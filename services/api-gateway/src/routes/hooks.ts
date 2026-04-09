import express, { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { authMiddleware, authorizationMiddleware } from "../middleware/auth";

export interface Hook {
  event: string;
  name: string;
  callbackUrl: string;
  filters?: Record<string, any>;
  enabled: boolean;
  createdAt: string;
  lastTriggered?: string;
}

export interface RegisterHookRequest {
  callbackUrl: string;
  filters?: Record<string, any>;
  enabled?: boolean;
}

const hooksRegistry: Map<string, Map<string, Hook>> = new Map();

export function createHooksRouter(): Router {
  const router = express.Router();

  router.use(authMiddleware({}));
  router.use(authorizationMiddleware(["hooks:read", "hooks:manage", "*"]));

  router.get("/", async (req: Request, res: Response) => {
    try {
      logger.info("Fetching hooks", {
        requestId: req.headers["x-request-id"],
        userId: (req as any).user?.id,
      });

      const allHooks: Hook[] = [];
      hooksRegistry.forEach((eventHooks, event) => {
        eventHooks.forEach((hook) => {
          allHooks.push(hook);
        });
      });

      res.json({
        success: true,
        data: {
          hooks: allHooks,
          totalCount: allHooks.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch hooks", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch hooks",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/:event", async (req: Request, res: Response) => {
    try {
      const { event } = req.params;
      const { callbackUrl, filters, enabled } = req.body as RegisterHookRequest;

      if (!callbackUrl) {
        res.status(400).json({
          success: false,
          error: "callbackUrl is required",
        });
        return;
      }

      const hookName = `hook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (!hooksRegistry.has(event)) {
        hooksRegistry.set(event, new Map());
      }

      const hook: Hook = {
        event,
        name: hookName,
        callbackUrl,
        filters,
        enabled: enabled ?? true,
        createdAt: new Date().toISOString(),
      };

      hooksRegistry.get(event)!.set(hookName, hook);

      logger.info("Registered hook", {
        requestId: req.headers["x-request-id"],
        event,
        hookName,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: {
          hook,
          message: `Hook registered for event '${event}'`,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to register hook", {
        requestId: req.headers["x-request-id"],
        event: req.params.event,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to register hook",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.delete("/:event/:name", async (req: Request, res: Response) => {
    try {
      const { event, name } = req.params;

      const eventHooks = hooksRegistry.get(event);
      if (!eventHooks || !eventHooks.has(name)) {
        res.status(404).json({
          success: false,
          error: `Hook '${name}' for event '${event}' not found`,
        });
        return;
      }

      logger.info("Unregistering hook", {
        requestId: req.headers["x-request-id"],
        event,
        name,
        userId: (req as any).user?.id,
      });

      eventHooks.delete(name);

      if (eventHooks.size === 0) {
        hooksRegistry.delete(event);
      }

      res.json({
        success: true,
        data: {
          message: `Hook '${name}' unregistered from event '${event}'`,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to unregister hook", {
        requestId: req.headers["x-request-id"],
        event: req.params.event,
        name: req.params.name,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to unregister hook",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
