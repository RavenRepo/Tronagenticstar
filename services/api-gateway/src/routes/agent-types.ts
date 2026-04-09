import express, { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { authMiddleware, authorizationMiddleware } from "../middleware/auth";

export interface AgentType {
  name: string;
  description: string;
  capabilities: string[];
  configSchema: Record<string, any>;
  version: string;
  category: string;
}

export interface ForkSubagentRequest {
  parentAgentId: string;
  subagentType: string;
  name?: string;
  context?: {
    inheritMemory?: boolean;
    inheritCapabilities?: boolean;
    metadata?: Record<string, any>;
  };
}

const agentTypes: AgentType[] = [
  {
    name: "researcher",
    description: "Specialized in information gathering and analysis",
    capabilities: ["web-search", "code-read", "summarize"],
    configSchema: {
      type: "object",
      properties: {
        searchDepth: { type: "number", default: 5 },
        includeSources: { type: "boolean", default: true },
      },
    },
    version: "1.0.0",
    category: "analysis",
  },
  {
    name: "coder",
    description: "Specialized in code generation and review",
    capabilities: ["code-generate", "code-review", "code-execute"],
    configSchema: {
      type: "object",
      properties: {
        language: { type: "string", default: "typescript" },
        strictMode: { type: "boolean", default: true },
      },
    },
    version: "1.0.0",
    category: "development",
  },
  {
    name: "writer",
    description: "Specialized in content creation and editing",
    capabilities: ["write", "edit", "translate"],
    configSchema: {
      type: "object",
      properties: {
        tone: { type: "string", default: "professional" },
        maxLength: { type: "number", default: 5000 },
      },
    },
    version: "1.0.0",
    category: "content",
  },
  {
    name: "analyst",
    description: "Specialized in data analysis and visualization",
    capabilities: ["data-analyze", "visualize", "report"],
    configSchema: {
      type: "object",
      properties: {
        chartType: { type: "string", default: "bar" },
        includeRawData: { type: "boolean", default: false },
      },
    },
    version: "1.0.0",
    category: "analysis",
  },
];

export function createAgentTypesRouter(): Router {
  const router = express.Router();

  router.use(authMiddleware({}));
  router.use(authorizationMiddleware(["agents:read", "agents:execute", "*"]));

  router.get("/types", async (req: Request, res: Response) => {
    try {
      logger.info("Fetching agent types", {
        requestId: req.headers["x-request-id"],
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: {
          types: agentTypes,
          totalCount: agentTypes.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch agent types", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch agent types",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/types/:type/config", async (req: Request, res: Response) => {
    try {
      const { type } = req.params;

      const agentType = agentTypes.find((t) => t.name === type);
      if (!agentType) {
        res.status(404).json({
          success: false,
          error: `Agent type '${type}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          name: agentType.name,
          description: agentType.description,
          capabilities: agentType.capabilities,
          configSchema: agentType.configSchema,
          version: agentType.version,
          category: agentType.category,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch agent type config", {
        requestId: req.headers["x-request-id"],
        type: req.params.type,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch agent type config",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/fork", async (req: Request, res: Response) => {
    try {
      const { parentAgentId, subagentType, name, context } = req.body as ForkSubagentRequest;

      if (!parentAgentId || !subagentType) {
        res.status(400).json({
          success: false,
          error: "parentAgentId and subagentType are required",
        });
        return;
      }

      const agentType = agentTypes.find((t) => t.name === subagentType);
      if (!agentType) {
        res.status(404).json({
          success: false,
          error: `Agent type '${subagentType}' not found`,
        });
        return;
      }

      logger.info("Forking subagent", {
        requestId: req.headers["x-request-id"],
        parentAgentId,
        subagentType,
        name,
        userId: (req as any).user?.id,
      });

      const subagentId = `subagent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      res.json({
        success: true,
        data: {
          subagentId,
          parentAgentId,
          type: subagentType,
          name: name || `${subagentType}-subagent-${subagentId.slice(-6)}`,
          capabilities: context?.inheritCapabilities !== false 
            ? agentType.capabilities 
            : [],
          context: {
            inheritMemory: context?.inheritMemory ?? true,
            inheritCapabilities: context?.inheritCapabilities ?? true,
            metadata: context?.metadata || {},
          },
          status: "created",
          createdAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fork subagent", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fork subagent",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
