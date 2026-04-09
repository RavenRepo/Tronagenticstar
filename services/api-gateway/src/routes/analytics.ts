import express, { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { authMiddleware, authorizationMiddleware } from "../middleware/auth";

export interface AnalyticsConfig {
  enabled: boolean;
  sinkEnabled: boolean;
  flushInterval: number;
  maxBatchSize: number;
  endpoints: {
    primary?: string;
    backup?: string;
  };
}

export interface AnalyticsEvent {
  name: string;
  timestamp: string;
  properties: Record<string, any>;
  userId?: string;
  sessionId?: string;
}

export interface FlushRequest {
  force?: boolean;
}

let analyticsConfig: AnalyticsConfig = {
  enabled: true,
  sinkEnabled: true,
  flushInterval: 5000,
  maxBatchSize: 100,
  endpoints: {
    primary: process.env.ANALYTICS_ENDPOINT_PRIMARY,
    backup: process.env.ANALYTICS_ENDPOINT_BACKUP,
  },
};

let pendingEvents: AnalyticsEvent[] = [];
let lastFlush: string = new Date().toISOString();

export function createAnalyticsRouter(): Router {
  const router = express.Router();

  router.use(authMiddleware({}));
  router.use(authorizationMiddleware(["analytics:read", "analytics:write", "*"]));

  router.get("/config", async (req: Request, res: Response) => {
    try {
      logger.info("Fetching analytics config", {
        requestId: req.headers["x-request-id"],
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: {
          config: {
            ...analyticsConfig,
            endpoints: {
              primary: analyticsConfig.endpoints.primary ? "[REDACTED]" : undefined,
              backup: analyticsConfig.endpoints.backup ? "[REDACTED]" : undefined,
            },
          },
          pendingEventsCount: pendingEvents.length,
          lastFlush,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch analytics config", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch analytics config",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/killswitch", async (req: Request, res: Response) => {
    try {
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        res.status(400).json({
          success: false,
          error: "enabled (boolean) is required",
        });
        return;
      }

      logger.info("Toggling analytics sink", {
        requestId: req.headers["x-request-id"],
        enabled,
        userId: (req as any).user?.id,
      });

      analyticsConfig.sinkEnabled = enabled;

      res.json({
        success: true,
        data: {
          sinkEnabled: analyticsConfig.sinkEnabled,
          message: analyticsConfig.sinkEnabled
            ? "Analytics sink enabled"
            : "Analytics sink disabled",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to toggle analytics sink", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to toggle analytics sink",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/flush", async (req: Request, res: Response) => {
    try {
      const { force } = req.body as FlushRequest;

      logger.info("Flushing analytics events", {
        requestId: req.headers["x-request-id"],
        pendingCount: pendingEvents.length,
        force: force ?? false,
        userId: (req as any).user?.id,
      });

      const eventsToFlush = [...pendingEvents];
      pendingEvents = [];
      lastFlush = new Date().toISOString();

      res.json({
        success: true,
        data: {
          flushedCount: eventsToFlush.length,
          lastFlush,
          message: `Flushed ${eventsToFlush.length} events`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to flush analytics events", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to flush analytics events",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
