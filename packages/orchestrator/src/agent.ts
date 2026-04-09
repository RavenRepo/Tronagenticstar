import { EventEmitter } from "eventemitter3";
import {
  Task,
  AgentMetrics,
  TaskType,
  ToolDefinition,
  SessionMessage,
  SessionToolsConfig,
} from "./types.js";
import { SessionTools } from "./sessionTools.js";
import { AgentRegistry } from "./agentRegistry.js";
import {
  SystemTools,
  SystemToolsConfig,
  SandboxPolicy,
  SystemRunOptions,
  SystemRunResult,
} from "./systemTools.js";

export interface AgentConfig {
  id: string;
  specialization: TaskType;
  llmApiKey?: string;
  /** NATS server URL for swarm communication (e.g. "nats://localhost:4222") */
  natsUrl?: string;
  /** Default timeout in ms when awaiting inter-agent replies */
  defaultTimeoutMs?: number;
  /** Sandbox execution policy. Default: "denied". Only "allowed" agents can invoke system_run. */
  sandboxPolicy?: SandboxPolicy;
  /** Docker socket path override for sandbox execution */
  dockerSocketPath?: string;
}

export abstract class BaseAgent extends EventEmitter {
  readonly id: string;
  readonly specialization: TaskType;

  private metrics: AgentMetrics = {
    avgResponseTimeMs: 0,
    currentLoad: 0,
    healthStatus: "healthy",
    lastActivity: new Date(),
  };

  // ── Swarm Intelligence (Phase 1) ────────────────────────────────────────

  /**
   * SessionTools instance for agent-to-agent communication.
   * Lazily initialised via `initializeSwarm()`. Null until then.
   */
  protected sessionTools: SessionTools | null = null;

  /**
   * NATS URL passed through config, stored for deferred swarm init.
   */
  private readonly natsUrl?: string;

  /**
   * Default reply timeout passed through config.
   */
  private readonly defaultTimeoutMs?: number;

  // ── Secure Sandboxing (Phase 2) ─────────────────────────────────────────

  /**
   * SystemTools instance for secure code execution in ephemeral containers.
   * Lazily initialised via `initializeSandbox()`. Null until then.
   */
  protected systemTools: SystemTools | null = null;

  /**
   * Sandbox policy stored from config. Default is "denied".
   */
  private readonly sandboxPolicy: SandboxPolicy;

  /**
   * Docker socket path stored from config for deferred sandbox init.
   */
  private readonly dockerSocketPath?: string;

  // ── Constructor ─────────────────────────────────────────────────────────

  constructor(config: AgentConfig) {
    super();
    this.id = config.id;
    this.specialization = config.specialization;
    this.natsUrl = config.natsUrl;
    this.defaultTimeoutMs = config.defaultTimeoutMs;
    this.sandboxPolicy = config.sandboxPolicy ?? "denied";
    this.dockerSocketPath = config.dockerSocketPath;
  }

  // ── Metrics ─────────────────────────────────────────────────────────────

  getMetrics(): AgentMetrics {
    return this.metrics;
  }

  protected updateMetrics(partial: Partial<AgentMetrics>) {
    this.metrics = { ...this.metrics, ...partial };
    this.emit("metrics", this.metrics);
  }

  // ── Abstract ────────────────────────────────────────────────────────────

  /** Execute a task and return result payload */
  abstract execute(task: Task): Promise<unknown>;

  // ── Swarm Lifecycle ─────────────────────────────────────────────────────

  /**
   * Initialise the swarm communication layer for this agent.
   *
   * Creates a `SessionTools` instance, connects to NATS, subscribes to
   * this agent's inbox, and wires inbound messages to `handleInboundMessage`.
   *
   * This is intentionally **not** called from the constructor so that:
   *  1. Agents that don't need NATS can skip it entirely.
   *  2. The `AgentRegistry` can be passed in after construction.
   *  3. Tests can create agents without needing a running NATS server.
   *
   * @param registry — The shared AgentRegistry used for agent discovery
   */
  async initializeSwarm(registry: AgentRegistry): Promise<void> {
    if (this.sessionTools) {
      // Already initialised — no-op
      return;
    }

    const config: SessionToolsConfig = {
      ownerAgentId: this.id,
      natsUrl: this.natsUrl,
      defaultTimeoutMs: this.defaultTimeoutMs,
    };

    this.sessionTools = new SessionTools(config, registry);

    // Wire events from SessionTools into this agent's EventEmitter
    this.sessionTools.on("inbound_message", (envelope: SessionMessage) => {
      this.handleInboundMessage(envelope).catch((err) =>
        this.emit("error", {
          source: "handleInboundMessage",
          error: err,
          envelope,
        }),
      );
    });

    this.sessionTools.on(
      "reply_requested",
      (ctx: {
        envelope: SessionMessage;
        sendReply: (content: string) => void;
      }) => {
        this.emit("reply_requested", ctx);
      },
    );

    this.sessionTools.on("error", (err: unknown) => {
      this.emit("swarm_error", err);
    });

    this.sessionTools.on("connected", () => {
      this.emit("swarm_connected", { agentId: this.id });
    });

    this.sessionTools.on("disconnected", () => {
      this.emit("swarm_disconnected", { agentId: this.id });
    });

    // Connect to NATS and start listening
    await this.sessionTools.connect();
  }

  /**
   * Gracefully shut down the swarm communication layer.
   * Safe to call even if swarm was never initialised.
   */
  async shutdownSwarm(): Promise<void> {
    if (!this.sessionTools) return;

    await this.sessionTools.disconnect();
    this.sessionTools.removeAllListeners();
    this.sessionTools = null;
  }

  // ── Sandbox Lifecycle (Phase 2) ─────────────────────────────────────────

  /**
   * Initialise the secure sandboxing layer for this agent.
   *
   * Creates a `SystemTools` instance connected to the Docker daemon.
   * Only agents with `sandboxPolicy: "allowed"` will actually be able
   * to execute commands — the policy is enforced at runtime, so it's
   * safe to call this on any agent.
   *
   * Like `initializeSwarm()`, this is intentionally **not** called from
   * the constructor so that:
   *  1. Agents that don't need sandboxing can skip it.
   *  2. Tests can create agents without needing a running Docker daemon.
   */
  initializeSandbox(): void {
    if (this.systemTools) {
      // Already initialised — no-op
      return;
    }

    const config: SystemToolsConfig = {
      ownerAgentId: this.id,
      sandboxPolicy: this.sandboxPolicy,
      dockerSocketPath: this.dockerSocketPath,
    };

    this.systemTools = new SystemTools(config);

    // Wire events from SystemTools into this agent's EventEmitter
    this.systemTools.on("container_created", (info: unknown) => {
      this.emit("sandbox_container_created", info);
    });

    this.systemTools.on("execution_complete", (info: unknown) => {
      this.emit("sandbox_execution_complete", info);
    });

    this.systemTools.on("execution_error", (info: unknown) => {
      this.emit("sandbox_execution_error", info);
    });

    this.systemTools.on("container_removed", (info: unknown) => {
      this.emit("sandbox_container_removed", info);
    });

    this.emit("sandbox_initialized", {
      agentId: this.id,
      policy: this.sandboxPolicy,
    });
  }

  /**
   * Gracefully shut down the sandboxing layer, cleaning up any
   * active containers. Safe to call even if sandbox was never initialised.
   */
  async shutdownSandbox(): Promise<void> {
    if (!this.systemTools) return;

    await this.systemTools.cleanupAll();
    this.systemTools.removeAllListeners();
    this.systemTools = null;
  }

  // ── Tool Definitions ────────────────────────────────────────────────────

  /**
   * Return all tool definitions this agent exposes to the LLM.
   *
   * Base implementation returns:
   *  - The three `sessions_*` tools (if swarm is initialised)
   *  - The `system_run` tool (if sandbox is initialised and policy is "allowed")
   *
   * Subclasses should override and call `super.getTools()` to
   * merge their domain-specific tools with the platform tools.
   *
   * @example
   * ```ts
   * class CodeCraftAgent extends BaseAgent {
   *   getTools(): ToolDefinition[] {
   *     return [
   *       ...super.getTools(),
   *       { name: "run_linter", description: "...", parameters: {} },
   *     ];
   *   }
   * }
   * ```
   */
  getTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    // Phase 1: Session tools (agent-to-agent communication)
    if (this.sessionTools) {
      tools.push(...this.sessionTools.getToolDefinitions());
    }

    // Phase 2: System tools (sandbox execution)
    if (this.systemTools && this.systemTools.isAllowed) {
      tools.push(this.systemTools.getToolDefinition());
    }

    return tools;
  }

  // ── Tool Dispatch ───────────────────────────────────────────────────────

  /**
   * Dispatch a tool call to the appropriate handler.
   *
   * Routes to the correct tool subsystem:
   *  1. `sessions_*` → SessionTools dispatcher (Phase 1)
   *  2. `system_run` → SystemTools dispatcher (Phase 2)
   *  3. Everything else → emits `tool_call` event for subclass handling
   *
   * @returns JSON-serialised result string to feed back to the LLM
   */
  async dispatchToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    // Phase 1: Session tools (agent-to-agent communication)
    const sessionToolNames = [
      "sessions_list",
      "sessions_send",
      "sessions_history",
    ];
    if (sessionToolNames.includes(toolName) && this.sessionTools) {
      const result = await this.sessionTools.dispatch(toolName, args);
      this.emit("tool_call", { toolName, args, result });
      return result;
    }

    // Phase 2: System tools (sandbox execution)
    if (toolName === "system_run" && this.systemTools) {
      const result = await this.systemTools.dispatch(toolName, args);
      this.emit("tool_call", { toolName, args, result });
      return result;
    }

    // For non-platform tools, emit an event and let the subclass / external
    // handler provide the result. Default: return an error.
    this.emit("tool_call", { toolName, args, result: null });
    return JSON.stringify({ error: `Unhandled tool: "${toolName}"` });
  }

  // ── Inbound Message Handling ────────────────────────────────────────────

  /**
   * Handle an inbound message from another agent (via NATS inbox).
   *
   * The default implementation records it in history and emits an event.
   * Subclasses should override this to implement domain-specific responses
   * (e.g. the Chief Architect triaging a request to the appropriate agent).
   *
   * @param envelope — The deserialised SessionMessage from the inbox
   */
  protected async handleInboundMessage(
    envelope: SessionMessage,
  ): Promise<void> {
    this.emit("inbound_message", {
      from: envelope.fromAgentId,
      content: envelope.content,
      correlationId: envelope.correlationId,
      timestamp: envelope.timestamp,
    });
  }

  // ── Convenience: Send to Another Agent ──────────────────────────────────

  /**
   * Send a message to another agent. Convenience wrapper around
   * `sessionTools.sessionsSend()`.
   *
   * @throws Error if swarm is not initialised
   */
  async sendToAgent(
    targetAgentId: string,
    message: string,
    options?: { awaitReply?: boolean; timeoutMs?: number },
  ) {
    if (!this.sessionTools) {
      throw new Error(
        `Cannot send message: swarm not initialised for agent "${this.id}". ` +
          `Call initializeSwarm() first.`,
      );
    }
    return this.sessionTools.sessionsSend(targetAgentId, message, options);
  }

  /**
   * List all available agents. Convenience wrapper around
   * `sessionTools.sessionsList()`.
   */
  async listAgents(options?: {
    statusFilter?: string;
    specializationFilter?: string;
  }) {
    if (!this.sessionTools) {
      throw new Error(
        `Cannot list agents: swarm not initialised for agent "${this.id}". ` +
          `Call initializeSwarm() first.`,
      );
    }
    return this.sessionTools.sessionsList(options);
  }

  /**
   * Retrieve another agent's history. Convenience wrapper around
   * `sessionTools.sessionsHistory()`.
   */
  async getAgentHistory(
    agentId: string,
    options?: { limit?: number; since?: Date },
  ) {
    if (!this.sessionTools) {
      throw new Error(
        `Cannot get history: swarm not initialised for agent "${this.id}". ` +
          `Call initializeSwarm() first.`,
      );
    }
    return this.sessionTools.sessionsHistory(agentId, options);
  }

  // ── Sandbox Convenience ─────────────────────────────────────────────────

  /**
   * Execute a command inside the secure sandbox. Convenience wrapper
   * around `systemTools.systemRun()`.
   *
   * @throws Error if sandbox is not initialised
   */
  async runInSandbox(options: SystemRunOptions): Promise<SystemRunResult> {
    if (!this.systemTools) {
      throw new Error(
        `Cannot run in sandbox: sandbox not initialised for agent "${this.id}". ` +
          `Call initializeSandbox() first.`,
      );
    }
    return this.systemTools.systemRun(options);
  }

  /**
   * Check sandbox health (Docker reachable, images available).
   * Returns null if sandbox is not initialised.
   */
  async checkSandboxHealth() {
    if (!this.systemTools) return null;
    return this.systemTools.checkHealth();
  }

  // ── Swarm Status ────────────────────────────────────────────────────────

  /** Whether the swarm communication layer is active. */
  get isSwarmConnected(): boolean {
    return this.sessionTools?.isConnected ?? false;
  }

  /** Whether the sandbox layer is initialised. */
  get isSandboxInitialized(): boolean {
    return this.systemTools !== null;
  }

  /** Whether this agent is allowed to execute sandbox commands. */
  get isSandboxAllowed(): boolean {
    return this.sandboxPolicy === "allowed";
  }

  /**
   * Publish a heartbeat on this agent's NATS status subject.
   * No-op if swarm is not initialised.
   */
  async publishHeartbeat(extra?: Record<string, unknown>): Promise<void> {
    if (!this.sessionTools) return;
    await this.sessionTools.publishStatus(extra);
  }

  // ── Full Lifecycle Helpers ──────────────────────────────────────────────

  /**
   * Initialise all platform capabilities (swarm + sandbox) in one call.
   * Convenience method for agents that need both.
   */
  async initializeAll(registry: AgentRegistry): Promise<void> {
    await this.initializeSwarm(registry);
    this.initializeSandbox();
  }

  /**
   * Shut down all platform capabilities (swarm + sandbox) in one call.
   */
  async shutdownAll(): Promise<void> {
    await this.shutdownSandbox();
    await this.shutdownSwarm();
  }
}
