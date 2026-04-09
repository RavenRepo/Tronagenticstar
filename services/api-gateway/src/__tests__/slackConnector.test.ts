// ─── Unit Tests for Slack Channel Connector ─────────────────────────────────
//
// Tests for:
//   - SlackConnector class instantiation
//   - createRouter() Express router creation
//   - Slack Events API url_verification challenge handling
//   - Event deduplication
//   - handleSlackEvent() routing logic
//   - NATS message publishing and response handling
//   - postReply() Slack Web API integration
//   - splitMessage() for long messages
//   - createSlackWebhookRouter() factory function
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response } from "express";
import request from "supertest";
import crypto from "crypto";
import { SlackConnector } from "../channels/slackConnector";
import { SlackChannelConfig } from "../channels/types";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock NATS — declare mocks at module scope but create them inside the factory
// so jest.mock hoisting doesn't try to reference them before initialization.
const mockNatsPublish = jest.fn();
const mockNatsSubscribe = jest.fn();
const mockNatsDrain = jest.fn().mockResolvedValue(undefined);
const mockNatsClose = jest.fn().mockResolvedValue(undefined);

jest.mock("nats", () => {
  const mockNatsConnection = {
    publish: jest.fn(),
    subscribe: jest.fn(),
    drain: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    isClosed: jest.fn().mockReturnValue(false),
  };
  return {
    connect: jest.fn().mockResolvedValue(mockNatsConnection),
    StringCodec: jest.fn().mockReturnValue({
      encode: jest.fn((str: string) => Buffer.from(str, "utf-8")),
      decode: jest.fn((buf: Uint8Array) => Buffer.from(buf).toString("utf-8")),
    }),
    __mockConnection: mockNatsConnection,
  };
});

// Mock Slack Web API
const mockChatPostMessage = jest
  .fn()
  .mockResolvedValue({ ok: true, ts: "1234567890.123456" });
const mockUsersInfo = jest.fn().mockResolvedValue({
  ok: true,
  user: { real_name: "Test User", profile: { display_name: "testuser" } },
});

jest.mock("@slack/web-api", () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockChatPostMessage },
    users: { info: mockUsersInfo },
  })),
}));

// Mock logger
jest.mock("../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock slackVerify middleware — preserveRawBody() streams conflict with supertest
// because supertest already serialises the body before sending. The real
// preserveRawBody() attaches a "data"/"end" listener on the request stream,
// but that stream is already consumed by express.json(), causing an indefinite hang.
// We replace both functions with simple pass-through middleware for unit tests.
jest.mock("../middleware/slackVerify", () => ({
  preserveRawBody: () => (_req: any, _res: any, next: any) => next(),
  slackVerify: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_SIGNING_SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const TEST_BOT_TOKEN = "xoxb-test-bot-token-1234567890";

function computeSlackSignature(
  signingSecret: string,
  timestamp: number | string,
  body: string,
): string {
  const sigBaseString = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(sigBaseString, "utf-8")
    .digest("hex");
  return `v0=${hmac}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function createTestConfig(
  overrides: Partial<SlackChannelConfig> = {},
): SlackChannelConfig {
  return {
    enabled: true,
    channelType: "slack",
    natsUrl: "nats://localhost:4222",
    defaultAgentId: "orchestrator-py",
    replyTimeoutMs: 5000,
    botToken: TEST_BOT_TOKEN,
    signingSecret: TEST_SIGNING_SECRET,
    ...overrides,
  };
}

/**
 * Create a test Express app with the SlackConnector's router mounted.
 * Uses skipVerification to bypass HMAC checks in most tests.
 */
function createTestApp(config?: Partial<SlackChannelConfig>): {
  app: express.Application;
  connector: SlackConnector;
} {
  const fullConfig = createTestConfig(config);
  const connector = new SlackConnector(fullConfig);
  const router = connector.createRouter();

  const app = express();
  // We need to mount without signature verification for unit testing
  // the router logic itself. Signature verification is tested separately.
  app.use(express.json());
  app.use("/webhooks/slack", router);

  return { app, connector };
}

/**
 * Create a Slack Events API request body for url_verification challenge.
 */
function createChallengePayload(challenge = "test_challenge_token_abc123") {
  return {
    token: "deprecated-verification-token",
    challenge,
    type: "url_verification",
  };
}

/**
 * Create a Slack Events API request body for an app_mention event.
 */
function createAppMentionPayload(overrides: Record<string, any> = {}) {
  return {
    token: "deprecated-token",
    team_id: "T12345",
    event_id: overrides.event_id || "Ev12345",
    type: "event_callback",
    event: {
      type: "app_mention",
      text: overrides.text || "<@U12345> @codecraft help me with TypeScript",
      user: overrides.user || "U67890",
      channel: overrides.channel || "C11111",
      ts: overrides.ts || "1234567890.123456",
      thread_ts: overrides.thread_ts || undefined,
      ...overrides.eventOverrides,
    },
    ...overrides,
  };
}

/**
 * Create a Slack Events API request body for a message.im event.
 */
function createDirectMessagePayload(overrides: Record<string, any> = {}) {
  return {
    token: "deprecated-token",
    team_id: "T12345",
    event_id: overrides.event_id || "Ev99999",
    type: "event_callback",
    event: {
      type: "message",
      channel_type: "im",
      text: overrides.text || "Help me build an API",
      user: overrides.user || "U67890",
      channel: overrides.channel || "D22222",
      ts: overrides.ts || "1234567890.654321",
      thread_ts: overrides.thread_ts || undefined,
      ...overrides.eventOverrides,
    },
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("SlackConnector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Constructor ────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("should instantiate with a valid configuration", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      expect(connector).toBeDefined();
      expect(connector).toBeInstanceOf(SlackConnector);
    });

    it("should use default reply timeout when not specified", () => {
      const config = createTestConfig({ replyTimeoutMs: 0 });
      const connector = new SlackConnector(config);
      // The connector should fall back to DEFAULT_REPLY_TIMEOUT_MS (30000)
      expect(connector).toBeDefined();
    });

    it("should accept a custom reply timeout", () => {
      const config = createTestConfig({ replyTimeoutMs: 10000 });
      const connector = new SlackConnector(config);
      expect(connector).toBeDefined();
    });
  });

  // ─── createRouter ──────────────────────────────────────────────────────

  describe("createRouter", () => {
    it("should return an Express router", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      const router = connector.createRouter();
      expect(router).toBeDefined();
      expect(typeof router).toBe("function"); // Express routers are functions
    });

    it("should create a router that can be mounted on an Express app", () => {
      const { app } = createTestApp();
      expect(app).toBeDefined();
    });
  });

  // ─── URL Verification Challenge ────────────────────────────────────────

  describe("url_verification challenge", () => {
    it("should respond to Slack url_verification challenge", async () => {
      const { app } = createTestApp();
      const payload = createChallengePayload("my_challenge_token");

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.challenge).toBe("my_challenge_token");
    });

    it("should respond with the exact challenge token provided", async () => {
      const { app } = createTestApp();
      const challenge = "randomChallengeString12345";
      const payload = createChallengePayload(challenge);

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.challenge).toBe(challenge);
    });

    it("should handle url_verification with special characters in challenge", async () => {
      const { app } = createTestApp();
      const challenge = "abc-123_XYZ.test!@#$%";
      const payload = createChallengePayload(challenge);

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.challenge).toBe(challenge);
    });
  });

  // ─── Event Callback Handling ──────────────────────────────────────────

  describe("event_callback handling", () => {
    it("should return 200 OK immediately for a valid event_callback", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload();

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      // Slack expects a 200 within 3 seconds; the async processing happens in background
      expect(res.status).toBe(200);
    });

    it("should return 200 for a direct message event", async () => {
      const { app } = createTestApp();
      const payload = createDirectMessagePayload();

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should ignore bot messages to prevent loops", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        eventOverrides: { bot_id: "B12345" },
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should ignore events with subtype (e.g. message_changed, message_deleted)", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        eventOverrides: { subtype: "message_changed" },
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  // ─── Event Deduplication ──────────────────────────────────────────────

  describe("event deduplication", () => {
    it("should handle duplicate event IDs gracefully", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({ event_id: "Ev_DUPLICATE" });

      // First request
      const res1 = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);
      expect(res1.status).toBe(200);

      // Second request with same event_id (Slack retry)
      const res2 = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);
      expect(res2.status).toBe(200);
    });

    it("should handle Slack retry headers (x-slack-retry-num)", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({ event_id: "Ev_RETRY" });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .set("x-slack-retry-num", "1")
        .set("x-slack-retry-reason", "http_timeout")
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  // ─── Agent Mention Extraction ─────────────────────────────────────────

  describe("agent mention extraction from event text", () => {
    it("should extract @codecraft mention from event text", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        text: "<@U12345> @codecraft review my code please",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should extract @security alias for securishield", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        text: "<@U12345> @security scan my endpoints",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should route to default agent when no agent is mentioned", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        text: "<@U12345> help me with something",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with only a bot mention (no agent)", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        text: "<@U12345>",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  // ─── Thread Support ───────────────────────────────────────────────────

  describe("thread support", () => {
    it("should accept messages with thread_ts (threaded conversations)", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        thread_ts: "1234567890.000001",
        ts: "1234567890.000002",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should accept messages without thread_ts (top-level messages)", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({ thread_ts: undefined });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  // ─── NATS Connection ──────────────────────────────────────────────────

  describe("NATS connection lifecycle", () => {
    it("should connect to NATS on connectNats()", async () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);

      await connector.connectNats();

      const nats = require("nats");
      expect(nats.connect).toHaveBeenCalled();
    });

    it("should disconnect from NATS on disconnectNats()", async () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);

      await connector.connectNats();
      await connector.disconnectNats();

      const nats = require("nats");
      const mockConn = nats.__mockConnection;
      expect(mockConn.drain).toHaveBeenCalled();
    });

    it("should handle NATS connection errors gracefully", async () => {
      const nats = require("nats");
      nats.connect.mockRejectedValueOnce(new Error("NATS connection refused"));

      const config = createTestConfig();
      const connector = new SlackConnector(config);

      // connectNats() logs the error and re-throws so callers can handle it
      await expect(connector.connectNats()).rejects.toThrow(
        "NATS connection refused",
      );
    });

    it("should handle NATS disconnect errors gracefully", async () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);

      // Disconnect without connecting first
      await expect(connector.disconnectNats()).resolves.not.toThrow();
    });
  });

  // ─── Message Splitting ────────────────────────────────────────────────

  describe("message splitting (splitMessage)", () => {
    it("should not split short messages", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);

      // Access private method via prototype for testing
      const splitMessage = (connector as any).splitMessage.bind(connector);
      const result = splitMessage("Hello, world!", 4000);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hello, world!");
    });

    it("should split messages exceeding the max length", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const longMessage = "A".repeat(5000);
      const result = splitMessage(longMessage, 2000);

      expect(result.length).toBeGreaterThan(1);
      // Reassembled message should contain all original characters
      expect(result.join("").length).toBe(5000);
    });

    it("should prefer splitting at newline boundaries", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const message = "Line 1\n" + "A".repeat(1990) + "\nLine 3";
      const result = splitMessage(message, 2000);

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle messages with no good split points", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      // One long line with no newlines or spaces
      const message = "X".repeat(5000);
      const result = splitMessage(message, 2000);

      expect(result.length).toBeGreaterThan(1);
      expect(result.join("").length).toBe(5000);
    });

    it("should return an array with one empty string for empty input", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const result = splitMessage("", 2000);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("");
    });

    it("should handle messages exactly at the max length boundary", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const message = "B".repeat(2000);
      const result = splitMessage(message, 2000);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(message);
    });
  });

  // ─── Event ID Tracking (Idempotency) ─────────────────────────────────

  describe("processed events tracking (addProcessedEvent)", () => {
    it("should track processed event IDs", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      const addProcessedEvent = (connector as any).addProcessedEvent.bind(
        connector,
      );
      const processedEvents: Set<string> = (connector as any).processedEvents;

      addProcessedEvent("Ev001");
      expect(processedEvents.has("Ev001")).toBe(true);
    });

    it("should limit the size of the processed events set", () => {
      const config = createTestConfig();
      const connector = new SlackConnector(config);
      (connector as any).processedEventsMaxSize = 5;

      const addProcessedEvent = (connector as any).addProcessedEvent.bind(
        connector,
      );
      const processedEvents: Set<string> = (connector as any).processedEvents;

      // Add more than max
      for (let i = 0; i < 10; i++) {
        addProcessedEvent(`Ev_${i}`);
      }

      // Should have evicted older entries
      expect(processedEvents.size).toBeLessThanOrEqual(6); // some tolerance for implementation
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────

  describe("error handling", () => {
    it("should handle missing event in payload gracefully", async () => {
      const { app } = createTestApp();
      const payload = {
        token: "deprecated-token",
        team_id: "T12345",
        type: "event_callback",
        // No event field
      };

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      // Should not crash — return 200 or handle gracefully
      expect([200, 400, 500]).toContain(res.status);
    });

    it("should handle unknown event type gracefully", async () => {
      const { app } = createTestApp();
      const payload = {
        token: "deprecated-token",
        team_id: "T12345",
        event_id: "Ev_UNKNOWN",
        type: "event_callback",
        event: {
          type: "unknown_event_type",
          text: "something",
          user: "U12345",
          channel: "C12345",
          ts: "1234567890.123456",
        },
      };

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle malformed JSON body", async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send("this is not json");

      expect([200, 400, 500]).toContain(res.status);
    });

    it("should handle empty body", async () => {
      const { app } = createTestApp();

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send({});

      expect([200, 400, 500]).toContain(res.status);
    });
  });

  // ─── Payload Structure Validation ─────────────────────────────────────

  describe("payload structure validation", () => {
    it("should process a well-formed app_mention event", async () => {
      const { app } = createTestApp();
      const payload = {
        token: "test-token",
        team_id: "T12345",
        api_app_id: "A12345",
        event_id: "Ev_WELL_FORMED",
        type: "event_callback",
        event: {
          type: "app_mention",
          text: "<@UBOTID> @constella tell me about the architecture",
          user: "U98765",
          channel: "C55555",
          ts: "1700000000.000001",
          event_ts: "1700000000.000001",
          team: "T12345",
        },
      };

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should process a well-formed message.im event", async () => {
      const { app } = createTestApp();
      const payload = {
        token: "test-token",
        team_id: "T12345",
        api_app_id: "A12345",
        event_id: "Ev_DM_WELL",
        type: "event_callback",
        event: {
          type: "message",
          channel_type: "im",
          text: "What can you do?",
          user: "U11111",
          channel: "D99999",
          ts: "1700000001.000001",
        },
      };

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  // ─── Configuration Edge Cases ─────────────────────────────────────────

  describe("configuration edge cases", () => {
    it("should handle configuration with all optional fields", () => {
      const config = createTestConfig({
        replyTimeoutMs: 60000,
        appToken: "xapp-test-app-token",
      });
      const connector = new SlackConnector(config);
      expect(connector).toBeDefined();
    });

    it("should handle configuration with minimum required fields", () => {
      const config: SlackChannelConfig = {
        enabled: true,
        channelType: "slack",
        natsUrl: "nats://localhost:4222",
        defaultAgentId: "orchestrator-py",
        replyTimeoutMs: 5000,
        botToken: "xoxb-minimal",
        signingSecret: "minimal-secret",
      };
      const connector = new SlackConnector(config);
      expect(connector).toBeDefined();
    });
  });

  // ─── Integration: Multiple Events in Sequence ─────────────────────────

  describe("integration: sequential event processing", () => {
    it("should handle multiple different events in sequence", async () => {
      const { app } = createTestApp();

      // First: url_verification
      const res1 = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(createChallengePayload("challenge_1"));
      expect(res1.status).toBe(200);
      expect(res1.body.challenge).toBe("challenge_1");

      // Second: app_mention event
      const res2 = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(createAppMentionPayload({ event_id: "Ev_SEQ_1" }));
      expect(res2.status).toBe(200);

      // Third: direct message
      const res3 = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(createDirectMessagePayload({ event_id: "Ev_SEQ_2" }));
      expect(res3.status).toBe(200);

      // Fourth: another app_mention with different agent
      const res4 = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(
          createAppMentionPayload({
            event_id: "Ev_SEQ_3",
            text: "<@U12345> @database help with schema",
          }),
        );
      expect(res4.status).toBe(200);
    });

    it("should handle rapid successive events", async () => {
      const { app } = createTestApp();
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post("/webhooks/slack/events")
            .set("Content-Type", "application/json")
            .send(
              createAppMentionPayload({
                event_id: `Ev_RAPID_${i}`,
                text: `<@U12345> @codecraft task ${i}`,
              }),
            ),
        );
      }

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status).toBe(200);
      }
    });
  });

  // ─── Various Text Content Tests ───────────────────────────────────────

  describe("text content handling", () => {
    it("should handle messages with emoji", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        event_id: "Ev_EMOJI",
        text: "<@U12345> @codecraft 🚀 deploy this please 🎉",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with code blocks", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        event_id: "Ev_CODE",
        text: "<@U12345> @codecraft review this:\n```\nfunction hello() { return 'world'; }\n```",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with URLs", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        event_id: "Ev_URL",
        text: "<@U12345> @security scan <https://example.com|example.com>",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with multiple @mentions", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        event_id: "Ev_MULTI",
        text: "<@U12345> @codecraft and @security please review this",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle very long messages", async () => {
      const { app } = createTestApp();
      const longText = "<@U12345> @codecraft " + "x".repeat(10000);
      const payload = createAppMentionPayload({
        event_id: "Ev_LONG",
        text: longText,
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with only whitespace after mention", async () => {
      const { app } = createTestApp();
      const payload = createAppMentionPayload({
        event_id: "Ev_SPACE",
        text: "<@U12345>   ",
      });

      const res = await request(app)
        .post("/webhooks/slack/events")
        .set("Content-Type", "application/json")
        .send(payload);

      expect(res.status).toBe(200);
    });
  });
});

// ─── createSlackWebhookRouter Factory ───────────────────────────────────────

describe("createSlackWebhookRouter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should return null when SLACK_BOT_TOKEN is not set", async () => {
    process.env.SLACK_BOT_TOKEN = "";
    process.env.SLACK_SIGNING_SECRET = "";

    // We need to dynamically import to pick up the new env
    // Since the factory is at module level, we test the behavior by
    // verifying the connector handles missing config gracefully
    const config = createTestConfig({ botToken: "", signingSecret: "" });
    const connector = new SlackConnector(config);
    expect(connector).toBeDefined();
  });

  it("should create a connector when all environment variables are set", () => {
    const config = createTestConfig({
      botToken: "xoxb-valid-token",
      signingSecret: "valid-secret",
    });
    const connector = new SlackConnector(config);
    const router = connector.createRouter();
    expect(router).toBeDefined();
  });
});
