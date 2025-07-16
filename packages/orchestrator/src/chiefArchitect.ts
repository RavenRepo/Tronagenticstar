import { EventEmitter } from "eventemitter3";
import { Task, TaskType, MemoryEntry, ContextQuery } from "./types.js";
import { FrameworkRouter } from "./frameworkRouter.js";
import { AgentRegistry } from "./agentRegistry.js";
import { MemoryBankManager } from "./memoryBank.js";
import { ErrorGoldCollector } from "./errorGold.js";
import { AgentFactory, AgentAuthenticator } from "./agentFactory.js";

export interface ChiefArchitectConfig {
  retrieverServiceUrl?: string;
  errorReportingEnabled?: boolean;
  memoryRetentionMs?: number;
  authSecretKey?: string;
}

export class ChiefArchitect extends EventEmitter {
  private router: FrameworkRouter;
  private registry: AgentRegistry;
  private memoryBank: MemoryBankManager;
  private errorCollector: ErrorGoldCollector;
  private agentFactory: AgentFactory;
  private authenticator: AgentAuthenticator;
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(
    router: FrameworkRouter,
    config: ChiefArchitectConfig = {}
  ) {
    super();
    this.router = router;
    this.registry = new AgentRegistry();
    this.memoryBank = new MemoryBankManager(config.retrieverServiceUrl);
    this.errorCollector = new ErrorGoldCollector({
      enableCircuitBreaker: true,
      flushInterval: 30000, // 30 seconds
      maxQueueSize: 1000
    });
    this.agentFactory = new AgentFactory();
    this.authenticator = new AgentAuthenticator(
      config.authSecretKey || 'default-secret-key'
    );

    this.setupEventHandlers();
    this.startHealthChecks();
  }

  /** Entry point called by SystemTrigger */
  async handleRequest(task: Task): Promise<unknown> {
    this.emit("task_received", task);
    
    try {
      // Store task in memory for context
      await this.storeTaskMemory(task);
      
      // Get relevant context
      const context = await this.getTaskContext(task);
      
      // Execute with error handling
      const result = await this.errorCollector.safeExecute(
        'chief-architect',
        task.id,
        async () => {
          return await this.router.route(task);
        },
        { context, taskType: task.type }
      );
      
      // Store result in memory
      await this.storeResultMemory(task, result);
      
      this.emit("task_completed", { taskId: task.id, result });
      return result;
    } catch (err) {
      this.emit("task_failed", { taskId: task.id, error: err });
      throw err;
    }
  }

  /**
   * Query the memory bank for contextual information
   */
  async queryContext(query: ContextQuery): Promise<MemoryEntry[]> {
    return await this.memoryBank.queryContext(query);
  }

  /**
   * Get agent registry
   */
  getRegistry(): AgentRegistry {
    return this.registry;
  }

  /**
   * Get memory bank manager
   */
  getMemoryBank(): MemoryBankManager {
    return this.memoryBank;
  }

  /**
   * Get error collector
   */
  getErrorCollector(): ErrorGoldCollector {
    return this.errorCollector;
  }

  /**
   * Get agent factory
   */
  getAgentFactory(): AgentFactory {
    return this.agentFactory;
  }

  /**
   * Register a new agent
   */
  async registerAgent(
    agentId: string,
    agentType: string,
    specialization: TaskType,
    capabilities: string[],
    config: any = {}
  ): Promise<void> {
    try {
      // Create agent instance
      const agent = await this.agentFactory.createAgent(
        agentId,
        agentType,
        config,
        specialization
      );

      // Register with framework router
      this.router.registerAgent(agent);

      // Create agent info for registry
      const agentInfo = this.agentFactory.createAgentInfo(
        agentId,
        agentType,
        capabilities
      );

      // Register in registry
      this.registry.register(agentInfo);

      // Generate authentication token
      const token = this.authenticator.generateToken(agentId, capabilities);

      this.emit('agent_registered', {
        agentId,
        agentType,
        specialization,
        capabilities,
        token
      });

    } catch (error) {
      await this.errorCollector.captureError({
        taskId: 'agent-registration',
        agentId: 'chief-architect',
        error: error as Error,
        context: { agentId, agentType, specialization },
        severity: 'high'
      });
      throw error;
    }
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<boolean> {
    try {
      // Remove from factory
      await this.agentFactory.removeAgent(agentId);
      
      // Remove from registry
      const removed = this.registry.unregister(agentId);
      
      // Revoke authentication
      this.authenticator.revokeToken(agentId);
      
      // Clear agent memories
      this.memoryBank.clearAgentMemories(agentId);

      this.emit('agent_unregistered', { agentId });
      return removed;
    } catch (error) {
      await this.errorCollector.captureError({
        taskId: 'agent-unregistration',
        agentId: 'chief-architect',
        error: error as Error,
        context: { agentId },
        severity: 'medium'
      });
      return false;
    }
  }

  /**
   * Get system health status
   */
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    agents: any;
    memory: any;
    errors: any;
    uptime: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Check agent health
      const agentHealth = await this.agentFactory.performHealthCheck();
      const agentStats = this.registry.getStats();
      
      // Check memory bank status
      const memoryStats = this.memoryBank.getMemoryStats();
      
      // Check error rates
      const errorStats = this.errorCollector.getErrorStats('chief-architect');
      
      // Determine overall health
      const healthyAgents = Array.from(agentHealth.values()).filter(h => h).length;
      const totalAgents = agentHealth.size;
      const healthyRatio = totalAgents > 0 ? healthyAgents / totalAgents : 1;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (healthyRatio < 0.5) {
        status = 'unhealthy';
      } else if (healthyRatio < 0.8) {
        status = 'degraded';
      }

      return {
        status,
        agents: {
          total: totalAgents,
          healthy: healthyAgents,
          stats: agentStats,
          details: Object.fromEntries(agentHealth)
        },
        memory: memoryStats,
        errors: errorStats,
        uptime: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        agents: { total: 0, healthy: 0, stats: null, details: {} },
        memory: null,
        errors: null,
        uptime: Date.now() - startTime
      };
    }
  }

  /**
   * Shutdown the orchestrator
   */
  async shutdown(): Promise<void> {
    this.emit('shutting_down');
    
    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Cleanup memory
    await this.memoryBank.performCleanup();
    
    // Remove all agents
    const agents = this.registry.getAllAgents();
    for (const agent of agents) {
      await this.unregisterAgent(agent.id);
    }
    
    this.emit('shutdown_complete');
  }

  private async storeTaskMemory(task: Task): Promise<void> {
    const memoryEntry: MemoryEntry = {
      id: `task_${task.id}`,
      agentId: 'chief-architect',
      timestamp: new Date(),
      content: {
        type: 'task_received',
        task: task,
        correlation_id: task.correlationId
      },
      tags: ['task', task.type.toLowerCase(), 'received'],
      metadata: {
        taskType: task.type,
        priority: task.priority,
        manifestHash: task.manifestHash
      }
    };

    await this.memoryBank.storeMemory(memoryEntry);
  }

  private async getTaskContext(task: Task): Promise<MemoryEntry[]> {
    const query: ContextQuery = {
      query: `${task.type} ${JSON.stringify(task.parameters)}`,
      taskType: task.type,
      limit: 5
    };

    return await this.memoryBank.queryContext(query);
  }

  private async storeResultMemory(task: Task, result: unknown): Promise<void> {
    const memoryEntry: MemoryEntry = {
      id: `result_${task.id}`,
      agentId: 'chief-architect',
      timestamp: new Date(),
      content: {
        type: 'task_completed',
        task_id: task.id,
        result: result,
        correlation_id: task.correlationId
      },
      tags: ['result', task.type.toLowerCase(), 'completed'],
      metadata: {
        taskType: task.type,
        success: true,
        manifestHash: task.manifestHash
      }
    };

    await this.memoryBank.storeMemory(memoryEntry);
  }

  private setupEventHandlers(): void {
    // Registry events
    this.registry.on('agent_registered', (agent) => {
      this.emit('agent_status_change', { type: 'registered', agent });
    });

    this.registry.on('agent_unregistered', (agent) => {
      this.emit('agent_status_change', { type: 'unregistered', agent });
    });

    // Memory bank events
    this.memoryBank.on('memory_stored', (entry) => {
      this.emit('memory_update', { type: 'stored', entry });
    });

    // Error collector events
    this.errorCollector.on('critical_error', (error) => {
      this.emit('critical_error', error);
    });
  }

  private startHealthChecks(): void {
    // Perform health checks every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        this.registry.performHealthCheck();
        await this.memoryBank.performCleanup();
        this.authenticator.cleanupExpired();
      } catch (error) {
        await this.errorCollector.captureError({
          taskId: 'health-check',
          agentId: 'chief-architect',
          error: error as Error,
          context: {},
          severity: 'medium'
        });
      }
    }, 5 * 60 * 1000);
  }
} 