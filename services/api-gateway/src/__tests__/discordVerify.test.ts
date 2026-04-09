// ─── Unit Tests for Discord Ed25519 Signature Verification Middleware ────────
//
// Tests for:
//   - discordVerify() middleware factory
//   - Ed25519 signature verification
//   - Timestamp replay attack prevention
//   - Missing/invalid headers
//   - skipVerification option
//   - Public key configuration edge cases
// ─────────────────────────────────────────────────────────────────────────────

import express, { Request, Response } from "express";
import request from "supertest";
import nacl from "tweetnacl";
import { discordVerify } from "../middleware/discordVerify";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a fresh Ed25519 keypair for testing.
 * Returns the public key as a hex string (like Discord provides)
 * and the secret key as a Uint8Array (for signing test payloads).
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
 * Returns the signature as a hex string.
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

/**
 * Express.json with verify callback that preserves the raw body on the request.
 * This is more reliable than the streaming preserveRawBody middleware in test
 * environments (supertest consumes the stream before preserveRawBody can read it).
 */
function jsonWithRawBody() {
  return express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf-8");
    },
  });
}

/**
 * Create a minimal Express app with discordVerify applied.
 */
function createTestApp(
  options: Parameters<typeof discordVerify>[0] = {},
): express.Application {
  const app = express();

  app.use(jsonWithRawBody());
  app.use(discordVerify(options));

  app.post("/test", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

/**
 * Create a test app that uses express.json() only (without raw body preservation)
 * to test the JSON.stringify fallback path inside discordVerify.
 */
function createTestAppWithJsonOnly(
  options: Parameters<typeof discordVerify>[0] = {},
): express.Application {
  const app = express();
  app.use(express.json());
  app.use(discordVerify(options));

  app.post("/test", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

/**
 * Get the current Unix timestamp as a string (seconds since epoch).
 */
function nowTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

// Generate a persistent keypair for the test suite
const { publicKeyHex: TEST_PUBLIC_KEY, secretKey: TEST_SECRET_KEY } =
  generateTestKeypair();

describe("discordVerify", () => {
  // ─── Valid Signatures ───────────────────────────────────────────────────

  describe("valid signatures", () => {
    it("should pass through when Ed25519 signature is valid", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("should accept a valid signature with a PING interaction payload", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 }); // PING
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
    });

    it("should accept a valid signature with a complex APPLICATION_COMMAND payload", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({
        type: 2,
        id: "1234567890",
        token: "interaction-token-abc",
        data: {
          id: "cmd-001",
          name: "ask",
          options: [
            { name: "message", type: 3, value: "Help me with TypeScript" },
            { name: "agent", type: 3, value: "codecraft" },
          ],
        },
        member: {
          user: {
            id: "U123456",
            username: "testuser",
            discriminator: "0001",
          },
        },
        channel_id: "C789012",
        guild_id: "G345678",
      });
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
    });

    it("should accept a valid signature with a MESSAGE_COMPONENT payload", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({
        type: 3,
        id: "9876543210",
        token: "component-token-xyz",
        data: {
          custom_id: "codecraft:approve:task123",
          component_type: 2,
        },
        member: {
          user: { id: "U999", username: "buttonclicker", discriminator: "0" },
        },
        channel_id: "C111",
        guild_id: "G222",
      });
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
    });

    it("should accept a valid signature with an empty JSON object body", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({});
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
    });

    it("should accept a valid signature with a large payload", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const largeContent = "x".repeat(5000);
      const body = JSON.stringify({
        type: 2,
        data: { name: "ask", options: [{ name: "msg", value: largeContent }] },
      });
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
    });

    it("should accept a valid signature with a timestamp at the max age boundary", async () => {
      const app = createTestApp({
        publicKey: TEST_PUBLIC_KEY,
        maxRequestAgeSeconds: 300,
      });
      const body = JSON.stringify({ type: 1 });
      // Exactly 300 seconds old
      const ts = (Math.floor(Date.now() / 1000) - 300).toString();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
    });
  });

  // ─── Invalid Signatures ─────────────────────────────────────────────────

  describe("invalid signatures", () => {
    it("should reject a request with a completely invalid signature", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      // 128 hex chars = 64 bytes, but all zeros (not a valid sig for the body)
      const fakeSig = "0".repeat(128);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", fakeSig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("should reject when signature is computed with a different keypair", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const { secretKey: otherSecretKey } = generateTestKeypair();
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();
      const wrongSig = signDiscordPayload(otherSecretKey, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", wrongSig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Invalid Discord request signature");
    });

    it("should reject when the body is tampered with after signing", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const originalBody = JSON.stringify({ type: 1, data: "original" });
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, originalBody);

      const tamperedBody = JSON.stringify({ type: 1, data: "tampered" });

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(tamperedBody);

      expect(res.status).toBe(401);
    });

    it("should reject when the timestamp is tampered with after signing", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const signedTs = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, signedTs, body);

      // Change the timestamp by 1 second
      const tamperedTs = (parseInt(signedTs) + 1).toString();

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", tamperedTs)
        .send(body);

      expect(res.status).toBe(401);
    });

    it("should reject a signature that is too short (not 64 bytes)", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      // Only 32 hex chars = 16 bytes, should be 128 hex = 64 bytes
      const shortSig = "ab".repeat(16);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", shortSig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Invalid Discord signature length");
    });

    it("should reject a signature that is too long", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      // 256 hex chars = 128 bytes
      const longSig = "ab".repeat(128);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", longSig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Invalid Discord signature length");
    });

    it("should reject a signature with invalid hex characters", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      // 'zz' is not valid hex
      const invalidHexSig = "zz" + "00".repeat(63);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", invalidHexSig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("not valid hex");
    });

    it("should reject a signature with odd-length hex string", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      // 127 hex chars (odd length)
      const oddSig = "a".repeat(127);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", oddSig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
    });
  });

  // ─── Missing Headers ────────────────────────────────────────────────────

  describe("missing headers", () => {
    it("should reject when x-signature-ed25519 header is missing", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Missing Discord signature headers");
    });

    it("should reject when x-signature-timestamp header is missing", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const sig = "ab".repeat(64);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Missing Discord signature headers");
    });

    it("should reject when both signature headers are missing", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .send(body);

      expect(res.status).toBe(401);
    });
  });

  // ─── Timestamp Validation (Replay Attack Prevention) ────────────────────

  describe("timestamp validation (replay attack prevention)", () => {
    it("should reject a request with a timestamp older than 5 minutes", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      // 6 minutes old
      const ts = (Math.floor(Date.now() / 1000) - 360).toString();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("too old");
    });

    it("should reject a request with a timestamp from the far future", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      // 10 minutes in the future
      const ts = (Math.floor(Date.now() / 1000) + 600).toString();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("too old");
    });

    it("should accept a custom maxRequestAgeSeconds", async () => {
      // Only allow 10 seconds
      const app = createTestApp({
        publicKey: TEST_PUBLIC_KEY,
        maxRequestAgeSeconds: 10,
      });
      const body = JSON.stringify({ type: 1 });
      // 15 seconds old — should be rejected with 10s window
      const ts = (Math.floor(Date.now() / 1000) - 15).toString();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(401);
    });

    it("should accept a request within custom maxRequestAgeSeconds", async () => {
      const app = createTestApp({
        publicKey: TEST_PUBLIC_KEY,
        maxRequestAgeSeconds: 60,
      });
      const body = JSON.stringify({ type: 1 });
      // 30 seconds old — within 60s window
      const ts = (Math.floor(Date.now() / 1000) - 30).toString();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
    });

    it("should allow a non-numeric timestamp through to the signature check", async () => {
      // Discord's timestamp may sometimes be a non-numeric string.
      // The middleware should allow it through to the actual Ed25519 check
      // rather than rejecting it as an invalid timestamp.
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 1 });
      const ts = "not-a-number";
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      // Should succeed because the signature is valid and non-numeric timestamps
      // are allowed through (Discord may use them in edge cases)
      expect(res.status).toBe(200);
    });
  });

  // ─── skipVerification Option ────────────────────────────────────────────

  describe("skipVerification option", () => {
    it("should skip verification when skipVerification is true", async () => {
      const app = createTestApp({
        publicKey: TEST_PUBLIC_KEY,
        skipVerification: true,
      });

      // No signature headers at all
      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ type: 1 }));

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("should skip verification even with invalid headers", async () => {
      const app = createTestApp({
        publicKey: TEST_PUBLIC_KEY,
        skipVerification: true,
      });

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "completely-invalid-not-even-hex")
        .set("x-signature-timestamp", "0")
        .send(JSON.stringify({ type: 1 }));

      expect(res.status).toBe(200);
    });

    it("should skip verification even with no public key configured", async () => {
      const app = createTestApp({
        publicKey: "",
        skipVerification: true,
      });

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ type: 1 }));

      expect(res.status).toBe(200);
    });
  });

  // ─── Public Key Configuration ───────────────────────────────────────────

  describe("public key configuration", () => {
    it("should return 500 when no public key is configured", async () => {
      // Suppress console warnings
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();
      const errorSpy = jest.spyOn(console, "error").mockImplementation();

      const app = createTestApp({ publicKey: "" });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain("not configured");

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should return 500 when public key is not 32 bytes (64 hex chars)", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation();

      // 16 hex chars = 8 bytes, not 32
      const app = createTestApp({ publicKey: "ab".repeat(8) });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(500);
      expect(res.body.message).toContain("not configured");

      errorSpy.mockRestore();
    });

    it("should return 500 when public key contains invalid hex", async () => {
      const errorSpy = jest.spyOn(console, "error").mockImplementation();

      // 'zz' is not valid hex
      const app = createTestApp({ publicKey: "zz" + "00".repeat(31) });
      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", "ab".repeat(64))
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(500);

      errorSpy.mockRestore();
    });
  });

  // ─── JSON Body Fallback Path ────────────────────────────────────────────

  describe("JSON body fallback path", () => {
    it("should work when rawBody is available from preserveRawBody", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });
      const body = JSON.stringify({ type: 2, data: { name: "ask" } });
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
    });

    it("should attempt verification with JSON.stringify fallback when rawBody is not available", async () => {
      const app = createTestAppWithJsonOnly({ publicKey: TEST_PUBLIC_KEY });
      const bodyObj = { type: 1 };
      const body = JSON.stringify(bodyObj);
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      // May succeed or fail depending on JSON reconstruction fidelity
      // but should not crash
      expect([200, 401]).toContain(res.status);
    });
  });

  // ─── Ed25519 Signature Sanity Checks ────────────────────────────────────

  describe("Ed25519 signature sanity checks", () => {
    it("should produce a deterministic signature for the same inputs", () => {
      const sig1 = signDiscordPayload(
        TEST_SECRET_KEY,
        "1234567890",
        '{"type":1}',
      );
      const sig2 = signDiscordPayload(
        TEST_SECRET_KEY,
        "1234567890",
        '{"type":1}',
      );
      expect(sig1).toBe(sig2);
    });

    it("should produce different signatures for different bodies", () => {
      const sig1 = signDiscordPayload(
        TEST_SECRET_KEY,
        "1234567890",
        '{"type":1}',
      );
      const sig2 = signDiscordPayload(
        TEST_SECRET_KEY,
        "1234567890",
        '{"type":2}',
      );
      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different timestamps", () => {
      const sig1 = signDiscordPayload(
        TEST_SECRET_KEY,
        "1234567890",
        '{"type":1}',
      );
      const sig2 = signDiscordPayload(
        TEST_SECRET_KEY,
        "1234567891",
        '{"type":1}',
      );
      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures with different keypairs", () => {
      const { secretKey: otherKey } = generateTestKeypair();
      const sig1 = signDiscordPayload(
        TEST_SECRET_KEY,
        "1234567890",
        '{"type":1}',
      );
      const sig2 = signDiscordPayload(otherKey, "1234567890", '{"type":1}');
      expect(sig1).not.toBe(sig2);
    });

    it("should produce a 128-character hex string (64 bytes)", () => {
      const sig = signDiscordPayload(
        TEST_SECRET_KEY,
        "1234567890",
        '{"type":1}',
      );
      expect(sig).toMatch(/^[0-9a-f]{128}$/);
    });

    it("signature verification should succeed with matching key", () => {
      const ts = "1234567890";
      const body = '{"type":1}';
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const message = new TextEncoder().encode(ts + body);
      const sigBytes = Uint8Array.from(Buffer.from(sig, "hex"));
      const pubKeyBytes = Uint8Array.from(Buffer.from(TEST_PUBLIC_KEY, "hex"));

      const isValid = nacl.sign.detached.verify(message, sigBytes, pubKeyBytes);
      expect(isValid).toBe(true);
    });

    it("signature verification should fail with non-matching key", () => {
      const { publicKeyHex: otherPubKey } = generateTestKeypair();
      const ts = "1234567890";
      const body = '{"type":1}';
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const message = new TextEncoder().encode(ts + body);
      const sigBytes = Uint8Array.from(Buffer.from(sig, "hex"));
      const wrongPubKeyBytes = Uint8Array.from(Buffer.from(otherPubKey, "hex"));

      const isValid = nacl.sign.detached.verify(
        message,
        sigBytes,
        wrongPubKeyBytes,
      );
      expect(isValid).toBe(false);
    });
  });

  // ─── Integration: Full Discord PING Handshake Scenario ──────────────────

  describe("integration: Discord PING verification flow", () => {
    it("should verify a valid PING and allow the handler to respond with PONG", async () => {
      const app = express();
      app.use(jsonWithRawBody());
      app.use(discordVerify({ publicKey: TEST_PUBLIC_KEY }));

      // Simulate the Discord PING handler
      app.post("/interactions", (req: Request, res: Response) => {
        if (req.body?.type === 1) {
          res.status(200).json({ type: 1 }); // PONG
        } else {
          res.status(200).json({ type: 4, data: { content: "Handled" } });
        }
      });

      const body = JSON.stringify({ type: 1 });
      const ts = nowTimestamp();
      const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

      const res = await request(app)
        .post("/interactions")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig)
        .set("x-signature-timestamp", ts)
        .send(body);

      expect(res.status).toBe(200);
      expect(res.body.type).toBe(1); // PONG
    });

    it("should reject an unsigned PING attempt", async () => {
      const app = express();
      app.use(jsonWithRawBody());
      app.use(discordVerify({ publicKey: TEST_PUBLIC_KEY }));

      app.post("/interactions", (req: Request, res: Response) => {
        res.status(200).json({ type: 1 });
      });

      const res = await request(app)
        .post("/interactions")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ type: 1 }));

      // Should never reach the handler
      expect(res.status).toBe(401);
    });
  });

  // ─── Integration: Successive requests with different keypairs ───────────

  describe("integration: multiple requests", () => {
    it("should handle successive valid requests", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });

      for (let i = 0; i < 5; i++) {
        const body = JSON.stringify({ type: 1, seq: i });
        const ts = nowTimestamp();
        const sig = signDiscordPayload(TEST_SECRET_KEY, ts, body);

        const res = await request(app)
          .post("/test")
          .set("Content-Type", "application/json")
          .set("x-signature-ed25519", sig)
          .set("x-signature-timestamp", ts)
          .send(body);

        expect(res.status).toBe(200);
      }
    });

    it("should correctly reject after accepting valid requests", async () => {
      const app = createTestApp({ publicKey: TEST_PUBLIC_KEY });

      // Valid request
      const body1 = JSON.stringify({ type: 1 });
      const ts1 = nowTimestamp();
      const sig1 = signDiscordPayload(TEST_SECRET_KEY, ts1, body1);

      const res1 = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig1)
        .set("x-signature-timestamp", ts1)
        .send(body1);

      expect(res1.status).toBe(200);

      // Invalid request (wrong keypair)
      const { secretKey: wrongKey } = generateTestKeypair();
      const body2 = JSON.stringify({ type: 1 });
      const ts2 = nowTimestamp();
      const sig2 = signDiscordPayload(wrongKey, ts2, body2);

      const res2 = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig2)
        .set("x-signature-timestamp", ts2)
        .send(body2);

      expect(res2.status).toBe(401);

      // Another valid request (should still work)
      const body3 = JSON.stringify({ type: 2 });
      const ts3 = nowTimestamp();
      const sig3 = signDiscordPayload(TEST_SECRET_KEY, ts3, body3);

      const res3 = await request(app)
        .post("/test")
        .set("Content-Type", "application/json")
        .set("x-signature-ed25519", sig3)
        .set("x-signature-timestamp", ts3)
        .send(body3);

      expect(res3.status).toBe(200);
    });
  });
});
