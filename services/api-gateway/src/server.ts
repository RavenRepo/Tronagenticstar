import express, { Request, Response, NextFunction, Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  config,
  validateConfig,
  getConfigSummary,
  SECURITY_HEADERS,
} from "@/config";
import { serviceDiscovery } from "@/services/discovery";
import {
  requestIdMiddleware,
  authMiddleware,
  authorizationMiddleware,
  createTestTokens,
} from "@/middleware/auth";
import {
  createRateLimit,
  createSlowDown,
  initializeRateLimit,
  closeRateLimit,
} from "@/middleware/rateLimit";
import {
  createMetricsMiddleware,
  createHealthCheck,
} from "@/middleware/monitoring";
import {
  AuthenticatedRequest,
  TaskRequest,
  TaskResult,
  APIResponse,
  HTTP_STATUS_CODES,
  ERROR_CODES,
  ServiceConfig,
} from "@/types";
import { logger } from "@/utils/logger";
import { v4 as uuidv4 } from "uuid";

export class APIGateway {
  private app: Application;
  private server?: any;
  private isStarted: boolean = false;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet(SECURITY_HEADERS as any));

    // CORS configuration
    this.app.use(
      cors({
        origin: config.cors.origin,
        methods: config.cors.methods,
        allowedHeaders: config.cors.allowedHeaders,
        credentials: true,
        optionsSuccessStatus: 200,
      }),
    );

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use(
      morgan(
        ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms',
        {
          stream: {
            write: (message: string) => {
              logger.info(message.trim());
            },
          },
        },
      ),
    );

    // Request parsing
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Add request ID to all requests
    this.app.use(requestIdMiddleware());

    // Rate limiting
    this.app.use(createRateLimit());
    this.app.use(createSlowDown());

    // Metrics collection
    this.app.use(createMetricsMiddleware());
  }

  private setupRoutes(): void {
    // Health check endpoint (no auth required)
    this.app.get("/health", createHealthCheck());

    // Metrics endpoint (no auth required for now)
    this.app.get("/metrics", (req, res, next) => {
      // In production, you might want to add auth here
      next();
    });

    // Development endpoints (only in development)
    if (config.environment === "development") {
      this.setupDevelopmentRoutes();
    }

    // API v1 routes
    this.app.use("/v1", this.createV1Router());

    // Default route for undefined endpoints
    this.app.use("*", this.handleUndefinedRoutes.bind(this));
  }

  private setupDevelopmentRoutes(): void {
    // Generate test tokens for development
    this.app.get("/dev/tokens", (req, res) => {
      try {
        const tokens = createTestTokens();
        res.json({
          success: true,
          data: tokens,
          metadata: {
            requestId: (req as AuthenticatedRequest).requestId,
            timestamp: new Date(),
            executionTime: 0,
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: "Failed to generate test tokens",
          },
        });
      }
    });

    // Service status for development
    this.app.get("/dev/services", (req, res) => {
      const status = serviceDiscovery.getServiceStatus();
      res.json({
        success: true,
        data: status,
        metadata: {
          requestId: (req as AuthenticatedRequest).requestId,
          timestamp: new Date(),
          executionTime: 0,
        },
      });
    });
  }

  private createV1Router(): express.Router {
    const router = express.Router();

    // Add authentication to all v1 routes
    router.use(
      authMiddleware({
        skipPaths: ["/v1/status", "/v1/agents"],
      }),
    );

    // Gateway status endpoint
    router.get("/status", this.handleGatewayStatus.bind(this));

    // List all available agents
    router.get("/agents", this.handleListAgents.bind(this));

    // Get specific agent details
    router.get("/agents/:agentId", this.handleGetAgent.bind(this));

    // Execute agent task
    router.post(
      "/agents/:agentId/trigger",
      authorizationMiddleware(["agents:trigger"]),
      this.handleAgentTrigger.bind(this),
    );

    // Proxy to specific services
    router.use("/services/:serviceName/*", this.handleServiceProxy.bind(this));

    return router;
  }

  private async handleGatewayStatus(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const startTime = Date.now();

      const status = {
        gateway: {
          status: "healthy",
          version: "1.0.0",
          environment: config.environment,
          uptime: process.uptime(),
          timestamp: new Date(),
        },
        services: serviceDiscovery.getServiceStatus(),
        config: getConfigSummary(),
      };

      const response: APIResponse = {
        success: true,
        data: status,
        metadata: {
          requestId: req.requestId,
          timestamp: new Date(),
          executionTime: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  private async handleListAgents(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const startTime = Date.now();

      const agents = serviceDiscovery.getAllAgents();

      const response: APIResponse = {
        success: true,
        data: agents,
        metadata: {
          requestId: req.requestId,
          timestamp: new Date(),
          executionTime: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  private async handleGetAgent(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const startTime = Date.now();
      const { agentId } = req.params;

      const agent = serviceDiscovery.getAgent(agentId);

      if (!agent) {
        res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Agent with ID '${agentId}' not found`,
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: Date.now() - startTime,
          },
        });
        return;
      }

      const response: APIResponse = {
        success: true,
        data: agent,
        metadata: {
          requestId: req.requestId,
          timestamp: new Date(),
          executionTime: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  private async handleAgentTrigger(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const { agentId } = req.params;
      const taskRequest: TaskRequest = req.body;

      // Validate request
      if (!taskRequest.action) {
        res.status(HTTP_STATUS_CODES.BAD_REQUEST).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Missing required field: action",
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: Date.now() - startTime,
          },
        });
        return;
      }

      // Get agent information
      const agent = serviceDiscovery.getAgent(agentId);
      if (!agent) {
        res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: `Agent with ID '${agentId}' not found`,
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: Date.now() - startTime,
          },
        });
        return;
      }

      // Get service for the agent
      const service = serviceDiscovery.getService(agent.service);
      if (!service || service.status !== "healthy") {
        res.status(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE).json({
          success: false,
          error: {
            code: ERROR_CODES.SERVICE_UNAVAILABLE,
            message: `Service '${agent.service}' is not available`,
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: Date.now() - startTime,
          },
        });
        return;
      }

      // Forward request to the appropriate service
      const result = await this.forwardToService(service, agent.endpoint, {
        ...taskRequest,
        context: {
          ...taskRequest.context,
          requestId: req.requestId,
          userId: req.user?.id,
          timestamp: new Date(),
        },
      });

      const response: APIResponse<TaskResult> = {
        success: true,
        data: result,
        metadata: {
          requestId: req.requestId,
          timestamp: new Date(),
          executionTime: Date.now() - startTime,
        },
      };

      res.json(response);
    } catch (error) {
      this.handleError(error, req, res, Date.now() - startTime);
    }
  }

  private async handleServiceProxy(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { serviceName } = req.params;
      const service = serviceDiscovery.getService(serviceName);

      if (!service) {
        res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
          success: false,
          error: {
            code: ERROR_CODES.SERVICE_UNAVAILABLE,
            message: `Service '${serviceName}' not found`,
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: 0,
          },
        });
        return;
      }

      if (service.status !== "healthy") {
        res.status(HTTP_STATUS_CODES.SERVICE_UNAVAILABLE).json({
          success: false,
          error: {
            code: ERROR_CODES.SERVICE_UNAVAILABLE,
            message: `Service '${serviceName}' is not healthy`,
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: 0,
          },
        });
        return;
      }

      // Create proxy middleware for this service
      const proxy = createProxyMiddleware({
        target: service.url,
        changeOrigin: true,
        pathRewrite: {
          [`^/v1/services/${serviceName}`]: "",
        },
        timeout: service.timeout,
        onProxyReq: (proxyReq, req, res) => {
          // Add request ID header
          proxyReq.setHeader(
            "X-Request-ID",
            (req as AuthenticatedRequest).requestId,
          );

          // Add user context if available
          const authReq = req as AuthenticatedRequest;
          if (authReq.user) {
            proxyReq.setHeader("X-User-ID", authReq.user.id);
            proxyReq.setHeader("X-User-Email", authReq.user.email);
          }

          if (authReq.apiKey) {
            proxyReq.setHeader("X-API-Key-ID", authReq.apiKey.id);
          }
        },
        onProxyRes: (proxyRes, req, res) => {
          // Add CORS headers if needed
          proxyRes.headers["Access-Control-Allow-Origin"] = "*";
        },
        onError: (err, req, res) => {
          logger.error(`Proxy error for service ${serviceName}:`, err);

          if (!res.headersSent) {
            (res as Response).status(HTTP_STATUS_CODES.BAD_GATEWAY).json({
              success: false,
              error: {
                code: ERROR_CODES.PROXY_ERROR,
                message: `Failed to proxy request to ${serviceName}`,
              },
              metadata: {
                requestId: (req as AuthenticatedRequest).requestId,
                timestamp: new Date(),
                executionTime: 0,
              },
            });
          }
        },
      });

      proxy(req, res, next);
    } catch (error) {
      this.handleError(error, req, res);
    }
  }

  private async forwardToService(
    service: ServiceConfig,
    endpoint: string,
    payload: any,
  ): Promise<TaskResult> {
    const axios = require("axios");

    try {
      const response = await axios.post(`${service.url}${endpoint}`, payload, {
        timeout: service.timeout,
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": payload.context?.requestId || uuidv4(),
        },
      });

      return response.data;
    } catch (error: any) {
      logger.error(`Error forwarding to service ${service.name}:`, error);

      // Return error in TaskResult format
      return {
        success: false,
        result: null,
        metadata: {
          agentId: service.name,
          executionTime: 0,
          requestId: payload.context?.requestId || uuidv4(),
          timestamp: new Date(),
        },
        error: {
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: `Service ${service.name} error: ${error.message}`,
          details: error.response?.data,
        },
      };
    }
  }

  private handleUndefinedRoutes(req: Request, res: Response): void {
    res.status(HTTP_STATUS_CODES.NOT_FOUND).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Route ${req.method} ${req.path} not found`,
      },
      metadata: {
        requestId: (req as AuthenticatedRequest).requestId || uuidv4(),
        timestamp: new Date(),
        executionTime: 0,
      },
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use(
      (
        error: any,
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction,
      ) => {
        this.handleError(error, req, res);
      },
    );

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception:", error);
      this.gracefulShutdown();
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection at:", promise, "reason:", reason);
      this.gracefulShutdown();
    });
  }

  private handleError(
    error: any,
    req: AuthenticatedRequest,
    res: Response,
    executionTime?: number,
  ): void {
    logger.error("API Gateway error:", error, {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      userAgent: req.get("User-Agent"),
      ip: req.ip,
    });

    if (res.headersSent) {
      return;
    }

    let statusCode = HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR;
    let errorCode = ERROR_CODES.INTERNAL_ERROR;
    let message = "Internal server error";

    if (error.statusCode) {
      statusCode = error.statusCode;
    }

    if (error.code) {
      errorCode = error.code;
    }

    if (error.message) {
      message =
        config.environment === "development"
          ? error.message
          : "Internal server error";
    }

    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        message,
        ...(config.environment === "development" && { stack: error.stack }),
      },
      metadata: {
        requestId: req.requestId,
        timestamp: new Date(),
        executionTime: executionTime || 0,
      },
    });
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();

      // Initialize rate limiting
      await initializeRateLimit();

      // Start service discovery
      await serviceDiscovery.start();

      // Start the server
      this.server = this.app.listen(config.port, config.host, () => {
        this.isStarted = true;
        const summary = getConfigSummary();
        logger.info(`API Gateway started successfully`, {
          port: config.port,
          host: config.host,
          environment: config.environment,
          services: Object.keys(config.services).length,
          servicesCount: summary.servicesCount,
          redisEnabled: summary.redisEnabled,
          prometheusEnabled: summary.prometheusEnabled,
          rateLimit: summary.rateLimit,
        });
      });

      // Handle server errors
      this.server.on("error", (error: any) => {
        logger.error("Server error:", error);
        if (error.code === "EADDRINUSE") {
          logger.error(`Port ${config.port} is already in use`);
        }
        process.exit(1);
      });
    } catch (error) {
      logger.error("Failed to start API Gateway:", error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    if (!this.isStarted || !this.server) {
      return;
    }

    logger.info("Shutting down API Gateway...");

    // Stop accepting new connections
    this.server.close(() => {
      logger.info("HTTP server closed");
    });

    // Stop service discovery
    await serviceDiscovery.stop();

    // Close rate limiting connections
    await closeRateLimit();

    this.isStarted = false;
    logger.info("API Gateway shut down complete");
  }

  private gracefulShutdown(): void {
    logger.info("Received shutdown signal, starting graceful shutdown...");

    this.stop()
      .then(() => {
        logger.info("Graceful shutdown completed");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Error during graceful shutdown:", error);
        process.exit(1);
      });
  }

  // Getters for testing
  public getApp(): Application {
    return this.app;
  }

  public getServer(): any {
    return this.server;
  }

  public isRunning(): boolean {
    return this.isStarted;
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => {
  logger.info("Received SIGTERM signal");
  // The gracefulShutdown will be called by the error handler
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT signal");
  // The gracefulShutdown will be called by the error handler
});

export default APIGateway;
