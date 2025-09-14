import axios, { AxiosError } from 'axios';
import { EventEmitter } from 'events';
import { config, HEALTH_CHECK_INTERVAL, HEALTH_CHECK_TIMEOUT } from '@/config';
import {
  ServiceConfig,
  ServiceRegistry,
  HealthCheckResult,
  LoadBalancerStrategy,
  Agent
} from '@/types';
import { logger } from '@/utils/logger';

export class ServiceDiscovery extends EventEmitter {
  private registry: ServiceRegistry;
  private healthCheckInterval?: NodeJS.Timeout;
  private loadBalancer: LoadBalancer;

  constructor() {
    super();
    this.registry = {
      services: new Map(),
      agents: new Map()
    };
    this.loadBalancer = new LoadBalancer();
    this.initializeServices();
  }

  private initializeServices(): void {
    // Initialize services from configuration
    Object.values(config.services).forEach(serviceConfig => {
      this.registry.services.set(serviceConfig.name, {
        ...serviceConfig,
        status: 'unknown'
      });
    });

    logger.info(`Initialized ${this.registry.services.size} services in registry`);
  }

  public async start(): Promise<void> {
    logger.info('Starting service discovery...');

    // Perform initial health checks
    await this.performHealthChecks();

    // Discover agents from healthy services
    await this.discoverAgents();

    // Start periodic health checks
    this.startHealthChecks();

    logger.info('Service discovery started successfully');
  }

  public async stop(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    logger.info('Service discovery stopped');
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, HEALTH_CHECK_INTERVAL);
  }

  private async performHealthChecks(): Promise<void> {
    const healthChecks = Array.from(this.registry.services.values()).map(
      service => this.checkServiceHealth(service)
    );

    const results = await Promise.allSettled(healthChecks);
    let healthyCount = 0;
    let unhealthyCount = 0;

    results.forEach((result, index) => {
      const service = Array.from(this.registry.services.values())[index];

      if (result.status === 'fulfilled' && result.value.status === 'healthy') {
        healthyCount++;
        if (service.status !== 'healthy') {
          this.emit('service:healthy', service.name);
        }
        service.status = 'healthy';
      } else {
        unhealthyCount++;
        if (service.status !== 'unhealthy') {
          this.emit('service:unhealthy', service.name);
        }
        service.status = 'unhealthy';
      }

      this.registry.services.set(service.name, service);
    });

    if (unhealthyCount > 0) {
      logger.warn(`Health check completed: ${healthyCount} healthy, ${unhealthyCount} unhealthy services`);
    } else {
      logger.debug(`Health check completed: ${healthyCount} healthy services`);
    }
  }

  private async checkServiceHealth(service: ServiceConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await axios.get(`${service.url}${service.health}`, {
        timeout: HEALTH_CHECK_TIMEOUT,
        validateStatus: (status) => status < 500
      });

      const responseTime = Date.now() - startTime;

      return {
        service: service.name,
        status: response.status < 400 ? 'healthy' : 'unhealthy',
        responseTime,
        timestamp: new Date(),
        details: {
          statusCode: response.status,
          headers: response.headers,
          data: response.data
        }
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        service: service.name,
        status: 'unhealthy',
        responseTime,
        timestamp: new Date(),
        details: {
          error: error instanceof AxiosError ? {
            message: error.message,
            code: error.code,
            status: error.response?.status
          } : error
        }
      };
    }
  }

  private async discoverAgents(): Promise<void> {
    const healthyServices = Array.from(this.registry.services.values())
      .filter(service => service.status === 'healthy');

    for (const service of healthyServices) {
      try {
        await this.discoverAgentsFromService(service);
      } catch (error) {
        logger.warn(`Failed to discover agents from ${service.name}:`, error);
      }
    }

    logger.info(`Discovered ${this.registry.agents.size} agents from ${healthyServices.length} services`);
  }

  private async discoverAgentsFromService(service: ServiceConfig): Promise<void> {
    try {
      // Try to get agents from service
      const response = await axios.get(`${service.url}/agents`, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 200 && Array.isArray(response.data)) {
        response.data.forEach((agentData: any) => {
          const agent: Agent = {
            id: agentData.id || `${service.name}-${agentData.name}`,
            name: agentData.name,
            specialization: agentData.specialization || agentData.type || 'General',
            description: agentData.description || `Agent from ${service.name}`,
            status: 'active',
            capabilities: agentData.capabilities || [],
            service: service.name,
            endpoint: agentData.endpoint || '/trigger',
            responseTimeMs: agentData.responseTimeMs,
            lastHeartbeat: new Date()
          };

          this.registry.agents.set(agent.id, agent);
          this.emit('agent:discovered', agent);
        });
      }
    } catch (error) {
      // If service doesn't support agent discovery, create default agent
      if (error instanceof AxiosError && error.response?.status === 404) {
        const defaultAgent: Agent = {
          id: service.name,
          name: service.name.charAt(0).toUpperCase() + service.name.slice(1),
          specialization: this.getDefaultSpecialization(service.name),
          description: `Default agent for ${service.name} service`,
          status: 'active',
          capabilities: this.getDefaultCapabilities(service.name),
          service: service.name,
          endpoint: '/trigger',
          lastHeartbeat: new Date()
        };

        this.registry.agents.set(defaultAgent.id, defaultAgent);
        this.emit('agent:discovered', defaultAgent);
      }
    }
  }

  private getDefaultSpecialization(serviceName: string): string {
    const specializations: Record<string, string> = {
      'orchestrator': 'Task Orchestration',
      'designforge': 'UI/UX Design',
      'securishield': 'Security Analysis',
      'codecraft': 'Code Generation',
      'perfpulse': 'Performance Analysis',
      'embedding': 'Text Embedding',
      'retriever': 'Information Retrieval',
      'soc2-compliance': 'Compliance Monitoring'
    };

    return specializations[serviceName] || 'General Purpose';
  }

  private getDefaultCapabilities(serviceName: string): string[] {
    const capabilities: Record<string, string[]> = {
      'orchestrator': ['task_routing', 'workflow_management', 'agent_coordination'],
      'designforge': ['ui_design', 'ux_analysis', 'design_patterns', 'accessibility_check'],
      'securishield': ['vulnerability_scan', 'security_audit', 'threat_assessment'],
      'codecraft': ['code_generation', 'code_review', 'refactoring', 'testing'],
      'perfpulse': ['performance_analysis', 'bottleneck_detection', 'optimization'],
      'embedding': ['text_embedding', 'similarity_search', 'semantic_analysis'],
      'retriever': ['document_search', 'knowledge_retrieval', 'context_extraction'],
      'soc2-compliance': ['compliance_check', 'audit_trail', 'policy_validation']
    };

    return capabilities[serviceName] || ['general_purpose'];
  }

  // Public API methods
  public getService(serviceName: string): ServiceConfig | undefined {
    return this.registry.services.get(serviceName);
  }

  public getHealthyServices(): ServiceConfig[] {
    return Array.from(this.registry.services.values())
      .filter(service => service.status === 'healthy');
  }

  public getServicesForLoadBalancing(): ServiceConfig[] {
    return this.getHealthyServices();
  }

  public selectService(serviceName?: string): ServiceConfig | null {
    if (serviceName) {
      const service = this.registry.services.get(serviceName);
      return service?.status === 'healthy' ? service : null;
    }

    return this.loadBalancer.selectService(this.getHealthyServices());
  }

  public getAgent(agentId: string): Agent | undefined {
    return this.registry.agents.get(agentId);
  }

  public getAllAgents(): Agent[] {
    return Array.from(this.registry.agents.values());
  }

  public getAgentsByService(serviceName: string): Agent[] {
    return Array.from(this.registry.agents.values())
      .filter(agent => agent.service === serviceName);
  }

  public getServiceStatus(): Record<string, any> {
    const services = Array.from(this.registry.services.values());
    const agents = Array.from(this.registry.agents.values());

    return {
      services: {
        total: services.length,
        healthy: services.filter(s => s.status === 'healthy').length,
        unhealthy: services.filter(s => s.status === 'unhealthy').length,
        unknown: services.filter(s => s.status === 'unknown').length
      },
      agents: {
        total: agents.length,
        active: agents.filter(a => a.status === 'active').length,
        inactive: agents.filter(a => a.status === 'inactive').length,
        busy: agents.filter(a => a.status === 'busy').length
      },
      lastUpdated: new Date().toISOString()
    };
  }
}

// Load Balancer implementation
class LoadBalancer {
  private strategies: Record<string, LoadBalancerStrategy> = {
    'round_robin': new RoundRobinStrategy(),
    'weighted': new WeightedStrategy(),
    'least_connections': new LeastConnectionsStrategy(),
    'response_time': new ResponseTimeStrategy()
  };

  private currentStrategy: string = 'weighted';

  public selectService(services: ServiceConfig[]): ServiceConfig | null {
    if (services.length === 0) {
      return null;
    }

    if (services.length === 1) {
      return services[0];
    }

    const strategy = this.strategies[this.currentStrategy];
    return strategy.selectService(services);
  }

  public setStrategy(strategyName: string): void {
    if (this.strategies[strategyName]) {
      this.currentStrategy = strategyName;
    }
  }
}

// Load balancing strategies
class RoundRobinStrategy implements LoadBalancerStrategy {
  private current = 0;

  selectService(services: ServiceConfig[]): ServiceConfig | null {
    if (services.length === 0) return null;

    const service = services[this.current];
    this.current = (this.current + 1) % services.length;
    return service;
  }
}

class WeightedStrategy implements LoadBalancerStrategy {
  selectService(services: ServiceConfig[]): ServiceConfig | null {
    if (services.length === 0) return null;

    const totalWeight = services.reduce((sum, service) => sum + service.weight, 0);
    const random = Math.random() * totalWeight;

    let currentWeight = 0;
    for (const service of services) {
      currentWeight += service.weight;
      if (random <= currentWeight) {
        return service;
      }
    }

    return services[0];
  }
}

class LeastConnectionsStrategy implements LoadBalancerStrategy {
  private connections: Map<string, number> = new Map();

  selectService(services: ServiceConfig[]): ServiceConfig | null {
    if (services.length === 0) return null;

    let leastConnections = Infinity;
    let selectedService: ServiceConfig | null = null;

    for (const service of services) {
      const connections = this.connections.get(service.name) || 0;
      if (connections < leastConnections) {
        leastConnections = connections;
        selectedService = service;
      }
    }

    if (selectedService) {
      this.connections.set(selectedService.name, leastConnections + 1);
    }

    return selectedService;
  }

  public releaseConnection(serviceName: string): void {
    const current = this.connections.get(serviceName) || 0;
    if (current > 0) {
      this.connections.set(serviceName, current - 1);
    }
  }
}

class ResponseTimeStrategy implements LoadBalancerStrategy {
  private responseTimes: Map<string, number[]> = new Map();

  selectService(services: ServiceConfig[]): ServiceConfig | null {
    if (services.length === 0) return null;

    let bestService: ServiceConfig | null = null;
    let bestAvgTime = Infinity;

    for (const service of services) {
      const times = this.responseTimes.get(service.name) || [];
      const avgTime = times.length > 0
        ? times.reduce((sum, time) => sum + time, 0) / times.length
        : 0;

      if (avgTime < bestAvgTime) {
        bestAvgTime = avgTime;
        bestService = service;
      }
    }

    return bestService || services[0];
  }

  public recordResponseTime(serviceName: string, responseTime: number): void {
    const times = this.responseTimes.get(serviceName) || [];
    times.push(responseTime);

    // Keep only last 100 response times
    if (times.length > 100) {
      times.shift();
    }

    this.responseTimes.set(serviceName, times);
  }
}

// Create singleton instance
export const serviceDiscovery = new ServiceDiscovery();

// Export default
export default serviceDiscovery;
