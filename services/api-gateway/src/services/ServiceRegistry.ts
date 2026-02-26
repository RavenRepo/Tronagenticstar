import { config } from "../config";
import { logger } from "../utils/logger";
import axios, { AxiosError, AxiosInstance } from "axios";

export interface ServiceMetadata {
  version: string;
  environment: string;
  region?: string;
  capabilities?: string[];
  [key: string]: any;
}

export interface Service {
  id: string;
  name: string;
  url: string;
  healthPath: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  lastCheck: Date;
  retryCount: number;
  metadata?: ServiceMetadata;
  circuitState: 'closed' | 'open' | 'half-open';
  circuitFailures: number;
  lastError?: Error;
}

export class ServiceRegistry {
  private services: Map<string, Service> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private httpClient: AxiosInstance;
  private readonly MAX_RETRIES = 3;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly CIRCUIT_RESET_TIMEOUT = 30000; // 30 seconds

  constructor() {
    this.httpClient = axios.create({
      timeout: 5000,
      headers: { 'User-Agent': 'Constella-API-Gateway/1.0' }
    });
    this.initializeServices();
  }

  private initializeServices() {
    if (!config.services) return;
    
    for (const serviceConfig of config.services) {
      this.registerService({
        id: `${serviceConfig.name}-${Date.now()}`,
        name: serviceConfig.name,
        url: serviceConfig.url,
        healthPath: serviceConfig.healthPath || '/health',
        metadata: {
          version: '1.0.0',
          environment: process.env.NODE_ENV || 'development',
        }
      });
    }
  }

  public startHealthChecks(intervalMs: number = 30000) {
    if (this.checkInterval) this.stopHealthChecks();
    
    this.checkInterval = setInterval(
      () => this.checkAllServices(),
      intervalMs
    );
    
    // Initial check
    this.checkAllServices();
    logger.info('Service registry health checks started', { intervalMs });
  }

  public stopHealthChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Service registry health checks stopped');
    }
  }

  public registerService(service: Omit<Service, 'status' | 'lastCheck' | 'retryCount' | 'circuitState' | 'circuitFailures'>): Service {
    const newService: Service = {
      ...service,
      status: 'unhealthy',
      lastCheck: new Date(0),
      retryCount: 0,
      circuitState: 'closed',
      circuitFailures: 0
    };

    this.services.set(newService.id, newService);
    logger.info('Service registered', { serviceId: newService.id, name: newService.name });
    
    // Perform immediate health check
    this.checkServiceHealth(newService);
    
    return newService;
  }

  public deregisterService(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    if (service) {
      this.services.delete(serviceId);
      logger.info('Service deregistered', { serviceId, name: service.name });
      return true;
    }
    return false;
  }

  public getService(serviceName: string, strategy: 'round-robin' | 'random' = 'round-robin'): Service | null {
    const services = this.getHealthyServices(serviceName);
    if (services.length === 0) return null;

    switch (strategy) {
      case 'random':
        return services[Math.floor(Math.random() * services.length)];
      case 'round-robin':
      default:
        // Simple round-robin implementation
        const service = services[0]; // For now, just return first healthy service
        return service;
    }
  }

  public getHealthyServices(serviceName?: string): Service[] {
    return Array.from(this.services.values())
      .filter(service => 
        service.status === 'healthy' && 
        (serviceName ? service.name === serviceName : true)
      );
  }

  public getAllServices(): Service[] {
    return Array.from(this.services.values());
  }

  private async checkAllServices() {
    logger.debug('Running health checks for all services');
    const checkPromises = Array.from(this.services.values()).map(
      service => this.checkServiceHealth(service)
    );
    await Promise.allSettled(checkPromises);
  }

  private async checkServiceHealth(service: Service): Promise<void> {
    if (service.circuitState === 'open') {
      // Check if we should try to close the circuit
      const timeSinceLastCheck = Date.now() - service.lastCheck.getTime();
      if (timeSinceLastCheck > this.CIRCUIT_RESET_TIMEOUT) {
        service.circuitState = 'half-open';
      } else {
        return; // Circuit is open, skip health check
      }
    }

    try {
      const response = await this.httpClient.get(`${service.url}${service.healthPath}`);
      
      if (response.status === 200) {
        this.handleHealthyService(service, response.data);
      } else {
        this.handleUnhealthyService(service, new Error(`Unexpected status code: ${response.status}`));
      }
    } catch (error) {
      this.handleUnhealthyService(service, error as Error);
    } finally {
      service.lastCheck = new Date();
    }
  }

  private handleHealthyService(service: Service, healthData: any) {
    const wasUnhealthy = service.status !== 'healthy';
    
    service.status = 'healthy';
    service.retryCount = 0;
    service.circuitState = 'closed';
    service.circuitFailures = 0;
    service.lastError = undefined;
    
    if (wasUnhealthy) {
      logger.info(`Service ${service.name} is now healthy`, { 
        serviceId: service.id,
        status: healthData?.status || 'unknown'
      });
    }
  }

  private handleUnhealthyService(service: Service, error: Error) {
    const wasHealthy = service.status === 'healthy';
    
    service.status = 'unhealthy';
    service.retryCount++;
    service.circuitFailures++;
    service.lastError = error;

    // Check if we should open the circuit
    if (service.circuitState !== 'open' && 
        service.circuitFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      service.circuitState = 'open';
      logger.warn(`Circuit breaker opened for service ${service.name}`, { 
        serviceId: service.id,
        failures: service.circuitFailures,
        error: error.message
      });
    }

    if (wasHealthy) {
      logger.error(`Service ${service.name} is now unhealthy`, { 
        serviceId: service.id,
        error: error.message,
        retryCount: service.retryCount
      });
    } else if (service.retryCount <= this.MAX_RETRIES) {
      logger.warn(`Service ${service.name} health check failed (attempt ${service.retryCount}/${this.MAX_RETRIES})`, {
        serviceId: service.id,
        error: error.message
      });
    }
  }
}

export const serviceRegistry = new ServiceRegistry();
