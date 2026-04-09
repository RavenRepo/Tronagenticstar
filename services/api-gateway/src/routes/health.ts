import express, { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config';
import axios, { AxiosError } from 'axios';
import * as os from 'os';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  error?: string;
  lastChecked: string;
  details?: Record<string, any>;
}

export interface MemoryStatus {
  heapUsedMB: number;
  heapTotalMB: number;
  heapUsagePercent: number;
  rssMB: number;
  externalMB: number;
  systemTotalMB: number;
  systemFreeMB: number;
  systemUsagePercent: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface ConnectionPoolStatus {
  activeConnections: number;
  maxConnections: number;
  availableConnections: number;
  utilizationPercent: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface OrchestratorConnectivity {
  status: 'connected' | 'disconnected' | 'degraded';
  url: string;
  lastSuccessfulConnection?: string;
  responseTimeMs?: number;
  error?: string;
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  services: HealthCheckResult[];
  gateway: {
    status: 'healthy' | 'unhealthy';
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

// Connection pool tracking (simulated - in production, integrate with actual pool)
let connectionPoolStats = {
  activeConnections: 0,
  maxConnections: parseInt(process.env.MAX_CONNECTIONS || '100'),
  lastUpdated: new Date().toISOString(),
};

// Track orchestrator connectivity
let orchestratorLastSuccess: string | undefined;

/**
 * Get detailed memory status with health thresholds
 */
function getMemoryStatus(): MemoryStatus {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
  const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;
  const rssMB = memoryUsage.rss / 1024 / 1024;
  const externalMB = memoryUsage.external / 1024 / 1024;
  const systemTotalMB = os.totalmem() / 1024 / 1024;
  const systemFreeMB = os.freemem() / 1024 / 1024;
  const systemUsagePercent = ((systemTotalMB - systemFreeMB) / systemTotalMB) * 100;

  // Determine memory health status
  const heapThresholdWarning = parseFloat(process.env.MEMORY_WARNING_THRESHOLD || '70');
  const heapThresholdCritical = parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD || '90');

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (heapUsagePercent >= heapThresholdCritical) {
    status = 'critical';
  } else if (heapUsagePercent >= heapThresholdWarning) {
    status = 'warning';
  }

  return {
    heapUsedMB: Math.round(heapUsedMB * 100) / 100,
    heapTotalMB: Math.round(heapTotalMB * 100) / 100,
    heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
    rssMB: Math.round(rssMB * 100) / 100,
    externalMB: Math.round(externalMB * 100) / 100,
    systemTotalMB: Math.round(systemTotalMB * 100) / 100,
    systemFreeMB: Math.round(systemFreeMB * 100) / 100,
    systemUsagePercent: Math.round(systemUsagePercent * 100) / 100,
    status,
  };
}

/**
 * Get connection pool status
 */
function getConnectionPoolStatus(): ConnectionPoolStatus {
  const { activeConnections, maxConnections } = connectionPoolStats;
  const availableConnections = maxConnections - activeConnections;
  const utilizationPercent = (activeConnections / maxConnections) * 100;

  const utilizationWarning = parseFloat(process.env.POOL_WARNING_THRESHOLD || '70');
  const utilizationCritical = parseFloat(process.env.POOL_CRITICAL_THRESHOLD || '90');

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (utilizationPercent >= utilizationCritical) {
    status = 'critical';
  } else if (utilizationPercent >= utilizationWarning) {
    status = 'warning';
  }

  return {
    activeConnections,
    maxConnections,
    availableConnections,
    utilizationPercent: Math.round(utilizationPercent * 100) / 100,
    status,
  };
}

/**
 * Check orchestrator connectivity
 */
async function checkOrchestratorConnectivity(): Promise<OrchestratorConnectivity> {
  const orchestratorService = config.services.find(s => s.name === 'orchestrator');
  
  if (!orchestratorService) {
    return {
      status: 'disconnected',
      url: 'not configured',
      error: 'Orchestrator service not configured',
    };
  }

  const startTime = Date.now();
  
  try {
    await axios.get(`${orchestratorService.url}${orchestratorService.healthPath}`, {
      timeout: 5000,
      headers: {
        'user-agent': 'AgentForge-Gateway-HealthCheck/1.0.0',
      },
    });

    const responseTimeMs = Date.now() - startTime;
    orchestratorLastSuccess = new Date().toISOString();

    return {
      status: 'connected',
      url: orchestratorService.url,
      lastSuccessfulConnection: orchestratorLastSuccess,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    
    return {
      status: 'disconnected',
      url: orchestratorService.url,
      lastSuccessfulConnection: orchestratorLastSuccess,
      responseTimeMs,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Update connection pool stats (call this from request middleware)
 */
export function updateConnectionPool(active: number): void {
  connectionPoolStats.activeConnections = active;
  connectionPoolStats.lastUpdated = new Date().toISOString();
}

/**
 * Creates the health router with all health check endpoints
 */
export function createHealthRouter(): Router {
  const router = express.Router();

  /**
   * GET /health
   * Basic health check endpoint - returns 200 if gateway is running
   */
  router.get('/', (req: Request, res: Response) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    logger.debug('Basic health check requested', {
      requestId: req.headers['x-request-id'],
      uptime,
    });

    res.json({
      status: 'healthy',
      service: 'api-gateway',
      version: config.version,
      environment: config.environment,
      uptime: Math.floor(uptime),
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      },
    });
  });

  /**
   * GET /health/detailed
   * Comprehensive health check including all dependent services
   */
  router.get('/detailed', async (req: Request, res: Response) => {
    const startTime = Date.now();
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    logger.info('Detailed health check requested', {
      requestId: req.headers['x-request-id'],
      uptime,
    });

    try {
      // Check all configured services
      const serviceChecks = await Promise.allSettled(
        config.services.map(async (service): Promise<HealthCheckResult> => {
          const serviceStartTime = Date.now();

          try {
            const response = await axios.get(`${service.url}${service.healthPath}`, {
              timeout: 10000, // 10 second timeout for health checks
              headers: {
                'user-agent': 'AgentForge-Gateway-HealthCheck/1.0.0',
              },
            });

            const responseTime = Date.now() - serviceStartTime;

            return {
              service: service.name,
              status: 'healthy',
              responseTime,
              lastChecked: new Date().toISOString(),
              details: {
                url: service.url,
                statusCode: response.status,
                version: response.data?.version,
                uptime: response.data?.uptime,
              },
            };
          } catch (error) {
            const responseTime = Date.now() - serviceStartTime;

            logger.warn('Service health check failed', {
              service: service.name,
              url: service.url,
              error: error instanceof Error ? error.message : error,
              responseTime,
            });

            return {
              service: service.name,
              status: 'unhealthy',
              responseTime,
              error: error instanceof Error ? error.message : 'Unknown error',
              lastChecked: new Date().toISOString(),
              details: {
                url: service.url,
                timeout: service.timeout,
              },
            };
          }
        })
      );

      // Process service check results
      const services: HealthCheckResult[] = serviceChecks.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            service: config.services[index].name,
            status: 'unknown',
            error: 'Health check failed to complete',
            lastChecked: new Date().toISOString(),
          };
        }
      });

      // Calculate overall system status
      const healthyServices = services.filter(s => s.status === 'healthy').length;
      const totalServices = services.length;

      let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyServices === totalServices) {
        overallStatus = 'healthy';
      } else if (healthyServices > 0) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'unhealthy';
      }

      // Gateway metrics
      const memoryUsedMB = memoryUsage.heapUsed / 1024 / 1024;
      const memoryTotalMB = memoryUsage.heapTotal / 1024 / 1024;
      const memoryPercentage = (memoryUsedMB / memoryTotalMB) * 100;

      const healthResponse: SystemHealthResponse = {
        status: overallStatus,
        version: config.version,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        services,
        gateway: {
          status: 'healthy',
          memory: {
            used: Math.round(memoryUsedMB),
            total: Math.round(memoryTotalMB),
            percentage: Math.round(memoryPercentage * 100) / 100,
          },
          cpu: {
            usage: 0, // TODO: Implement CPU usage monitoring
          },
        },
      };

      const totalResponseTime = Date.now() - startTime;

      logger.info('Detailed health check completed', {
        requestId: req.headers['x-request-id'],
        overallStatus,
        healthyServices: `${healthyServices}/${totalServices}`,
        totalResponseTime,
      });

      // Set appropriate HTTP status based on health
      const httpStatus = overallStatus === 'healthy' ? 200 :
                        overallStatus === 'degraded' ? 200 : 503;

      res.status(httpStatus).json(healthResponse);

    } catch (error) {
      logger.error('Health check system error', {
        requestId: req.headers['x-request-id'],
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      res.status(500).json({
        status: 'unhealthy',
        version: config.version,
        timestamp: new Date().toISOString(),
        error: 'Health check system failure',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /health/ready
   * Readiness check - returns 200 when all critical services are available
   */
  router.get('/ready', async (req: Request, res: Response) => {
    logger.debug('Readiness check requested', {
      requestId: req.headers['x-request-id'],
    });

    try {
      // Check only critical services (orchestrator is required)
      const criticalServices = config.services.filter(s => s.name === 'orchestrator');

      const readinessChecks = await Promise.allSettled(
        criticalServices.map(async (service) => {
          try {
            await axios.get(`${service.url}${service.healthPath}`, {
              timeout: 5000, // Shorter timeout for readiness
              headers: {
                'user-agent': 'AgentForge-Gateway-ReadinessCheck/1.0.0',
              },
            });
            return { service: service.name, ready: true };
          } catch (error) {
            return { service: service.name, ready: false, error: error instanceof Error ? error.message : 'Unknown error' };
          }
        })
      );

      const results = readinessChecks.map(result =>
        result.status === 'fulfilled' ? result.value : { service: 'unknown', ready: false }
      );

      const allReady = results.every(r => r.ready);

      if (allReady) {
        res.json({
          status: 'ready',
          message: 'All critical services are available',
          services: results,
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          message: 'One or more critical services are unavailable',
          services: results,
          timestamp: new Date().toISOString(),
        });
      }

    } catch (error) {
      logger.error('Readiness check system error', {
        requestId: req.headers['x-request-id'],
        error: error instanceof Error ? error.message : error,
      });

      res.status(500).json({
        status: 'error',
        message: 'Readiness check system failure',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /health/live
   * Liveness check - returns 200 if the gateway process is alive
   */
  router.get('/live', (req: Request, res: Response) => {
    logger.debug('Liveness check requested', {
      requestId: req.headers['x-request-id'],
    });

    // Simple liveness check - if we can respond, we're alive
    res.json({
      status: 'alive',
      service: 'api-gateway',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      pid: process.pid,
    });
  });

  /**
   * GET /health/services
   * Get health status of all configured services
   */
  router.get('/services', async (req: Request, res: Response) => {
    logger.info('Services health check requested', {
      requestId: req.headers['x-request-id'],
    });

    try {
      const serviceChecks = await Promise.allSettled(
        config.services.map(async (service): Promise<HealthCheckResult> => {
          const startTime = Date.now();

          try {
            const response = await axios.get(`${service.url}${service.healthPath}`, {
              timeout: service.timeout || 10000,
              headers: {
                'user-agent': 'AgentForge-Gateway-ServiceCheck/1.0.0',
              },
            });

            return {
              service: service.name,
              status: 'healthy',
              responseTime: Date.now() - startTime,
              lastChecked: new Date().toISOString(),
              details: {
                url: service.url,
                statusCode: response.status,
                version: response.data?.version,
              },
            };
          } catch (error) {
            return {
              service: service.name,
              status: 'unhealthy',
              responseTime: Date.now() - startTime,
              error: error instanceof Error ? error.message : 'Unknown error',
              lastChecked: new Date().toISOString(),
              details: {
                url: service.url,
              },
            };
          }
        })
      );

      const services = serviceChecks.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            service: config.services[index].name,
            status: 'unknown' as const,
            error: 'Service check failed to complete',
            lastChecked: new Date().toISOString(),
          };
        }
      });

      res.json({
        services,
        summary: {
          total: services.length,
          healthy: services.filter(s => s.status === 'healthy').length,
          unhealthy: services.filter(s => s.status === 'unhealthy').length,
          unknown: services.filter(s => s.status === 'unknown').length,
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Services health check failed', {
        requestId: req.headers['x-request-id'],
        error: error instanceof Error ? error.message : error,
      });

      res.status(500).json({
        error: 'Failed to check services health',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  return router;
}
