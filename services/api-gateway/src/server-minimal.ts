import express, { Request, Response, NextFunction, Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { config } from "./config";

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
    // Basic security headers
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-API-Key'],
      credentials: true
    }));

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use(morgan('combined'));

    // Request parsing
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (req: Request, res: Response) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        uptime: process.uptime(),
        environment: config.environment
      });
    });

    // Basic status endpoint
    this.app.get("/v1/status", (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          gateway: {
            status: "healthy",
            version: "1.0.0",
            environment: config.environment,
            uptime: process.uptime()
          }
        },
        metadata: {
          requestId: "test-" + Date.now(),
          timestamp: new Date(),
          executionTime: 0
        }
      });
    });

    // Mock agents endpoint
    this.app.get("/v1/agents", (req: Request, res: Response) => {
      res.json({
        success: true,
        data: [
          {
            id: "architecture",
            name: "Architecture Agent",
            specialization: "System Architecture",
            status: "active"
          },
          {
            id: "security",
            name: "Security Agent",
            specialization: "Security Analysis",
            status: "active"
          },
          {
            id: "quality",
            name: "Quality Agent",
            specialization: "Code Quality",
            status: "active"
          }
        ],
        metadata: {
          requestId: "test-" + Date.now(),
          timestamp: new Date(),
          executionTime: 0
        }
      });
    });

    // Development token endpoint
    this.app.get("/dev/tokens", (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          admin: "dev-admin-token-12345",
          user: "dev-user-token-67890"
        },
        metadata: {
          requestId: "test-" + Date.now(),
          timestamp: new Date(),
          executionTime: 0
        }
      });
    });

    // Metrics endpoint
    this.app.get("/metrics", (req: Request, res: Response) => {
      res.set('Content-Type', 'text/plain');
      res.send(`# HELP constella_gateway_info Gateway information
# TYPE constella_gateway_info gauge
constella_gateway_info{version="1.0.0",environment="${config.environment}"} 1
# HELP constella_gateway_uptime_seconds Gateway uptime in seconds
# TYPE constella_gateway_uptime_seconds gauge
constella_gateway_uptime_seconds ${process.uptime()}
`);
    });

    // Catch all route
    this.app.use("*", (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Route ${req.method} ${req.path} not found`
        },
        metadata: {
          requestId: "test-" + Date.now(),
          timestamp: new Date(),
          executionTime: 0
        }
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: NextFunction) => {
      console.error('API Gateway error:', error);

      if (res.headersSent) {
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: config.environment === "development" ? error.message : "Internal server error"
        },
        metadata: {
          requestId: "test-" + Date.now(),
          timestamp: new Date(),
          executionTime: 0
        }
      });
    });
  }

  public async start(): Promise<void> {
    try {
      // Start the server
      this.server = this.app.listen(config.port, config.host, () => {
        this.isStarted = true;
        console.log(`🚀 Constella API Gateway started successfully`);
        console.log(`   Port: ${config.port}`);
        console.log(`   Host: ${config.host}`);
        console.log(`   Environment: ${config.environment}`);
        console.log(`   Health: http://localhost:${config.port}/health`);
        console.log(`   Status: http://localhost:${config.port}/v1/status`);
      });

      // Handle server errors
      this.server.on("error", (error: any) => {
        console.error('Server error:', error);
        if (error.code === "EADDRINUSE") {
          console.error(`Port ${config.port} is already in use`);
        }
        process.exit(1);
      });
    } catch (error) {
      console.error('Failed to start API Gateway:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    if (!this.isStarted || !this.server) {
      return;
    }

    console.log('Shutting down API Gateway...');

    // Stop accepting new connections
    this.server.close(() => {
      console.log('HTTP server closed');
    });

    this.isStarted = false;
    console.log('API Gateway shut down complete');
  }

  public getApp(): Application {
    return this.app;
  }

  public isRunning(): boolean {
    return this.isStarted;
  }
}

export default APIGateway;
