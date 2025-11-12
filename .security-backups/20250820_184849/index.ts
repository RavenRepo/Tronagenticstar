import dotenv from 'dotenv';
import { GatewayConfig, ServiceConfig } from '@/types';

// Load environment variables
dotenv.config();

// Validation helper
function requireEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseArray(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

// Service configurations
const DEFAULT_SERVICES: Record<string, ServiceConfig> = {
  orchestrator: {
    name: 'orchestrator',
    url: process.env.ORCHESTRATOR_URL || 'http://localhost:3001',
    health: '/health',
    weight: 10,
    timeout: parseNumber(process.env.ORCHESTRATOR_TIMEOUT, 30000),
    retryAttempts: parseNumber(process.env.ORCHESTRATOR_RETRY_ATTEMPTS, 3),
    status: 'unknown'
  },
  embedding: {
    name: 'embedding',
    url: process.env.EMBEDDING_URL || 'http://localhost:8001',
    health: '/health',
    weight: 5,
    timeout: parseNumber(process.env.EMBEDDING_TIMEOUT, 20000),
    retryAttempts: parseNumber(process.env.EMBEDDING_RETRY_ATTEMPTS, 2),
    status: 'unknown'
  },
  retriever: {
    name: 'retriever',
    url: process.env.RETRIEVER_URL || 'http://localhost:8002',
    health: '/health',
    weight: 5,
    timeout: parseNumber(process.env.RETRIEVER_TIMEOUT, 15000),
    retryAttempts: parseNumber(process.env.RETRIEVER_RETRY_ATTEMPTS, 2),
    status: 'unknown'
  },
  designforge: {
    name: 'designforge',
    url: process.env.DESIGNFORGE_URL || 'http://localhost:8003',
    health: '/health',
    weight: 3,
    timeout: parseNumber(process.env.DESIGNFORGE_TIMEOUT, 25000),
    retryAttempts: parseNumber(process.env.DESIGNFORGE_RETRY_ATTEMPTS, 2),
    status: 'unknown'
  },
  securishield: {
    name: 'securishield',
    url: process.env.SECURISHIELD_URL || 'http://localhost:8004',
    health: '/health',
    weight: 3,
    timeout: parseNumber(process.env.SECURISHIELD_TIMEOUT, 20000),
    retryAttempts: parseNumber(process.env.SECURISHIELD_RETRY_ATTEMPTS, 2),
    status: 'unknown'
  },
  codecraft: {
    name: 'codecraft',
    url: process.env.CODECRAFT_URL || 'http://localhost:8005',
    health: '/health',
    weight: 4,
    timeout: parseNumber(process.env.CODECRAFT_TIMEOUT, 30000),
    retryAttempts: parseNumber(process.env.CODECRAFT_RETRY_ATTEMPTS, 3),
    status: 'unknown'
  },
  perfpulse: {
    name: 'perfpulse',
    url: process.env.PERFPULSE_URL || 'http://localhost:8006',
    health: '/health',
    weight: 2,
    timeout: parseNumber(process.env.PERFPULSE_TIMEOUT, 15000),
    retryAttempts: parseNumber(process.env.PERFPULSE_RETRY_ATTEMPTS, 2),
    status: 'unknown'
  },
  'soc2-compliance': {
    name: 'soc2-compliance',
    url: process.env.SOC2_COMPLIANCE_URL || 'http://localhost:8007',
    health: '/health',
    weight: 2,
    timeout: parseNumber(process.env.SOC2_COMPLIANCE_TIMEOUT, 20000),
    retryAttempts: parseNumber(process.env.SOC2_COMPLIANCE_RETRY_ATTEMPTS, 2),
    status: 'unknown'
  }
};

// Main configuration
export const config: GatewayConfig = {
  port: parseNumber(process.env.API_GATEWAY_PORT, 3000),
  host: process.env.API_GATEWAY_HOST || '0.0.0.0',
  environment: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development',

  cors: {
    origin: parseArray(process.env.CORS_ORIGINS, ['http://localhost:*', 'https://localhost:*']),
    methods: parseArray(process.env.CORS_METHODS, ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']),
    allowedHeaders: parseArray(process.env.CORS_HEADERS, [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
      'X-Request-ID'
    ])
  },

  rateLimit: {
    windowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000), // 1 minute
    maxRequests: parseNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    skipSuccessfulRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_SUCCESSFUL, false),
    skipFailedRequests: parseBoolean(process.env.RATE_LIMIT_SKIP_FAILED, false)
  },

  auth: {
    jwtSecret: requireEnv('JWT_SECRET', 'dev-secret-change-in-production'),
    jwtExpiration: process.env.JWT_EXPIRATION || '24h',
    bcryptRounds: parseNumber(process.env.BCRYPT_ROUNDS, 12)
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD,
    db: parseNumber(process.env.REDIS_DB, 0)
  },

  services: {
    ...DEFAULT_SERVICES,
    // Allow override via environment variables
    ...parseServices()
  },

  monitoring: {
    metricsPath: process.env.METRICS_PATH || '/metrics',
    healthPath: process.env.HEALTH_PATH || '/health',
    enablePrometheus: parseBoolean(process.env.ENABLE_PROMETHEUS, true)
  }
};

// Parse additional services from environment
function parseServices(): Record<string, ServiceConfig> {
  const services: Record<string, ServiceConfig> = {};
  const serviceNames = parseArray(process.env.ADDITIONAL_SERVICES);

  for (const serviceName of serviceNames) {
    const envPrefix = serviceName.toUpperCase().replace('-', '_');
    const url = process.env[`${envPrefix}_URL`];

    if (url) {
      services[serviceName] = {
        name: serviceName,
        url,
        health: process.env[`${envPrefix}_HEALTH_PATH`] || '/health',
        weight: parseNumber(process.env[`${envPrefix}_WEIGHT`], 1),
        timeout: parseNumber(process.env[`${envPrefix}_TIMEOUT`], 15000),
        retryAttempts: parseNumber(process.env[`${envPrefix}_RETRY_ATTEMPTS`], 2),
        status: 'unknown'
      };
    }
  }

  return services;
}

// API Key configurations (in production, these should come from a secure store)
export const getAPIKeys = (): Record<string, any> => {
  const apiKeysEnv = process.env.API_KEYS;
  if (!apiKeysEnv) {
    // Default development keys
    return {
      'dev-key-12345': {
        id: 'dev-key-1',
        name: 'Development Key',
        permissions: ['*'],
        rateLimit: 1000,
        dailyLimit: 10000,
        active: true
      }
    };
  }

  try {
    return JSON.parse(apiKeysEnv);
  } catch (error) {
    console.error('Failed to parse API_KEYS environment variable:', error);
    return {};
  }
};

// Service health check intervals
export const HEALTH_CHECK_INTERVAL = parseNumber(process.env.HEALTH_CHECK_INTERVAL, 30000); // 30 seconds
export const HEALTH_CHECK_TIMEOUT = parseNumber(process.env.HEALTH_CHECK_TIMEOUT, 5000); // 5 seconds

// Request/Response timeouts
export const DEFAULT_REQUEST_TIMEOUT = parseNumber(process.env.DEFAULT_REQUEST_TIMEOUT, 30000); // 30 seconds
export const MAX_REQUEST_TIMEOUT = parseNumber(process.env.MAX_REQUEST_TIMEOUT, 120000); // 2 minutes

// Logging configuration
export const LOG_LEVEL = process.env.LOG_LEVEL || (config.environment === 'production' ? 'info' : 'debug');
export const LOG_FORMAT = process.env.LOG_FORMAT || 'combined';

// Security headers configuration
export const SECURITY_HEADERS = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: ["no-referrer", "strict-origin-when-cross-origin"] },
  xssFilter: true
};

// Validate configuration
export function validateConfig(): void {
  const errors: string[] = [];

  // Validate required fields
  if (!config.auth.jwtSecret || config.auth.jwtSecret === 'dev-secret-change-in-production') {
    if (config.environment === 'production') {
      errors.push('JWT_SECRET must be set to a secure value in production');
    }
  }

  // Validate service URLs
  for (const [name, service] of Object.entries(config.services)) {
    try {
      new URL(service.url);
    } catch {
      errors.push(`Invalid URL for service ${name}: ${service.url}`);
    }
  }

  // Validate Redis connection in production
  if (config.environment === 'production' && !config.redis.host) {
    errors.push('Redis host must be configured in production');
  }

  // Validate CORS origins in production
  if (config.environment === 'production' &&
      config.cors.origin.some(origin => origin.includes('localhost'))) {
    errors.push('CORS origins should not include localhost in production');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Export default configuration
export default config;

// Configuration summary for logging
export const getConfigSummary = () => ({
  environment: config.environment,
  port: config.port,
  servicesCount: Object.keys(config.services).length,
  redisEnabled: !!config.redis.host,
  prometheusEnabled: config.monitoring.enablePrometheus,
  rateLimit: `${config.rateLimit.maxRequests} req/${config.rateLimit.windowMs}ms`
});
