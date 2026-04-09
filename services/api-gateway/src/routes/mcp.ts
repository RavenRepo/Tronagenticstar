import express, { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { authMiddleware, authorizationMiddleware } from "../middleware/auth";

export interface MCPServer {
  name: string;
  url: string;
  status: "connected" | "disconnected" | "error";
  capabilities: string[];
  tools: string[];
  lastHealthCheck?: string;
}

export interface AddMCPServerRequest {
  name: string;
  url: string;
  apiKey?: string;
  capabilities?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

const mcpServersRegistry: Map<string, MCPServer> = new Map([
  [
    "context7",
    {
      name: "context7",
      url: "https://api.context7.io",
      status: "connected",
      capabilities: ["code-search", "documentation-fetch", "web-search"],
      tools: ["resolve-library-id", "query-docs"],
      lastHealthCheck: new Date().toISOString(),
    },
  ],
  [
    "filesystem",
    {
      name: "filesystem",
      url: "file://localhost",
      status: "connected",
      capabilities: ["read", "write", "list"],
      tools: ["read_file", "write_file", "list_directory"],
      lastHealthCheck: new Date().toISOString(),
    },
  ],
]);

export function createMCPRouter(): Router {
  const router = express.Router();

  router.use(authMiddleware({}));
  router.use(authorizationMiddleware(["mcp:read", "mcp:manage", "*"]));

  router.get("/servers", async (req: Request, res: Response) => {
    try {
      logger.info("Fetching MCP servers", {
        requestId: req.headers["x-request-id"],
        userId: (req as any).user?.id,
      });

      const servers = Array.from(mcpServersRegistry.values());

      res.json({
        success: true,
        data: {
          servers: servers.map((s) => ({
            name: s.name,
            url: s.url,
            status: s.status,
            capabilities: s.capabilities,
            toolsCount: s.tools.length,
            lastHealthCheck: s.lastHealthCheck,
          })),
          totalCount: servers.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch MCP servers", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch MCP servers",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/servers", async (req: Request, res: Response) => {
    try {
      const { name, url, apiKey, capabilities } = req.body as AddMCPServerRequest;

      if (!name || !url) {
        res.status(400).json({
          success: false,
          error: "name and url are required",
        });
        return;
      }

      if (mcpServersRegistry.has(name)) {
        res.status(409).json({
          success: false,
          error: `MCP server '${name}' already exists`,
        });
        return;
      }

      logger.info("Adding MCP server", {
        requestId: req.headers["x-request-id"],
        name,
        url,
        userId: (req as any).user?.id,
      });

      const newServer: MCPServer = {
        name,
        url,
        status: "connected",
        capabilities: capabilities || [],
        tools: [],
        lastHealthCheck: new Date().toISOString(),
      };

      mcpServersRegistry.set(name, newServer);

      res.json({
        success: true,
        data: {
          server: newServer,
          message: `MCP server '${name}' added successfully`,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to add MCP server", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to add MCP server",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.delete("/servers/:name", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      if (!mcpServersRegistry.has(name)) {
        res.status(404).json({
          success: false,
          error: `MCP server '${name}' not found`,
        });
        return;
      }

      logger.info("Removing MCP server", {
        requestId: req.headers["x-request-id"],
        name,
        userId: (req as any).user?.id,
      });

      mcpServersRegistry.delete(name);

      res.json({
        success: true,
        data: {
          message: `MCP server '${name}' removed successfully`,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to remove MCP server", {
        requestId: req.headers["x-request-id"],
        serverName: req.params.name,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to remove MCP server",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/servers/:name/tools", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const server = mcpServersRegistry.get(name);
      if (!server) {
        res.status(404).json({
          success: false,
          error: `MCP server '${name}' not found`,
        });
        return;
      }

      const mockTools: MCPTool[] = server.tools.map((toolName) => ({
        name: toolName,
        description: `Tool from ${server.name}`,
        inputSchema: {
          type: "object",
          properties: {
            input: { type: "string" },
          },
        },
      }));

      res.json({
        success: true,
        data: {
          server: server.name,
          tools: mockTools,
          totalCount: mockTools.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch server tools", {
        requestId: req.headers["x-request-id"],
        serverName: req.params.name,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch server tools",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
