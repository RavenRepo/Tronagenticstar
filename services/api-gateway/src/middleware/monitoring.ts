import { Request, Response, NextFunction } from "express";
import promClient from "prom-client";
import { config } from "../config";
import { logger } from "../utils/logger";

// Initialize Prometheus registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  prefix: "constella_gateway_",
});

// Custom metrics
const httpRequestsTotal = new promClient.Counter({
  name: "constella_gateway_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code", "user_type"],
  registers: [register],
});

const httpRequestDuration = new promClient.Histogram({
  name: "constella_gateway_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

const activeConnections = new promClient.Gauge({
  name: "constella_gateway_active_connections",
  help: "Number of active connections",
  registers: [register],
});

const proxyRequestsTotal = new promClient.Counter({
  name: "constella_gateway_proxy_requests_total",
  help: "Total number of proxy requests to backend services",
  labelNames: ["service", "status_code"],
  registers: [register],
});

const proxyRequestDuration = new promClient.Histogram({
  name: "constella_gateway_proxy_request_duration_seconds",
  help: "Duration of proxy requests to backend services in seconds",
  labelNames: ["service"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

const serviceHealthGauge = new promClient.Gauge({
  name: "constella_gateway_service_health",
  help: "Health status of backend services (1 = healthy, 0 = unhealthy)",
  labelNames: ["service"],
  registers: [register],
});

const authenticationAttemptsTotal = new promClient.Counter({
  name: "constella_gateway_auth_attempts_total",
  help: "Total number of authentication attempts",
  labelNames: ["type", "status"],
  registers: [register],
});

const rateLimitHitsTotal = new promClient.Counter({
  name: "constella_gateway_rate_limit_hits_total",
  help: "Total number of rate limit hits",
  labelNames: ["user_type"],
  registers: [register],
});

const agentRequestsTotal = new promClient.Counter({
  name: "constella_gateway_agent_requests_total",
  help: "Total number of agent requests",
  labelNames: ["agent_id", "agent_type", "status"],
  registers: [register],
});

const agentResponseTime = new promClient.Histogram({
  name: "constella_gateway_agent_response_time_seconds",
  help: "Response time of agent requests in seconds",
  labelNames: ["agent_id", "agent_type"],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

// Connection tracking
let connectionCount = 0;

/**
 * Metrics collection middleware
 */
export function monitoringMiddleware() {
  return (req: any, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Increment active connections
    connectionCount++;
    activeConnections.set(connectionCount);

    // Track authentication attempts
    if (req.user || req.apiKey) {
      const authType = req.user ? "jwt" : "apikey";
      authenticationAttemptsTotal.labels(authType, "success").inc();
    }

    // Override res.end to capture metrics when response is sent
    const originalEnd = res.end.bind(res);
    res.end = function (
      this: Response,
      chunk?: any,
      encoding?: BufferEncoding,
      cb?: () => void,
    ) {
      // Calculate response time
      const responseTime = (Date.now() - startTime) / 1000;

      // Get route pattern (remove dynamic segments)
      const route = getRoutePattern(req.path);

      // Get user type for metrics
      const userType = req.user ? "user" : req.apiKey ? "apikey" : "anonymous";

      // Record metrics
      httpRequestsTotal
        .labels(req.method, route, res.statusCode.toString(), userType)
        .inc();

      httpRequestDuration
        .labels(req.method, route, res.statusCode.toString())
        .observe(responseTime);

      // Track rate limit hits
      if (res.statusCode === 429) {
        rateLimitHitsTotal.labels(userType).inc();
      }

      // Decrement active connections
      connectionCount--;
      activeConnections.set(connectionCount);

      // Call original end
      return originalEnd(chunk, encoding as any, cb);
    } as any;

    next();
  };
}

/**
 * Agent metrics middleware
 */
export function createAgentMetricsMiddleware() {
  return (req: any, res: Response, next: NextFunction) => {
    // Only track agent-specific routes
    if (!req.path.includes("/agents/") || !req.path.includes("/trigger")) {
      return next();
    }

    const startTime = Date.now();
    const agentId = req.params.agentId;

    if (!agentId) {
      return next();
    }

    const agentType = "unknown"; // Simplified for now

    // Override res.end to capture agent metrics
    const originalEnd = res.end.bind(res);
    res.end = function (
      this: Response,
      chunk?: any,
      encoding?: BufferEncoding,
      cb?: () => void,
    ) {
      const responseTime = (Date.now() - startTime) / 1000;
      const status = res.statusCode < 400 ? "success" : "error";

      // Record agent metrics
      agentRequestsTotal.labels(agentId, agentType, status).inc();

      agentResponseTime.labels(agentId, agentType).observe(responseTime);

      // Call original end
      return originalEnd(chunk, encoding as any, cb);
    } as any;

    next();
  };
}

/**
 * Proxy metrics middleware
 */
export function createProxyMetricsMiddleware(serviceName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Override res.end to capture proxy metrics
    const originalEnd = res.end.bind(res);
    res.end = function (
      this: Response,
      chunk?: any,
      encoding?: BufferEncoding,
      cb?: () => void,
    ) {
      const responseTime = (Date.now() - startTime) / 1000;

      // Record proxy metrics
      proxyRequestsTotal.labels(serviceName, res.statusCode.toString()).inc();

      proxyRequestDuration.labels(serviceName).observe(responseTime);

      // Call original end
      return originalEnd(chunk, encoding as any, cb);
    } as any;

    next();
  };
}

/**
 * Health check endpoint
 */
export function createHealthCheck() {
  return async (req: Request, res: Response) => {
    try {
      const startTime = Date.now();

      // Simplified health check
      const isHealthy = true; // Simplified for now

      const health = {
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        uptime: process.uptime(),
        environment: config.environment,
        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          platform: process.platform,
          nodeVersion: process.version,
        },
        metrics: {
          totalRequests: await getTotalRequests(),
          averageResponseTime: await getAverageResponseTime(),
          errorRate: await getErrorRate(),
          activeConnections: connectionCount,
        },
      };

      const statusCode = isHealthy ? 200 : 503;

      res.status(statusCode).json(health);

      logger.debug("Health check completed", {
        status: health.status,
        responseTime: Date.now() - startTime,
      });
    } catch (error) {
      logger.error("Health check error:", error);

      res.status(500).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
      });
    }
  };
}

/**
 * Metrics endpoint
 */
export function createMetricsEndpoint() {
  return async (req: Request, res: Response) => {
    try {
      // Update service health metrics
      await updateServiceHealthMetrics();

      // Generate metrics
      const metrics = await register.metrics();

      res.set("Content-Type", register.contentType);
      res.end(metrics);
    } catch (error) {
      logger.error("Metrics endpoint error:", error);
      res.status(500).json({
        error: "Failed to generate metrics",
      });
    }
  };
}

/**
 * Update service health metrics
 */
async function updateServiceHealthMetrics(): Promise<void> {
  try {
    const allServices = config.services;

    // Reset all service health metrics
    serviceHealthGauge.reset();

    // Update health status for each service (simplified)
    allServices.forEach((service) => {
      serviceHealthGauge.labels(service.name).set(1); // Assume healthy for now
    });
  } catch (error) {
    logger.error("Error updating service health metrics:", error);
  }
}

/**
 * Get route pattern for metrics (normalize dynamic segments)
 */
function getRoutePattern(path: string): string {
  return (
    path
      // Replace UUIDs with :id
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "/:id",
      )
      // Replace numeric IDs with :id
      .replace(/\/\d+/g, "/:id")
      // Replace other dynamic segments
      .replace(/\/[^\/]+$/g, "/:param")
      // Normalize multiple slashes
      .replace(/\/+/g, "/")
  );
}

/**
 * Get total requests from metrics
 */
async function getTotalRequests(): Promise<number> {
  try {
    const metric = await register.getSingleMetric(
      "constella_gateway_http_requests_total",
    );
    if (metric && "get" in metric) {
      const values = await metric.get();
      return values.values.reduce((sum, value) => sum + value.value, 0);
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Get average response time from metrics
 */
async function getAverageResponseTime(): Promise<number> {
  try {
    const metric = await register.getSingleMetric(
      "constella_gateway_http_request_duration_seconds",
    );
    if (metric && "get" in metric) {
      const values = await metric.get();
      const histogram = values.values[0];
      if (histogram && (histogram as any).metricName?.includes("sum")) {
        const sum = histogram.value;
        const countMetric = values.values.find((v) =>
          (v as any).metricName?.includes("count"),
        );
        const count = countMetric ? countMetric.value : 1;
        return count > 0 ? sum / count : 0;
      }
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Get error rate from metrics
 */
async function getErrorRate(): Promise<number> {
  try {
    const metric = await register.getSingleMetric(
      "constella_gateway_http_requests_total",
    );
    if (metric && "get" in metric) {
      const values = await metric.get();
      let totalRequests = 0;
      let errorRequests = 0;

      values.values.forEach((value) => {
        const statusCode = value.labels.status_code;
        const count = value.value;

        totalRequests += count;

        if (statusCode && parseInt(String(statusCode)) >= 400) {
          errorRequests += count;
        }
      });

      return totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0;
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Custom metrics recording functions
 */
export const recordAuthAttempt = (
  type: "jwt" | "apikey",
  status: "success" | "failure",
) => {
  authenticationAttemptsTotal.labels(type, status).inc();
};

export const recordRateLimitHit = (userType: string) => {
  rateLimitHitsTotal.labels(userType).inc();
};

export const recordProxyRequest = (
  serviceName: string,
  statusCode: number,
  duration: number,
) => {
  proxyRequestsTotal.labels(serviceName, statusCode.toString()).inc();
  proxyRequestDuration.labels(serviceName).observe(duration);
};

/**
 * Get current metrics summary
 */
export async function getMetricsSummary(): Promise<{
  totalRequests: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  serviceHealth: Record<string, number>;
}> {
  const totalRequests = await getTotalRequests();
  const averageResponseTime = await getAverageResponseTime();
  const errorRate = await getErrorRate();

  // Get service health
  const serviceHealth: Record<string, number> = {};
  const allServices = config.services;

  allServices.forEach((service) => {
    serviceHealth[service.name] = 1; // Assume healthy for now
  });

  return {
    totalRequests,
    averageResponseTime,
    errorRate,
    activeConnections: connectionCount,
    serviceHealth,
  };
}

/**
 * Initialize monitoring
 */
export async function initializeMonitoring(): Promise<void> {
  logger.info("Initializing monitoring system...");

  // Set up periodic service health updates
  setInterval(async () => {
    await updateServiceHealthMetrics();
  }, 30000); // Update every 30 seconds

  logger.info("Monitoring system initialized");
}

/**
 * Shutdown monitoring
 */
export async function shutdownMonitoring(): Promise<void> {
  logger.info("Shutting down monitoring system...");
  register.clear();
  logger.info("Monitoring system shut down");
}

// Export the register for external use
export { register };
