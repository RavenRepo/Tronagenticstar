import winston from "winston";

// Custom log format
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const logObject: any = {
      timestamp,
      level,
      message,
      service: "api-gateway",
      environment: process.env.NODE_ENV || "development",
      ...meta,
    };

    if (stack) {
      logObject.stack = stack;
    }

    return JSON.stringify(logObject);
  }),
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: "HH:mm:ss.SSS",
  }),
  winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
    let logMessage = `${timestamp} [${level}] ${message}`;

    if (requestId) {
      logMessage += ` [${requestId}]`;
    }

    if (Object.keys(meta).length > 0) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }

    return logMessage;
  }),
);

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: customFormat,
  defaultMeta: {
    service: "api-gateway",
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  },
  transports: [
    // Console transport
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === "development" ? consoleFormat : customFormat,
      handleExceptions: true,
      handleRejections: true,
    }),

    // File transport for errors
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: customFormat,
      handleExceptions: true,
      handleRejections: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: "logs/combined.log",
      format: customFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
  exitOnError: false,
});

// Custom logging methods with structured data
export const loggers = {
  // HTTP request logging
  httpRequest: (data: {
    requestId: string;
    method: string;
    url: string;
    statusCode?: number;
    responseTime?: number;
    userAgent?: string;
    ip?: string;
    userId?: string;
    apiKeyId?: string;
  }) => {
    logger.info("HTTP Request", {
      type: "http_request",
      ...data,
    });
  },

  // Authentication logging
  auth: {
    success: (data: {
      requestId: string;
      type: "jwt" | "apikey";
      userId?: string;
      apiKeyId?: string;
      ip: string;
    }) => {
      logger.info("Authentication successful", {
        ...data,
        authType: "success",
      });
    },

    failure: (data: {
      requestId: string;
      type: "jwt" | "apikey";
      reason: string;
      ip: string;
      userAgent?: string;
    }) => {
      logger.warn("Authentication failed", {
        ...data,
        authType: "failure",
      });
    },
  },

  // Service discovery logging
  service: {
    discovered: (serviceName: string, agents: number) => {
      logger.info("Service discovered", {
        type: "service_discovered",
        serviceName,
        agentsCount: agents,
      });
    },

    healthy: (serviceName: string) => {
      logger.info("Service became healthy", {
        type: "service_healthy",
        serviceName,
      });
    },

    unhealthy: (serviceName: string, error?: any) => {
      logger.warn("Service became unhealthy", {
        type: "service_unhealthy",
        serviceName,
        error: error?.message || "Unknown error",
      });
    },
  },

  // Agent logging
  agent: {
    request: (data: {
      requestId: string;
      agentId: string;
      action: string;
      userId?: string;
      responseTime?: number;
      success: boolean;
    }) => {
      const level = data.success ? "info" : "warn";
      logger[level]("Agent request", {
        type: "agent_request",
        ...data,
      });
    },

    error: (data: {
      requestId: string;
      agentId: string;
      error: string;
      stack?: string;
    }) => {
      logger.error("Agent request error", {
        type: "agent_error",
        ...data,
      });
    },
  },

  // Rate limiting logging
  rateLimit: {
    hit: (data: {
      requestId: string;
      userType: "user" | "apikey" | "ip";
      userId?: string;
      ip: string;
      endpoint: string;
      limit: number;
      current: number;
    }) => {
      logger.warn("Rate limit hit", {
        type: "rate_limit_hit",
        ...data,
      });
    },

    exceeded: (data: {
      requestId: string;
      userType: "user" | "apikey" | "ip";
      userId?: string;
      ip: string;
      endpoint: string;
      limit: number;
    }) => {
      logger.error("Rate limit exceeded", {
        type: "rate_limit_exceeded",
        ...data,
      });
    },
  },

  // Security logging
  security: {
    suspiciousActivity: (data: {
      requestId: string;
      type: "multiple_failed_auth" | "unusual_pattern" | "blocked_ip";
      ip: string;
      userAgent?: string;
      details: any;
    }) => {
      logger.error("Suspicious activity detected", {
        ...data,
        alertType: "security_alert",
      });
    },

    blocked: (data: {
      requestId: string;
      reason: string;
      ip: string;
      userAgent?: string;
    }) => {
      logger.error("Request blocked", {
        type: "security_blocked",
        ...data,
      });
    },
  },

  // Performance logging
  performance: {
    slow: (data: {
      requestId: string;
      endpoint: string;
      responseTime: number;
      threshold: number;
      method: string;
    }) => {
      logger.warn("Slow request detected", {
        type: "performance_slow",
        ...data,
      });
    },

    high_memory: (memoryUsage: any) => {
      logger.warn("High memory usage detected", {
        type: "performance_memory",
        ...memoryUsage,
      });
    },
  },
};

// Middleware to add request context to logs
export function addRequestContext(
  requestId: string,
  userId?: string,
  apiKeyId?: string,
) {
  return logger.child({
    requestId,
    userId,
    apiKeyId,
  });
}

// Helper function to sanitize sensitive data
export function sanitizeLogData(data: any): any {
  const sensitiveKeys = [
    "password",
    "token",
    "authorization",
    "apikey",
    "secret",
    "key",
    "auth",
    "credential",
  ];

  if (typeof data !== "object" || data === null) {
    return data;
  }

  const sanitized = { ...data };

  for (const key in sanitized) {
    if (
      sensitiveKeys.some((sensitive) =>
        key.toLowerCase().includes(sensitive.toLowerCase()),
      )
    ) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }

  return sanitized;
}

// Error logging helper
export function logError(error: any, context?: any) {
  const errorData = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    statusCode: error.statusCode,
    ...sanitizeLogData(context),
  };

  logger.error("Error occurred", errorData);
}

// Create logs directory if it doesn't exist
import fs from "fs";
import path from "path";

const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Export default logger
export default logger;
