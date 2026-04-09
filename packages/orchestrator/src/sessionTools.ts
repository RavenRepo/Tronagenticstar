import { EventEmitter } from "eventemitter3";
import {
  connect,
  NatsConnection,
  StringCodec,
  Subscription,
  type Msg as NatsMsg,
} from "nats";
import { createClient, type RedisClientType } from "redis";
import {
  AgentInfo,
  AgentStatus,
  SessionMessage,
  SessionHistoryEntry,
  SessionToolsConfig,
  ToolDefinition,
} from "./types.js";
import { AgentRegistry } from "./agentRegistry.js";

// ─── Constants ──────────────────────────────────────────────────────────────

const NATS_SUBJECT_PREFIX = "constella.agent";
const REDIS_HISTORY_PREFIX = "constella:agent";
const REDIS_HISTORY_TTL_SECS = 60 * 60 * 24 * 7; // 7 days
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 500;

// ─── Helpers ────────────────────────────────────────────────────────────────

const sc = StringCodec();

/**
 * Build a standardised NATS subject for a given agent and channel.
 *
 * Pattern: `constella.agent.{agentId}.{channel}`
 */
export function buildNatsSubject(
  agentId: string,
  channel: "inbox" | "response" | "status",
): string {
  return `${NATS_SUBJECT_PREFIX}.${agentId}.${channel}`;
}

/**
 * Build the Redis key used for an agent's hot history list.
 *
 * Pattern: `constella:agent:{agentId}:history`
 */
export function buildRedisHistoryKey(agentId: string): string {
  return `${REDIS_HISTORY_PREFIX}:${agentId}:history`;
}

/**
 * Generate a v4-style correlation ID without pulling in a uuid library.
 * Crypto.randomUUID is available in Node ≥ 19 / with --experimental-global-webcrypto.
 * Falls back to a simple random hex string.
 */
function generateCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback: 32 hex chars
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");
  }
}

// ─── Types used only inside this module ─────────────────────────────────────

export interface SessionsListResult {
  agents: Array<{
    id: string;
    specialization: string;
    status: string;
    capabilities: string[];
    address?: string;
    lastSeen?: string;
  }>;
  total: number;
}

export interface SessionsSendOptions {
  /** If true, wait for a reply on the response subject (default false) */
  awaitReply?: boolean;
  /** Timeout in ms when awaiting a reply (default 30 000) */
  timeoutMs?: number;
}

export interface SessionsSendResult {
  correlationId: string;
  delivered: boolean;
  reply?: string;
  error?: string;
  roundTripMs?: number;
}

export interface SessionsHistoryOptions {
  /** Maximum number of entries to return (default 50, max 500) */
  limit?: number;
  /** Only return entries newer than this date */
  since?: Date;
}

export interface SessionsHistoryResult {
  entries: SessionHistoryEntry[];
  total: number;
  source: "redis" | "memory" | "empty";
}

// ─── SessionTools ───────────────────────────────────────────────────────────

/**
 * Provides the three swarm-intelligence tools that agents expose to LLMs:
 *
 * - **sessions_list**    — discover online agents
 * - **sessions_send**    — message another agent (fire-and-forget or request/reply)
 * - **sessions_history** — read an agent's recent task log
 *
 * Backed by NATS JetStream for messaging, Redis for hot history,
 * and the existing `AgentRegistry` for discovery.
 *
 * Follows the OpenClaw `sessions_*` tool pattern but adapted for
 * Constella's NATS + Redis + Neo4j infrastructure.
 */
export class SessionTools extends EventEmitter {
  // ── Injected dependencies ──────────────────────────────────────────────

  private readonly ownerAgentId: string;
  private readonly registry: AgentRegistry;
  private readonly defaultTimeoutMs: number;
  private readonly natsUrl: string;
  private readonly redisUrl: string | undefined;

  // ── Runtime state ──────────────────────────────────────────────────────

  private nc: NatsConnection | null = null;
  private inboxSubscription: Subscription | null = null;
  private redisClient: RedisClientType | null = null;

  /**
   * In-memory history buffer per agent.
   * Used as the primary store when Redis is not available and as a
   * write-through cache when it is.
   */
  private historyBuffer: Map<string, SessionHistoryEntry[]> = new Map();

  /**
   * Pending reply resolvers keyed by correlationId.
   * Populated when `sessions_send` is called with `awaitReply: true`.
   */
  private pendingReplies: Map<
    string,
    {
      resolve: (value: string) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  > = new Map();

  // ── Constructor ────────────────────────────────────────────────────────

  constructor(config: SessionToolsConfig, registry: AgentRegistry) {
    super();
    this.ownerAgentId = config.ownerAgentId;
    this.registry = registry;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.natsUrl = config.natsUrl ?? "nats://localhost:4222";
    this.redisUrl = config.redisUrl;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Connect to NATS and subscribe to this agent's inbox + response subjects.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  async connect(): Promise<void> {
    if (this.nc) return;

    try {
      this.nc = await connect({ servers: this.natsUrl });
      this.emit("connected", { agentId: this.ownerAgentId });

      // Subscribe to our own inbox so we can handle inbound messages
      const inboxSubject = buildNatsSubject(this.ownerAgentId, "inbox");
      this.inboxSubscription = this.nc.subscribe(inboxSubject);
      this.processInbox().catch((err) =>
        this.emit("error", { source: "inbox", error: err }),
      );

      // Subscribe to our own response subject for reply routing
      const responseSubject = buildNatsSubject(this.ownerAgentId, "response");
      const responseSub = this.nc.subscribe(responseSubject);
      this.processResponses(responseSub).catch((err) =>
        this.emit("error", { source: "responses", error: err }),
      );
    } catch (err) {
      this.emit("error", { source: "connect", error: err });
      throw err;
    }

    // ── Redis hot-store connection ─────────────────────────────────────
    if (this.redisUrl) {
      try {
        this.redisClient = createClient({
          url: this.redisUrl,
        }) as RedisClientType;

        this.redisClient.on("error", (err) =>
          this.emit("error", { source: "redis", error: err }),
        );

        await this.redisClient.connect();
        this.emit("redis_connected", { agentId: this.ownerAgentId });
      } catch (err) {
        // Redis is optional — degrade gracefully to in-memory only
        this.emit("error", {
          source: "redis_connect",
          error: err,
        });
        this.redisClient = null;
      }
    }
  }

  /**
   * Gracefully disconnect from NATS. Drains all subscriptions first.
   */
  /** Whether a usable Redis connection is available. */
  get hasRedis(): boolean {
    return this.redisClient?.isOpen === true;
  }

  async disconnect(): Promise<void> {
    // Clean up pending replies
    for (const [id, pending] of this.pendingReplies) {
      clearTimeout(pending.timer);
      pending.resolve(JSON.stringify({ error: "SessionTools disconnecting" }));
      this.pendingReplies.delete(id);
    }

    if (this.inboxSubscription) {
      this.inboxSubscription.unsubscribe();
      this.inboxSubscription = null;
    }

    if (this.nc) {
      try {
        await this.nc.drain();
      } catch {
        // Connection may already be closed
      }
      this.nc = null;
    }

    this.emit("disconnected", { agentId: this.ownerAgentId });
  }

  /** Whether a NATS connection is currently active. */
  get isConnected(): boolean {
    return this.nc !== null;
  }

  // ── Tool Definitions (LLM function-calling format) ─────────────────────

  /**
   * Return the three session tool definitions in a format compatible with
   * both OpenAI and Anthropic function-calling schemas.
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: "sessions_list",
        description:
          "List all agents currently registered in the Constella platform. " +
          "Returns each agent's id, specialization, status, and capabilities. " +
          "Use this to discover which agents are available before sending a message.",
        parameters: {
          type: "object",
          properties: {
            statusFilter: {
              type: "string",
              enum: ["ready", "busy", "degraded", "all"],
              description:
                'Filter agents by status. Defaults to "all" which includes every registered agent.',
            },
            specializationFilter: {
              type: "string",
              description:
                "If provided, only return agents whose specialization matches this value.",
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      {
        name: "sessions_send",
        description:
          "Send a message to another agent by its id. " +
          "By default this is fire-and-forget; set awaitReply to true to " +
          "wait for the target agent's response (with a configurable timeout).",
        parameters: {
          type: "object",
          properties: {
            agentId: {
              type: "string",
              description:
                "The target agent's id (e.g. 'codecraft', 'securishield').",
            },
            message: {
              type: "string",
              description: "The message content to send to the target agent.",
            },
            awaitReply: {
              type: "boolean",
              description:
                "If true, block until the target agent responds or timeout is reached. Default false.",
            },
            timeoutMs: {
              type: "number",
              description:
                "Timeout in milliseconds when awaitReply is true. Default 30000.",
            },
          },
          required: ["agentId", "message"],
          additionalProperties: false,
        },
      },
      {
        name: "sessions_history",
        description:
          "Retrieve the recent task/message history for a given agent. " +
          "Returns timestamped entries showing past interactions.",
        parameters: {
          type: "object",
          properties: {
            agentId: {
              type: "string",
              description: "The agent whose history to retrieve.",
            },
            limit: {
              type: "number",
              description:
                "Maximum number of history entries to return (default 50, max 500).",
            },
            since: {
              type: "string",
              format: "date-time",
              description:
                "ISO 8601 timestamp. Only return entries newer than this.",
            },
          },
          required: ["agentId"],
          additionalProperties: false,
        },
      },
    ];
  }

  // ── Tool Implementations ───────────────────────────────────────────────

  /**
   * **sessions_list** — Discover registered agents.
   *
   * Queries the `AgentRegistry` and returns a filtered, serialisable list.
   */
  async sessionsList(options?: {
    statusFilter?: string;
    specializationFilter?: string;
  }): Promise<SessionsListResult> {
    const allAgents: AgentInfo[] = this.registry.getAllAgents();
    const statusFilter = options?.statusFilter ?? "all";
    const specFilter = options?.specializationFilter;

    let filtered = allAgents;

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((a) => a.status === statusFilter);
    }

    // Specialization filter
    if (specFilter) {
      const upper = specFilter.toUpperCase();
      filtered = filtered.filter(
        (a) =>
          a.specialization.toUpperCase() === upper ||
          (a.capabilities ?? []).some((c) => c.toUpperCase().includes(upper)),
      );
    }

    return {
      agents: filtered.map((a) => ({
        id: a.id,
        specialization: a.specialization,
        status: a.status,
        capabilities: a.capabilities ?? [],
        address: a.address,
        lastSeen: a.lastSeen?.toISOString(),
      })),
      total: filtered.length,
    };
  }

  /**
   * **sessions_send** — Send a message to another agent via NATS.
   *
   * 1. Publishes a `SessionMessage` to `constella.agent.{agentId}.inbox`.
   * 2. If `awaitReply` is true, subscribes to the target's `.response`
   *    subject filtered by `correlationId` and waits up to `timeoutMs`.
   * 3. Records the exchange in both agents' history buffers.
   */
  async sessionsSend(
    agentId: string,
    message: string,
    options?: SessionsSendOptions,
  ): Promise<SessionsSendResult> {
    const correlationId = generateCorrelationId();
    const awaitReply = options?.awaitReply ?? false;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    // Validate the target agent exists
    const targetAgent = this.registry.getAgent(agentId);
    if (!targetAgent) {
      return {
        correlationId,
        delivered: false,
        error: `Agent "${agentId}" is not registered in the AgentRegistry.`,
      };
    }

    // Build the envelope
    const envelope: SessionMessage = {
      correlationId,
      fromAgentId: this.ownerAgentId,
      toAgentId: agentId,
      content: message,
      timestamp: new Date(),
      replyTo: awaitReply
        ? buildNatsSubject(this.ownerAgentId, "response")
        : undefined,
    };

    // Record outbound message in sender's history
    this.appendHistory(this.ownerAgentId, {
      timestamp: envelope.timestamp,
      role: "agent",
      content: `[→ ${agentId}] ${message}`,
      agentId: this.ownerAgentId,
    });

    // If NATS is not connected, fall back to event-only delivery
    if (!this.nc) {
      this.emit("message_sent", envelope);

      // Record inbound in target's history (best effort in-process)
      this.appendHistory(agentId, {
        timestamp: envelope.timestamp,
        role: "user",
        content: `[← ${this.ownerAgentId}] ${message}`,
        agentId,
      });

      return {
        correlationId,
        delivered: true,
        error: "NATS not connected — delivered via in-process event only.",
      };
    }

    // Publish to NATS
    const subject = buildNatsSubject(agentId, "inbox");
    const payload = JSON.stringify(envelope);

    try {
      this.nc.publish(subject, sc.encode(payload));
      this.emit("message_sent", envelope);
    } catch (err) {
      return {
        correlationId,
        delivered: false,
        error: `Failed to publish to NATS subject "${subject}": ${err}`,
      };
    }

    // Fire-and-forget path
    if (!awaitReply) {
      return { correlationId, delivered: true };
    }

    // Request/reply path — wait for a response
    const startMs = Date.now();
    try {
      const reply = await this.waitForReply(correlationId, timeoutMs);
      const roundTripMs = Date.now() - startMs;

      // Record reply in sender's history
      this.appendHistory(this.ownerAgentId, {
        timestamp: new Date(),
        role: "agent",
        content: `[← ${agentId} reply] ${reply}`,
        agentId: this.ownerAgentId,
      });

      return { correlationId, delivered: true, reply, roundTripMs };
    } catch {
      return {
        correlationId,
        delivered: true,
        error: `Timeout: no reply from "${agentId}" within ${timeoutMs}ms.`,
        roundTripMs: Date.now() - startMs,
      };
    }
  }

  /**
   * **sessions_history** — Retrieve an agent's recent message/task history.
   *
   * Sources (in priority order):
   * 1. In-memory buffer (always available, fastest)
   * 2. Redis hot store (key = `constella:agent:{agentId}:history`)
   * 3. Neo4j cold store (graph query for long-term history)
   *
   * Each tier is tried in order; the first one that returns data wins.
   */
  async sessionsHistory(
    agentId: string,
    options?: SessionsHistoryOptions,
  ): Promise<SessionsHistoryResult> {
    const limit = Math.min(
      Math.max(options?.limit ?? DEFAULT_HISTORY_LIMIT, 1),
      MAX_HISTORY_LIMIT,
    );
    const since = options?.since;

    // ── 1. Try in-memory buffer ──────────────────────────────────────
    let memEntries = this.historyBuffer.get(agentId) ?? [];

    if (memEntries.length > 0) {
      if (since) {
        const sinceMs = since.getTime();
        memEntries = memEntries.filter((e) => e.timestamp.getTime() >= sinceMs);
      }

      // Most recent first
      const sorted = [...memEntries]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);

      return { entries: sorted, total: sorted.length, source: "memory" };
    }

    // ── 2. Try Redis hot store ───────────────────────────────────────
    if (this.hasRedis) {
      try {
        const redisKey = buildRedisHistoryKey(agentId);
        // Fetch up to `limit` most-recent entries (list is ordered newest-first via LPUSH)
        const raw = await this.redisClient!.lRange(redisKey, 0, limit - 1);

        if (raw.length > 0) {
          let entries: SessionHistoryEntry[] = raw.map((json) => {
            const parsed = JSON.parse(json);
            return {
              ...parsed,
              timestamp: new Date(parsed.timestamp),
            };
          });

          if (since) {
            const sinceMs = since.getTime();
            entries = entries.filter((e) => e.timestamp.getTime() >= sinceMs);
          }

          return { entries, total: entries.length, source: "redis" };
        }
      } catch (err) {
        this.emit("error", { source: "redis_history_read", error: err });
        // Fall through to next tier
      }
    }

    // ── 3. Neo4j cold-store fallback ─────────────────────────────────
    // Neo4j integration is designed to be plugged in via an injected
    // driver instance. When available the query would be:
    //
    //   MATCH (a:Agent {id: $agentId})-[:HAS_HISTORY]->(h:HistoryEntry)
    //   WHERE h.timestamp >= $since
    //   RETURN h ORDER BY h.timestamp DESC LIMIT $limit
    //
    // For now, emit an event so external adapters can handle the query
    // asynchronously and backfill the in-memory / Redis tiers.
    this.emit("history_miss", { agentId, limit, since });

    return { entries: [], total: 0, source: "empty" };
  }

  // ── Tool Dispatcher ────────────────────────────────────────────────────

  /**
   * Dispatch a tool call by name. This is the single entry-point that the
   * LLM tool-use handler invokes after parsing the function call.
   *
   * @returns The serialised JSON result to feed back to the LLM.
   */
  async dispatch(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    switch (toolName) {
      case "sessions_list": {
        const result = await this.sessionsList({
          statusFilter: args.statusFilter as string | undefined,
          specializationFilter: args.specializationFilter as string | undefined,
        });
        return JSON.stringify(result);
      }

      case "sessions_send": {
        const agentId = args.agentId as string;
        const message = args.message as string;
        if (!agentId || !message) {
          return JSON.stringify({
            error: "sessions_send requires 'agentId' and 'message' parameters.",
          });
        }
        const result = await this.sessionsSend(agentId, message, {
          awaitReply: args.awaitReply as boolean | undefined,
          timeoutMs: args.timeoutMs as number | undefined,
        });
        return JSON.stringify(result);
      }

      case "sessions_history": {
        const agentId = args.agentId as string;
        if (!agentId) {
          return JSON.stringify({
            error: "sessions_history requires 'agentId' parameter.",
          });
        }
        const result = await this.sessionsHistory(agentId, {
          limit: args.limit as number | undefined,
          since: args.since ? new Date(args.since as string) : undefined,
        });
        return JSON.stringify(result, (_key, value) => {
          // Serialise Date objects as ISO strings
          if (value instanceof Date) return value.toISOString();
          return value;
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: "${toolName}"` });
    }
  }

  // ── History Management ─────────────────────────────────────────────────

  /**
   * Append an entry to an agent's in-memory history buffer.
   * Also emits a `history_appended` event for external persistence layers
   * (Redis, Neo4j) to pick up.
   */
  appendHistory(agentId: string, entry: SessionHistoryEntry): void {
    let buffer = this.historyBuffer.get(agentId);
    if (!buffer) {
      buffer = [];
      this.historyBuffer.set(agentId, buffer);
    }

    buffer.push(entry);

    // Cap buffer size to prevent unbounded memory growth
    if (buffer.length > MAX_HISTORY_LIMIT * 2) {
      buffer.splice(0, buffer.length - MAX_HISTORY_LIMIT);
    }

    this.emit("history_appended", { agentId, entry });

    // ── Write-through to Redis hot store ─────────────────────────────
    if (this.hasRedis) {
      const redisKey = buildRedisHistoryKey(agentId);
      const serialised = JSON.stringify({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      });

      // LPUSH keeps newest at head; LTRIM caps the list at MAX_HISTORY_LIMIT
      this.redisClient!.multi()
        .lPush(redisKey, serialised)
        .lTrim(redisKey, 0, MAX_HISTORY_LIMIT - 1)
        .expire(redisKey, REDIS_HISTORY_TTL_SECS)
        .exec()
        .catch((err) =>
          this.emit("error", { source: "redis_history_write", error: err }),
        );
    }
  }

  /** Clear all in-memory history for a given agent. Also removes the Redis key. */
  clearHistory(agentId: string): void {
    this.historyBuffer.delete(agentId);

    if (this.hasRedis) {
      const redisKey = buildRedisHistoryKey(agentId);
      this.redisClient!.del(redisKey).catch((err) =>
        this.emit("error", { source: "redis_history_clear", error: err }),
      );
    }
  }

  /** Clear all in-memory history across all agents. */
  clearAllHistory(): void {
    // Delete Redis keys for every agent we have buffered history for
    if (this.hasRedis) {
      for (const agentId of this.historyBuffer.keys()) {
        const redisKey = buildRedisHistoryKey(agentId);
        this.redisClient!.del(redisKey).catch((err) =>
          this.emit("error", { source: "redis_history_clear_all", error: err }),
        );
      }
    }

    this.historyBuffer.clear();
  }

  // ── NATS Message Processing ────────────────────────────────────────────

  /**
   * Process messages arriving on this agent's inbox subject.
   * Each inbound message is deserialised, stored in history,
   * and emitted as an `inbound_message` event for the owning
   * BaseAgent to handle.
   */
  private async processInbox(): Promise<void> {
    if (!this.inboxSubscription) return;

    for await (const msg of this.inboxSubscription) {
      try {
        const raw = sc.decode(msg.data);
        const envelope: SessionMessage = JSON.parse(raw, (key, value) => {
          if (key === "timestamp" && typeof value === "string") {
            return new Date(value);
          }
          return value;
        });

        // Record in target's (our) history
        this.appendHistory(this.ownerAgentId, {
          timestamp: envelope.timestamp,
          role: "user",
          content: `[← ${envelope.fromAgentId}] ${envelope.content}`,
          agentId: this.ownerAgentId,
        });

        this.emit("inbound_message", envelope);

        // If the sender requested a reply, emit a specific event
        if (envelope.replyTo) {
          this.emit("reply_requested", {
            envelope,
            sendReply: (replyContent: string) =>
              this.publishReply(envelope, replyContent),
          });
        }
      } catch (err) {
        this.emit("error", {
          source: "processInbox",
          error: err,
          rawData: sc.decode(msg.data),
        });
      }
    }
  }

  /**
   * Process messages arriving on this agent's response subject.
   * Routes replies to pending `waitForReply` promises by correlationId.
   */
  private async processResponses(sub: Subscription): Promise<void> {
    for await (const msg of sub) {
      try {
        const raw = sc.decode(msg.data);
        const parsed = JSON.parse(raw) as {
          correlationId: string;
          content: string;
        };

        const pending = this.pendingReplies.get(parsed.correlationId);
        if (pending) {
          clearTimeout(pending.timer);
          pending.resolve(parsed.content);
          this.pendingReplies.delete(parsed.correlationId);
        }
      } catch (err) {
        this.emit("error", { source: "processResponses", error: err });
      }
    }
  }

  /**
   * Publish a reply back to the requesting agent's response subject.
   */
  private publishReply(
    originalEnvelope: SessionMessage,
    replyContent: string,
  ): void {
    if (!this.nc) {
      this.emit("error", {
        source: "publishReply",
        error: new Error("NATS not connected"),
      });
      return;
    }

    const replySubject =
      originalEnvelope.replyTo ??
      buildNatsSubject(originalEnvelope.fromAgentId, "response");

    const payload = JSON.stringify({
      correlationId: originalEnvelope.correlationId,
      fromAgentId: this.ownerAgentId,
      toAgentId: originalEnvelope.fromAgentId,
      content: replyContent,
      timestamp: new Date().toISOString(),
    });

    this.nc.publish(replySubject, sc.encode(payload));

    // Record outbound reply in our history
    this.appendHistory(this.ownerAgentId, {
      timestamp: new Date(),
      role: "agent",
      content: `[→ ${originalEnvelope.fromAgentId} reply] ${replyContent}`,
      agentId: this.ownerAgentId,
    });

    this.emit("reply_sent", {
      correlationId: originalEnvelope.correlationId,
      toAgentId: originalEnvelope.fromAgentId,
    });
  }

  /**
   * Returns a promise that resolves when a reply with the given
   * correlationId arrives, or rejects on timeout.
   */
  private waitForReply(
    correlationId: string,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingReplies.delete(correlationId);
        reject(new Error(`Reply timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingReplies.set(correlationId, { resolve, timer });
    });
  }

  // ── Heartbeat / Status ─────────────────────────────────────────────────

  /**
   * Publish a status heartbeat on this agent's status subject.
   * Call this on an interval (e.g. every 30s) for presence tracking.
   */
  async publishStatus(extra?: Record<string, unknown>): Promise<void> {
    if (!this.nc) return;

    const subject = buildNatsSubject(this.ownerAgentId, "status");
    const payload = JSON.stringify({
      agentId: this.ownerAgentId,
      status: "online",
      timestamp: new Date().toISOString(),
      ...extra,
    });

    this.nc.publish(subject, sc.encode(payload));
  }
}
