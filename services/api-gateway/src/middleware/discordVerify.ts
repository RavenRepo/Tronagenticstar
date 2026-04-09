// ─── Phase 3d: Discord Request Signature Verification Middleware ─────────────
//
// Verifies that incoming HTTP requests to the Discord webhook endpoints
// actually originate from Discord by validating the Ed25519 signature.
//
// This middleware replaces the standard `authMiddleware` for Discord routes —
// Discord uses Ed25519 signature verification rather than JWT/API keys.
//
// Reference: https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import nacl from "tweetnacl";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Header names used by Discord for request signing.
 */
const DISCORD_SIGNATURE_HEADER = "x-signature-ed25519";
const DISCORD_TIMESTAMP_HEADER = "x-signature-timestamp";

/**
 * Maximum age of a request timestamp (in seconds) before we reject it.
 * Discord doesn't mandate a specific window, but 5 minutes is a reasonable
 * bound to prevent replay attacks (consistent with Slack verification).
 */
const MAX_REQUEST_AGE_SECONDS = 300; // 5 minutes

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiscordVerifyOptions {
  /**
   * The Discord Application Public Key (hex-encoded).
   * If not provided, falls back to the `DISCORD_PUBLIC_KEY` environment variable.
   */
  publicKey?: string;

  /**
   * Maximum allowed age of the request timestamp in seconds.
   * Default: 300 (5 minutes).
   */
  maxRequestAgeSeconds?: number;

  /**
   * If true, skip verification entirely (useful for local development).
   * Default: false. Only set this in development — never in production.
   */
  skipVerification?: boolean;
}

// ─── Middleware Factory ─────────────────────────────────────────────────────

/**
 * Creates an Express middleware that verifies Discord interaction request
 * signatures using Ed25519.
 *
 * Discord signs every interaction request it sends using Ed25519 with your
 * application's public key. This middleware:
 *
 *  1. Reads the raw request body (requires the body to be available as a
 *     string or Buffer — see `preserveRawBody` in slackVerify.ts).
 *  2. Extracts the `X-Signature-Ed25519` and `X-Signature-Timestamp` headers.
 *  3. Constructs the message as `{timestamp}{rawBody}`.
 *  4. Verifies the Ed25519 signature using the application's public key
 *     via `tweetnacl.sign.detached.verify()`.
 *
 * If verification fails, responds with 401 Unauthorized.
 *
 * **Important:** Discord requires that the PING interaction (type 1) be
 * responded to with a PONG (type 1) response. This middleware does NOT
 * handle PING — that is the responsibility of the route handler. This
 * middleware only verifies the signature.
 *
 * @example
 * ```ts
 * import { discordVerify } from "./middleware/discordVerify";
 *
 * // Apply to Discord webhook routes only
 * router.use(discordVerify({ publicKey: process.env.DISCORD_PUBLIC_KEY }));
 * ```
 */
export function discordVerify(options: DiscordVerifyOptions = {}) {
  const publicKey =
    options.publicKey || process.env.DISCORD_PUBLIC_KEY || "";
  const maxAge = options.maxRequestAgeSeconds ?? MAX_REQUEST_AGE_SECONDS;
  const skipVerification =
    options.skipVerification ??
    (process.env.DISCORD_SKIP_VERIFICATION === "true" &&
      process.env.NODE_ENV === "development");

  if (!publicKey && !skipVerification) {
    console.warn(
      "[discordVerify] WARNING: No DISCORD_PUBLIC_KEY configured. " +
        "All Discord webhook requests will be rejected. " +
        "Set DISCORD_PUBLIC_KEY in your environment variables."
    );
  }

  // Pre-convert the hex public key to a Uint8Array once at middleware creation
  // time rather than on every request.
  let publicKeyBytes: Uint8Array | null = null;
  if (publicKey) {
    try {
      publicKeyBytes = hexToUint8Array(publicKey);
      if (publicKeyBytes.length !== 32) {
        console.error(
          `[discordVerify] DISCORD_PUBLIC_KEY must be 32 bytes (64 hex chars), ` +
            `got ${publicKeyBytes.length} bytes (${publicKey.length} hex chars).`
        );
        publicKeyBytes = null;
      }
    } catch (err) {
      console.error(
        `[discordVerify] Failed to parse DISCORD_PUBLIC_KEY as hex: ${err}`
      );
      publicKeyBytes = null;
    }
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // ── Skip verification in development if configured ─────────────────
    if (skipVerification) {
      next();
      return;
    }

    // ── Ensure public key is available ─────────────────────────────────
    if (!publicKeyBytes) {
      res.status(500).json({
        error: "Internal Server Error",
        message:
          "Discord public key is not configured or is invalid. " +
          "Set DISCORD_PUBLIC_KEY in your environment variables.",
      });
      return;
    }

    // ── Extract headers ────────────────────────────────────────────────
    const signature = req.headers[DISCORD_SIGNATURE_HEADER] as
      | string
      | undefined;
    const timestampHeader = req.headers[DISCORD_TIMESTAMP_HEADER] as
      | string
      | undefined;

    if (!signature || !timestampHeader) {
      res.status(401).json({
        error: "Unauthorized",
        message:
          "Missing Discord signature headers. " +
          "Ensure X-Signature-Ed25519 and X-Signature-Timestamp are present.",
      });
      return;
    }

    // ── Validate timestamp (replay attack prevention) ──────────────────
    const timestamp = parseInt(timestampHeader, 10);
    if (!isNaN(timestamp)) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const age = Math.abs(nowSeconds - timestamp);

      if (age > maxAge) {
        res.status(401).json({
          error: "Unauthorized",
          message: `Request timestamp is too old (${age}s > ${maxAge}s). Possible replay attack.`,
        });
        return;
      }
    }
    // Note: Discord's timestamp may be a string rather than a unix timestamp
    // in some interaction payloads. We validate if it parses as a number but
    // still allow non-numeric timestamps through to the signature check.

    // ── Extract raw body ───────────────────────────────────────────────
    let rawBody: string;

    if (typeof (req as any).rawBody === "string") {
      rawBody = (req as any).rawBody;
    } else if (Buffer.isBuffer((req as any).rawBody)) {
      rawBody = (req as any).rawBody.toString("utf-8");
    } else if (typeof req.body === "string") {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString("utf-8");
    } else if (req.body && typeof req.body === "object") {
      // Body was already parsed as JSON — reconstruct it.
      // Note: For production reliability, use a body parser that preserves
      // the raw body (see preserveRawBody in slackVerify.ts).
      rawBody = JSON.stringify(req.body);
    } else {
      rawBody = "";
    }

    // ── Verify Ed25519 signature ───────────────────────────────────────
    // Discord's signing scheme: message = timestamp + body
    const message = timestampHeader + rawBody;

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = hexToUint8Array(signature);
    } catch {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid Discord signature format (not valid hex).",
      });
      return;
    }

    if (signatureBytes.length !== 64) {
      res.status(401).json({
        error: "Unauthorized",
        message: `Invalid Discord signature length: expected 64 bytes, got ${signatureBytes.length}.`,
      });
      return;
    }

    const messageBytes = new TextEncoder().encode(message);

    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    if (!isValid) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid Discord request signature.",
      });
      return;
    }

    // ── Signature valid — proceed ──────────────────────────────────────
    next();
  };
}

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Convert a hex-encoded string to a Uint8Array.
 *
 * @param hex — Hex string (e.g. "a1b2c3d4...")
 * @returns Uint8Array of the decoded bytes
 * @throws Error if the string is not valid hex or has odd length
 */
function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`Hex string has odd length: ${hex.length}`);
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${i}: "${hex.substring(i, i + 2)}"`);
    }
    bytes[i / 2] = byte;
  }

  return bytes;
}

export default discordVerify;
