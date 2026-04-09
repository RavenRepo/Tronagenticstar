import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { logger } from "./utils/logger";
import { authMiddleware } from "./middleware/auth";
import { monitoringMiddleware } from "./middleware/monitoring";
import {
  errorHandler,
  notFoundHandler,
  setupErrorHandling,
} from "./middleware/error-handler";
import { createAgentsRouter } from "./routes/agents";
import { createToolsRouter } from "./routes/tools";
import { createAgentTypesRouter } from "./routes/agent-types";
import { createSkillsRouter } from "./routes/skills";
import { createMCPRouter } from "./routes/mcp";
import { createHooksRouter } from "./routes/hooks";
import { createAnalyticsRouter } from "./routes/analytics";
import { createHealthRouter } from "./routes/health";
import { createMetricsRouter } from "./routes/metrics";

// Phase 3: Multi-Channel Routing — External channel connectors
import { createSlackWebhookRouter } from "./channels/slackConnector";
import { createDiscordWebhookRouter } from "./channels/discordConnector";

const app: express.Application = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

// CORS Configuration - Strict in production
const corsOptions = {
  origin: function (origin: string | undefined, callback: Function) {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ];

    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: process.env.CORS_CREDENTIALS === "true",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-API-Key",
    "X-Request-ID",
  ],
  exposedHeaders: [
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
  ],
};

app.use(cors(corsOptions));

// Rate Limiting
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || "60000"),
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || "1000"),
  message: {
    error: "Too many requests from this IP",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks in development
    if (req.path === "/health" && process.env.NODE_ENV === "development") {
      return true;
    }
    return false;
  },
});

app.use(rateLimiter);

// Request parsing
app.use(
  express.json({
    limit: process.env.MAX_REQUEST_SIZE_MB
      ? `${process.env.MAX_REQUEST_SIZE_MB}mb`
      : "10mb",
  }),
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Monitoring middleware
app.use(monitoringMiddleware);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    requestId: req.headers["x-request-id"],
  });
  next();
});

// Health check (public, no auth required)
app.use("/health", createHealthRouter());

// Metrics endpoint (PROTECTED in production)
const metricsAuthRequired = process.env.METRICS_AUTH_REQUIRED === "true";
if (metricsAuthRequired) {
  logger.info("Metrics endpoint authentication enabled");
  app.use("/metrics", authMiddleware, createMetricsRouter());
} else {
  logger.warn(
    "Metrics endpoint running without authentication (development mode)",
  );
  app.use("/metrics", createMetricsRouter());
}

// API routes (all require authentication)
app.use("/v1/agents", authMiddleware, createAgentsRouter());
app.use("/v1/tools", authMiddleware, createToolsRouter());
app.use("/v1/agents/types", authMiddleware, createAgentTypesRouter());
app.use("/v1/skills", authMiddleware, createSkillsRouter());
app.use("/v1/mcp", authMiddleware, createMCPRouter());
app.use("/v1/hooks", authMiddleware, createHooksRouter());
app.use("/v1/analytics", authMiddleware, createAnalyticsRouter());
app.use("/v1/status", authMiddleware, (req: any, res: any) => {
  res.json({
    status: "healthy",
    version: config.version,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: config.services,
  });
});

// ─── Phase 3: External Channel Webhooks ─────────────────────────────────────
// These routes use platform-specific signature verification (HMAC-SHA256 for
// Slack, Ed25519 for Discord) instead of JWT/API key authMiddleware.
// They are registered OUTSIDE the authMiddleware-protected routes.

// Slack Events API webhook
// Slack will send events to POST /webhooks/slack/events
// Signature verification is handled inside the Slack connector router.
if (process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET) {
  app.use("/webhooks/slack", createSlackWebhookRouter());
  logger.info("✅ Slack webhook connector enabled at /webhooks/slack/events");
} else {
  logger.info(
    "ℹ️  Slack webhook connector disabled (SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET not set)",
  );
}

// Discord Interactions Endpoint webhook
// Discord will send interactions to POST /webhooks/discord/events
// Signature verification is handled inside the Discord connector router.
if (
  process.env.DISCORD_BOT_TOKEN &&
  process.env.DISCORD_PUBLIC_KEY &&
  process.env.DISCORD_APPLICATION_ID
) {
  app.use("/webhooks/discord", createDiscordWebhookRouter());
  logger.info(
    "✅ Discord webhook connector enabled at /webhooks/discord/events",
  );
} else {
  logger.info(
    "ℹ️  Discord webhook connector disabled (DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY, or DISCORD_APPLICATION_ID not set)",
  );
}

// Development-only routes
if (process.env.NODE_ENV === "development") {
  app.use("/dev/tokens", (req, res) => {
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET;

    const adminToken = jwt.sign(
      { sub: "admin", role: "admin", permissions: ["*"] },
      secret,
      { expiresIn: "24h" },
    );

    const userToken = jwt.sign(
      {
        sub: "user",
        role: "user",
        permissions: ["agents:read", "agents:execute"],
      },
      secret,
      { expiresIn: "24h" },
    );

    res.json({ admin: adminToken, user: userToken });
  });

  logger.warn("Development endpoints enabled (/dev/*)");
} else {
  logger.info("Development endpoints disabled in production");
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
});

// Error handling
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

const port = config.port;
const host = config.host;

/**
 * Start the API Gateway server
 */
export function startServer() {
  return new Promise<any>((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        logger.info(`🚀 Constella API Gateway started`, {
          port,
          host,
          environment: process.env.NODE_ENV,
          version: config.version,
          healthCheck: `http://${host}:${port}/health`,
          metricsAuth: metricsAuthRequired,
        });
        resolve(server);
      });

      server.on("error", (error) => {
        logger.error("Server startup error:", error);
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export { app };
export default app;
