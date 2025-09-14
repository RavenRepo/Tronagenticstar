import "./utils/logger"; // Initialize logger first
import { APIGateway } from "./server";
import { config } from "./config";
import { logger } from "./utils/logger";

/**
 * Main entry point for the Constella API Gateway
 */
async function main(): Promise<void> {
  try {
    logger.info("Starting Constella API Gateway...", {
      version: "1.0.0",
      environment: config.environment,
      port: config.port,
      host: config.host,
    });

    // Create and start the API Gateway
    const gateway = new APIGateway();
    await gateway.start();

    logger.info("Constella API Gateway started successfully");

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal} signal, starting graceful shutdown...`);

      try {
        await gateway.stop();
        logger.info("Graceful shutdown completed");
        process.exit(0);
      } catch (error) {
        logger.error("Error during graceful shutdown:", error);
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // For nodemon
  } catch (error) {
    logger.error("Failed to start API Gateway:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main().catch((error) => {
    logger.error("Application startup error:", error);
    process.exit(1);
  });
}

export default main;
