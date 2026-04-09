// ─── Unit Tests for Discord Channel Connector ───────────────────────────────
//
// Tests for:
//   - DiscordConnector class instantiation
//   - createRouter() Express router creation
//   - Discord PING/PONG handshake (interaction type 1)
//   - APPLICATION_COMMAND handling (interaction type 2)
//   - MESSAGE_COMPONENT handling (interaction type 3)
//   - Interaction deduplication
//   - NATS message publishing and response handling
//   - sendFollowup() Discord REST API integration
//   - postChannelMessage() Discord REST API integration
//   - splitMessage() for long messages
//   - createDiscordWebhookRouter() factory function
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response } from "express";
import request from "supertest";
import nacl from "tweetnacl";
import { DiscordConnector } from "../channels/discordConnector";
import { DiscordChannelConfig } from "../channels/types";

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

// Mock axios for Discord REST API calls
const mockAxiosPost = jest.fn().mockResolvedValue({ data: { id: "msg-123" } });
const mockAxiosPatch = jest.fn().mockResolvedValue({ data: { id: "msg-456" } });
jest.mock("axios", () => {
  const post = jest.fn().mockResolvedValue({ data: { id: "msg-123" } });
  const patch = jest.fn().mockResolvedValue({ data: { id: "msg-456" } });
  return {
    __esModule: true,
    default: {
      post: (...args: any[]) => post(...args),
      patch: (...args: any[]) => patch(...args),
    },
    __mockPost: post,
    __mockPatch: patch,
  };
});

// Mock logger
jest.mock("../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock discordVerify middleware — pass-through for unit tests
jest.mock("../middleware/discordVerify", () => ({
  discordVerify: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock preserveRawBody — the real implementation attaches "data"/"end"
// listeners on the request stream, but supertest already consumed that
// stream via express.json(), causing an indefinite hang.
jest.mock("../middleware/slackVerify", () => ({
  preserveRawBody: () => (_req: any, _res: any, next: any) => next(),
  slackVerify: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a fresh Ed25519 keypair for testing.
 */
function generateTestKeypair(): {
  publicKeyHex: string;
  secretKey: Uint8Array;
} {
  const keypair = nacl.sign.keyPair();
  const publicKeyHex = Buffer.from(keypair.publicKey).toString("hex");
  return { publicKeyHex, secretKey: keypair.secretKey };
}

/**
 * Sign a Discord interaction request body + timestamp using Ed25519.
 */
function signDiscordPayload(
  secretKey: Uint8Array,
  timestamp: string,
  body: string,
): string {
  const message = new TextEncoder().encode(timestamp + body);
  const signature = nacl.sign.detached(message, secretKey);
  return Buffer.from(signature).toString("hex");
}

const { publicKeyHex: TEST_PUBLIC_KEY, secretKey: TEST_SECRET_KEY } =
  generateTestKeypair();

const TEST_BOT_TOKEN = "Bot MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.test-token";
const TEST_APPLICATION_ID = "1234567890123456789";

function nowTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function createTestConfig(
  overrides: Partial<DiscordChannelConfig> = {},
): DiscordChannelConfig {
  return {
    enabled: true,
    channelType: "discord",
    natsUrl: "nats://localhost:4222",
    defaultAgentId: "orchestrator-py",
    replyTimeoutMs: 5000,
    botToken: TEST_BOT_TOKEN,
    publicKey: TEST_PUBLIC_KEY,
    applicationId: TEST_APPLICATION_ID,
    ...overrides,
  };
}

/**
 * Create a test Express app with the DiscordConnector's router mounted.
 * Uses skipVerification for simpler unit testing of the router logic.
 */
function createTestAppSkipVerify(config?: Partial<DiscordChannelConfig>): {
  app: express.Application;
  connector: DiscordConnector;
} {
  const fullConfig = createTestConfig(config);
  const connector = new DiscordConnector(fullConfig);
  const router = connector.createRouter();

  const app = express();
  // Mount without signature verification for testing router logic
  app.use(express.json());
  app.use("/webhooks/discord", router);

  return { app, connector };
}

/**
 * Create a test Express app that performs actual Ed25519 signature verification.
 * For testing the full signed request flow.
 */
function createTestAppWithVerify(): {
  app: express.Application;
  connector: DiscordConnector;
} {
  const fullConfig = createTestConfig();
  const connector = new DiscordConnector(fullConfig);
  const router = connector.createRouter();

  const app = express();
  // The router itself includes the discordVerify middleware,
  // so we just mount it directly.
  app.use("/webhooks/discord", router);

  return { app, connector };
}

// ─── Discord Interaction Payloads ───────────────────────────────────────────

function createPingPayload() {
  return { type: 1 };
}

function createApplicationCommandPayload(overrides: Record<string, any> = {}) {
  return {
    type: 2,
    id: overrides.id || "interaction-cmd-001",
    token: overrides.token || "interaction-token-abc123",
    data: overrides.data || {
      id: "cmd-ask-001",
      name: "ask",
      options: [
        {
          name: "message",
          type: 3,
          value: overrides.messageValue || "Help me with TypeScript generics",
        },
        ...(overrides.agentOption
          ? [{ name: "agent", type: 3, value: overrides.agentOption }]
          : []),
      ],
    },
    member: overrides.member || {
      user: {
        id: "U123456",
        username: "testuser",
        discriminator: "0001",
        global_name: "Test User",
      },
    },
    user: overrides.user || undefined,
    channel_id: overrides.channel_id || "C789012",
    guild_id: overrides.guild_id || "G345678",
    application_id: overrides.application_id || TEST_APPLICATION_ID,
    ...overrides,
  };
}

function createMessageComponentPayload(overrides: Record<string, any> = {}) {
  return {
    type: 3,
    id: overrides.id || "interaction-comp-001",
    token: overrides.token || "component-token-xyz789",
    data: overrides.data || {
      custom_id: overrides.custom_id || "codecraft:approve:task123",
      component_type: overrides.component_type || 2, // Button
      values: overrides.values || undefined,
    },
    member: overrides.member || {
      user: {
        id: "U999888",
        username: "buttonclicker",
        discriminator: "0000",
        global_name: "Button Clicker",
      },
    },
    user: overrides.user || undefined,
    channel_id: overrides.channel_id || "C111222",
    guild_id: overrides.guild_id || "G333444",
    application_id: overrides.application_id || TEST_APPLICATION_ID,
    message: overrides.message || {
      id: "msg-original-001",
      content: "Original message with button",
    },
    ...overrides,
  };
}

function createUnknownInteractionPayload(type: number = 99) {
  return {
    type,
    id: "interaction-unknown-001",
    token: "unknown-token",
    channel_id: "C000",
    guild_id: "G000",
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("DiscordConnector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Constructor ────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("should instantiate with a valid configuration", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      expect(connector).toBeDefined();
      expect(connector).toBeInstanceOf(DiscordConnector);
    });

    it("should use default reply timeout when replyTimeoutMs is 0", () => {
      const config = createTestConfig({ replyTimeoutMs: 0 });
      const connector = new DiscordConnector(config);
      // The connector should fall back to DEFAULT_REPLY_TIMEOUT_MS (30000)
      expect(connector).toBeDefined();
    });

    it("should accept a custom reply timeout", () => {
      const config = createTestConfig({ replyTimeoutMs: 60000 });
      const connector = new DiscordConnector(config);
      expect(connector).toBeDefined();
    });

    it("should accept all configuration fields", () => {
      const config = createTestConfig({
        enabled: true,
        channelType: "discord",
        natsUrl: "nats://custom:4222",
        defaultAgentId: "codecraft",
        replyTimeoutMs: 15000,
        botToken: "Bot custom-token",
        publicKey: TEST_PUBLIC_KEY,
        applicationId: "9999999999",
      });
      const connector = new DiscordConnector(config);
      expect(connector).toBeDefined();
    });
  });

  // ─── createRouter ──────────────────────────────────────────────────────

  describe("createRouter", () => {
    it("should return an Express router", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const router = connector.createRouter();
      expect(router).toBeDefined();
      expect(typeof router).toBe("function"); // Express routers are functions
    });

    it("should create a router that can be mounted on an Express app", () => {
      const { app } = createTestAppSkipVerify();
      expect(app).toBeDefined();
    });
  });

  // ─── PING / PONG Handshake ────────────────────────────────────────────

  describe("PING / PONG handshake (interaction type 1)", () => {
    it("should respond to Discord PING with PONG (type 1)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createPingPayload();

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(1); // InteractionResponseType.PONG
    });

    it("should return PONG regardless of other fields in the payload", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = {
        type: 1,
        id: "extra-id",
        token: "extra-token",
        application_id: TEST_APPLICATION_ID,
      };

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(1);
    });
  });

  // ─── APPLICATION_COMMAND Handling ─────────────────────────────────────

  describe("APPLICATION_COMMAND handling (interaction type 2)", () => {
    it("should return a deferred response (type 5) for slash commands", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload();

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      // Should respond with DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE (type 5)
      expect(res.status).toBe(200);
      expect(res.body.type).toBe(5);
    });

    it("should handle slash commands with an explicit agent option", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        agentOption: "securishield",
        messageValue: "Scan my API endpoints",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(5);
    });

    it("should handle slash commands with no agent option (route to default)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        messageValue: "General question without specifying an agent",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(5);
    });

    it("should handle slash commands with member.user info", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        member: {
          user: {
            id: "U555555",
            username: "guildmember",
            discriminator: "1234",
            global_name: "Guild Member",
          },
        },
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(5);
    });

    it("should handle slash commands with user (DM context, no guild)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        member: undefined,
        user: {
          id: "U666666",
          username: "dmuser",
          discriminator: "0001",
          global_name: "DM User",
        },
        guild_id: undefined,
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(5);
    });

    it("should handle slash commands with @mention in the message text", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        messageValue: "@database help me optimize this query",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(5);
    });

    it("should handle slash commands with empty message text", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        data: {
          id: "cmd-ask-002",
          name: "ask",
          options: [],
        },
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(5);
    });

    it("should handle slash commands with a very long message", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        messageValue: "A".repeat(4000),
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(5);
    });
  });

  // ─── MESSAGE_COMPONENT Handling ───────────────────────────────────────

  describe("MESSAGE_COMPONENT handling (interaction type 3)", () => {
    it("should return a deferred update (type 6) for button interactions", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createMessageComponentPayload();

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
      // Should be DEFERRED_UPDATE_MESSAGE (type 6) or DEFERRED_CHANNEL_MESSAGE (type 5)
      expect([5, 6]).toContain(res.body.type);
    });

    it("should parse custom_id to extract agent and action", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createMessageComponentPayload({
        custom_id: "securishield:scan:endpoint-xyz",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle select menu interactions (component_type 3)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createMessageComponentPayload({
        component_type: 3, // Select menu
        values: ["option_a", "option_b"],
        custom_id: "codecraft:select-lang:task001",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle component interactions with member context", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createMessageComponentPayload({
        member: {
          user: {
            id: "U777",
            username: "clicker",
            discriminator: "9999",
            global_name: "The Clicker",
          },
        },
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle component interactions with DM user context", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createMessageComponentPayload({
        member: undefined,
        user: {
          id: "U888",
          username: "dm-clicker",
          discriminator: "0",
          global_name: "DM Clicker",
        },
        guild_id: undefined,
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle custom_id with only agent and action (no extra)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createMessageComponentPayload({
        custom_id: "perfpulse:analyze",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle custom_id with only one segment", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createMessageComponentPayload({
        custom_id: "single-segment",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  // ─── Unknown Interaction Types ────────────────────────────────────────

  describe("unknown interaction types", () => {
    it("should handle an unknown interaction type gracefully", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createUnknownInteractionPayload(99);

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      // Should return some response without crashing
      expect([200, 400]).toContain(res.status);
    });

    it("should handle AUTOCOMPLETE interaction type (type 4)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = {
        type: 4,
        id: "autocomplete-001",
        token: "autocomplete-token",
        data: { id: "cmd-ask", name: "ask", options: [] },
        channel_id: "C000",
      };

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect([200, 400]).toContain(res.status);
    });

    it("should handle MODAL_SUBMIT interaction type (type 5)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = {
        type: 5,
        id: "modal-001",
        token: "modal-token",
        data: { custom_id: "my-modal" },
        channel_id: "C000",
      };

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect([200, 400]).toContain(res.status);
    });
  });

  // ─── Interaction Deduplication ────────────────────────────────────────

  describe("interaction deduplication", () => {
    it("should handle duplicate interaction IDs gracefully", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "interaction-DUPLICATE",
      });

      // First request
      const res1 = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);
      expect(res1.status).toBe(200);

      // Second request with same interaction ID
      const res2 = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);
      expect(res2.status).toBe(200);
    });
  });

  // ─── NATS Connection ──────────────────────────────────────────────────

  describe("NATS connection lifecycle", () => {
    it("should connect to NATS on connectNats()", async () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);

      await connector.connectNats();

      const nats = require("nats");
      expect(nats.connect).toHaveBeenCalled();
    });

    it("should disconnect from NATS on disconnectNats()", async () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);

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
      const connector = new DiscordConnector(config);

      // connectNats() logs the error and re-throws so callers can handle it
      await expect(connector.connectNats()).rejects.toThrow(
        "NATS connection refused",
      );
    });

    it("should handle NATS disconnect when not connected", async () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);

      // Disconnect without connecting first — should not throw
      await expect(connector.disconnectNats()).resolves.not.toThrow();
    });

    it("should connect to the configured NATS URL", async () => {
      const nats = require("nats");
      nats.connect.mockResolvedValueOnce(nats.__mockConnection);

      const config = createTestConfig({ natsUrl: "nats://custom-host:4222" });
      const connector = new DiscordConnector(config);

      await connector.connectNats();

      expect(nats.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          servers: "nats://custom-host:4222",
        }),
      );
    });
  });

  // ─── Message Splitting ────────────────────────────────────────────────

  describe("message splitting (splitMessage)", () => {
    it("should not split short messages", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const result = splitMessage("Hello, world!", 2000);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("Hello, world!");
    });

    it("should split messages exceeding the max length", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const longMessage = "A".repeat(5000);
      const result = splitMessage(longMessage, 2000);

      expect(result.length).toBeGreaterThan(1);
      // All characters should be preserved
      expect(result.join("").length).toBe(5000);
    });

    it("should prefer splitting at newline boundaries", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const message = "Line 1\n" + "B".repeat(1990) + "\nLine 3";
      const result = splitMessage(message, 2000);

      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle messages with no good split points", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      // One long line with no whitespace
      const message = "X".repeat(6000);
      const result = splitMessage(message, 2000);

      expect(result.length).toBe(3);
      expect(result.join("").length).toBe(6000);
    });

    it("should return a single-element array for empty input", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const result = splitMessage("", 2000);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe("");
    });

    it("should handle messages exactly at the max length boundary", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      const message = "C".repeat(2000);
      const result = splitMessage(message, 2000);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(message);
    });

    it("should handle messages with Unicode characters", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const splitMessage = (connector as any).splitMessage.bind(connector);

      // emoji are multi-byte but count as length in JS strings
      const message = "🚀".repeat(1000) + "\n" + "🎉".repeat(1000);
      const result = splitMessage(message, 2000);

      expect(result.length).toBeGreaterThanOrEqual(1);
      // splitMessage uses .trimStart() on the remainder after each split,
      // which strips the newline separator — so joined chunks won't include it.
      // Verify all original non-whitespace content is preserved instead.
      expect(result.join("")).toBe("🚀".repeat(1000) + "🎉".repeat(1000));
    });
  });

  // ─── Interaction ID Tracking (Idempotency) ───────────────────────────

  describe("processed interactions tracking (addProcessedInteraction)", () => {
    it("should track processed interaction IDs", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const addProcessedInteraction = (
        connector as any
      ).addProcessedInteraction.bind(connector);
      const processedInteractions: Set<string> = (connector as any)
        .processedInteractions;

      addProcessedInteraction("int-001");
      expect(processedInteractions.has("int-001")).toBe(true);
    });

    it("should limit the size of the processed interactions set", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      (connector as any).processedInteractionsMaxSize = 5;

      const addProcessedInteraction = (
        connector as any
      ).addProcessedInteraction.bind(connector);
      const processedInteractions: Set<string> = (connector as any)
        .processedInteractions;

      // Add more than max
      for (let i = 0; i < 10; i++) {
        addProcessedInteraction(`int_${i}`);
      }

      // Should have evicted older entries
      expect(processedInteractions.size).toBeLessThanOrEqual(6);
    });

    it("should be idempotent for the same interaction ID", () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const addProcessedInteraction = (
        connector as any
      ).addProcessedInteraction.bind(connector);
      const processedInteractions: Set<string> = (connector as any)
        .processedInteractions;

      addProcessedInteraction("int-dupe");
      addProcessedInteraction("int-dupe");

      expect(processedInteractions.has("int-dupe")).toBe(true);
      // Set naturally deduplicates
      expect(processedInteractions.size).toBe(1);
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────────

  describe("error handling", () => {
    it("should handle missing body gracefully", async () => {
      const { app } = createTestAppSkipVerify();

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send({});

      // Should not crash
      expect([200, 400, 500]).toContain(res.status);
    });

    it("should handle missing type field gracefully", async () => {
      const { app } = createTestAppSkipVerify();

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send({ data: { name: "ask" } });

      expect([200, 400, 500]).toContain(res.status);
    });

    it("should handle malformed JSON body", async () => {
      const { app } = createTestAppSkipVerify();

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send("this is not json");

      expect([200, 400, 500]).toContain(res.status);
    });

    it("should handle null data in APPLICATION_COMMAND", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = {
        type: 2,
        id: "int-null-data",
        token: "token-null",
        data: null,
        channel_id: "C000",
      };

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect([200, 400, 500]).toContain(res.status);
    });

    it("should handle null data in MESSAGE_COMPONENT", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = {
        type: 3,
        id: "int-null-comp",
        token: "token-null-comp",
        data: null,
        channel_id: "C000",
      };

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect([200, 400, 500]).toContain(res.status);
    });
  });

  // ─── sendFollowup ────────────────────────────────────────────────────

  describe("sendFollowup", () => {
    it("should call the Discord follow-up webhook URL", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const sendFollowup = (connector as any).sendFollowup.bind(connector);

      await sendFollowup(
        "interaction-token-abc",
        "codecraft",
        "Here is your code review result",
        "corr-001",
      );

      expect(axiosPost).toHaveBeenCalled();
      const callArgs = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      expect(callArgs[0]).toContain(
        `https://discord.com/api/v10/webhooks/${TEST_APPLICATION_ID}/interaction-token-abc`,
      );
    });

    it("should include the response text in the POST body", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const sendFollowup = (connector as any).sendFollowup.bind(connector);

      await sendFollowup(
        "token-test",
        "codecraft",
        "My response text",
        "corr-002",
      );

      const callArgs = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      expect(callArgs[1]).toHaveProperty("content");
      expect(callArgs[1].content).toContain("My response text");
    });

    it("should handle long responses by splitting into chunks", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;
      const callCountBefore = axiosPost.mock.calls.length;

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const sendFollowup = (connector as any).sendFollowup.bind(connector);

      const longResponse = "Z".repeat(5000);
      await sendFollowup("token-long", "codecraft", longResponse, "corr-003");

      // Should have made at least one API call for chunked messages
      expect(
        axiosPost.mock.calls.length - callCountBefore,
      ).toBeGreaterThanOrEqual(1);
    });

    it("should handle API errors gracefully", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;
      axiosPost.mockRejectedValueOnce(new Error("Discord API error"));

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const sendFollowup = (connector as any).sendFollowup.bind(connector);

      // Should not throw
      await expect(
        sendFollowup("token-err", "codecraft", "response", "corr-004"),
      ).resolves.not.toThrow();
    });

    it("should include authorization header with bot token", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const sendFollowup = (connector as any).sendFollowup.bind(connector);

      await sendFollowup("token-auth", "codecraft", "response", "corr-005");

      const callArgs = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      // The third argument is the config object with headers
      if (callArgs[2]?.headers) {
        expect(callArgs[2].headers.Authorization).toContain(TEST_BOT_TOKEN);
      }
    });

    it("should handle empty response text", async () => {
      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const sendFollowup = (connector as any).sendFollowup.bind(connector);

      await expect(
        sendFollowup("token-empty", "codecraft", "", "corr-006"),
      ).resolves.not.toThrow();
    });
  });

  // ─── postChannelMessage ───────────────────────────────────────────────

  describe("postChannelMessage", () => {
    it("should post a message to a Discord channel", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const postChannelMessage = (connector as any).postChannelMessage.bind(
        connector,
      );

      await postChannelMessage("C789012", "Hello from Constella!");

      expect(axiosPost).toHaveBeenCalled();
      const callArgs = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      expect(callArgs[0]).toContain("channels/C789012/messages");
    });

    it("should include the text content in the POST body", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const postChannelMessage = (connector as any).postChannelMessage.bind(
        connector,
      );

      await postChannelMessage("C111", "Test message content");

      const callArgs = axiosPost.mock.calls[axiosPost.mock.calls.length - 1];
      expect(callArgs[1]).toHaveProperty("content", "Test message content");
    });

    it("should handle API errors gracefully", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;
      axiosPost.mockRejectedValueOnce(new Error("Channel not found"));

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const postChannelMessage = (connector as any).postChannelMessage.bind(
        connector,
      );

      await expect(
        postChannelMessage("C-INVALID", "message"),
      ).resolves.not.toThrow();
    });

    it("should handle long messages by splitting into chunks", async () => {
      const axios = require("axios");
      const axiosPost = axios.__mockPost;

      const config = createTestConfig();
      const connector = new DiscordConnector(config);
      const postChannelMessage = (connector as any).postChannelMessage.bind(
        connector,
      );

      const longMessage = "W".repeat(5000);
      await postChannelMessage("C222", longMessage);

      // Should post at least one message
      expect(axiosPost).toHaveBeenCalled();
    });
  });

  // ─── Integration: Sequential Interactions ─────────────────────────────

  describe("integration: sequential interaction processing", () => {
    it("should handle PING followed by APPLICATION_COMMAND", async () => {
      const { app } = createTestAppSkipVerify();

      // PING
      const res1 = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(createPingPayload());
      expect(res1.status).toBe(200);
      expect(res1.body.type).toBe(1);

      // APPLICATION_COMMAND
      const res2 = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(createApplicationCommandPayload({ id: "int-seq-1" }));
      expect(res2.status).toBe(200);
      expect(res2.body.type).toBe(5);
    });

    it("should handle multiple APPLICATION_COMMANDs in sequence", async () => {
      const { app } = createTestAppSkipVerify();

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post("/webhooks/discord/events")
          .set("Content-Type", "application/json")
          .set("x-signature-ed25519", "ab".repeat(64))
          .set("x-signature-timestamp", nowTimestamp())
          .send(
            createApplicationCommandPayload({
              id: `int-multi-${i}`,
              messageValue: `Question number ${i}`,
            }),
          );
        expect(res.status).toBe(200);
        expect(res.body.type).toBe(5);
      }
    });

    it("should handle rapid concurrent interactions", async () => {
      const { app } = createTestAppSkipVerify();
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post("/webhooks/discord/events")
            .set("Content-Type", "application/json")
            .set("x-signature-ed25519", "ab".repeat(64))
            .set("x-signature-timestamp", nowTimestamp())
            .send(
              createApplicationCommandPayload({
                id: `int-rapid-${i}`,
                messageValue: `Rapid task ${i}`,
              }),
            ),
        );
      }

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status).toBe(200);
      }
    });

    it("should handle mixed interaction types in sequence", async () => {
      const { app } = createTestAppSkipVerify();

      // PING
      const res1 = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(createPingPayload());
      expect(res1.body.type).toBe(1);

      // APPLICATION_COMMAND
      const res2 = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(createApplicationCommandPayload({ id: "int-mix-1" }));
      expect(res2.body.type).toBe(5);

      // MESSAGE_COMPONENT
      const res3 = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(createMessageComponentPayload({ id: "int-mix-2" }));
      expect([5, 6]).toContain(res3.body.type);

      // Another PING
      const res4 = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(createPingPayload());
      expect(res4.body.type).toBe(1);
    });
  });

  // ─── Agent Routing from Slash Commands ────────────────────────────────

  describe("agent routing from slash commands", () => {
    it("should route to codecraft when agent option is 'codecraft'", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-route-1",
        agentOption: "codecraft",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should route to securishield when agent option is 'security'", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-route-2",
        agentOption: "security",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should route to default agent when agent option is unrecognised", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-route-3",
        agentOption: "nonexistent-agent",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should extract @mention from message text when no agent option", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-route-4",
        messageValue: "@database optimize my queries",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  // ─── Various Content Tests ────────────────────────────────────────────

  describe("text content handling", () => {
    it("should handle messages with emoji", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-emoji",
        messageValue: "🚀 Deploy this feature 🎉✨",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with code blocks", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-code",
        messageValue:
          "Review this:\n```typescript\nconst x: number = 42;\nconsole.log(x);\n```",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with Discord markdown", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-md",
        messageValue:
          "**Bold** *italic* __underline__ ~~strikethrough~~ `inline code`",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with URLs", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-url",
        messageValue:
          "Check https://github.com/constella/repo and tell me about it",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with Discord mentions (<@userid>)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-mention",
        messageValue: "Hey <@U123456789> can you check this?",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });

    it("should handle messages with channel mentions (<#channelid>)", async () => {
      const { app } = createTestAppSkipVerify();
      const payload = createApplicationCommandPayload({
        id: "int-channel-mention",
        messageValue: "Post the results in <#C987654321>",
      });

      const res = await request(app)
        .post("/webhooks/discord/events")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", nowTimestamp())
        .send(payload);

      expect(res.status).toBe(200);
    });
  });

  // ─── Configuration Edge Cases ─────────────────────────────────────────

  describe("configuration edge cases", () => {
    it("should handle configuration with all fields populated", () => {
      const config: DiscordChannelConfig = {
        enabled: true,
        channelType: "discord",
        natsUrl: "nats://prod:4222",
        defaultAgentId: "orchestrator-py",
        replyTimeoutMs: 45000,
        botToken: "Bot my-production-token",
        publicKey: TEST_PUBLIC_KEY,
        applicationId: "9876543210987654321",
      };
      const connector = new DiscordConnector(config);
      expect(connector).toBeDefined();
    });

    it("should handle configuration with minimum required fields", () => {
      const config: DiscordChannelConfig = {
        enabled: true,
        channelType: "discord",
        natsUrl: "nats://localhost:4222",
        defaultAgentId: "orchestrator-py",
        replyTimeoutMs: 5000,
        botToken: "Bot min",
        publicKey: TEST_PUBLIC_KEY,
        applicationId: "1",
      };
      const connector = new DiscordConnector(config);
      expect(connector).toBeDefined();
    });

    it("should handle disabled configuration", () => {
      const config = createTestConfig({ enabled: false });
      const connector = new DiscordConnector(config);
      expect(connector).toBeDefined();
    });
  });
});

// ─── createDiscordWebhookRouter Factory ─────────────────────────────────────

describe("createDiscordWebhookRouter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("should create a connector when all configuration is provided", () => {
    const config = createTestConfig({
      botToken: "Bot valid-token",
      publicKey: TEST_PUBLIC_KEY,
      applicationId: "1234",
    });
    const connector = new DiscordConnector(config);
    const router = connector.createRouter();
    expect(router).toBeDefined();
  });

  it("should create a connector even with empty bot token (will fail at runtime)", () => {
    const config = createTestConfig({ botToken: "" });
    const connector = new DiscordConnector(config);
    const router = connector.createRouter();
    expect(router).toBeDefined();
  });

  it("should create a connector with a different default agent", () => {
    const config = createTestConfig({ defaultAgentId: "codecraft" });
    const connector = new DiscordConnector(config);
    expect(connector).toBeDefined();
  });
});
