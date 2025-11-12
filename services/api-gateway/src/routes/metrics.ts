import express, { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { config } from "../config";

export interface APIMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
    currentRPS: number;
  };
  agents: {
    totalExecutions: number;
    activeAgents: number;
    averageExecutionTime: number;
  };
  services: {
    [serviceName: string]: {
      status: "healthy" | "unhealthy" | "unknown";
      uptime: number;
      responseTime: number;
      errorRate: number;
    };
  };
  gateway: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
  timestamp: string;
}

// In-memory metrics store (in production, use Redis or proper metrics store)
class MetricsCollector {
  private metrics = {
    requests: {
      total: 0,
      successful: 0,
      failed: 0,
      responseTimes: [] as number[],
      recentRequests: [] as { timestamp: number }[],
    },
    agents: {
      totalExecutions: 0,
      activeAgents: new Set<string>(),
      executionTimes: [] as number[],
    },
    services: new Map<
      string,
      {
        status: "healthy" | "unhealthy" | "unknown";
        uptime: number;
        responseTime: number;
        errorCount: number;
        totalRequests: number;
      }
    >(),
  };

  recordRequest(success: boolean, responseTime: number) {
    this.metrics.requests.total++;
    this.metrics.requests.responseTimes.push(responseTime);

    // Keep only last 100 response times for average calculation
    if (this.metrics.requests.responseTimes.length > 100) {
      this.metrics.requests.responseTimes.shift();
    }

    if (success) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Track recent requests for RPS calculation
    const now = Date.now();
    this.metrics.requests.recentRequests.push({ timestamp: now });

    // Keep only requests from last minute
    this.metrics.requests.recentRequests =
      this.metrics.requests.recentRequests.filter(
        (req) => now - req.timestamp <= 60000,
      );
  }

  recordAgentExecution(agentId: string, executionTime: number) {
    this.metrics.agents.totalExecutions++;
    this.metrics.agents.activeAgents.add(agentId);
    this.metrics.agents.executionTimes.push(executionTime);

    // Keep only last 50 execution times
    if (this.metrics.agents.executionTimes.length > 50) {
      this.metrics.agents.executionTimes.shift();
    }
  }

  recordServiceHealth(
    serviceName: string,
    status: "healthy" | "unhealthy" | "unknown",
    responseTime: number,
    hasError: boolean = false,
  ) {
    const service = this.metrics.services.get(serviceName) || {
      status: "unknown",
      uptime: 0,
      responseTime: 0,
      errorCount: 0,
      totalRequests: 0,
    };

    service.status = status;
    service.responseTime = responseTime;
    service.totalRequests++;

    if (hasError) {
      service.errorCount++;
    }

    this.metrics.services.set(serviceName, service);
  }

  getMetrics(): APIMetrics {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Calculate average response time
    const avgResponseTime =
      this.metrics.requests.responseTimes.length > 0
        ? this.metrics.requests.responseTimes.reduce((a, b) => a + b, 0) /
          this.metrics.requests.responseTimes.length
        : 0;

    // Calculate current RPS
    const currentRPS = this.metrics.requests.recentRequests.length / 60; // requests per second over last minute

    // Calculate average agent execution time
    const avgExecutionTime =
      this.metrics.agents.executionTimes.length > 0
        ? this.metrics.agents.executionTimes.reduce((a, b) => a + b, 0) /
          this.metrics.agents.executionTimes.length
        : 0;

    // Build services metrics
    const servicesMetrics: APIMetrics["services"] = {};
    this.metrics.services.forEach((service, serviceName) => {
      servicesMetrics[serviceName] = {
        status: service.status,
        uptime: service.totalRequests > 0 ? uptime : 0, // Simplified uptime
        responseTime: service.responseTime,
        errorRate:
          service.totalRequests > 0
            ? (service.errorCount / service.totalRequests) * 100
            : 0,
      };
    });

    return {
      requests: {
        total: this.metrics.requests.total,
        successful: this.metrics.requests.successful,
        failed: this.metrics.requests.failed,
        averageResponseTime: Math.round(avgResponseTime * 100) / 100,
        currentRPS: Math.round(currentRPS * 100) / 100,
      },
      agents: {
        totalExecutions: this.metrics.agents.totalExecutions,
        activeAgents: this.metrics.agents.activeAgents.size,
        averageExecutionTime: Math.round(avgExecutionTime * 100) / 100,
      },
      services: servicesMetrics,
      gateway: {
        uptime: Math.floor(uptime),
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          percentage:
            Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 10000) /
            100,
        },
        cpu: {
          usage: 0, // TODO: Implement CPU monitoring
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  reset() {
    this.metrics.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      responseTimes: [],
      recentRequests: [],
    };
    this.metrics.agents = {
      totalExecutions: 0,
      activeAgents: new Set(),
      executionTimes: [],
    };
    this.metrics.services.clear();
  }
}

// Global metrics collector instance
const metricsCollector = new MetricsCollector();

// Export the collector for use in middleware
export { metricsCollector };

/**
 * Creates the metrics router with all metrics endpoints
 */
export function createMetricsRouter(): Router {
  const router = express.Router();

  /**
   * GET /metrics
   * Get comprehensive system metrics in JSON format
   */
  router.get("/", (req: Request, res: Response) => {
    try {
      logger.debug("Metrics requested", {
        requestId: req.headers["x-request-id"],
        userAgent: req.headers["user-agent"],
      });

      const metrics = metricsCollector.getMetrics();

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error("Failed to retrieve metrics", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });

      res.status(500).json({
        success: false,
        error: "Failed to retrieve metrics",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /metrics/prometheus
   * Get metrics in Prometheus format for scraping
   */
  router.get("/prometheus", (req: Request, res: Response) => {
    try {
      logger.debug("Prometheus metrics requested", {
        requestId: req.headers["x-request-id"],
      });

      const metrics = metricsCollector.getMetrics();

      // Convert to Prometheus format
      const prometheusMetrics = [
        "# HELP api_gateway_requests_total Total number of requests",
        "# TYPE api_gateway_requests_total counter",
        `api_gateway_requests_total ${metrics.requests.total}`,
        "",
        "# HELP api_gateway_requests_successful_total Total number of successful requests",
        "# TYPE api_gateway_requests_successful_total counter",
        `api_gateway_requests_successful_total ${metrics.requests.successful}`,
        "",
        "# HELP api_gateway_requests_failed_total Total number of failed requests",
        "# TYPE api_gateway_requests_failed_total counter",
        `api_gateway_requests_failed_total ${metrics.requests.failed}`,
        "",
        "# HELP api_gateway_response_time_ms Average response time in milliseconds",
        "# TYPE api_gateway_response_time_ms gauge",
        `api_gateway_response_time_ms ${metrics.requests.averageResponseTime}`,
        "",
        "# HELP api_gateway_requests_per_second Current requests per second",
        "# TYPE api_gateway_requests_per_second gauge",
        `api_gateway_requests_per_second ${metrics.requests.currentRPS}`,
        "",
        "# HELP api_gateway_agent_executions_total Total number of agent executions",
        "# TYPE api_gateway_agent_executions_total counter",
        `api_gateway_agent_executions_total ${metrics.agents.totalExecutions}`,
        "",
        "# HELP api_gateway_active_agents Number of active agents",
        "# TYPE api_gateway_active_agents gauge",
        `api_gateway_active_agents ${metrics.agents.activeAgents}`,
        "",
        "# HELP api_gateway_agent_execution_time_ms Average agent execution time",
        "# TYPE api_gateway_agent_execution_time_ms gauge",
        `api_gateway_agent_execution_time_ms ${metrics.agents.averageExecutionTime}`,
        "",
        "# HELP api_gateway_uptime_seconds Gateway uptime in seconds",
        "# TYPE api_gateway_uptime_seconds gauge",
        `api_gateway_uptime_seconds ${metrics.gateway.uptime}`,
        "",
        "# HELP api_gateway_memory_used_bytes Memory used in bytes",
        "# TYPE api_gateway_memory_used_bytes gauge",
        `api_gateway_memory_used_bytes ${metrics.gateway.memory.used * 1024 * 1024}`,
        "",
        "# HELP api_gateway_memory_percentage Memory usage percentage",
        "# TYPE api_gateway_memory_percentage gauge",
        `api_gateway_memory_percentage ${metrics.gateway.memory.percentage}`,
        "",
      ];

      // Add service-specific metrics
      Object.entries(metrics.services).forEach(
        ([serviceName, serviceMetrics]) => {
          prometheusMetrics.push(
            `# HELP api_gateway_service_response_time_ms Response time for ${serviceName} service`,
            `# TYPE api_gateway_service_response_time_ms gauge`,
            `api_gateway_service_response_time_ms{service="${serviceName}"} ${serviceMetrics.responseTime}`,
            "",
            `# HELP api_gateway_service_error_rate Error rate for ${serviceName} service`,
            `# TYPE api_gateway_service_error_rate gauge`,
            `api_gateway_service_error_rate{service="${serviceName}"} ${serviceMetrics.errorRate}`,
            "",
            `# HELP api_gateway_service_status Service status (1=healthy, 0=unhealthy)`,
            `# TYPE api_gateway_service_status gauge`,
            `api_gateway_service_status{service="${serviceName}"} ${serviceMetrics.status === "healthy" ? 1 : 0}`,
            "",
          );
        },
      );

      res.set("Content-Type", "text/plain; version=0.0.4");
      res.send(prometheusMetrics.join("\n"));
    } catch (error) {
      logger.error("Failed to generate Prometheus metrics", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });

      res.status(500).send("# Error generating metrics\n");
    }
  });

  /**
   * GET /metrics/summary
   * Get a summary of key metrics
   */
  router.get("/summary", (req: Request, res: Response) => {
    try {
      const metrics = metricsCollector.getMetrics();

      // Calculate health score
      const totalServices = Object.keys(metrics.services).length;
      const healthyServices = Object.values(metrics.services).filter(
        (s) => s.status === "healthy",
      ).length;
      const healthScore =
        totalServices > 0 ? (healthyServices / totalServices) * 100 : 100;

      const summary = {
        status:
          healthScore >= 80
            ? "healthy"
            : healthScore >= 50
              ? "degraded"
              : "unhealthy",
        healthScore: Math.round(healthScore),
        requests: {
          total: metrics.requests.total,
          successRate:
            metrics.requests.total > 0
              ? Math.round(
                  (metrics.requests.successful / metrics.requests.total) * 100,
                )
              : 100,
          currentRPS: metrics.requests.currentRPS,
        },
        services: {
          total: totalServices,
          healthy: healthyServices,
          unhealthy: totalServices - healthyServices,
        },
        performance: {
          averageResponseTime: metrics.requests.averageResponseTime,
          memoryUsage: metrics.gateway.memory.percentage,
          uptime: metrics.gateway.uptime,
        },
        timestamp: metrics.timestamp,
      };

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error("Failed to generate metrics summary", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });

      res.status(500).json({
        success: false,
        error: "Failed to generate metrics summary",
      });
    }
  });

  /**
   * POST /metrics/reset
   * Reset all metrics (development only)
   */
  router.post("/reset", (req: Request, res: Response): void => {
    if (config.environment !== "development") {
      res.status(403).json({
        success: false,
        error: "Metrics reset is only available in development mode",
      });
      return;
    }

    try {
      logger.info("Metrics reset requested", {
        requestId: req.headers["x-request-id"],
        userId: (req as any).user?.userId,
      });

      metricsCollector.reset();

      res.json({
        success: true,
        message: "Metrics have been reset",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to reset metrics", {
        requestId: req.headers["x-request-id"],
        error: error instanceof Error ? error.message : error,
      });

      res.status(500).json({
        success: false,
        error: "Failed to reset metrics",
      });
    }
  });

  return router;
}
