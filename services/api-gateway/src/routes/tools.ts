import express, { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { authMiddleware, authorizationMiddleware } from "../middleware/auth";

export interface Tool {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  permissions: string[];
  version: string;
}

export interface ToolExecutionRequest {
  toolName: string;
  parameters: Record<string, any>;
  context?: {
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, any>;
  };
}

export interface ToolExecutionResponse {
  taskId: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface ToolSchema {
  name: string;
  version: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

const availableTools: Tool[] = [
  {
    name: "web-search",
    description: "Search the web for information",
    category: "search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        numResults: { type: "number", description: "Number of results" },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        results: { type: "array" },
        totalCount: { type: "number" },
      },
    },
    permissions: ["tools:execute"],
    version: "1.0.0",
  },
  {
    name: "code-execute",
    description: "Execute code in sandboxed environment",
    category: "execution",
    inputSchema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["javascript", "python"] },
        code: { type: "string" },
        timeout: { type: "number" },
      },
      required: ["language", "code"],
    },
    outputSchema: {
      type: "object",
      properties: {
        output: { type: "string" },
        error: { type: "string" },
        executionTime: { type: "number" },
      },
    },
    permissions: ["tools:execute", "admin"],
    version: "1.0.0",
  },
  {
    name: "file-read",
    description: "Read files from the filesystem",
    category: "filesystem",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        encoding: { type: "string", default: "utf-8" },
      },
      required: ["path"],
    },
    outputSchema: {
      type: "object",
      properties: {
        content: { type: "string" },
        size: { type: "number" },
      },
    },
    permissions: ["tools:execute", "files:read"],
    version: "1.0.0",
  },
];

export function createToolsRouter(): Router {
  const router = express.Router();

  router.use(authMiddleware({}));
  router.use(authorizationMiddleware(["tools:read", "tools:execute", "*"]));

  router.get("/", async (req: Request, res: Response) => {
    try {
      logger.info("Fetching available tools", {
        requestId: req.headers["x-request-id"],
        userId: (req as any).user?.id,
      });

      const userPermissions = (req as any).user?.permissions || [];
      const accessibleTools = availableTools.filter((tool) =>
        tool.permissions.some(
          (p) => userPermissions.includes("*") || userPermissions.includes(p),
        ),
      );

      res.json({
        success: true,
        data: {
          tools: accessibleTools.map((t) => ({
            name: t.name,
            description: t.description,
            category: t.category,
            version: t.version,
          })),
          totalCount: accessibleTools.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch tools", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch tools",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/execute", async (req: Request, res: Response) => {
    try {
      const { toolName, parameters, context } = req.body as ToolExecutionRequest;

      if (!toolName) {
        res.status(400).json({
          success: false,
          error: "toolName is required",
        });
        return;
      }

      const tool = availableTools.find((t) => t.name === toolName);
      if (!tool) {
        res.status(404).json({
          success: false,
          error: `Tool '${toolName}' not found`,
        });
        return;
      }

      const userPermissions = (req as any).user?.permissions || [];
      const hasPermission = tool.permissions.some(
        (p) => userPermissions.includes("*") || userPermissions.includes(p),
      );
      if (!hasPermission) {
        res.status(403).json({
          success: false,
          error: "Insufficient permissions to execute this tool",
        });
        return;
      }

      logger.info("Executing tool", {
        requestId: req.headers["x-request-id"],
        toolName,
        userId: (req as any).user?.id,
      });

      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      let result: any;
      let status: "completed" | "failed" = "completed";

      switch (toolName) {
        case "web-search":
          result = { results: [], totalCount: 0 };
          break;
        case "code-execute":
          result = { output: "Executed in sandbox", executionTime: 100 };
          break;
        case "file-read":
          result = { content: "File content placeholder", size: 0 };
          break;
        default:
          result = { message: "Tool execution placeholder" };
      }

      const executionTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          taskId,
          status,
          result,
          executionTime,
          toolName,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Tool execution failed", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Tool execution failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/:toolName/schema", async (req: Request, res: Response) => {
    try {
      const { toolName } = req.params;

      const tool = availableTools.find((t) => t.name === toolName);
      if (!tool) {
        res.status(404).json({
          success: false,
          error: `Tool '${toolName}' not found`,
        });
        return;
      }

      const schema: ToolSchema = {
        name: tool.name,
        version: tool.version,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      };

      res.json({
        success: true,
        data: schema,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch tool schema", {
        requestId: req.headers["x-request-id"],
        toolName: req.params.toolName,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch tool schema",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
