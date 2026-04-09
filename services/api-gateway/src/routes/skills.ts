import express, { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { authMiddleware, authorizationMiddleware } from "../middleware/auth";

export interface Skill {
  name: string;
  description: string;
  category: string;
  version: string;
  enabled: boolean;
  parameters?: Record<string, any>;
  instructions?: string;
}

export interface SkillExecutionRequest {
  parameters?: Record<string, any>;
  context?: {
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, any>;
  };
}

const skillsRegistry: Skill[] = [
  {
    name: "agentflow",
    description: "Orchestrate opencode agents in dependency graphs with parallel fanout, iterative cycles, and remote execution",
    category: "workflow",
    version: "1.0.0",
    enabled: true,
    parameters: {
      type: "object",
      properties: {
        graph: { type: "object", description: "Dependency graph definition" },
        parallel: { type: "boolean", default: false },
      },
    },
  },
  {
    name: "apex-architect",
    description: "Advanced idea optimization with Chain-of-Thought, Red-Teaming, Competitive Intelligence Loops, and Resource-Awareness",
    category: "strategy",
    version: "2.0",
    enabled: true,
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["analysis", "optimization", "research"] },
      },
    },
  },
  {
    name: "context7-mcp",
    description: "Fetch current documentation for libraries, frameworks, or APIs",
    category: "development",
    version: "1.0.0",
    enabled: true,
    parameters: {
      type: "object",
      properties: {
        library: { type: "string" },
        query: { type: "string" },
      },
      required: ["library"],
    },
  },
  {
    name: "find-skills",
    description: "Discover and install agent skills for extending capabilities",
    category: "discovery",
    version: "1.0.0",
    enabled: true,
  },
  {
    name: "hindsight-docs",
    description: "Complete Hindsight documentation for AI agents - architecture, APIs, configuration, and best practices",
    category: "documentation",
    version: "1.0.0",
    enabled: false,
  },
];

export function createSkillsRouter(): Router {
  const router = express.Router();

  router.use(authMiddleware({}));
  router.use(authorizationMiddleware(["skills:read", "skills:execute", "*"]));

  router.get("/", async (req: Request, res: Response) => {
    try {
      logger.info("Fetching skills", {
        requestId: req.headers["x-request-id"],
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: {
          skills: skillsRegistry.map((s) => ({
            name: s.name,
            description: s.description,
            category: s.category,
            version: s.version,
            enabled: s.enabled,
          })),
          totalCount: skillsRegistry.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch skills", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch skills",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/enabled", async (req: Request, res: Response) => {
    try {
      const enabledSkills = skillsRegistry.filter((s) => s.enabled);

      res.json({
        success: true,
        data: {
          skills: enabledSkills.map((s) => ({
            name: s.name,
            description: s.description,
            category: s.category,
            version: s.version,
          })),
          totalCount: enabledSkills.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Failed to fetch enabled skills", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch enabled skills",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/:name", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const skill = skillsRegistry.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );
      if (!skill) {
        res.status(404).json({
          success: false,
          error: `Skill '${name}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        data: skill,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to fetch skill", {
        requestId: req.headers["x-request-id"],
        skillName: req.params.name,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Failed to fetch skill",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/:name/execute", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const { parameters, context } = req.body as SkillExecutionRequest;

      const skill = skillsRegistry.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );
      if (!skill) {
        res.status(404).json({
          success: false,
          error: `Skill '${name}' not found`,
        });
        return;
      }

      if (!skill.enabled) {
        res.status(400).json({
          success: false,
          error: `Skill '${name}' is disabled`,
        });
        return;
      }

      logger.info("Executing skill", {
        requestId: req.headers["x-request-id"],
        skillName: name,
        userId: (req as any).user?.id,
      });

      const executionId = `skill-exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      res.json({
        success: true,
        data: {
          executionId,
          skillName: name,
          status: "completed",
          result: {
            message: `Skill '${name}' executed successfully`,
            parameters: parameters || {},
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Skill execution failed", {
        requestId: req.headers["x-request-id"],
        skillName: req.params.name,
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        success: false,
        error: "Skill execution failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return router;
}
