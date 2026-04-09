/**
 * Input Validation Middleware
 * 
 * Provides Joi-based request validation to prevent injection attacks
 * and ensure data integrity for all API endpoints.
 */

import Joi from "joi";
import { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../utils/logger";

// ─── Validation Schemas ─────────────────────────────────────────────────────

/**
 * Schema for POST /v1/agents/:agentId/execute
 * Validates agent execution requests
 */
export const agentExecuteSchema = Joi.object({
  action: Joi.string()
    .required()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      "string.empty": "Action is required",
      "string.min": "Action must be at least 1 character",
      "string.max": "Action must not exceed 100 characters",
      "string.pattern.base": "Action must contain only alphanumeric characters, underscores, and hyphens",
      "any.required": "Action is required for agent execution",
    }),
  parameters: Joi.object()
    .default({})
    .unknown(true)
    .messages({
      "object.base": "Parameters must be an object",
    }),
  sessionId: Joi.string()
    .max(255)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      "string.max": "Session ID must not exceed 255 characters",
      "string.pattern.base": "Session ID must contain only alphanumeric characters, underscores, and hyphens",
    }),
  userId: Joi.string()
    .max(255)
    .optional()
    .messages({
      "string.max": "User ID must not exceed 255 characters",
    }),
  metadata: Joi.object()
    .default({})
    .unknown(true)
    .optional()
    .messages({
      "object.base": "Metadata must be an object",
    }),
}).options({ stripUnknown: false });

/**
 * Schema for POST /v1/agents/:agentId/trigger
 * Validates agent trigger requests (legacy endpoint)
 */
export const agentTriggerSchema = Joi.object({
  action: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .default("analyze")
    .messages({
      "string.min": "Action must be at least 1 character",
      "string.max": "Action must not exceed 100 characters",
      "string.pattern.base": "Action must contain only alphanumeric characters, underscores, and hyphens",
    }),
  parameters: Joi.object()
    .default({})
    .unknown(true)
    .messages({
      "object.base": "Parameters must be an object",
    }),
  sessionId: Joi.string()
    .max(255)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      "string.max": "Session ID must not exceed 255 characters",
      "string.pattern.base": "Session ID must contain only alphanumeric characters, underscores, and hyphens",
    }),
  userId: Joi.string()
    .max(255)
    .optional()
    .messages({
      "string.max": "User ID must not exceed 255 characters",
    }),
  metadata: Joi.object()
    .default({})
    .unknown(true)
    .optional()
    .messages({
      "object.base": "Metadata must be an object",
    }),
}).options({ stripUnknown: false });

/**
 * Schema for POST /analyze endpoint
 * Validates code analysis requests
 */
export const analyzeSchema = Joi.object({
  code: Joi.string()
    .required()
    .min(1)
    .max(1000000) // 1MB max code size
    .messages({
      "string.empty": "Code is required",
      "string.min": "Code must not be empty",
      "string.max": "Code must not exceed 1MB",
      "any.required": "Code is required for analysis",
    }),
  language: Joi.string()
    .max(50)
    .pattern(/^[a-zA-Z0-9+#_-]+$/)
    .optional()
    .messages({
      "string.max": "Language must not exceed 50 characters",
      "string.pattern.base": "Language must contain only valid characters",
    }),
}).options({ stripUnknown: true });

/**
 * Schema for POST /task endpoint
 * Validates task execution requests
 */
export const taskSchema = Joi.object({
  prompt: Joi.string()
    .required()
    .min(1)
    .max(100000) // 100KB max prompt size
    .messages({
      "string.empty": "Prompt is required",
      "string.min": "Prompt must not be empty",
      "string.max": "Prompt must not exceed 100KB",
      "any.required": "Prompt is required for task execution",
    }),
  agentType: Joi.string()
    .max(100)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .messages({
      "string.max": "Agent type must not exceed 100 characters",
      "string.pattern.base": "Agent type must contain only alphanumeric characters, underscores, and hyphens",
    }),
}).options({ stripUnknown: true });

/**
 * Schema for POST /metrics/reset endpoint
 * Validates metrics reset requests
 */
export const metricsResetSchema = Joi.object({
  confirm: Joi.boolean()
    .optional()
    .messages({
      "boolean.base": "Confirm must be a boolean",
    }),
}).options({ stripUnknown: true });

/**
 * Schema for validating URL path parameters
 * Prevents path traversal and injection attacks
 */
export const pathParamSchema = {
  agentId: Joi.string()
    .required()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      "string.empty": "Agent ID is required",
      "string.min": "Agent ID must not be empty",
      "string.max": "Agent ID must not exceed 255 characters",
      "string.pattern.base": "Agent ID must contain only alphanumeric characters, underscores, and hyphens",
      "any.required": "Agent ID is required",
    }),
};

// ─── Validation Middleware Factory ──────────────────────────────────────────

/**
 * Creates a validation middleware for request body
 * @param schema - Joi schema to validate against
 * @returns Express middleware function
 */
export function validateBody(schema: Joi.ObjectSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      const errorDetails = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
        type: detail.type,
      }));

      logger.warn("Request validation failed", {
        requestId: req.headers["x-request-id"],
        path: req.path,
        method: req.method,
        errors: errorDetails,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errorDetails,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Replace body with validated and sanitized values
    req.body = value;
    next();
  };
}

/**
 * Creates a validation middleware for URL path parameters
 * @param paramName - Name of the path parameter to validate
 * @param schema - Joi schema to validate against
 * @returns Express middleware function
 */
export function validateParam(paramName: string, schema: Joi.StringSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const paramValue = req.params[paramName];
    const { error } = schema.validate(paramValue);

    if (error) {
      logger.warn("Path parameter validation failed", {
        requestId: req.headers["x-request-id"],
        path: req.path,
        method: req.method,
        param: paramName,
        value: paramValue,
        error: error.details[0].message,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        error: "Invalid path parameter",
        details: [{
          field: paramName,
          message: error.details[0].message,
          type: error.details[0].type,
        }],
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

/**
 * Creates a validation middleware for query parameters
 * @param schema - Joi schema to validate against
 * @returns Express middleware function
 */
export function validateQuery(schema: Joi.ObjectSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      allowUnknown: false,
    });

    if (error) {
      const errorDetails = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
        type: detail.type,
      }));

      logger.warn("Query parameter validation failed", {
        requestId: req.headers["x-request-id"],
        path: req.path,
        method: req.method,
        errors: errorDetails,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: errorDetails,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.query = value;
    next();
  };
}

// ─── Sanitization Utilities ─────────────────────────────────────────────────

/**
 * Sanitizes a string to prevent XSS and injection attacks
 * @param input - String to sanitize
 * @returns Sanitized string
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return "";
  
  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .trim();
}

/**
 * Deep sanitizes an object, removing potentially dangerous content
 * @param obj - Object to sanitize
 * @returns Sanitized object
 */
export function sanitizeObject(obj: Record<string, any>): Record<string, any> {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key
    const sanitizedKey = sanitizeString(key);
    
    if (typeof value === "string") {
      sanitized[sanitizedKey] = sanitizeString(value);
    } else if (Array.isArray(value)) {
      sanitized[sanitizedKey] = value.map((item) =>
        typeof item === "object" ? sanitizeObject(item) : 
        typeof item === "string" ? sanitizeString(item) : item
      );
    } else if (typeof value === "object" && value !== null) {
      sanitized[sanitizedKey] = sanitizeObject(value);
    } else {
      sanitized[sanitizedKey] = value;
    }
  }

  return sanitized;
}

// ─── Export Validation Schemas Map ──────────────────────────────────────────

export const validationSchemas = {
  agentExecute: agentExecuteSchema,
  agentTrigger: agentTriggerSchema,
  analyze: analyzeSchema,
  task: taskSchema,
  metricsReset: metricsResetSchema,
  pathParams: pathParamSchema,
};

export default {
  validateBody,
  validateParam,
  validateQuery,
  sanitizeString,
  sanitizeObject,
  schemas: validationSchemas,
};
