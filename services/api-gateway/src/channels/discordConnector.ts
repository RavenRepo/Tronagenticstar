// ─── Phase 3e: Discord Channel Connector ────────────────────────────────────
//
// Webhook handler for Discord Interactions. Receives inbound messages from
// Discord, normalises them into `InboundChannelMessage`, routes them to the
// appropriate Constella agent via NATS, awaits the agent's response, and
// posts the reply back to Discord via the REST API.
//
// Supported Discord interaction types:
//   - Type 1: PING           — Discord verification handshake (respond with PONG)
//   - Type 2: APPLICATION_COMMAND — slash command invocations
//   - Type 4: MESSAGE_COMPONENT  — button / select menu interactions
//
// Additionally handles gateway MESSAGE_CREATE events when configured as a
// bot user receiving forwarded webhook payloads.
//
// This connector does NOT use the standard `authMiddleware`. Instead, it
// relies on the `discordVerify` middleware for Ed25519 signature
// verification, which is Discord's required authentication mechanism.
//
// Reference: https://discord.com/developers/docs/interactions/receiving-and-responding
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import axios from "axios";
import { connect, NatsConnection, StringCodec, Subscription } from "nats";
import { discordVerify } from "../middleware/discordVerify";
import { preserveRawBody } from "../middleware/slackVerify";
import {
  InboundChannelMessage,
  OutboundChannelMessage,
  DiscordChannelConfig,
  extractAgentMention,
  buildAgentInboxSubject,
  buildAgentResponseSubject,
  generateCorrelationId,
  DEFAULT_AGENT_ID,
} from "./types";
import { logger } from "../utils/logger";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_REPLY_TIMEOUT_MS = 30_000;
const DISCORD_API_BASE = "https://discord.com/api/v10";
const MAX_DISCORD_MSG_LENGTH = 2000;

const sc = StringCodec();

// ─── Discord Interaction Types ──────────────────────────────────────────────

enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

enum InteractionResponseType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
}

// ─── Discord Connector Class ────────────────────────────────────────────────

/**
 * DiscordConnector manages the lifecycle of a single Discord application
 * integration via the Interactions Endpoint.
 *
 * Responsibilities:
 *  1. Expose an Express router for Discord Interactions webhook
 *  2. Verify request signatures using Ed25519 (via discordVerify middleware)
 *  3. Handle PING interactions with a PONG response (required by Discord)
 *  4. Parse APPLICATION_COMMAND and MESSAGE_COMPONENT interactions
 *  5. Resolve which Constella agent should handle the interaction
 *  6. Publish the message to the agent's NATS inbox subject
 *  7. Await the agent's response on the NATS response subject
 *  8. Post the reply back to Discord via the REST API or interaction response
 */
export class DiscordConnector {
  private readonly config: DiscordChannelConfig;
  private nc: NatsConnection | null = null;
  private readonly replyTimeoutMs: number;

  /**
   * Tracks processed interaction IDs for idempotency.
   * Discord may deliver duplicate interactions in edge cases.
   */
  private processedInteractions: Set<string> = new Set();
  private processedInteractionsMaxSize = 10_000;

  constructor(config: DiscordChannelConfig) {
    this.config = config;
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
      logger.info("[DiscordConnector] Connected to NATS", {
        url: this.config.natsUrl,
      });
    } catch (err) {
      logger.error("[DiscordConnector] Failed to connect to NATS", {
        error: err,
      });
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
    logger.info("[DiscordConnector] Disconnected from NATS");
  }

  // ── Express Router ──────────────────────────────────────────────────────

  /**
   * Create and return an Express Router with the Discord webhook routes.
   *
   * Routes:
   *   POST /events  — Discord Interactions endpoint
   *
   * The router includes:
   *   1. Raw body preservation (for Ed25519 signature verification)
   *   2. Discord Ed25519 signature verification
   *   3. PING/PONG handler (required by Discord for endpoint validation)
   *   4. Interaction dispatcher
   */
  createRouter(): Router {
    const router = Router();

    // Preserve raw body for signature verification.
    // IMPORTANT: This must come before any JSON body parser on this route.
    router.use(preserveRawBody());

    // Discord Ed25519 signature verification
    router.use(
      discordVerify({
        publicKey: this.config.publicKey,
      })
    );

    // JSON body parser (raw body is already preserved above)
    router.use((req: Request, _res: Response, next) => {
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
        const interactionType = body.type as number;

        // ── PING — Discord verification handshake ──────────────────────
        // Discord sends a PING interaction when you first register the
        // Interactions Endpoint URL. You MUST respond with a PONG (type 1).
        // This is also sent periodically to verify the endpoint is alive.
        if (interactionType === InteractionType.PING) {
          logger.info("[DiscordConnector] Received PING, responding with PONG");
          res.status(200).json({ type: InteractionResponseType.PONG });
          return;
        }

        // ── APPLICATION_COMMAND — Slash commands ───────────────────────
        if (interactionType === InteractionType.APPLICATION_COMMAND) {
          const interactionId = body.id as string;
          const interactionToken = body.token as string;

          // Deduplicate
          if (this.processedInteractions.has(interactionId)) {
            logger.debug("[DiscordConnector] Duplicate interaction, skipping", {
              interactionId,
            });
            res.status(200).json({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: "Processing..." },
            });
            return;
          }
          this.addProcessedInteraction(interactionId);

          // Immediately defer the response — this gives us up to 15 minutes
          // to send a follow-up instead of the 3-second interaction deadline.
          res.status(200).json({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          });

          // Process the interaction asynchronously
          this.handleApplicationCommand(body, interactionToken).catch(
            (err) => {
              logger.error(
                "[DiscordConnector] Error handling APPLICATION_COMMAND",
                {
                  error: err,
                  interactionId,
                }
              );
              // Send an error follow-up
              this.sendFollowup(
                interactionToken,
                "⚠️ An error occurred while processing your request."
              ).catch(() => {
                // Best effort
              });
            }
          );
          return;
        }

        // ── MESSAGE_COMPONENT — Buttons / Select Menus ─────────────────
        if (interactionType === InteractionType.MESSAGE_COMPONENT) {
          const interactionId = body.id as string;
          const interactionToken = body.token as string;

          this.addProcessedInteraction(interactionId);

          // Defer update
          res.status(200).json({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
          });

          // Process the component interaction asynchronously
          this.handleMessageComponent(body, interactionToken).catch((err) => {
            logger.error(
              "[DiscordConnector] Error handling MESSAGE_COMPONENT",
              {
                error: err,
                interactionId,
              }
            );
          });
          return;
        }

        // ── Unknown interaction type — acknowledge silently ────────────
        logger.debug("[DiscordConnector] Unknown interaction type", {
          type: interactionType,
        });
        res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: "Interaction received." },
        });
      } catch (err) {
        logger.error("[DiscordConnector] Error processing webhook", {
          error: err,
        });
        res.status(500).json({ error: "Internal server error" });
      }
    });

    return router;
  }

  // ── Interaction Handling ─────────────────────────────────────────────────

  /**
   * Handle an APPLICATION_COMMAND interaction (slash command).
   *
   * Extracts the command name and options, resolves the target agent,
   * routes through NATS, and posts a follow-up response.
   */
  private async handleApplicationCommand(
    body: Record<string, any>,
    interactionToken: string
  ): Promise<void> {
    const data = body.data || {};
    const commandName = (data.name as string) || "";
    const options = (data.options as Array<Record<string, any>>) || [];
    const userId = body.member?.user?.id || body.user?.id || "unknown";
    const userName =
      body.member?.user?.global_name ||
      body.member?.user?.username ||
      body.user?.global_name ||
      body.user?.username ||
      userId;
    const channelId = body.channel_id || body.channel?.id || "";
    const guildId = body.guild_id || "";
    const interactionId = body.id as string;

    // Extract the message text from command options.
    // Common patterns:
    //   /ask message:"What is X?"
    //   /agent name:"codecraft" message:"Generate a helper"
    let messageText = "";
    let targetAgentId = DEFAULT_AGENT_ID;

    // Look for a "message" or "prompt" or "query" option
    const messageOption = options.find(
      (o) =>
        o.name === "message" ||
        o.name === "prompt" ||
        o.name === "query" ||
        o.name === "text"
    );
    if (messageOption) {
      messageText = String(messageOption.value || "");
    }

    // Look for an "agent" option to override target agent
    const agentOption = options.find(
      (o) => o.name === "agent" || o.name === "to"
    );
    if (agentOption) {
      const { agentId } = extractAgentMention(String(agentOption.value || ""));
      targetAgentId = agentId;
    }

    // If no explicit message option, concatenate all option values
    if (!messageText) {
      messageText =
        options.map((o) => `${o.name}: ${o.value}`).join(", ") ||
        commandName;
    }

    // If the command name itself maps to an agent, use that
    if (targetAgentId === DEFAULT_AGENT_ID) {
      const { agentId, cleanedText } = extractAgentMention(commandName);
      if (agentId !== DEFAULT_AGENT_ID) {
        targetAgentId = agentId;
      }
      if (!messageText) {
        messageText = cleanedText || commandName;
      }
    }

    const correlationId = generateCorrelationId();

    const inbound: InboundChannelMessage = {
      channelType: "discord",
      channelMessageId: interactionId,
      senderId: userId,
      senderName: userName,
      text: messageText,
      threadId: undefined,
      targetAgentId,
      correlationId,
      receivedAt: new Date(),
      metadata: {
        channelId,
        guildId,
        interactionToken,
        commandName,
        options,
        interactionType: "APPLICATION_COMMAND",
      },
    };

    logger.info("[DiscordConnector] Routing slash command to agent", {
      agentId: targetAgentId,
      correlationId,
      commandName,
      userId,
      channelId,
    });

    // Route through NATS and await response
    const response = await this.routeToAgent(inbound);

    // Post follow-up response to Discord
    if (response) {
      await this.sendFollowup(interactionToken, response, targetAgentId, correlationId);
    }
  }

  /**
   * Handle a MESSAGE_COMPONENT interaction (button click, select menu).
   *
   * Extracts the custom_id, resolves intent, routes through NATS.
   */
  private async handleMessageComponent(
    body: Record<string, any>,
    interactionToken: string
  ): Promise<void> {
    const data = body.data || {};
    const customId = (data.custom_id as string) || "";
    const componentType = data.component_type as number;
    const userId = body.member?.user?.id || body.user?.id || "unknown";
    const userName =
      body.member?.user?.global_name ||
      body.member?.user?.username ||
      body.user?.global_name ||
      body.user?.username ||
      userId;
    const channelId = body.channel_id || body.channel?.id || "";
    const guildId = body.guild_id || "";
    const interactionId = body.id as string;

    // Parse custom_id to extract agent and action.
    // Convention: custom_id = "agentId:action:extra"
    const parts = customId.split(":");
    const targetAgentId = parts[0] || DEFAULT_AGENT_ID;
    const action = parts[1] || "component_click";
    const extra = parts.slice(2).join(":") || "";

    // For select menus, include the selected values
    const values = data.values || [];
    const messageText = values.length > 0
      ? `[${action}] Selected: ${values.join(", ")}${extra ? ` (${extra})` : ""}`
      : `[${action}]${extra ? ` ${extra}` : ""}`;

    const correlationId = generateCorrelationId();

    const inbound: InboundChannelMessage = {
      channelType: "discord",
      channelMessageId: interactionId,
      senderId: userId,
      senderName: userName,
      text: messageText,
      threadId: undefined,
      targetAgentId,
      correlationId,
      receivedAt: new Date(),
      metadata: {
        channelId,
        guildId,
        interactionToken,
        customId,
        componentType,
        values,
        interactionType: "MESSAGE_COMPONENT",
      },
    };

    logger.info("[DiscordConnector] Routing component interaction to agent", {
      agentId: targetAgentId,
      correlationId,
      customId,
      userId,
    });

    const response = await this.routeToAgent(inbound);

    if (response) {
      await this.sendFollowup(interactionToken, response, targetAgentId, correlationId);
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
      logger.error(
        "[DiscordConnector] NATS not connected — cannot route message"
      );
      return "⚠️ I'm having trouble connecting to the agent network. Please try again in a moment.";
    }

    const inboxSubject = buildAgentInboxSubject(inbound.targetAgentId);
    const responseSubject = buildAgentResponseSubject(inbound.targetAgentId);

    // Build the NATS message envelope (matches SessionMessage format from Phase 1)
    const natsPayload = JSON.stringify({
      correlationId: inbound.correlationId,
      fromAgentId: `discord:${inbound.senderId}`,
      toAgentId: inbound.targetAgentId,
      content: inbound.text,
      timestamp: inbound.receivedAt.toISOString(),
      replyTo: responseSubject,
      metadata: {
        channelType: "discord",
        channelId: inbound.metadata.channelId,
        guildId: inbound.metadata.guildId,
        senderName: inbound.senderName,
        interactionType: inbound.metadata.interactionType,
      },
    });

    // Subscribe to the agent's response subject BEFORE publishing
    // so we don't miss a fast reply.
    const responseSub: Subscription = this.nc.subscribe(responseSubject, {
      max: 100, // Auto-unsubscribe safety valve
    });

    // Publish the inbound message to the agent's inbox
    try {
      this.nc.publish(inboxSubject, sc.encode(natsPayload));
    } catch (err) {
      responseSub.unsubscribe();
      logger.error("[DiscordConnector] Failed to publish to NATS", {
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
      logger.warn("[DiscordConnector] Timeout waiting for agent response", {
        agentId: inbound.targetAgentId,
        correlationId: inbound.correlationId,
        timeoutMs: this.replyTimeoutMs,
      });
      return (
        `⏳ **${inbound.targetAgentId}** is taking longer than expected. ` +
        `Your request (\`${inbound.correlationId.slice(0, 8)}...\`) is still being processed.`
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

  // ── Discord Reply Posting ───────────────────────────────────────────────

  /**
   * Send a follow-up message via the Discord Interactions webhook.
   *
   * After deferring an interaction response, we have up to 15 minutes
   * to send follow-up messages using the interaction token.
   *
   * Endpoint: POST /webhooks/{application_id}/{interaction_token}
   *
   * Handles long responses by splitting into multiple messages.
   */
  async sendFollowup(
    interactionToken: string,
    responseText: string,
    agentId?: string,
    correlationId?: string
  ): Promise<void> {
    const webhookUrl = `${DISCORD_API_BASE}/webhooks/${this.config.applicationId}/${interactionToken}`;

    // Discord has a 2000 character limit per message.
    const chunks = this.splitMessage(responseText, MAX_DISCORD_MSG_LENGTH - 100);

    for (let i = 0; i < chunks.length; i++) {
      let content = chunks[i];

      // Add attribution footer to the last chunk
      if (i === chunks.length - 1 && agentId) {
        const footer = correlationId
          ? `\n-# 🤖 *${agentId}* · \`${correlationId.slice(0, 8)}\``
          : `\n-# 🤖 *${agentId}*`;

        if (content.length + footer.length <= MAX_DISCORD_MSG_LENGTH) {
          content += footer;
        }
      }

      try {
        await axios.post(
          webhookUrl,
          { content },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bot ${this.config.botToken}`,
            },
            timeout: 10_000,
          }
        );
      } catch (err) {
        logger.error("[DiscordConnector] Failed to send follow-up", {
          error: err instanceof Error ? err.message : String(err),
          webhookUrl: webhookUrl.replace(interactionToken, "***"),
          chunkIndex: i,
          chunkLength: content.length,
        });
      }
    }

    logger.info("[DiscordConnector] Follow-up posted to Discord", {
      agentId,
      correlationId,
      responseLength: responseText.length,
      chunks: chunks.length,
    });
  }

  /**
   * Post a message directly to a Discord channel via the REST API.
   * Used for non-interaction message replies (e.g. responding to
   * forwarded MESSAGE_CREATE events).
   *
   * Endpoint: POST /channels/{channel_id}/messages
   */
  async postChannelMessage(
    channelId: string,
    text: string,
    replyToMessageId?: string
  ): Promise<void> {
    const url = `${DISCORD_API_BASE}/channels/${channelId}/messages`;

    const chunks = this.splitMessage(text, MAX_DISCORD_MSG_LENGTH);

    for (const chunk of chunks) {
      const payload: Record<string, any> = { content: chunk };

      // Reply to a specific message if provided (only for the first chunk)
      if (replyToMessageId && chunks.indexOf(chunk) === 0) {
        payload.message_reference = {
          message_id: replyToMessageId,
        };
      }

      try {
        await axios.post(url, payload, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bot ${this.config.botToken}`,
          },
          timeout: 10_000,
        });
      } catch (err) {
        logger.error("[DiscordConnector] Failed to post channel message", {
          channelId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  /**
   * Split a long message into chunks that fit within Discord's message limits.
   * Tries to split on newline or space boundaries for readability.
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
   * Add an interaction ID to the processed set, with overflow protection.
   */
  private addProcessedInteraction(interactionId: string): void {
    if (this.processedInteractions.size >= this.processedInteractionsMaxSize) {
      const entries = Array.from(this.processedInteractions);
      this.processedInteractions = new Set(
        entries.slice(Math.floor(entries.length / 2))
      );
    }
    this.processedInteractions.add(interactionId);
  }
}

// ─── Factory Function ───────────────────────────────────────────────────────

/**
 * Create a Discord connector and its Express router from environment variables.
 *
 * Environment variables:
 *   DISCORD_BOT_TOKEN      — Bot Token for REST API calls
 *   DISCORD_PUBLIC_KEY     — Application Public Key for Ed25519 verification
 *   DISCORD_APPLICATION_ID — Application ID for webhook URLs
 *   NATS_URL               — NATS server URL (default: nats://localhost:4222)
 *   DISCORD_REPLY_TIMEOUT  — Reply timeout in ms (default: 30000)
 *   DISCORD_DEFAULT_AGENT  — Default agent for unmentioned messages (default: orchestrator-py)
 *
 * @returns An Express Router ready to be mounted at `/webhooks/discord`
 */
export function createDiscordWebhookRouter(): Router {
  const botToken = process.env.DISCORD_BOT_TOKEN || "";
  const publicKey = process.env.DISCORD_PUBLIC_KEY || "";
  const applicationId = process.env.DISCORD_APPLICATION_ID || "";
  const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
  const replyTimeoutMs = parseInt(
    process.env.DISCORD_REPLY_TIMEOUT || String(DEFAULT_REPLY_TIMEOUT_MS),
    10
  );
  const defaultAgentId =
    process.env.DISCORD_DEFAULT_AGENT || DEFAULT_AGENT_ID;

  if (!botToken) {
    logger.warn(
      "[DiscordConnector] DISCORD_BOT_TOKEN not set — Discord connector will be non-functional."
    );
  }
  if (!publicKey) {
    logger.warn(
      "[DiscordConnector] DISCORD_PUBLIC_KEY not set — all requests will be rejected."
    );
  }
  if (!applicationId) {
    logger.warn(
      "[DiscordConnector] DISCORD_APPLICATION_ID not set — follow-up messages will fail."
    );
  }

  const config: DiscordChannelConfig = {
    enabled: !!botToken && !!publicKey && !!applicationId,
    channelType: "discord",
    natsUrl,
    defaultAgentId,
    replyTimeoutMs,
    botToken,
    publicKey,
    applicationId,
  };

  const connector = new DiscordConnector(config);

  // Connect to NATS asynchronously — don't block router creation
  connector.connectNats().catch((err) => {
    logger.error("[DiscordConnector] Failed to connect to NATS at startup", {
      error: err,
    });
  });

  return connector.createRouter();
}
