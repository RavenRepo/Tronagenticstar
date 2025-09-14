import { APIGateway } from "./server-minimal";
import { config } from "./config";

/**
 * Minimal entry point for the Constella API Gateway
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting Constella API Gateway...');
    console.log(`   Version: 1.0.0`);
    console.log(`   Environment: ${config.environment}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Host: ${config.host}`);

    // Create and start the API Gateway
    const gateway = new APIGateway();
    await gateway.start();

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\nReceived ${signal} signal, starting graceful shutdown...`);

      try {
        await gateway.stop();
        console.log('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // For nodemon
  } catch (error) {
    console.error('Failed to start API Gateway:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main().catch((error) => {
    console.error("Application startup error:", error);
    process.exit(1);
  });
}

export default main;
