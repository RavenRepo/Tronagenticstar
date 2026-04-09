export interface ServiceConfig {
  name: string;
  url: string;
  timeout: number;
  retryAttempts: number;
  healthPath: string;
  weight: number;
}

export interface Config {
  port: number;
  host: string;
  version: string;
  environment: string;
  jwtSecret: string;
  services: ServiceConfig[];
  auth: {
    jwtSecret: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
  };
  security: {
    corsOrigins: string[];
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    metricsAuthRequired: boolean;
  };
}

function validateRequiredEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// Default configurations
export const HEALTH_CHECK_INTERVAL = parseInt(
  process.env.HEALTH_CHECK_INTERVAL || "30000",
);
export const HEALTH_CHECK_TIMEOUT = parseInt(
  process.env.HEALTH_CHECK_TIMEOUT || "5000",
);
export const LOG_LEVEL = process.env.LOG_LEVEL || "info";
export const LOG_FORMAT = process.env.LOG_FORMAT || "json";

// API Keys configuration
export function getAPIKeys(): Record<string, any> {
  const apiKeysEnv = process.env.API_KEYS;
  if (!apiKeysEnv) {
    console.error("Missing required environment variable: API_KEYS");
    console.error("API_KEYS must be set with valid JSON configuration");
    process.exit(1);
  }

  try {
    return JSON.parse(apiKeysEnv);
  } catch (error) {
    console.error("Invalid API_KEYS JSON configuration", {
      error: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }
}

export const config: Config = {
  port: parseInt(process.env.API_GATEWAY_PORT || "3000"),
  host: process.env.API_GATEWAY_HOST || "0.0.0.0",
  version: process.env.npm_package_version || "1.0.0",
  environment: process.env.NODE_ENV || "development",

  // JWT Secret is MANDATORY - no fallback in any environment
  jwtSecret: validateRequiredEnvVar("JWT_SECRET"),

  // Auth configuration
  auth: {
    jwtSecret: validateRequiredEnvVar("JWT_SECRET"),
  },

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || "0"),
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || "60000"),
    maxRequests: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || "1000"),
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === "true",
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === "false",
  },

  services: [
    {
      name: "orchestrator",
      url: process.env.ORCHESTRATOR_URL || "http://localhost:8001",
      timeout: parseInt(process.env.ORCHESTRATOR_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.ORCHESTRATOR_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "embedding",
      url: process.env.EMBEDDING_URL || "http://localhost:8002",
      timeout: parseInt(process.env.EMBEDDING_TIMEOUT || "15000"),
      retryAttempts: parseInt(process.env.EMBEDDING_RETRY_ATTEMPTS || "2"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "retriever",
      url: process.env.RETRIEVER_URL || "http://localhost:8003",
      timeout: parseInt(process.env.RETRIEVER_TIMEOUT || "15000"),
      retryAttempts: parseInt(process.env.RETRIEVER_RETRY_ATTEMPTS || "2"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "codecraft",
      url: process.env.CODECRAFT_URL || "http://localhost:8012",
      timeout: parseInt(process.env.CODECRAFT_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.CODECRAFT_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "securishield",
      url: process.env.SECURISHIELD_URL || "http://localhost:8011",
      timeout: parseInt(process.env.SECURISHIELD_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.SECURISHIELD_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "designforge",
      url: process.env.DESIGNFORGE_URL || "http://localhost:8010",
      timeout: parseInt(process.env.DESIGNFORGE_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.DESIGNFORGE_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "perfpulse",
      url: process.env.PERFPULSE_URL || "http://localhost:8013",
      timeout: parseInt(process.env.PERFPULSE_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.PERFPULSE_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "evaluator",
      url: process.env.EVALUATOR_URL || "http://localhost:8014",
      timeout: parseInt(process.env.EVALUATOR_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.EVALUATOR_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "expressops",
      url: process.env.EXPRESSOPS_URL || "http://localhost:8015",
      timeout: parseInt(process.env.EXPRESSOPS_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.EXPRESSOPS_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "mobilefirstops",
      url: process.env.MOBILEFIRSTOPS_URL || "http://localhost:8016",
      timeout: parseInt(process.env.MOBILEFIRSTOPS_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.MOBILEFIRSTOPS_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "database-agent",
      url: process.env.DATABASE_AGENT_URL || "http://localhost:8017",
      timeout: parseInt(process.env.DATABASE_AGENT_TIMEOUT || "30000"),
      retryAttempts: parseInt(process.env.DATABASE_AGENT_RETRY_ATTEMPTS || "3"),
      healthPath: "/health",
      weight: 1,
    },
    {
      name: "soc2-compliance",
      url: process.env.SOC2_COMPLIANCE_URL || "http://localhost:8020",
      timeout: parseInt(process.env.SOC2_COMPLIANCE_TIMEOUT || "30000"),
      retryAttempts: parseInt(
        process.env.SOC2_COMPLIANCE_RETRY_ATTEMPTS || "3",
      ),
      healthPath: "/health",
      weight: 1,
    },
  ],

  security: {
    corsOrigins: process.env.CORS_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
    rateLimitWindowMs: parseInt(
      process.env.API_RATE_LIMIT_WINDOW_MS || "60000",
    ),
    rateLimitMaxRequests: parseInt(
      process.env.API_RATE_LIMIT_MAX_REQUESTS || "1000",
    ),
    metricsAuthRequired: process.env.METRICS_AUTH_REQUIRED === "true",
  },
};

// Log security configuration on startup
console.log("Security configuration loaded", {
  environment: config.environment,
  corsOrigins: config.security.corsOrigins,
  metricsAuthRequired: config.security.metricsAuthRequired,
  jwtSecretConfigured:
    !!config.jwtSecret && config.jwtSecret !== "dev-fallback-secret",
});

// Warn about insecure configurations
if (config.environment === "production") {
  if (config.jwtSecret === "dev-fallback-secret") {
    console.error("CRITICAL: Using development JWT secret in production!");
    process.exit(1);
  }

  if (!config.security.metricsAuthRequired) {
    console.warn("WARNING: Metrics endpoint is not protected in production");
  }

  if (config.security.corsOrigins.includes("*")) {
    console.error("CRITICAL: CORS wildcard not allowed in production!");
    process.exit(1);
  }
} else {
  console.warn("Running in development mode - some security features disabled");
}
