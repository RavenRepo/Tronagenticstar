import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config, getAPIKeys } from '@/config';
import {
  AuthenticatedRequest,
  JWTPayload,
  APIKeyConfig,
  HTTP_STATUS_CODES,
  ERROR_CODES
} from '@/types';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

// Extend Request interface
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: {
        id: string;
        email: string;
        role: string;
        permissions: string[];
      };
      apiKey?: {
        id: string;
        name: string;
        permissions: string[];
        rateLimit: number;
      };
    }
  }
}

/**
 * Request ID middleware - adds unique request ID to all requests
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    req.requestId = req.headers['x-request-id'] as string || uuidv4();
    res.setHeader('X-Request-ID', req.requestId);
    next();
  };
}

/**
 * Authentication middleware - supports both JWT and API Key authentication
 */
export function authMiddleware(options: {
  optional?: boolean;
  skipPaths?: string[];
  apiKeyOnly?: boolean;
  jwtOnly?: boolean;
} = {}) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Skip authentication for certain paths
      if (options.skipPaths?.some(path => req.path.startsWith(path))) {
        return next();
      }

      const authHeader = req.headers.authorization;
      const apiKeyHeader = req.headers['x-api-key'] as string;

      let authenticated = false;

      // Try API Key authentication first
      if (apiKeyHeader && !options.jwtOnly) {
        const result = await authenticateApiKey(apiKeyHeader);
        if (result.success) {
          req.apiKey = result.apiKey;
          authenticated = true;
          logger.debug(`API Key authentication successful: ${result.apiKey?.name}`, {
            requestId: req.requestId,
            apiKeyId: result.apiKey?.id
          });
        }
      }

      // Try JWT authentication if API key failed or not provided
      if (!authenticated && authHeader && !options.apiKeyOnly) {
        if (authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const result = await authenticateJWT(token);
          if (result.success) {
            req.user = result.user;
            authenticated = true;
            logger.debug(`JWT authentication successful: ${result.user?.email}`, {
              requestId: req.requestId,
              userId: result.user?.id
            });
          }
        }
      }

      // Handle authentication failure
      if (!authenticated && !options.optional) {
        logger.warn('Authentication failed', {
          requestId: req.requestId,
          path: req.path,
          method: req.method,
          hasApiKey: !!apiKeyHeader,
          hasBearer: !!authHeader?.startsWith('Bearer ')
        });

        return res.status(HTTP_STATUS_CODES.UNAUTHORIZED).json({
          success: false,
          error: {
            code: ERROR_CODES.AUTHENTICATION_ERROR,
            message: 'Authentication required. Provide valid Authorization header or X-API-Key'
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: 0
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Authentication middleware error:', error, {
        requestId: req.requestId,
        path: req.path
      });

      res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Authentication service error'
        },
        metadata: {
          requestId: req.requestId,
          timestamp: new Date(),
          executionTime: 0
        }
      });
    }
  };
}

/**
 * Authorization middleware - checks permissions
 */
export function authorizationMiddleware(requiredPermissions: string[] = []) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Get permissions from user or API key
      const permissions = req.user?.permissions || req.apiKey?.permissions || [];

      // Check if user has wildcard permission
      if (permissions.includes('*')) {
        return next();
      }

      // Check if user has required permissions
      const hasPermission = requiredPermissions.every(permission =>
        permissions.includes(permission) ||
        permissions.some(p => p.endsWith('*') && permission.startsWith(p.slice(0, -1)))
      );

      if (!hasPermission) {
        logger.warn('Authorization failed', {
          requestId: req.requestId,
          requiredPermissions,
          userPermissions: permissions,
          userId: req.user?.id,
          apiKeyId: req.apiKey?.id
        });

        return res.status(HTTP_STATUS_CODES.FORBIDDEN).json({
          success: false,
          error: {
            code: ERROR_CODES.AUTHORIZATION_ERROR,
            message: `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`
          },
          metadata: {
            requestId: req.requestId,
            timestamp: new Date(),
            executionTime: 0
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Authorization middleware error:', error, {
        requestId: req.requestId
      });

      res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Authorization service error'
        },
        metadata: {
          requestId: req.requestId,
          timestamp: new Date(),
          executionTime: 0
        }
      });
    }
  };
}

/**
 * Authenticate API Key
 */
async function authenticateApiKey(apiKey: string): Promise<{
  success: boolean;
  apiKey?: APIKeyConfig;
  error?: string;
}> {
  try {
    const apiKeys = getAPIKeys();
    const keyConfig = apiKeys[apiKey];

    if (!keyConfig) {
      return { success: false, error: 'Invalid API key' };
    }

    if (!keyConfig.active) {
      return { success: false, error: 'API key is disabled' };
    }

    if (keyConfig.expiresAt && new Date() > new Date(keyConfig.expiresAt)) {
      return { success: false, error: 'API key has expired' };
    }

    return {
      success: true,
      apiKey: keyConfig
    };
  } catch (error) {
    logger.error('API key authentication error:', error);
    return { success: false, error: 'API key validation failed' };
  }
}

/**
 * Authenticate JWT token
 */
async function authenticateJWT(token: string): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> {
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret) as JWTPayload;

    // Validate token payload
    if (!decoded.userId || !decoded.email) {
      return { success: false, error: 'Invalid token payload' };
    }

    // Check if token is expired (additional check)
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return { success: false, error: 'Token has expired' };
    }

    return {
      success: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role || 'user',
        permissions: decoded.permissions || []
      }
    };
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return { success: false, error: 'Invalid token' };
    }
    if (error instanceof jwt.TokenExpiredError) {
      return { success: false, error: 'Token has expired' };
    }
    if (error instanceof jwt.NotBeforeError) {
      return { success: false, error: 'Token not yet valid' };
    }

    logger.error('JWT authentication error:', error);
    return { success: false, error: 'Token validation failed' };
  }
}

/**
 * Generate JWT token for development/testing
 */
export function generateJWT(payload: {
  userId: string;
  email: string;
  role?: string;
  permissions?: string[];
}): string {
  const jwtPayload: JWTPayload = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role || 'user',
    permissions: payload.permissions || [],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };

  return jwt.sign(jwtPayload, config.auth.jwtSecret);
}

/**
 * Validate API key format
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  // API keys should be at least 32 characters and contain only alphanumeric characters and hyphens
  const apiKeyRegex = /^[a-zA-Z0-9-]{32,}$/;
  return apiKeyRegex.test(apiKey);
}

/**
 * Get user context from request
 */
export function getUserContext(req: AuthenticatedRequest): {
  type: 'user' | 'apikey' | 'anonymous';
  id?: string;
  permissions: string[];
  rateLimit?: number;
} {
  if (req.user) {
    return {
      type: 'user',
      id: req.user.id,
      permissions: req.user.permissions
    };
  }

  if (req.apiKey) {
    return {
      type: 'apikey',
      id: req.apiKey.id,
      permissions: req.apiKey.permissions,
      rateLimit: req.apiKey.rateLimit
    };
  }

  return {
    type: 'anonymous',
    permissions: []
  };
}

/**
 * Development helper - create test tokens
 */
export function createTestTokens() {
  if (config.environment !== 'development') {
    throw new Error('Test tokens can only be created in development environment');
  }

  const adminToken = generateJWT({
    userId: 'dev-admin-001',
    email: 'admin@constella.dev',
    role: 'admin',
    permissions: ['*']
  });

  const userToken = generateJWT({
    userId: 'dev-user-001',
    email: 'user@constella.dev',
    role: 'user',
    permissions: ['agents:read', 'agents:trigger']
  });

  return {
    admin: adminToken,
    user: userToken
  };
}
