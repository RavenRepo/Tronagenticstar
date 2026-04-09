import { EventEmitter } from "eventemitter3";
import { AgentInfo, AgentStatus, TaskType, AgentMetrics } from "./types.js";
import { buildNatsSubject } from "./sessionTools.js";
import { connect, NatsConnection, StringCodec, Subscription } from "nats";
import axios from "axios";

const sc = StringCodec();

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_HEARTBEAT_STALE_MS = 90_000; // 90s without heartbeat → mark degraded
const DEFAULT_HEARTBEAT_DEAD_MS = 300_000; // 5 min without heartbeat → mark unavailable

// ─── AgentRegistry ──────────────────────────────────────────────────────────

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();

  // ── NATS state ────────────────────────────────────────────────────────

  private nc: NatsConnection | null = null;
  private natsUrl: string = "nats://localhost:4222";

  /**
   * Per-agent subscription to `constella.agent.{id}.status` for presence tracking.
   */
  private statusSubscriptions: Map<string, Subscription> = new Map();

  /**
   * Tracks the last heartbeat timestamp per agent (from NATS status messages).
   */
  private lastHeartbeat: Map<string, Date> = new Map();

  /**
   * Interval handle for the presence sweep that marks stale agents.
   */
  private presenceSweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
  }

  // ── NATS Lifecycle ────────────────────────────────────────────────────

  /**
   * Connect the registry to NATS for presence tracking.
   *
   * After calling this, every `register()` call will also subscribe
   * to that agent's status subject for heartbeat monitoring.
   *
   * @param natsUrl — NATS server URL (default "nats://localhost:4222")
   */
  async connectNats(natsUrl?: string): Promise<void> {
    if (this.nc) return;

    if (natsUrl) {
      this.natsUrl = natsUrl;
    }

    try {
      this.nc = await connect({ servers: this.natsUrl });
      this.emit("nats_connected", { url: this.natsUrl });

      // Subscribe to status subjects for all currently registered agents
      for (const agent of this.agents.values()) {
        this.subscribeToStatus(agent.id);
      }

      // Start the presence sweep
      this.startPresenceSweep();
    } catch (err) {
      this.emit("nats_error", { source: "connectNats", error: err });
      throw err;
    }
  }

  /**
   * Disconnect from NATS and clean up all status subscriptions.
   */
  async disconnectNats(): Promise<void> {
    this.stopPresenceSweep();

    for (const [agentId, sub] of this.statusSubscriptions) {
      sub.unsubscribe();
      this.statusSubscriptions.delete(agentId);
    }

    if (this.nc) {
      try {
        await this.nc.drain();
      } catch {
        // Connection may already be closed
      }
      this.nc = null;
    }

    this.emit("nats_disconnected");
  }

  /** Whether the registry is connected to NATS. */
  get isNatsConnected(): boolean {
    return this.nc !== null;
  }

  // ── NATS Subject Helpers ──────────────────────────────────────────────

  /**
   * Build a standardised NATS subject for a given agent and channel.
   *
   * Pattern: `constella.agent.{agentId}.{channel}`
   *
   * This is the canonical way to derive subjects — other parts of the
   * system should call this rather than constructing subjects by hand.
   *
   * @param agentId — The agent's unique identifier
   * @param channel — One of 'inbox', 'response', or 'status'
   * @returns The fully-qualified NATS subject string
   */
  getNatsSubject(
    agentId: string,
    channel: "inbox" | "response" | "status",
  ): string {
    return buildNatsSubject(agentId, channel);
  }

  /**
   * Return a map of all three NATS subjects for a given agent.
   * Convenient for logging or diagnostics.
   */
  getNatsSubjects(agentId: string): {
    inbox: string;
    response: string;
    status: string;
  } {
    return {
      inbox: this.getNatsSubject(agentId, "inbox"),
      response: this.getNatsSubject(agentId, "response"),
      status: this.getNatsSubject(agentId, "status"),
    };
  }

  // ── Agent Registration ────────────────────────────────────────────────

  async discoverAndRegisterAgent(agentUrl: string): Promise<AgentInfo | null> {
    try {
      const bearerEnv = process.env.AGENT_BEARER || process.env.CODECRAFT_TOKEN;
      const response = await axios.get(`${agentUrl}/capabilities`, {
        timeout: 5000,
        headers: {
          ...(bearerEnv ? { Authorization: `Bearer ${bearerEnv}` } : {}),
        },
      });
      const capabilities = response.data;

      const agentInfo: AgentInfo = {
        id: capabilities.agent_id,
        address: agentUrl,
        specialization: capabilities.task_type,
        capabilities: capabilities.capabilities,
        status: AgentStatus.READY,
        metrics: {
          avgResponseTimeMs: 0,
          totalTasksCompleted: 0,
          totalTasksFailed: 0,
          currentLoad: 0,
          healthStatus: "healthy",
          lastActivity: new Date(),
        },
        lastSeen: new Date(),
      };

      this.register(agentInfo);
      return agentInfo;
    } catch (error) {
      console.error(`Failed to discover agent at ${agentUrl}:`, error);
      return null;
    }
  }

  register(agentInfo: AgentInfo): void {
    this.agents.set(agentInfo.id, agentInfo);
    this.emit("agent_registered", agentInfo);

    // If NATS is connected, subscribe to this agent's status subject
    if (this.nc) {
      this.subscribeToStatus(agentInfo.id);
    }
  }

  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    // Unsubscribe from NATS status
    const sub = this.statusSubscriptions.get(agentId);
    if (sub) {
      sub.unsubscribe();
      this.statusSubscriptions.delete(agentId);
    }
    this.lastHeartbeat.delete(agentId);

    this.agents.delete(agentId);
    this.emit("agent_unregistered", agent);
    return true;
  }

  getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  getAgentsByTaskType(type: TaskType): AgentInfo[] {
    const capabilityToType = (cap: string): TaskType | undefined => {
      switch (cap) {
        case "generate_code":
          return TaskType.CODE_GENERATION;
        case "refactor_code":
          return TaskType.REFACTOR;
        case "generate_diagram":
          return TaskType.DESIGN;
        case "scan_target":
          return TaskType.SECURITY;
        case "analyze_performance":
          return TaskType.PERFORMANCE_ANALYSIS;
        case "generate_embedding":
          return TaskType.EMBEDDING;
        case "evaluate_quality":
          return TaskType.EVALUATION;
        case "evaluate_compliance":
          return TaskType.COMPLIANCE;
        case "retrieve_memories":
          return TaskType.RETRIEVAL;
        default:
          return undefined;
      }
    };

    return Array.from(this.agents.values()).filter((agent) => {
      if (agent.specialization === type) return true;
      // Fallback: infer support from capabilities
      return (agent.capabilities || []).some(
        (cap) => capabilityToType(cap) === type,
      );
    });
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  updateAgentMetrics(agentId: string, metrics: Partial<AgentMetrics>): void {
    const agent = this.getAgent(agentId);
    if (agent) {
      agent.metrics = { ...agent.metrics, ...metrics };
    }
  }

  async performHealthCheck(): Promise<void> {
    for (const agent of this.agents.values()) {
      try {
        const bearerEnv =
          process.env.AGENT_BEARER || process.env.CODECRAFT_TOKEN;
        const response = await axios.get(`${agent.address}/health`, {
          timeout: 3000,
          headers: {
            ...(bearerEnv ? { Authorization: `Bearer ${bearerEnv}` } : {}),
          },
        });
        if (response.data.status === "ok") {
          agent.status = AgentStatus.READY;
        } else {
          agent.status = AgentStatus.DEGRADED;
        }
        agent.lastSeen = new Date();
      } catch (error) {
        agent.status = AgentStatus.UNAVAILABLE as any;
        this.emit("agent_unavailable", agent);
      }
    }
  }

  // ── Presence Tracking (NATS Heartbeats) ───────────────────────────────

  /**
   * Get the last heartbeat timestamp for a given agent.
   * Returns undefined if no heartbeat has been received.
   */
  getLastHeartbeat(agentId: string): Date | undefined {
    return this.lastHeartbeat.get(agentId);
  }

  /**
   * Subscribe to a single agent's status subject for heartbeat tracking.
   */
  private subscribeToStatus(agentId: string): void {
    if (!this.nc || this.statusSubscriptions.has(agentId)) return;

    const subject = this.getNatsSubject(agentId, "status");
    const sub = this.nc.subscribe(subject);
    this.statusSubscriptions.set(agentId, sub);

    // Process heartbeats asynchronously
    this.processStatusMessages(agentId, sub).catch((err) =>
      this.emit("nats_error", {
        source: "subscribeToStatus",
        agentId,
        error: err,
      }),
    );
  }

  /**
   * Async iterator that processes status/heartbeat messages for a single agent.
   */
  private async processStatusMessages(
    agentId: string,
    sub: Subscription,
  ): Promise<void> {
    for await (const msg of sub) {
      try {
        const raw = sc.decode(msg.data);
        const payload = JSON.parse(raw) as {
          agentId: string;
          status: string;
          timestamp: string;
          [key: string]: unknown;
        };

        const now = new Date(payload.timestamp || Date.now());
        this.lastHeartbeat.set(agentId, now);

        // Update the agent's lastSeen and status
        const agent = this.agents.get(agentId);
        if (agent) {
          agent.lastSeen = now;

          // If agent was previously degraded/unavailable but is now sending
          // heartbeats, mark it as ready again
          if (
            agent.status === AgentStatus.UNAVAILABLE ||
            agent.status === AgentStatus.DEGRADED
          ) {
            agent.status = AgentStatus.READY;
            this.emit("agent_recovered", {
              agentId,
              previousStatus: agent.status,
            });
          }
        }

        this.emit("heartbeat_received", { agentId, payload });
      } catch (err) {
        this.emit("nats_error", {
          source: "processStatusMessages",
          agentId,
          error: err,
        });
      }
    }
  }

  /**
   * Start the periodic presence sweep that marks agents as degraded or
   * unavailable if their heartbeats go stale.
   */
  private startPresenceSweep(): void {
    if (this.presenceSweepInterval) return;

    this.presenceSweepInterval = setInterval(() => {
      this.sweepPresence();
    }, 30_000); // Every 30s
  }

  /** Stop the presence sweep interval. */
  private stopPresenceSweep(): void {
    if (this.presenceSweepInterval) {
      clearInterval(this.presenceSweepInterval);
      this.presenceSweepInterval = null;
    }
  }

  /**
   * Check all agents' last heartbeat timestamps and update their status
   * if they've gone stale.
   */
  private sweepPresence(): void {
    const now = Date.now();

    for (const agent of this.agents.values()) {
      const lastBeat = this.lastHeartbeat.get(agent.id);
      if (!lastBeat) continue; // No heartbeat data — skip (may not be NATS-enabled)

      const ageMs = now - lastBeat.getTime();

      if (
        ageMs > DEFAULT_HEARTBEAT_DEAD_MS &&
        agent.status !== AgentStatus.UNAVAILABLE
      ) {
        const previousStatus = agent.status;
        agent.status = AgentStatus.UNAVAILABLE;
        this.emit("agent_unavailable", agent);
        this.emit("presence_change", {
          agentId: agent.id,
          previousStatus,
          newStatus: AgentStatus.UNAVAILABLE,
          staleSinceMs: ageMs,
        });
      } else if (
        ageMs > DEFAULT_HEARTBEAT_STALE_MS &&
        agent.status === AgentStatus.READY
      ) {
        agent.status = AgentStatus.DEGRADED;
        this.emit("presence_change", {
          agentId: agent.id,
          previousStatus: AgentStatus.READY,
          newStatus: AgentStatus.DEGRADED,
          staleSinceMs: ageMs,
        });
      }
    }
  }
}
