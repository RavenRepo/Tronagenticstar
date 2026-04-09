import { EventEmitter } from "eventemitter3";
import Docker from "dockerode";
import { ToolDefinition } from "./types.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_IMAGE = "constella/sandbox-executor:dev";
const BROWSER_IMAGE = "constella/sandbox-executor:browser";
const DEFAULT_TIMEOUT_MS = 30_000;
const BROWSER_TIMEOUT_MS = 60_000;
const DEFAULT_MEMORY_BYTES = 256 * 1024 * 1024; // 256 MB
const BROWSER_MEMORY_BYTES = 512 * 1024 * 1024; // 512 MB
const DEFAULT_CPU_PERIOD = 100_000;
const DEFAULT_CPU_QUOTA = 50_000; // 0.5 CPUs
const BROWSER_CPU_QUOTA = 100_000; // 1.0 CPUs
const DEFAULT_PIDS_LIMIT = 64;
const BROWSER_PIDS_LIMIT = 128;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB stdout/stderr cap

// ─── Types ──────────────────────────────────────────────────────────────────

export type SandboxPolicy = "allowed" | "denied";

export type SandboxVariant = "default" | "browser";

export interface SystemRunOptions {
  /** Shell command to execute inside the sandbox container */
  command: string;
  /**
   * Optional context files to inject into the sandbox.
   * Keys are file paths relative to /sandbox/, values are file contents.
   */
  files?: Record<string, string>;
  /** Timeout in milliseconds (default 30000 for default, 60000 for browser) */
  timeoutMs?: number;
  /** Sandbox variant: "default" or "browser" (includes Chromium) */
  variant?: SandboxVariant;
  /** Working directory inside the container (default "/sandbox") */
  workdir?: string;
  /** Environment variables to inject into the container */
  env?: Record<string, string>;
  /**
   * Whether to allow network access inside the container.
   * Default: false (--network none). Only override for trusted scanning agents.
   */
  allowNetwork?: boolean;
}

export interface SystemRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  timedOut: boolean;
  containerId?: string;
  error?: string;
}

export interface SystemToolsConfig {
  /** The agent that owns this SystemTools instance */
  ownerAgentId: string;
  /** Sandbox policy for this agent. Default: "denied" */
  sandboxPolicy?: SandboxPolicy;
  /**
   * Docker socket path. Default: "/var/run/docker.sock" (Linux)
   * or connect via DOCKER_HOST env var.
   */
  dockerSocketPath?: string;
  /** Default sandbox image override */
  defaultImage?: string;
  /** Browser sandbox image override */
  browserImage?: string;
}

// ─── SystemTools ────────────────────────────────────────────────────────────

/**
 * Provides the `system_run` tool that allows agents to execute commands
 * inside ephemeral Docker containers (sandboxes).
 *
 * Security model:
 *  - Only agents with `sandboxPolicy: "allowed"` can invoke this tool.
 *  - Containers run as a non-root user (`sandboxuser`).
 *  - Containers have no network access by default (`--network none`).
 *  - Containers are memory-limited, CPU-limited, and PID-limited.
 *  - Containers are killed after a configurable timeout (default 30s).
 *  - Containers are always removed after execution, regardless of outcome.
 *  - The root filesystem is read-only; only /sandbox is writable.
 *
 * Backed by `dockerode` — communicates with the Docker daemon via the
 * local socket. No Docker-in-Docker required.
 *
 * Follows the OpenClaw `system_run` tool pattern, adapted for Constella's
 * agent infrastructure.
 */
export class SystemTools extends EventEmitter {
  // ── Configuration ──────────────────────────────────────────────────────

  private readonly ownerAgentId: string;
  private readonly sandboxPolicy: SandboxPolicy;
  private readonly defaultImage: string;
  private readonly browserImage: string;

  // ── Docker client ──────────────────────────────────────────────────────

  private docker: Docker;

  // ── Runtime tracking ───────────────────────────────────────────────────

  /**
   * Set of container IDs currently running.
   * Used for cleanup on shutdown.
   */
  private activeContainers: Set<string> = new Set();

  // ── Constructor ────────────────────────────────────────────────────────

  constructor(config: SystemToolsConfig) {
    super();
    this.ownerAgentId = config.ownerAgentId;
    this.sandboxPolicy = config.sandboxPolicy ?? "denied";
    this.defaultImage = config.defaultImage ?? DEFAULT_IMAGE;
    this.browserImage = config.browserImage ?? BROWSER_IMAGE;

    // Initialise Docker client
    const socketPath =
      config.dockerSocketPath ??
      process.env.DOCKER_HOST ??
      "/var/run/docker.sock";

    if (socketPath.startsWith("tcp://") || socketPath.startsWith("http://")) {
      // TCP connection (e.g. for remote Docker or Podman)
      const url = new URL(socketPath);
      this.docker = new Docker({
        host: url.hostname,
        port: parseInt(url.port || "2375", 10),
        protocol: url.protocol === "https:" ? "https" : "http",
      });
    } else {
      // Unix socket (default)
      this.docker = new Docker({ socketPath });
    }
  }

  // ── Tool Definition ────────────────────────────────────────────────────

  /**
   * Return the `system_run` tool definition in OpenAI/Anthropic
   * function-calling JSON Schema format.
   */
  getToolDefinition(): ToolDefinition {
    return {
      name: "system_run",
      description:
        "Execute a shell command inside a secure, ephemeral Docker sandbox. " +
        "The sandbox has Node.js 22, Python 3.11, bash, git, curl, and jq. " +
        "Use this to run code, scripts, or CLI commands safely. " +
        "No network access by default. Output is captured and returned. " +
        "Maximum execution time: 30 seconds (60 for browser variant). " +
        "Only agents with sandbox_policy='allowed' can use this tool.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description:
              "The shell command to execute inside the sandbox. " +
              'Examples: "python3 script.py", "node index.js", "echo hello".',
          },
          files: {
            type: "object",
            additionalProperties: { type: "string" },
            description:
              "Optional map of file paths (relative to /sandbox/) to file contents. " +
              "These files are written into the container before the command runs. " +
              'Example: {"script.py": "print(\'hello world\')"}',
          },
          variant: {
            type: "string",
            enum: ["default", "browser"],
            description:
              'Sandbox variant. "default" includes Node+Python+bash. ' +
              '"browser" adds Chromium for headless browser tasks. Default: "default".',
          },
          timeoutMs: {
            type: "number",
            description:
              "Timeout in milliseconds. Default: 30000 (default variant), 60000 (browser variant).",
          },
          workdir: {
            type: "string",
            description:
              'Working directory inside the container. Default: "/sandbox".',
          },
          env: {
            type: "object",
            additionalProperties: { type: "string" },
            description:
              "Environment variables to set inside the container. " +
              'Example: {"API_URL": "https://example.com"}.',
          },
          allowNetwork: {
            type: "boolean",
            description:
              "Whether to allow network access inside the container. " +
              "Default: false (no network). Only set to true for trusted scanning tasks.",
          },
        },
        required: ["command"],
        additionalProperties: false,
      },
    };
  }

  // ── Tool Implementation ────────────────────────────────────────────────

  /**
   * **system_run** — Execute a command inside an ephemeral sandbox container.
   *
   * Flow:
   * 1. Check sandbox policy (deny if not allowed)
   * 2. Pull/verify the sandbox image exists
   * 3. Create container with security constraints
   * 4. Optionally inject context files
   * 5. Start the container and capture output
   * 6. Kill on timeout
   * 7. Collect stdout, stderr, exit code
   * 8. Remove container (always, even on error)
   * 9. Return result
   */
  async systemRun(options: SystemRunOptions): Promise<SystemRunResult> {
    const startMs = Date.now();

    // ── Policy check ─────────────────────────────────────────────────────
    if (this.sandboxPolicy !== "allowed") {
      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        executionTimeMs: Date.now() - startMs,
        timedOut: false,
        error:
          `Sandbox execution denied for agent "${this.ownerAgentId}". ` +
          `sandboxPolicy is "${this.sandboxPolicy}". ` +
          "Only agents with sandboxPolicy='allowed' can execute system_run.",
      };
    }

    const variant = options.variant ?? "default";
    const image = variant === "browser" ? this.browserImage : this.defaultImage;
    const timeoutMs =
      options.timeoutMs ??
      (variant === "browser" ? BROWSER_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
    const memoryLimit =
      variant === "browser" ? BROWSER_MEMORY_BYTES : DEFAULT_MEMORY_BYTES;
    const cpuQuota =
      variant === "browser" ? BROWSER_CPU_QUOTA : DEFAULT_CPU_QUOTA;
    const pidsLimit =
      variant === "browser" ? BROWSER_PIDS_LIMIT : DEFAULT_PIDS_LIMIT;
    const workdir = options.workdir ?? "/sandbox";
    const allowNetwork = options.allowNetwork ?? false;

    // Build environment variables array
    const envArray: string[] = [];
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envArray.push(`${key}=${value}`);
      }
    }

    // ── Build the command ────────────────────────────────────────────────
    // If files need to be injected, we prepend file-creation commands.
    let fullCommand = options.command;
    if (options.files && Object.keys(options.files).length > 0) {
      const fileCreationCommands: string[] = [];
      for (const [filePath, content] of Object.entries(options.files)) {
        // Sanitise: ensure path doesn't escape /sandbox
        const safePath = filePath.replace(/\.\./g, "_").replace(/^\//, "");
        // Use heredoc to write file contents safely
        const escapedContent = content.replace(/'/g, "'\\''");
        fileCreationCommands.push(
          `mkdir -p "$(dirname "/sandbox/${safePath}")" && cat > "/sandbox/${safePath}" << 'CONSTELLA_EOF'\n${escapedContent}\nCONSTELLA_EOF`,
        );
      }
      fullCommand =
        fileCreationCommands.join(" && ") + " && " + options.command;
    }

    let container: Docker.Container | null = null;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      // ── Verify image exists ──────────────────────────────────────────
      try {
        await this.docker.getImage(image).inspect();
      } catch {
        return {
          stdout: "",
          stderr: "",
          exitCode: -1,
          executionTimeMs: Date.now() - startMs,
          timedOut: false,
          error:
            `Sandbox image "${image}" not found. ` +
            `Build it first: docker build -t ${image} services/sandbox-executor/`,
        };
      }

      // ── Create container ─────────────────────────────────────────────
      const createOptions: Docker.ContainerCreateOptions = {
        Image: image,
        Cmd: [fullCommand],
        WorkingDir: workdir,
        Env: envArray.length > 0 ? envArray : undefined,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        // Security: disable all capabilities, read-only root fs
        HostConfig: {
          Memory: memoryLimit,
          MemorySwap: memoryLimit, // No swap
          CpuPeriod: DEFAULT_CPU_PERIOD,
          CpuQuota: cpuQuota,
          PidsLimit: pidsLimit,
          NetworkMode: allowNetwork ? "bridge" : "none",
          ReadonlyRootfs: true,
          AutoRemove: false, // We remove manually after collecting output
          SecurityOpt: ["no-new-privileges:true"],
          Tmpfs: {
            "/sandbox": `rw,noexec,nosuid,size=${memoryLimit}`,
            "/tmp": "rw,noexec,nosuid,size=67108864", // 64MB tmp
          },
          CapDrop: ["ALL"],
        },
        Labels: {
          "constella.sandbox": "true",
          "constella.agent": this.ownerAgentId,
          "constella.variant": variant,
          "constella.created": new Date().toISOString(),
        },
      };

      container = await this.docker.createContainer(createOptions);
      const containerId = container.id;
      this.activeContainers.add(containerId);

      this.emit("container_created", {
        containerId,
        agentId: this.ownerAgentId,
        variant,
        command: options.command,
      });

      // ── Attach to stdout/stderr before starting ──────────────────────
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });

      // Collect output into buffers
      let stdoutBuf = Buffer.alloc(0);
      let stderrBuf = Buffer.alloc(0);

      // Docker multiplexes stdout/stderr over a single stream.
      // We use container.modem.demuxStream to split them.
      const stdoutPassThrough = new (await import("stream")).PassThrough();
      const stderrPassThrough = new (await import("stream")).PassThrough();

      container.modem.demuxStream(stream, stdoutPassThrough, stderrPassThrough);

      stdoutPassThrough.on("data", (chunk: Buffer) => {
        if (stdoutBuf.length + chunk.length <= MAX_OUTPUT_BYTES) {
          stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
        }
      });

      stderrPassThrough.on("data", (chunk: Buffer) => {
        if (stderrBuf.length + chunk.length <= MAX_OUTPUT_BYTES) {
          stderrBuf = Buffer.concat([stderrBuf, chunk]);
        }
      });

      // ── Start the container ──────────────────────────────────────────
      await container.start();

      this.emit("container_started", {
        containerId,
        agentId: this.ownerAgentId,
      });

      // ── Set timeout kill ─────────────────────────────────────────────
      const killPromise = new Promise<void>((resolve) => {
        killTimer = setTimeout(async () => {
          timedOut = true;
          try {
            await container!.kill({ signal: "SIGKILL" });
          } catch {
            // Container may have already exited
          }
          resolve();
        }, timeoutMs);
      });

      // ── Wait for container to finish ─────────────────────────────────
      const waitResult = await Promise.race([
        container.wait(),
        killPromise.then(() => ({ StatusCode: 137 })), // 137 = SIGKILL
      ]);

      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = null;
      }

      // Give streams a moment to flush
      await new Promise((r) => setTimeout(r, 100));

      const exitCode = (waitResult as { StatusCode: number }).StatusCode;
      const executionTimeMs = Date.now() - startMs;

      const result: SystemRunResult = {
        stdout: stdoutBuf.toString("utf-8"),
        stderr: stderrBuf.toString("utf-8"),
        exitCode,
        executionTimeMs,
        timedOut,
        containerId,
      };

      this.emit("execution_complete", {
        containerId,
        agentId: this.ownerAgentId,
        exitCode,
        executionTimeMs,
        timedOut,
      });

      return result;
    } catch (err) {
      const executionTimeMs = Date.now() - startMs;
      const errorMsg =
        err instanceof Error ? err.message : String(err);

      this.emit("execution_error", {
        agentId: this.ownerAgentId,
        error: errorMsg,
        executionTimeMs,
      });

      return {
        stdout: "",
        stderr: "",
        exitCode: -1,
        executionTimeMs,
        timedOut,
        error: `Sandbox execution failed: ${errorMsg}`,
      };
    } finally {
      // ── Cleanup: always remove the container ─────────────────────────
      if (killTimer) {
        clearTimeout(killTimer);
      }

      if (container) {
        const containerId = container.id;
        try {
          // Force remove in case it's still running
          await container.remove({ force: true });
        } catch {
          // Container may have already been removed (AutoRemove race)
        }
        this.activeContainers.delete(containerId);

        this.emit("container_removed", {
          containerId,
          agentId: this.ownerAgentId,
        });
      }
    }
  }

  // ── Dispatch ───────────────────────────────────────────────────────────

  /**
   * Dispatch a system_run tool call. Single entry-point for the LLM
   * tool-use handler.
   *
   * @returns JSON-serialised SystemRunResult to feed back to the LLM
   */
  async dispatch(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    if (toolName !== "system_run") {
      return JSON.stringify({ error: `Unknown tool: "${toolName}"` });
    }

    const command = args.command as string;
    if (!command) {
      return JSON.stringify({
        error: "system_run requires a 'command' parameter.",
      });
    }

    const result = await this.systemRun({
      command,
      files: args.files as Record<string, string> | undefined,
      variant: args.variant as SandboxVariant | undefined,
      timeoutMs: args.timeoutMs as number | undefined,
      workdir: args.workdir as string | undefined,
      env: args.env as Record<string, string> | undefined,
      allowNetwork: args.allowNetwork as boolean | undefined,
    });

    return JSON.stringify(result);
  }

  // ── Docker Connectivity ────────────────────────────────────────────────

  /**
   * Check if the Docker daemon is reachable and the sandbox image exists.
   * Useful for health checks and startup validation.
   */
  async checkHealth(): Promise<{
    dockerReachable: boolean;
    defaultImageAvailable: boolean;
    browserImageAvailable: boolean;
    error?: string;
  }> {
    let dockerReachable = false;
    let defaultImageAvailable = false;
    let browserImageAvailable = false;

    try {
      await this.docker.ping();
      dockerReachable = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        dockerReachable,
        defaultImageAvailable,
        browserImageAvailable,
        error: `Docker daemon not reachable: ${msg}`,
      };
    }

    try {
      await this.docker.getImage(this.defaultImage).inspect();
      defaultImageAvailable = true;
    } catch {
      // Image not found — not an error, just not built yet
    }

    try {
      await this.docker.getImage(this.browserImage).inspect();
      browserImageAvailable = true;
    } catch {
      // Image not found
    }

    return {
      dockerReachable,
      defaultImageAvailable,
      browserImageAvailable,
    };
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  /**
   * Force-remove all active sandbox containers.
   * Called during graceful shutdown to prevent orphaned containers.
   */
  async cleanupAll(): Promise<{ removed: string[]; errors: string[] }> {
    const removed: string[] = [];
    const errors: string[] = [];

    for (const containerId of this.activeContainers) {
      try {
        const container = this.docker.getContainer(containerId);
        await container.remove({ force: true });
        removed.push(containerId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${containerId}: ${msg}`);
      }
    }

    this.activeContainers.clear();

    this.emit("cleanup_complete", { removed, errors });
    return { removed, errors };
  }

  /**
   * List and remove any orphaned Constella sandbox containers that may
   * have been left behind by a previous crash.
   */
  async cleanupOrphans(): Promise<{ removed: string[]; errors: string[] }> {
    const removed: string[] = [];
    const errors: string[] = [];

    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: ["constella.sandbox=true"],
        },
      });

      for (const containerInfo of containers) {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          await container.remove({ force: true });
          removed.push(containerInfo.Id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${containerInfo.Id}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`listContainers failed: ${msg}`);
    }

    this.emit("orphan_cleanup_complete", { removed, errors });
    return { removed, errors };
  }

  // ── Getters ────────────────────────────────────────────────────────────

  /** Whether this agent is allowed to execute sandbox commands. */
  get isAllowed(): boolean {
    return this.sandboxPolicy === "allowed";
  }

  /** Number of containers currently running for this agent. */
  get activeContainerCount(): number {
    return this.activeContainers.size;
  }

  /** The owner agent's ID. */
  get agentId(): string {
    return this.ownerAgentId;
  }
}
