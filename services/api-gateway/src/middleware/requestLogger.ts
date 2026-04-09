import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger, sanitizeLogData } from "../utils/logger";

/**
 * Extended Request interface with logging context
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
      userId?: string;
    }
  }
}

/**
 * Structured JSON request logging middleware
 * Logs each request/response with observability best practices:
 * - timestamp: ISO 8601 format
 * - level: info/warn/error based on status code
 * - message: HTTP method and path
 * - requestId: unique identifier for request tracing
 * - userId: extracted from auth context (if available)
 * - durationMs: response time in milliseconds
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate or use existing request ID for distributed tracing
  const requestId =
    (req.headers["x-request-id"] as string) ||
    (req.headers["x-correlation-id"] as string) ||
    uuidv4();

  // Attach to request for downstream use
  req.requestId = requestId;
  req.startTime = Date.now();

  // Set response header for client correlation
  res.setHeader("X-Request-ID", requestId);

  // Capture original end to intercept response
  const originalEnd = res.end;
  const originalJson = res.json;

  let responseBody: any;

  // Intercept res.json to capture response body (for error logging)
  res.json = function (body: any) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Log when response finishes
  res.end = function (this: Response, ...args: any[]) {
    const durationMs = Date.now() - req.startTime;
    const statusCode = res.statusCode;

    // Extract userId from request context (set by auth middleware)
    const userId = (req as any).user?.sub || (req as any).user?.id || req.userId;

    // Build structured log entry
    const logEntry = {
      requestId,
      userId: userId || undefined,
      durationMs,
      method: req.method,
      path: req.path,
      url: req.originalUrl,
      statusCode,
      contentLength: res.get("Content-Length"),
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.get("User-Agent"),
      referer: req.get("Referer"),
      query: Object.keys(req.query).length > 0 ? sanitizeLogData(req.query) : undefined,
    };

    // Determine log level based on status code
    const level = getLogLevel(statusCode);

    // Format message
    const message = `${req.method} ${req.path} ${statusCode} - ${durationMs}ms`;

    // Log the request
    if (level === "error") {
      logger.error(message, {
        type: "http_request",
        ...logEntry,
        error: responseBody?.error || responseBody?.message,
      });
    } else if (level === "warn") {
      logger.warn(message, {
        type: "http_request",
        ...logEntry,
      });
    } else {
      logger.info(message, {
        type: "http_request",
        ...logEntry,
      });
    }

    // Log slow requests separately for alerting
    const slowThresholdMs = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || "1000");
    if (durationMs > slowThresholdMs) {
      logger.warn(`Slow request detected: ${durationMs}ms`, {
        type: "slow_request",
        requestId,
        durationMs,
        threshold: slowThresholdMs,
        method: req.method,
        path: req.path,
        userId,
      });
    }

    return originalEnd.apply(this, args as any);
  };

  next();
}

/**
 * Determine log level based on HTTP status code
 */
function getLogLevel(statusCode: number): "info" | "warn" | "error" {
  if (statusCode >= 500) {
    return "error";
  } else if (statusCode >= 400) {
    return "warn";
  }
  return "info";
}

/**
 * Skip logging for specific paths (health checks, metrics in high-frequency scenarios)
 */
export function shouldSkipLogging(req: Request): boolean {
  const skipPaths = ["/health", "/health/live", "/health/ready"];
  const skipInProduction = process.env.SKIP_HEALTH_LOGS === "true";

  if (skipInProduction && skipPaths.includes(req.path)) {
    return true;
  }

  return false;
}

/**
 * Request logging middleware with skip option
 */
export function createRequestLogger(options?: { skip?: (req: Request) => boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check if we should skip logging this request
    if (options?.skip?.(req) || shouldSkipLogging(req)) {
      // Still assign requestId for tracing
      req.requestId =
        (req.headers["x-request-id"] as string) ||
        (req.headers["x-correlation-id"] as string) ||
        uuidv4();
      req.startTime = Date.now();
      res.setHeader("X-Request-ID", req.requestId);
      return next();
    }

    return requestLoggerMiddleware(req, res, next);
  };
}

export default requestLoggerMiddleware;
