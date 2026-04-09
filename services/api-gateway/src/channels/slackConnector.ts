// ─── Phase 3c: Slack Channel Connector ──────────────────────────────────────
//
// Webhook handler for the Slack Events API. Receives inbound messages from
// Slack, normalises them into `InboundChannelMessage`, routes them to the
// appropriate Constella agent via NATS, awaits the agent's response, and
// posts the reply back to Slack via the Web API.
//
// Supported Slack event types:
//   - `app_mention`  — when someone @mentions the bot in a channel
//   - `message.im`   — direct messages to the bot
//
// This connector does NOT use the standard `authMiddleware`. Instead, it
// relies on the `slackVerify` middleware for HMAC-SHA256 signature
// verification, which is the Slack-approved authentication mechanism.
//
// Reference: https://api.slack.com/events-api
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { WebClient } from "@slack/web-api";
import { connect, NatsConnection, StringCodec, Subscription } from "nats";
import { slackVerify, preserveRawBody } from "../middleware/slackVerify";
import {
  InboundChannelMessage,
  OutboundChannelMessage,
  SlackChannelConfig,
  extractAgentMention,
  buildAgentInboxSubject,
  buildAgentResponseSubject,
  generateCorrelationId,
  DEFAULT_AGENT_ID,
} from "./types";
import { logger } from "../utils/logger";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_REPLY_TIMEOUT_MS = 30_000;
const NATS_SUBJECT_PREFIX = "constella.agent";

const sc = StringCodec();

// ─── Slack Connector Class ──────────────────────────────────────────────────

/**
 * SlackConnector manages the lifecycle of a single Slack app integration.
 *
 * Responsibilities:
 *  1. Expose an Express router for Slack Events API webhooks
 *  2. Verify request signatures using the Slack Signing Secret
 *  3. Parse `app_mention` and `message` events
 *  4. Resolve which Constella agent should handle the message
 *  5. Publish the message to the agent's NATS inbox subject
 *  6. Await the agent's response on the NATS response subject
 *  7. Post the reply back to the Slack channel via the Web API
 */
export class SlackConnector {
  private readonly config: SlackChannelConfig;
  private readonly slackClient: WebClient;
  private nc: NatsConnection | null = null;
  private readonly replyTimeoutMs: number;

  /**
   * Tracks processed event IDs for idempotency.
   * Slack may retry webhook deliveries, so we deduplicate.
   */
  private processedEvents: Set<string> = new Set();
  private processedEventsMaxSize = 10_000;

  constructor(config: SlackChannelConfig) {
    this.config = config;
    this.slackClient = new WebClient(config.botToken);
    this.replyTimeoutMs = config.replyTimeoutMs || DEFAULT_REPLY_TIMEOUT_MS;
  }

  // ── NATS Lifecycle ──────────────────────────────────────────────────────

  /**
   * Connect to NATS for message routing. Must be called before handling
   * any webhook events. Safe to call multiple times.
   */
  async connectNats(): Promise<void> {
    if (this.nc) return;

    try {
      this.nc = await connect({ servers: this.config.natsUrl });
      logger.info("[SlackConnector] Connected to NATS", {
        url: this.config.natsUrl,
      });
    } catch (err) {
      logger.error("[SlackConnector] Failed to connect to NATS", { error: err });
      throw err;
    }
  }

  /**
   * Disconnect from NATS gracefully.
   */
  async disconnectNats(): Promise<void> {
    if (!this.nc) return;

    try {
      await this.nc.drain();
    } catch {
      // Connection may already be closed
    }
    this.nc = null;
    logger.info("[SlackConnector] Disconnected from NATS");
  }

  // ── Express Router ──────────────────────────────────────────────────────

  /**
   * Create and return an Express Router with the Slack webhook routes.
   *
   * Routes:
   *   POST /events  — Slack Events API endpoint (app_mention, message.im)
   *
   * The router includes:
   *   1. Raw body preservation (for signature verification)
   *   2. Slack HMAC-SHA256 signature verification
   *   3. URL verification challenge handler
   *   4. Event dispatcher
   */
  createRouter(): Router {
    const router = Router();

    // Preserve raw body for signature verification.
    // IMPORTANT: This must come before any JSON body parser on this route.
    router.use(preserveRawBody());

    // Slack signature verification
    router.use(
      slackVerify({
        signingSecret: this.config.signingSecret,
      })
    );

    // JSON body parser (raw body is already preserved above)
    router.use((req: Request, _res: Response, next) => {
      // Body was already parsed by preserveRawBody; just ensure it's an object
      if (typeof req.body === "string") {
        try {
          req.body = JSON.parse(req.body);
        } catch {
          // Leave as-is
        }
      }
      next();
    });

    // ── POST /events ─────────────────────────────────────────────────────
    router.post("/events", async (req: Request, res: Response) => {
      try {
        const body = req.body;

        // ── URL Verification Challenge ─────────────────────────────────
        // Slack sends a challenge request when you first configure the
        // Events API URL. We must respond with the challenge value.
        if (body.type === "url_verification") {
          res.status(200).json({ challenge: body.challenge });
          return;
        }

        // ── Event Callback ─────────────────────────────────────────────
        if (body.type === "event_callback") {
          const event = body.event;

          if (!event) {
            res.status(200).json({ ok: true });
            return;
          }

          // Deduplicate: Slack may retry events
          const eventId = body.event_id || event.client_msg_id || event.ts;
          if (eventId && this.processedEvents.has(eventId)) {
            logger.debug("[SlackConnector] Duplicate event, skipping", {
              eventId,
            });
            res.status(200).json({ ok: true });
            return;
          }

          if (eventId) {
            this.addProcessedEvent(eventId);
          }

          // Respond to Slack immediately to prevent retries (3-second window)
          res.status(200).json({ ok: true });

          // Process the event asynchronously
          this.handleSlackEvent(event, body).catch((err) => {
            logger.error("[SlackConnector] Error handling Slack event", {
              error: err,
              eventType: event.type,
            });
          });
          return;
        }

        // Unknown event type
        res.status(200).json({ ok: true });
      } catch (err) {
        logger.error("[SlackConnector] Error processing webhook", {
          error: err,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    return router;
  }

  // ── Event Handling ──────────────────────────────────────────────────────

  /**
   * Handle a single Slack event (app_mention or message).
   *
   * Flow:
   *  1. Extract the message text and sender info
   *  2. Resolve which Constella agent to route to (from @mentions)
   *  3. Normalise into an InboundChannelMessage
   *  4. Publish to the agent's NATS inbox
   *  5. Await the agent's response
   *  6. Post the reply back to Slack
   */
  private async handleSlackEvent(
    event: Record<string, any>,
    envelope: Record<string, any>
  ): Promise<void> {
    const eventType = event.type as string;

    // Only handle app_mention and message events
    if (eventType !== "app_mention" && eventType !== "message") {
      logger.debug("[SlackConnector] Ignoring event type", { eventType });
      return;
    }

    // Ignore bot messages to prevent infinite loops
    if (event.bot_id || event.subtype === "bot_message") {
      return;
    }

    // Ignore message_changed, message_deleted, etc.
    if (event.subtype && event.subtype !== "file_share") {
      return;
    }

    const text = (event.text as string) || "";
    const senderId = (event.user as string) || "unknown";
    const channelId = (event.channel as string) || "";
    const threadTs = (event.thread_ts as string) || (event.ts as string) || "";
    const messageTs = (event.ts as string) || "";
    const teamId = (envelope.team_id as string) || "";

    // Resolve target agent from @mentions in the text
    const { agentId, cleanedText } = extractAgentMention(text);

    // Try to get the sender's display name
    let senderName = senderId;
    try {
      const userInfo = await this.slackClient.users.info({ user: senderId });
      if (userInfo.ok && userInfo.user) {
        senderName =
          (userInfo.user as any).real_name ||
          (userInfo.user as any).name ||
          senderId;
      }
    } catch {
      // Non-fatal — fall back to user ID
    }

    const correlationId = generateCorrelationId();

    // Build normalised inbound message
    const inbound: InboundChannelMessage = {
      channelType: "slack",
      channelMessageId: messageTs,
      senderId,
      senderName,
      text: cleanedText,
      threadId: threadTs,
      targetAgentId: agentId,
      correlationId,
      receivedAt: new Date(),
      metadata: {
        channelId,
        teamId,
        eventType,
        originalText: text,
        messageTs,
        threadTs,
      },
    };

    logger.info("[SlackConnector] Routing message to agent", {
      agentId,
      correlationId,
      senderId,
      channelId,
      textLength: cleanedText.length,
    });

    // Route through NATS and await response
    const response = await this.routeToAgent(inbound);

    // Post reply back to Slack
    if (response) {
      await this.postReply(inbound, response);
    }
  }

  // ── NATS Routing ────────────────────────────────────────────────────────

  /**
   * Publish an inbound message to the target agent's NATS inbox and
   * await a response on the agent's response subject.
   *
   * @returns The agent's response text, or a timeout/error message
   */
  private async routeToAgent(
    inbound: InboundChannelMessage
  ): Promise<string | null> {
    if (!this.nc) {
      logger.error("[SlackConnector] NATS not connected — cannot route message");
      return "⚠️ I'm having trouble connecting to the agent network. Please try again in a moment.";
    }

    const inboxSubject = buildAgentInboxSubject(inbound.targetAgentId);
    const responseSubject = buildAgentResponseSubject(inbound.targetAgentId);

    // Build the NATS message envelope (matches SessionMessage format from Phase 1)
    const natsPayload = JSON.stringify({
      correlationId: inbound.correlationId,
      fromAgentId: `slack:${inbound.senderId}`,
      toAgentId: inbound.targetAgentId,
      content: inbound.text,
      timestamp: inbound.receivedAt.toISOString(),
      replyTo: responseSubject,
      metadata: {
        channelType: "slack",
        channelId: inbound.metadata.channelId,
        threadId: inbound.threadId,
        senderName: inbound.senderName,
      },
    });

    // Subscribe to the agent's response subject BEFORE publishing
    // so we don't miss a fast reply.
    const responseSub: Subscription = this.nc.subscribe(responseSubject, {
      max: 100, // Auto-unsubscribe after 100 messages (safety valve)
    });

    // Publish the inbound message to the agent's inbox
    try {
      this.nc.publish(inboxSubject, sc.encode(natsPayload));
    } catch (err) {
      responseSub.unsubscribe();
      logger.error("[SlackConnector] Failed to publish to NATS", {
        subject: inboxSubject,
        error: err,
      });
      return "⚠️ Failed to reach the agent. Please try again.";
    }

    // Await the agent's response with a timeout
    try {
      const response = await this.waitForAgentResponse(
        responseSub,
        inbound.correlationId,
        this.replyTimeoutMs
      );
      return response;
    } catch {
      logger.warn("[SlackConnector] Timeout waiting for agent response", {
        agentId: inbound.targetAgentId,
        correlationId: inbound.correlationId,
        timeoutMs: this.replyTimeoutMs,
      });
      return (
        `⏳ ${inbound.targetAgentId} is taking longer than expected. ` +
        `Your request (${inbound.correlationId.slice(0, 8)}...) is still being processed.`
      );
    } finally {
      responseSub.unsubscribe();
    }
  }

  /**
   * Wait for a response message on a NATS subscription that matches
   * the given correlation ID.
   */
  private async waitForAgentResponse(
    sub: Subscription,
    correlationId: string,
    timeoutMs: number
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      (async () => {
        for await (const msg of sub) {
          try {
            const raw = sc.decode(msg.data);
            const parsed = JSON.parse(raw) as {
              correlationId?: string;
              content?: string;
            };

            // Match by correlation ID
            if (parsed.correlationId === correlationId && parsed.content) {
              clearTimeout(timer);
              resolve(parsed.content);
              return;
            }
          } catch {
            // Skip malformed messages
          }
        }

        // If the subscription ends without a match
        clearTimeout(timer);
        reject(new Error("Subscription ended without matching response"));
      })();
    });
  }

  // ── Slack Reply Posting ─────────────────────────────────────────────────

  /**
   * Post the agent's response back to the Slack channel.
   *
   * - Replies in the same thread if the original message was in a thread
   * - Uses the Slack Web API `chat.postMessage`
   * - Handles long responses by splitting into multiple messages if needed
   */
  private async postReply(
    inbound: InboundChannelMessage,
    responseText: string
  ): Promise<void> {
    const channelId = inbound.metadata.channelId as string;
    const threadTs = inbound.threadId;

    if (!channelId) {
      logger.error("[SlackConnector] No channel ID to post reply", {
        correlationId: inbound.correlationId,
      });
      return;
    }

    // Slack has a 40,000 character limit per message.
    // Split long responses into chunks if necessary.
    const MAX_SLACK_MSG_LENGTH = 3900; // Leave room for formatting
    const chunks = this.splitMessage(responseText, MAX_SLACK_MSG_LENGTH);

    for (const chunk of chunks) {
      try {
        await this.slackClient.chat.postMessage({
          channel: channelId,
          text: chunk,
          thread_ts: threadTs,
          unfurl_links: false,
          unfurl_media: false,
          // Add a subtle attribution footer
          ...(chunks.indexOf(chunk) === chunks.length - 1
            ? {
                blocks: [
                  {
                    type: "section",
                    text: { type: "mrkdwn", text: chunk },
                  },
                  {
                    type: "context",
                    elements: [
                      {
                        type: "mrkdwn",
                        text: `🤖 _${inbound.targetAgentId}_ · ${inbound.correlationId.slice(0, 8)}`,
                      },
                    ],
                  },
                ],
              }
            : {}),
        });
      } catch (err) {
        logger.error("[SlackConnector] Failed to post Slack reply", {
          channelId,
          correlationId: inbound.correlationId,
          error: err,
        });
      }
    }

    logger.info("[SlackConnector] Reply posted to Slack", {
      channelId,
      threadTs,
      agentId: inbound.targetAgentId,
      correlationId: inbound.correlationId,
      responseLength: responseText.length,
      chunks: chunks.length,
    });
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  /**
   * Split a long message into chunks that fit within Slack's message limits.
   * Tries to split on newline boundaries for readability.
   */
  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a newline near the limit
      let splitIdx = remaining.lastIndexOf("\n", maxLength);
      if (splitIdx < maxLength * 0.5) {
        // No good newline break — split at a space instead
        splitIdx = remaining.lastIndexOf(" ", maxLength);
      }
      if (splitIdx < maxLength * 0.3) {
        // No good break point at all — hard split
        splitIdx = maxLength;
      }

      chunks.push(remaining.slice(0, splitIdx));
      remaining = remaining.slice(splitIdx).trimStart();
    }

    return chunks;
  }

  /**
   * Add an event ID to the processed set, with overflow protection.
   */
  private addProcessedEvent(eventId: string): void {
    if (this.processedEvents.size >= this.processedEventsMaxSize) {
      // Clear the oldest half of entries.
      // (Set doesn't have ordering guarantees, but this is good enough
      // for deduplication — we're not trying to be perfectly ordered.)
      const entries = Array.from(this.processedEvents);
      this.processedEvents = new Set(
        entries.slice(Math.floor(entries.length / 2))
      );
    }
    this.processedEvents.add(eventId);
  }
}

// ─── Factory Function ───────────────────────────────────────────────────────

/**
 * Create a Slack connector and its Express router from environment variables.
 *
 * Environment variables:
 *   SLACK_BOT_TOKEN       — Bot User OAuth Token (xoxb-...)
 *   SLACK_SIGNING_SECRET  — App Signing Secret for request verification
 *   SLACK_APP_TOKEN       — (Optional) App-Level Token for Socket Mode (xapp-...)
 *   NATS_URL              — NATS server URL (default: nats://localhost:4222)
 *   SLACK_REPLY_TIMEOUT   — Reply timeout in ms (default: 30000)
 *   SLACK_DEFAULT_AGENT   — Default agent for unmentioned messages (default: orchestrator-py)
 *
 * @returns An Express Router ready to be mounted at `/webhooks/slack`
 */
export function createSlackWebhookRouter(): Router {
  const botToken = process.env.SLACK_BOT_TOKEN || "";
  const signingSecret = process.env.SLACK_SIGNING_SECRET || "";
  const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
  const replyTimeoutMs = parseInt(
    process.env.SLACK_REPLY_TIMEOUT || String(DEFAULT_REPLY_TIMEOUT_MS),
    10
  );
  const defaultAgentId =
    process.env.SLACK_DEFAULT_AGENT || DEFAULT_AGENT_ID;

  if (!botToken) {
    logger.warn(
      "[SlackConnector] SLACK_BOT_TOKEN not set — Slack connector will be non-functional."
    );
  }
  if (!signingSecret) {
    logger.warn(
      "[SlackConnector] SLACK_SIGNING_SECRET not set — all requests will be rejected."
    );
  }

  const config: SlackChannelConfig = {
    enabled: !!botToken && !!signingSecret,
    channelType: "slack",
    natsUrl,
    defaultAgentId,
    replyTimeoutMs,
    botToken,
    signingSecret,
  };

  const connector = new SlackConnector(config);

  // Connect to NATS asynchronously — don't block router creation
  connector.connectNats().catch((err) => {
    logger.error("[SlackConnector] Failed to connect to NATS at startup", {
      error: err,
    });
  });

  return connector.createRouter();
}
