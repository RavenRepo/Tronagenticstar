import express, { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { config } from "../config";
import axios, { AxiosError } from "axios";

export interface AgentExecutionRequest {
  agentId: string;
  action: string;
  parameters: Record<string, any>;
  context?: {
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, any>;
  };
}

export interface AgentExecutionResponse {
  taskId: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: any;
  error?: string;
  executionTime?: number;
  agentInfo: {
    id: string;
    name: string;
    version: string;
  };
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  status: "active" | "inactive" | "error";
  lastActive: string;
  metrics: {
    totalExecutions: number;
    averageResponseTime: number;
    successRate: number;
  };
}

/**
 * Creates the agents router with all agent-related endpoints
 */
export function createAgentsRouter(): Router {
  const router = express.Router();

  /**
   * GET /v1/agents
   * List all available agents with their status and capabilities
   */
  router.get("/", async (req: Request, res: Response) => {
    try {
      logger.info("Fetching agent list", {
        requestId: req.headers["x-request-id"],
        userId: (req as any).user?.userId,
      });

      // Get orchestrator service configuration
      const orchestratorService = config.services.find(
        (s) => s.name === "orchestrator",
      );
      if (!orchestratorService) {
        throw new Error("Orchestrator service not configured");
      }

      // Forward request to orchestrator
      const response = await axios.get(
        `${orchestratorService.url}/api/agents`,
        {
          timeout: orchestratorService.timeout,
          headers: {
            "x-forwarded-for": req.ip,
            "x-request-id": req.headers["x-request-id"],
            "user-agent": "AgentForge-Gateway/1.0.0",
          },
        },
      );

      const agents: AgentInfo[] = response.data.agents || [];

      logger.info("Agent list retrieved successfully", {
        requestId: req.headers["x-request-id"],
        agentCount: agents.length,
      });

      res.json({
        success: true,
        data: {
          agents,
          totalCount: agents.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch agent list", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        res.status(axiosError.response?.status || 502).json({
          success: false,
          error: "Failed to communicate with orchestrator service",
          details: axiosError.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Internal server error while fetching agents",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  });

  /**
   * GET /v1/agents/:agentId
   * Get detailed information about a specific agent
   */
  router.get(
    "/:agentId",
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { agentId } = req.params;

        if (!agentId || agentId.trim() === "") {
          res.status(400).json({
            success: false,
            error: "Agent ID is required",
          });
          return;
        }

        logger.info("Fetching agent details", {
          requestId: req.headers["x-request-id"],
          agentId,
          userId: (req as any).user?.userId,
        });

        const orchestratorService = config.services.find(
          (s) => s.name === "orchestrator",
        );
        if (!orchestratorService) {
          throw new Error("Orchestrator service not configured");
        }

        const response = await axios.get(
          `${orchestratorService.url}/api/agents/${agentId}`,
          {
            timeout: orchestratorService.timeout,
            headers: {
              "x-forwarded-for": req.ip,
              "x-request-id": req.headers["x-request-id"],
              "user-agent": "AgentForge-Gateway/1.0.0",
            },
          },
        );

        res.json({
          success: true,
          data: response.data,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error("Failed to fetch agent details", {
          requestId: req.headers["x-request-id"],
          agentId: req.params.agentId,
          error: error instanceof Error ? error.message : error,
        });

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;
          if (axiosError.response?.status === 404) {
            res.status(404).json({
              success: false,
              error: "Agent not found",
              agentId: req.params.agentId,
            });
          } else {
            res.status(axiosError.response?.status || 502).json({
              success: false,
              error: "Failed to communicate with orchestrator service",
              details: axiosError.message,
            });
          }
        } else {
          res.status(500).json({
            success: false,
            error: "Internal server error while fetching agent details",
          });
        }
      }
    },
  );

  /**
   * POST /v1/agents/:agentId/execute
   * Execute a task with a specific agent
   */
  router.post(
    "/:agentId/execute",
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { agentId } = req.params;
        const executionRequest: AgentExecutionRequest = {
          agentId,
          action: req.body.action,
          parameters: req.body.parameters || {},
          context: {
            sessionId:
              req.body.sessionId || (req.headers["x-session-id"] as string),
            userId: (req as any).user?.userId || req.body.userId,
            metadata: req.body.metadata || {},
          },
        };

        // Validate required fields
        if (!executionRequest.action) {
          res.status(400).json({
            success: false,
            error: "Action is required for agent execution",
          });
          return;
        }

        logger.info("Executing agent task", {
          requestId: req.headers["x-request-id"],
          agentId,
          action: executionRequest.action,
          userId: executionRequest.context?.userId,
          sessionId: executionRequest.context?.sessionId,
        });

        const orchestratorService = config.services.find(
          (s) => s.name === "orchestrator",
        );
        if (!orchestratorService) {
          throw new Error("Orchestrator service not configured");
        }

        const startTime = Date.now();
        const response = await axios.post(
          `${orchestratorService.url}/api/agents/${agentId}/execute`,
          executionRequest,
          {
            timeout: orchestratorService.timeout,
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": req.ip,
              "x-request-id": req.headers["x-request-id"],
              "user-agent": "AgentForge-Gateway/1.0.0",
            },
          },
        );

        const executionTime = Date.now() - startTime;

        logger.info("Agent task executed successfully", {
          requestId: req.headers["x-request-id"],
          agentId,
          action: executionRequest.action,
          executionTime,
          status: response.data.status,
        });

        res.json({
          success: true,
          data: {
            ...response.data,
            executionTime,
            gateway: {
              processedAt: new Date().toISOString(),
              version: config.version,
            },
          },
        });
      } catch (error) {
        logger.error("Agent task execution failed", {
          requestId: req.headers["x-request-id"],
          agentId: req.params.agentId,
          action: req.body.action,
          error: error instanceof Error ? error.message : error,
        });

        if (axios.isAxiosError(error)) {
          const axiosError = error as AxiosError;

          // Handle specific HTTP status codes from orchestrator
          if (axiosError.response?.status === 404) {
            res.status(404).json({
              success: false,
              error: "Agent not found or action not supported",
              agentId: req.params.agentId,
              action: req.body.action,
            });
          } else if (axiosError.response?.status === 400) {
            res.status(400).json({
              success: false,
              error: "Invalid execution request",
              details:
                (axiosError.response?.data as any)?.error || axiosError.message,
            });
          } else if (axiosError.response?.status === 429) {
            res.status(429).json({
              success: false,
              error: "Agent execution rate limit exceeded",
              retryAfter: axiosError.response.headers["retry-after"] || 60,
            });
          } else {
            res.status(axiosError.response?.status || 502).json({
              success: false,
              error: "Failed to communicate with orchestrator service",
              details: axiosError.message,
            });
          }
        } else {
          res.status(500).json({
            success: false,
            error: "Internal server error during agent execution",
            details: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    },
  );

  /**
   * GET /v1/agents/:agentId/status
   * Get the current status and health of a specific agent
   */
  router.get("/:agentId/status", async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;

      logger.info("Fetching agent status", {
        requestId: req.headers["x-request-id"],
        agentId,
      });

      const orchestratorService = config.services.find(
        (s) => s.name === "orchestrator",
      );
      if (!orchestratorService) {
        throw new Error("Orchestrator service not configured");
      }

      const response = await axios.get(
        `${orchestratorService.url}/api/agents/${agentId}/status`,
        {
          timeout: 10000, // Shorter timeout for status checks
          headers: {
            "x-forwarded-for": req.ip,
            "x-request-id": req.headers["x-request-id"],
            "user-agent": "AgentForge-Gateway/1.0.0",
          },
        },
      );

      res.json({
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch agent status", {
        requestId: req.headers["x-request-id"],
        agentId: req.params.agentId,
        error: error instanceof Error ? error.message : error,
      });

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        res.status(axiosError.response?.status || 502).json({
          success: false,
          error: "Failed to get agent status",
          details: axiosError.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: "Internal server error while fetching agent status",
        });
      }
    }
  });

  /**
   * POST /v1/agents/:agentId/trigger
   * Trigger agent execution (alternative endpoint for compatibility)
   */
  router.post(
    "/:agentId/trigger",
    async (req: Request, res: Response): Promise<void> => {
      // Redirect to execute endpoint with action mapping
      const action = req.body.action || "analyze";
      req.body.action = action;

      logger.info("Triggering agent via legacy endpoint", {
        requestId: req.headers["x-request-id"],
        agentId: req.params.agentId,
        action,
      });

      // Forward to execute endpoint by creating new request object
      const modifiedReq = {
        ...req,
        url: `/${req.params.agentId}/execute`,
        method: "POST",
        body: { ...req.body, action },
      };

      // Instead of trying to find the handler, just recreate the execution logic
      try {
        const { agentId } = req.params;
        const executionRequest: AgentExecutionRequest = {
          agentId,
          action,
          parameters: req.body.parameters || {},
          context: {
            sessionId:
              req.body.sessionId || (req.headers["x-session-id"] as string),
            userId: (req as any).user?.userId || req.body.userId,
            metadata: req.body.metadata || {},
          },
        };

        const orchestratorService = config.services.find(
          (s) => s.name === "orchestrator",
        );
        if (!orchestratorService) {
          throw new Error("Orchestrator service not configured");
        }

        const startTime = Date.now();
        const response = await axios.post(
          `${orchestratorService.url}/api/agents/${agentId}/execute`,
          executionRequest,
          {
            timeout: orchestratorService.timeout,
            headers: {
              "content-type": "application/json",
              "x-forwarded-for": req.ip,
              "x-request-id": req.headers["x-request-id"],
              "user-agent": "AgentForge-Gateway/1.0.0",
            },
          },
        );

        const executionTime = Date.now() - startTime;

        res.json({
          success: true,
          data: {
            ...response.data,
            executionTime,
            gateway: {
              processedAt: new Date().toISOString(),
              version: config.version,
            },
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: "Failed to trigger agent execution",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  return router;
}
