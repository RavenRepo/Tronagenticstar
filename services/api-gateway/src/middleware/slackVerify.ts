// ─── Phase 3b: Slack Request Signature Verification Middleware ───────────────
//
// Verifies that incoming HTTP requests to the Slack webhook endpoints
// actually originate from Slack by validating the HMAC-SHA256 signature.
//
// This middleware replaces the standard `authMiddleware` for Slack routes —
// Slack uses its own signing secret mechanism rather than JWT/API keys.
//
// Reference: https://api.slack.com/authentication/verifying-requests-from-slack
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Slack signatures include a version prefix. Currently always "v0".
 */
const SLACK_SIGNATURE_VERSION = "v0";

/**
 * Maximum age of a request timestamp (in seconds) before we reject it.
 * Slack recommends rejecting requests older than 5 minutes to prevent
 * replay attacks.
 */
const MAX_REQUEST_AGE_SECONDS = 300; // 5 minutes

/**
 * Header names used by Slack for request signing.
 */
const SLACK_SIGNATURE_HEADER = "x-slack-signature";
const SLACK_TIMESTAMP_HEADER = "x-slack-request-timestamp";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SlackVerifyOptions {
  /**
   * The Slack Signing Secret for your app.
   * If not provided, falls back to the `SLACK_SIGNING_SECRET` environment variable.
   */
  signingSecret?: string;

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
 * Creates an Express middleware that verifies Slack request signatures.
 *
 * Slack signs every HTTP request it sends using HMAC-SHA256 with your app's
 * Signing Secret. This middleware:
 *
 *  1. Reads the raw request body (requires `express.raw()` or a body parser
 *     that preserves the raw body on `req.body` as a Buffer/string).
 *  2. Checks the `X-Slack-Request-Timestamp` header is within the allowed window.
 *  3. Computes `HMAC-SHA256(signingSecret, "v0:{timestamp}:{rawBody}")`.
 *  4. Compares the computed signature with the `X-Slack-Signature` header
 *     using timing-safe comparison to prevent timing attacks.
 *
 * If verification fails, responds with 401 Unauthorized.
 *
 * @example
 * ```ts
 * import { slackVerify } from "./middleware/slackVerify";
 *
 * // Apply to Slack webhook routes only
 * router.use(slackVerify({ signingSecret: process.env.SLACK_SIGNING_SECRET }));
 * ```
 */
export function slackVerify(options: SlackVerifyOptions = {}) {
  const signingSecret =
    options.signingSecret || process.env.SLACK_SIGNING_SECRET || "";
  const maxAge = options.maxRequestAgeSeconds ?? MAX_REQUEST_AGE_SECONDS;
  const skipVerification =
    options.skipVerification ??
    (process.env.SLACK_SKIP_VERIFICATION === "true" &&
      process.env.NODE_ENV === "development");

  if (!signingSecret && !skipVerification) {
    console.warn(
      "[slackVerify] WARNING: No SLACK_SIGNING_SECRET configured. " +
        "All Slack webhook requests will be rejected. " +
        "Set SLACK_SIGNING_SECRET in your environment variables."
    );
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // ── Skip verification in development if configured ─────────────────
    if (skipVerification) {
      next();
      return;
    }

    // ── Extract headers ────────────────────────────────────────────────
    const slackSignature = req.headers[SLACK_SIGNATURE_HEADER] as
      | string
      | undefined;
    const timestampHeader = req.headers[SLACK_TIMESTAMP_HEADER] as
      | string
      | undefined;

    if (!slackSignature || !timestampHeader) {
      res.status(401).json({
        error: "Unauthorized",
        message:
          "Missing Slack signature headers. " +
          "Ensure X-Slack-Signature and X-Slack-Request-Timestamp are present.",
      });
      return;
    }

    // ── Validate timestamp (replay attack prevention) ──────────────────
    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid X-Slack-Request-Timestamp header.",
      });
      return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const age = Math.abs(nowSeconds - timestamp);

    if (age > maxAge) {
      res.status(401).json({
        error: "Unauthorized",
        message: `Request timestamp is too old (${age}s > ${maxAge}s). Possible replay attack.`,
      });
      return;
    }

    // ── Extract raw body ───────────────────────────────────────────────
    // The raw body can come from different places depending on how
    // the body parser is configured:
    //   - (req as any).rawBody — set by some body parsers
    //   - req.body as string/Buffer — if using express.raw() or express.text()
    //   - JSON.stringify(req.body) — fallback for express.json()
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
      // Note: This may not produce an exact match if the JSON was formatted
      // differently. For production, use a body parser that preserves rawBody.
      rawBody = JSON.stringify(req.body);
    } else {
      rawBody = "";
    }

    // ── Compute expected signature ─────────────────────────────────────
    const sigBaseString = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody}`;

    const expectedSignature =
      SLACK_SIGNATURE_VERSION +
      "=" +
      crypto
        .createHmac("sha256", signingSecret)
        .update(sigBaseString, "utf-8")
        .digest("hex");

    // ── Timing-safe comparison ─────────────────────────────────────────
    // Use timingSafeEqual to prevent timing attacks that could leak
    // information about the expected signature.
    const sigBuffer = Buffer.from(slackSignature, "utf-8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

    if (sigBuffer.length !== expectedBuffer.length) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid Slack request signature.",
      });
      return;
    }

    let isValid: boolean;
    try {
      isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid Slack request signature.",
      });
      return;
    }

    // ── Signature valid — proceed ──────────────────────────────────────
    next();
  };
}

// ─── Raw Body Preservation Middleware ────────────────────────────────────────

/**
 * Express middleware that preserves the raw request body as `req.rawBody`.
 *
 * Must be applied BEFORE `express.json()` or any other body parser.
 * This ensures the Slack signature verification has access to the
 * exact bytes that Slack signed.
 *
 * @example
 * ```ts
 * import { preserveRawBody } from "./middleware/slackVerify";
 *
 * // Apply globally or just to webhook routes
 * app.use("/webhooks/slack", preserveRawBody());
 * app.use("/webhooks/slack", express.json());
 * app.use("/webhooks/slack", slackVerify());
 * ```
 */
export function preserveRawBody() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      (req as any).rawBody = raw.toString("utf-8");

      // Re-assign body so downstream JSON parsers can still work.
      // We wrap it in a PassThrough stream if needed, but the simplest
      // approach is to just set the rawBody and let express.json() do its thing.
      // The raw body is already consumed, so we need to make it available
      // for the JSON parser too.
      if (!req.body || Object.keys(req.body).length === 0) {
        try {
          req.body = JSON.parse(raw.toString("utf-8"));
        } catch {
          // Not JSON — leave body as-is
        }
      }

      next();
    });

    req.on("error", (err) => {
      next(err);
    });
  };
}

export default slackVerify;
