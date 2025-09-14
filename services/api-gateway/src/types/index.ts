import { Request, Response } from 'express';

// Base interfaces
export interface ServiceConfig {
  name: string;
  url: string;
  health: string;
  weight: number;
  timeout: number;
  retryAttempts: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
}

export interface Agent {
  id: string;
  name: string;
  specialization: string;
  description: string;
  status: 'active' | 'inactive' | 'busy';
  capabilities: string[];
  service: string;
  endpoint: string;
  responseTimeMs?: number;
  lastHeartbeat?: Date;
}

// Request/Response interfaces
export interface TaskRequest {
  action: string;
  parameters: Record<string, any>;
  context?: {
    userId?: string;
    sessionId?: string;
    requestId?: string;
    timestamp?: Date;
  };
  options?: {
    timeout?: number;
    priority?: 'low' | 'normal' | 'high';
    async?: boolean;
  };
}

export interface TaskResult {
  success: boolean;
  result: any;
  metadata: {
    agentId: string;
    executionTime: number;
    provider?: string;
    cost?: number;
    requestId: string;
    timestamp: Date;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    requestId: string;
    timestamp: Date;
    executionTime: number;
  };
}

// Authentication interfaces
export interface AuthenticatedRequest extends Request {
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
  requestId: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export interface APIKeyConfig {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  rateLimit: number;
  dailyLimit?: number;
  active: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

// Service Discovery interfaces
export interface ServiceRegistry {
  services: Map<string, ServiceConfig>;
  agents: Map<string, Agent>;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy';
  responseTime: number;
  timestamp: Date;
  details?: any;
}

// Load Balancer interfaces
export interface LoadBalancerStrategy {
  selectService(services: ServiceConfig[]): ServiceConfig | null;
}

export interface RequestMetrics {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ipAddress: string;
  timestamp: Date;
  service?: string;
  agentId?: string;
}

// Rate Limiting interfaces
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

// Proxy interfaces
export interface ProxyConfig {
  target: string;
  changeOrigin: boolean;
  pathRewrite?: Record<string, string>;
  timeout: number;
  retries: number;
  onProxyReq?: (proxyReq: any, req: Request, res: Response) => void;
  onProxyRes?: (proxyRes: any, req: Request, res: Response) => void;
  onError?: (err: any, req: Request, res: Response) => void;
}

// Configuration interfaces
export interface GatewayConfig {
  port: number;
  host: string;
  environment: 'development' | 'staging' | 'production';
  cors: {
    origin: string[];
    methods: string[];
    allowedHeaders: string[];
  };
  rateLimit: RateLimitConfig;
  auth: {
    jwtSecret: string;
    jwtExpiration: string;
    bcryptRounds: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  services: Record<string, ServiceConfig>;
  monitoring: {
    metricsPath: string;
    healthPath: string;
    enablePrometheus: boolean;
  };
}

// Middleware interfaces
export interface MiddlewareOptions {
  skipPaths?: string[];
  skipMethods?: string[];
  customHandler?: (req: Request, res: Response, next: Function) => void;
}

export interface ValidationSchema {
  body?: any;
  query?: any;
  params?: any;
  headers?: any;
}

// Event interfaces
export interface GatewayEvent {
  type: 'request' | 'response' | 'error' | 'service_health' | 'rate_limit';
  timestamp: Date;
  data: any;
}

// Error interfaces
export interface GatewayError extends Error {
  code: string;
  statusCode: number;
  details?: any;
  service?: string;
  requestId?: string;
}

// Utility types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export type ServiceStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown';

// Agent-specific types
export interface AgentCapability {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
}

export interface LLMProvider {
  name: 'openai' | 'anthropic' | 'gemini' | 'openrouter';
  status: 'active' | 'inactive' | 'error';
  costPer1kTokens: number;
  responseTimeMs: number;
}

export interface AgentExecutionContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  startTime: Date;
  timeout: number;
  priority: 'low' | 'normal' | 'high';
  retryCount: number;
  maxRetries: number;
}

// WebSocket types for real-time features
export interface WebSocketMessage {
  type: 'agent_status' | 'task_progress' | 'task_complete' | 'error';
  data: any;
  timestamp: Date;
  requestId?: string;
}

export interface TaskProgress {
  requestId: string;
  agentId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  message?: string;
  estimatedTimeRemaining?: number;
}

// Configuration validation
export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  PROXY_ERROR: 'PROXY_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
