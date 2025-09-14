import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import { Request, Response, NextFunction } from "express";
import { createClient, RedisClientType } from "redis";
import { config } from "@/config";
import {
  AuthenticatedRequest,
  RateLimitConfig,
  RateLimitInfo,
  HTTP_STATUS_CODES,
  ERROR_CODES,
} from "@/types";
import { logger } from "@/utils/logger";
import { getUserContext } from "./auth";

// Redis client for rate limiting
let redisClient: RedisClientType | null = null;

/**
 * Initialize Redis client for rate limiting
 */
export async function initializeRateLimit(): Promise<void> {
  try {
    if (config.redis.host) {
      redisClient = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port,
        },
        password: config.redis.password,
        database: config.redis.db,
      });

      redisClient.on("error", (err) => {
        logger.error("Redis client error:", err);
      });

      redisClient.on("connect", () => {
        logger.info("Redis client connected for rate limiting");
      });

      await redisClient.connect();
    } else {
      logger.warn("Redis not configured, using in-memory rate limiting");
    }
  } catch (error) {
    logger.error("Failed to initialize Redis for rate limiting:", error);
    logger.warn("Falling back to in-memory rate limiting");
    redisClient = null;
  }
}

/**
 * Close Redis connection
 */
export async function closeRateLimit(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    logger.info("Redis client disconnected");
  }
}

/**
 * Generate rate limit key for a request
 */
function generateKey(req: AuthenticatedRequest): string {
  const userContext = getUserContext(req);

  if (userContext.type === "user" && userContext.id) {
    return `rate_limit:user:${userContext.id}`;
  }

  if (userContext.type === "apikey" && userContext.id) {
    return `rate_limit:apikey:${userContext.id}`;
  }

  // Fallback to IP address
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  return `rate_limit:ip:${ip}`;
}

/**
 * Get rate limit for user/API key
 */
function getRateLimit(req: AuthenticatedRequest): RateLimitConfig {
  const userContext = getUserContext(req);

  // Use custom rate limit from API key
  if (userContext.type === "apikey" && userContext.rateLimit) {
    return {
      windowMs: config.rateLimit.windowMs,
      maxRequests: userContext.rateLimit,
      skipSuccessfulRequests: config.rateLimit.skipSuccessfulRequests,
      skipFailedRequests: config.rateLimit.skipFailedRequests,
    };
  }

  // Use default configuration
  return config.rateLimit;
}

/**
 * Redis store implementation for express-rate-limit
 */
class RedisStore {
  private prefix: string;

  constructor(prefix: string = "rl:") {
    this.prefix = prefix;
  }

  async incr(key: string): Promise<{ totalHits: number; resetTime?: Date }> {
    if (!redisClient) {
      throw new Error("Redis client not available");
    }

    const fullKey = this.prefix + key;

    try {
      const multi = redisClient.multi();
      multi.incr(fullKey);
      multi.ttl(fullKey);

      const results = await multi.exec();

      if (!results || results.length < 2) {
        throw new Error("Redis multi command failed");
      }

      const totalHits = results[0] as number;
      const ttl = results[1] as number;

      // Set expiration if this is the first hit
      if (totalHits === 1) {
        await redisClient.expire(
          fullKey,
          Math.ceil(config.rateLimit.windowMs / 1000),
        );
      }

      const resetTime = ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined;

      return { totalHits, resetTime };
    } catch (error) {
      logger.error("Redis store incr error:", error);
      throw error;
    }
  }

  async decrement(key: string): Promise<void> {
    if (!redisClient) {
      return;
    }

    const fullKey = this.prefix + key;

    try {
      const current = await redisClient.get(fullKey);
      if (current && parseInt(current) > 0) {
        await redisClient.decr(fullKey);
      }
    } catch (error) {
      logger.error("Redis store decrement error:", error);
    }
  }

  async resetKey(key: string): Promise<void> {
    if (!redisClient) {
      return;
    }

    const fullKey = this.prefix + key;

    try {
      await redisClient.del(fullKey);
    } catch (error) {
      logger.error("Redis store resetKey error:", error);
    }
  }
}

/**
 * Main rate limiting middleware
 */
export function createRateLimit(options: Partial<RateLimitConfig> = {}) {
  const store = redisClient ? new RedisStore() : undefined;

  return rateLimit({
    windowMs: options.windowMs || config.rateLimit.windowMs,
    max: (req: AuthenticatedRequest) => {
      const rateLimitConfig = getRateLimit(req);
      return rateLimitConfig.maxRequests;
    },
    keyGenerator: (req: AuthenticatedRequest) => {
      return generateKey(req);
    },
    store: store as any, // Type assertion needed due to express-rate-limit typing
    skip: (req: AuthenticatedRequest) => {
      // Skip health checks and metrics endpoints
      if (req.path === "/health" || req.path === "/metrics") {
        return true;
      }

      // Check skip conditions from config
      const userContext = getUserContext(req);
      if (userContext.permissions.includes("rate_limit:bypass")) {
        return true;
      }

      return false;
    },

    handler: (req: AuthenticatedRequest, res: Response) => {
      const rateLimitInfo = getRateLimitInfo(req, res);

      res.status(HTTP_STATUS_CODES.TOO_MANY_REQUESTS).json({
        success: false,
        error: {
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          message: `Rate limit exceeded. Limit: ${rateLimitInfo.limit} requests per ${config.rateLimit.windowMs / 1000} seconds`,
          details: {
            limit: rateLimitInfo.limit,
            current: rateLimitInfo.current,
            remaining: rateLimitInfo.remaining,
            resetTime: rateLimitInfo.resetTime,
          },
        },
        metadata: {
          requestId: req.requestId,
          timestamp: new Date(),
          executionTime: 0,
        },
      });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * Slow down middleware for gradually reducing response speed
 */
export function createSlowDown() {
  return slowDown({
    windowMs: config.rateLimit.windowMs,
    delayAfter: Math.floor(config.rateLimit.maxRequests * 0.8), // Start slowing down at 80% of limit
    delayMs: 500, // Add 500ms delay per request over the delayAfter
    maxDelayMs: 10000, // Maximum delay of 10 seconds
    keyGenerator: (req: AuthenticatedRequest) => {
      return generateKey(req);
    },
    skip: (req: AuthenticatedRequest) => {
      // Skip health checks and metrics endpoints
      if (req.path === "/health" || req.path === "/metrics") {
        return true;
      }

      // Check skip conditions from config
      const userContext = getUserContext(req);
      if (userContext.permissions.includes("rate_limit:bypass")) {
        return true;
      }

      return false;
    },
  });
}

/**
 * Custom rate limiting middleware with per-endpoint limits
 */
export function createEndpointRateLimit(
  endpointLimits: Record<string, number>,
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const endpoint = getEndpointKey(req);
      const limit = endpointLimits[endpoint];

      if (!limit) {
        return next();
      }

      const key = `endpoint:${generateKey(req)}:${endpoint}`;
      const current = await getEndpointUsage(key);

      if (current >= limit) {
        logger.warn("Endpoint rate limit exceeded", {
          requestId: req.requestId,
          endpoint,
          limit,
          current,
          ip: req.ip,
        });

        return res.status(HTTP_STATUS_CODES.TOO_MANY_REQUESTS).json({
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: `Endpoint rate limit exceeded. Limit: ${limit} requests per ${config.rateLimit.windowMs / 1000} seconds for ${endpoint}`,
            details: {
              endpoint,
              limit,
              current,
              resetTime: new Date(Date.now() + config.rateLimit.windowMs),
            },
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: 0,
          },
        });
      }

      await incrementEndpointUsage(key);
      next();
    } catch (error) {
      logger.error("Endpoint rate limit error:", error);
      next(); // Continue on error to avoid blocking requests
    }
  };
}

/**
 * Get endpoint key for rate limiting
 */
function getEndpointKey(req: Request): string {
  // Normalize the path for rate limiting
  const path = req.path
    .replace(/\/v\d+/, "") // Remove version prefix
    .replace(/\/[a-f0-9-]{36}/, "/:id") // Replace UUIDs with :id
    .replace(/\/\d+/, "/:id"); // Replace numeric IDs with :id

  return `${req.method}:${path}`;
}

/**
 * Get endpoint usage from Redis or memory
 */
async function getEndpointUsage(key: string): Promise<number> {
  if (redisClient) {
    try {
      const result = await redisClient.get(key);
      return result ? parseInt(result, 10) : 0;
    } catch (error) {
      logger.error("Error getting endpoint usage from Redis:", error);
      return 0;
    }
  }

  // Fallback to in-memory storage (not recommended for production)
  return endpointUsageMap.get(key) || 0;
}

/**
 * Increment endpoint usage in Redis or memory
 */
async function incrementEndpointUsage(key: string): Promise<void> {
  if (redisClient) {
    try {
      const multi = redisClient.multi();
      multi.incr(key);
      multi.expire(key, Math.ceil(config.rateLimit.windowMs / 1000));
      await multi.exec();
    } catch (error) {
      logger.error("Error incrementing endpoint usage in Redis:", error);
    }
  } else {
    // Fallback to in-memory storage
    const current = endpointUsageMap.get(key) || 0;
    endpointUsageMap.set(key, current + 1);

    // Clean up old entries (simple implementation)
    setTimeout(() => {
      endpointUsageMap.delete(key);
    }, config.rateLimit.windowMs);
  }
}

/**
 * In-memory storage for endpoint usage (fallback when Redis is not available)
 */
const endpointUsageMap = new Map<string, number>();

/**
 * Get rate limit information from response headers
 */
export function getRateLimitInfo(
  req: AuthenticatedRequest,
  res: Response,
): RateLimitInfo {
  const limit = parseInt(
    (res.getHeader("X-RateLimit-Limit") as string) || "0",
    10,
  );
  const remaining = parseInt(
    (res.getHeader("X-RateLimit-Remaining") as string) || "0",
    10,
  );
  const reset = res.getHeader("X-RateLimit-Reset") as string;

  return {
    limit,
    current: limit - remaining,
    remaining,
    resetTime: reset ? new Date(parseInt(reset, 10) * 1000) : new Date(),
  };
}

/**
 * Bypass rate limiting for specific requests
 */
export function bypassRateLimit() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set a flag to bypass rate limiting
    (req as any).rateLimitBypass = true;
    next();
  };
}

/**
 * Get rate limit status for monitoring
 */
export async function getRateLimitStatus(): Promise<{
  redisConnected: boolean;
  totalKeys?: number;
  memoryKeys: number;
}> {
  let totalKeys: number | undefined;

  if (redisClient) {
    try {
      const keys = await redisClient.keys("rl:*");
      totalKeys = keys.length;
    } catch (error) {
      logger.error("Error getting Redis keys for rate limit status:", error);
    }
  }

  return {
    redisConnected: redisClient?.isOpen || false,
    totalKeys,
    memoryKeys: endpointUsageMap.size,
  };
}

/**
 * Clear rate limits for a specific user/API key (admin function)
 */
export async function clearRateLimit(
  type: "user" | "apikey" | "ip",
  id: string,
): Promise<boolean> {
  const key = `rate_limit:${type}:${id}`;

  if (redisClient) {
    try {
      const result = await redisClient.del(`rl:${key}`);
      return result > 0;
    } catch (error) {
      logger.error("Error clearing rate limit from Redis:", error);
      return false;
    }
  }

  // Clear from memory map (limited effectiveness)
  let cleared = false;
  for (const [mapKey] of endpointUsageMap) {
    if (mapKey.includes(key)) {
      endpointUsageMap.delete(mapKey);
      cleared = true;
    }
  }

  return cleared;
}
