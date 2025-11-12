import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { config } from "../config";

export interface ErrorResponse {
  success: false;
  error: string;
  details?: string;
  code?: string;
  timestamp: string;
  requestId?: string;
  path?: string;
  method?: string;
}

/**
 * Custom API Error class for structured error handling
 */
export class APIError extends Error {
  public statusCode: number;
  public code: string;
  public isOperational: boolean;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    details?: any,
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = "APIError";
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, APIError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error class for request validation failures
 */
export class ValidationError extends APIError {
  constructor(message: string, details?: any) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

/**
 * Authentication Error class for auth failures
 */
export class AuthenticationError extends APIError {
  constructor(message: string = "Authentication required", details?: any) {
    super(message, 401, "AUTHENTICATION_ERROR", details);
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization Error class for permission failures
 */
export class AuthorizationError extends APIError {
  constructor(message: string = "Insufficient permissions", details?: any) {
    super(message, 403, "AUTHORIZATION_ERROR", details);
    this.name = "AuthorizationError";
  }
}

/**
 * Not Found Error class for resource not found
 */
export class NotFoundError extends APIError {
  constructor(message: string = "Resource not found", details?: any) {
    super(message, 404, "NOT_FOUND", details);
    this.name = "NotFoundError";
  }
}

/**
 * Rate Limit Error class for rate limiting
 */
export class RateLimitError extends APIError {
  constructor(message: string = "Rate limit exceeded", details?: any) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", details);
    this.name = "RateLimitError";
  }
}

/**
 * Service Unavailable Error class for service issues
 */
export class ServiceUnavailableError extends APIError {
  constructor(
    message: string = "Service temporarily unavailable",
    details?: any,
  ) {
    super(message, 503, "SERVICE_UNAVAILABLE", details);
    this.name = "ServiceUnavailableError";
  }
}

/**
 * Determines if an error is operational (expected) or programming error
 */
function isOperationalError(error: Error): boolean {
  if (error instanceof APIError) {
    return error.isOperational || false;
  }
  return false;
}

/**
 * Formats error response based on environment
 */
function formatErrorResponse(
  error: Error | APIError,
  req: Request,
  includeStack: boolean = false,
): ErrorResponse {
  const isAPIError = error instanceof APIError;
  const statusCode = isAPIError ? error.statusCode : 500;
  const code = isAPIError ? error.code : "INTERNAL_ERROR";

  const errorResponse: ErrorResponse = {
    success: false,
    error: error.message || "An unexpected error occurred",
    code,
    timestamp: new Date().toISOString(),
    requestId: req.headers["x-request-id"] as string,
    path: req.path,
    method: req.method,
  };

  // Add details in development or for operational errors
  if (config.environment === "development" || isOperationalError(error)) {
    if (isAPIError && error.details) {
      errorResponse.details = error.details;
    }

    // Include stack trace in development
    if (includeStack && config.environment === "development") {
      (errorResponse as any).stack = error.stack;
    }
  } else {
    // In production, don't expose internal error details
    errorResponse.error = "Internal server error";
    errorResponse.details =
      "An unexpected error occurred. Please try again later.";
  }

  return errorResponse;
}

/**
 * Logs error with appropriate level and context
 */
function logError(error: Error | APIError, req: Request, res: Response) {
  const isAPIError = error instanceof APIError;
  const statusCode = isAPIError ? error.statusCode : 500;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const isServerError = statusCode >= 500;

  const logContext = {
    requestId: req.headers["x-request-id"],
    method: req.method,
    path: req.path,
    statusCode,
    error: error.message,
    stack: error.stack,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    userId: (req as any).user?.userId,
    body: req.method !== "GET" ? req.body : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
  };

  if (isServerError || !isOperationalError(error)) {
    // Log server errors and programming errors at error level
    logger.error("API Error - Server Error", logContext);
  } else if (isClientError) {
    // Log client errors at warn level (4xx errors)
    logger.warn("API Error - Client Error", logContext);
  } else {
    // Log other operational errors at info level
    logger.info("API Error - Operational", logContext);
  }
}

/**
 * Central error handling middleware
 * Must be registered last in middleware chain
 */
export function errorHandler(
  error: Error | APIError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // If response already sent, delegate to Express default error handler
  if (res.headersSent) {
    logger.warn("Error occurred after response sent", {
      requestId: req.headers["x-request-id"],
      error: error.message,
    });
    return next(error);
  }

  // Log the error
  logError(error, req, res);

  // Determine status code
  const isAPIError = error instanceof APIError;
  const statusCode = isAPIError ? error.statusCode || 500 : 500;

  // Format error response
  const includeStack =
    config.environment === "development" && statusCode >= 500;
  const errorResponse = formatErrorResponse(error, req, includeStack);

  // Set appropriate headers
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");

  // Add rate limit headers if applicable
  if (error instanceof RateLimitError && error.details) {
    if (error.details.retryAfter) {
      res.setHeader("Retry-After", error.details.retryAfter);
    }
    if (error.details.resetTime) {
      res.setHeader("X-RateLimit-Reset", error.details.resetTime);
    }
  }

  // Send error response
  res.json(errorResponse);
}

/**
 * 404 handler for unmatched routes
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(error);
}

/**
 * Async wrapper for route handlers to catch async errors
 */
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>,
) {
  return (req: T, res: U, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express error boundary for uncaught exceptions
 */
export function setupErrorHandling(): void {
  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    logger.error("Uncaught Exception - Process will exit", {
      error: error.message,
      stack: error.stack,
    });

    // Give some time for logs to be written
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    logger.error("Unhandled Promise Rejection", {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString(),
    });

    // In development, exit process to catch these early
    if (config.environment === "development") {
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });

  // Graceful shutdown handling
  const gracefulShutdown = (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown`);

    // Give time for current requests to complete
    setTimeout(() => {
      logger.info("Graceful shutdown completed");
      process.exit(0);
    }, 5000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

/**
 * Validation helper for request validation
 */
export function validateRequest<T>(
  data: any,
  validator: (data: any) => T,
  errorMessage?: string,
): T {
  try {
    return validator(data);
  } catch (error) {
    throw new ValidationError(
      errorMessage || "Request validation failed",
      error instanceof Error ? error.message : error,
    );
  }
}
