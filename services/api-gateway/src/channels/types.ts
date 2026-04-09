// ─── Phase 3: Multi-Channel Routing — Shared Types ──────────────────────────
//
// Canonical types used by all channel connectors (Slack, Discord, Telegram, etc.)
// to normalise inbound/outbound messages before routing them through NATS
// to the appropriate Constella agent.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Channel Types ──────────────────────────────────────────────────────────

export type ChannelType = "slack" | "discord" | "telegram" | "webchat";

// ─── Inbound Messages ───────────────────────────────────────────────────────

/**
 * Normalised inbound message from any external channel.
 * Channel connectors parse platform-specific payloads into this shape
 * before publishing to NATS for agent processing.
 */
export interface InboundChannelMessage {
  /** Which platform this message came from */
  channelType: ChannelType;
  /** Platform-specific message ID (for deduplication and reply threading) */
  channelMessageId: string;
  /** Platform-specific sender identifier (Slack user ID, Discord user ID, etc.) */
  senderId: string;
  /** Human-readable sender display name */
  senderName: string;
  /** The raw text content of the message (bot mention prefix stripped) */
  text: string;
  /** Thread ID for threaded conversations (Slack thread_ts, Discord thread ID) */
  threadId?: string;
  /** The Constella agent ID this message should be routed to */
  targetAgentId: string;
  /** Unique correlation ID for tracking the request/response lifecycle */
  correlationId: string;
  /** Timestamp when the message was received by the gateway */
  receivedAt: Date;
  /**
   * Platform-specific metadata (channel ID, workspace ID, guild ID, etc.)
   * Connectors store whatever they need here for the reply path.
   */
  metadata: Record<string, unknown>;
}

// ─── Outbound Messages ──────────────────────────────────────────────────────

/**
 * Normalised outbound message to be posted back to an external channel.
 * Agents produce responses that are converted into this shape before
 * the channel connector posts them back to the platform.
 */
export interface OutboundChannelMessage {
  /** Which platform to send the reply to */
  channelType: ChannelType;
  /** Platform-specific channel/conversation ID to post the reply in */
  channelId: string;
  /** Thread ID to reply within (preserves threading on Slack/Discord) */
  threadId?: string;
  /** The text content of the reply */
  text: string;
  /** The Constella agent ID that produced this response */
  agentId: string;
  /** Correlation ID matching the original inbound message */
  correlationId: string;
  /** Timestamp when the response was generated */
  respondedAt: Date;
  /** Platform-specific metadata needed by the connector to post the reply */
  metadata: Record<string, unknown>;
}

// ─── Channel Configuration ──────────────────────────────────────────────────

/**
 * Configuration for a channel connector instance.
 * Loaded from environment variables at startup.
 */
export interface ChannelConfig {
  /** Whether this channel connector is enabled */
  enabled: boolean;
  /** Channel type identifier */
  channelType: ChannelType;
  /** NATS server URL for publishing inbound messages */
  natsUrl: string;
  /** Default agent to route messages to when no agent is mentioned */
  defaultAgentId: string;
  /** Reply timeout in milliseconds — how long to wait for an agent response */
  replyTimeoutMs: number;
}

export interface SlackChannelConfig extends ChannelConfig {
  channelType: "slack";
  /** Slack Bot OAuth Token (xoxb-...) */
  botToken: string;
  /** Slack Signing Secret for request verification */
  signingSecret: string;
  /** Optional Slack App Token for Socket Mode (xapp-...) */
  appToken?: string;
}

export interface DiscordChannelConfig extends ChannelConfig {
  channelType: "discord";
  /** Discord Bot Token */
  botToken: string;
  /** Discord Application Public Key for interaction verification */
  publicKey: string;
  /** Discord Application ID */
  applicationId: string;
}

// ─── Agent Routing ──────────────────────────────────────────────────────────

/**
 * Maps mention patterns to Constella agent IDs.
 * Each channel connector uses this to resolve which agent should
 * handle a message based on @mentions in the text.
 *
 * The key is a lowercase mention pattern (without the @), and the
 * value is the Constella agent ID.
 */
export const AGENT_MENTION_MAP: Record<string, string> = {
  // Primary aliases
  chiefarchitect: "orchestrator-py",
  constella: "orchestrator-py",
  architect: "orchestrator-py",

  // Agent-specific mentions
  codecraft: "codecraft",
  code: "codecraft",
  securishield: "securishield",
  security: "securishield",
  designforge: "designforge",
  design: "designforge",
  perfpulse: "perfpulse",
  performance: "perfpulse",
  expressops: "expressops",
  devops: "expressops",
  mobilefirstops: "mobilefirstops",
  mobile: "mobilefirstops",
  "database-agent": "database-agent",
  database: "database-agent",
  db: "database-agent",
  "python-expert": "python-expert",
  python: "python-expert",
  evaluator: "evaluator",
  retriever: "retriever",
  embedding: "embedding",
  "soc2-compliance": "soc2-compliance",
  soc2: "soc2-compliance",
  compliance: "soc2-compliance",
  "memory-guardian": "memory-guardian",
  memory: "memory-guardian",
};

/** Default agent for messages with no recognised mention */
export const DEFAULT_AGENT_ID = "orchestrator-py";

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Resolve a mention string to a Constella agent ID.
 *
 * @param mention — The raw mention text (e.g. "@CodeCraft", "codecraft", "security")
 * @returns The agent ID, or the default agent if no match is found
 */
export function resolveAgentFromMention(mention: string): string {
  // Strip leading @ and whitespace, lowercase
  const normalised = mention.replace(/^@/, "").trim().toLowerCase();
  return AGENT_MENTION_MAP[normalised] ?? DEFAULT_AGENT_ID;
}

/**
 * Extract the first @mention from a message and return:
 *  - The resolved agent ID
 *  - The message text with the mention stripped
 *
 * If no mention is found, routes to the default agent.
 */
export function extractAgentMention(text: string): {
  agentId: string;
  cleanedText: string;
} {
  // Match patterns like @AgentName or @agent-name at the start of the message
  const mentionRegex = /^<@[A-Z0-9]+>\s*|^@([\w-]+)\s*/i;
  const match = text.match(mentionRegex);

  if (match) {
    const mentionText = match[1] || "";
    const agentId = resolveAgentFromMention(mentionText);
    const cleanedText = text.slice(match[0].length).trim();
    return { agentId, cleanedText: cleanedText || text };
  }

  // No mention found — check if any agent name appears in the text
  const lowerText = text.toLowerCase();
  for (const [pattern, agentId] of Object.entries(AGENT_MENTION_MAP)) {
    if (lowerText.includes(`@${pattern}`)) {
      const cleanedText = text.replace(new RegExp(`@${pattern}`, "gi"), "").trim();
      return { agentId, cleanedText: cleanedText || text };
    }
  }

  return { agentId: DEFAULT_AGENT_ID, cleanedText: text };
}

/**
 * Build the NATS subject for routing an inbound channel message to an agent.
 *
 * Pattern: `constella.agent.{agentId}.inbox`
 */
export function buildAgentInboxSubject(agentId: string): string {
  return `constella.agent.${agentId}.inbox`;
}

/**
 * Build the NATS subject for listening to an agent's response.
 *
 * Pattern: `constella.agent.{agentId}.response`
 */
export function buildAgentResponseSubject(agentId: string): string {
  return `constella.agent.${agentId}.response`;
}

/**
 * Generate a correlation ID for tracking a channel message through the system.
 * Uses crypto.randomUUID if available, falls back to a random hex string.
 */
export function generateCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback: 32 hex chars
    return Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  }
}
