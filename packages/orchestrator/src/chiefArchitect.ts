import { EventEmitter } from "eventemitter3";
import { Task, TaskType, MemoryEntry, ContextQuery } from "./types.js";
import { FrameworkRouter } from "./frameworkRouter.js";
import { AgentRegistry } from "./agentRegistry.js";
import { MemoryBankManager } from "./memoryBank.js";
import { ErrorGoldCollector } from "./errorGold.js";
import { AgentFactory, AgentAuthenticator } from "./agentFactory.js";
import {
  buildTool, Tool,
  AgentType, createAgentDefinition,
  HooksManager, HookEvent, HookCallback,
  initializeSkillsSystem
} from './index.js';
import { PermissionMode, PermissionBehavior, ToolCallContext } from './toolFactory.js';
import { createMCPClient, MCPClient, MCPServerConfig, MCPTransportType } from "./mcpClient.js";
import { TeamMemoryService, scanForSecrets, checkTeamMemSecrets } from "./teamMemory.js";
import { getSkillsRegistry } from "./skillsSystem.js";

export interface ChiefArchitectConfig {
  retrieverServiceUrl?: string;
  errorReportingEnabled?: boolean;
  memoryRetentionMs?: number;
  authSecretKey?: string;
  teamMemoryEnabled?: boolean;
  skillsConfig?: {
    policySettingsPath?: string;
    userSettingsPath?: string;
    projectSettingsPath?: string;
    isAutoMemoryEnabled?: () => boolean;
    BUILDING_CLAUDE_APPS?: boolean;
    AGENT_TRIGGERS?: boolean;
  };
  hooksConfig?: {
    callback?: HookCallback;
  };
  mcpServers?: MCPServerConfig[];
}

export class ChiefArchitect extends EventEmitter {
  private router: FrameworkRouter;
  private registry: AgentRegistry;
  private memoryBank: MemoryBankManager;
  private errorCollector: ErrorGoldCollector;
  private agentFactory: AgentFactory;
  private authenticator: AgentAuthenticator;
  private healthCheckInterval?: ReturnType<typeof setInterval>;
  private hooksManager?: HooksManager;
  private skillsRegistry?: ReturnType<typeof getSkillsRegistry>;
  private teamMemoryService?: TeamMemoryService;
  private mcpClients: Map<string, MCPClient> = new Map();

  constructor(config: ChiefArchitectConfig = {}) {
    super();
    this.registry = new AgentRegistry();
    this.router = new FrameworkRouter(this.registry);
    this.memoryBank = new MemoryBankManager(config.retrieverServiceUrl);
    this.errorCollector = new ErrorGoldCollector({
      enableCircuitBreaker: true,
      flushInterval: 30000,
      maxQueueSize: 1000
    });
    this.agentFactory = new AgentFactory();
    this.authenticator = new AgentAuthenticator(
      config.authSecretKey || 'default-secret-key'
    );

    this.initializeToolSystem(config);
    this.setupEventHandlers();
    this.startHealthChecks();
    this.fireHook(HookEvent.SessionStart, { sessionId: 'chief-architect' });
  }

  private initializeToolSystem(config: ChiefArchitectConfig): void {
    if (config.hooksConfig) {
      this.hooksManager = new HooksManager();
      if (config.hooksConfig.callback) {
        this.hooksManager.registerHook(HookEvent.SessionStart, config.hooksConfig.callback);
      }
    } else {
      this.hooksManager = new HooksManager();
    }

    if (config.skillsConfig) {
      initializeSkillsSystem(config.skillsConfig).then(() => {
        this.skillsRegistry = getSkillsRegistry();
      }).catch(err => {
        console.error('Failed to initialize skills system:', err);
      });
    }

    if (config.teamMemoryEnabled) {
      this.teamMemoryService = new TeamMemoryService();
    }
  }

  private fireHook(event: HookEvent, data: Record<string, unknown>): void {
    if (this.hooksManager) {
      this.hooksManager.executeHooks(event, data as any);
    }
  }

  private async executeToolPipelineWrapper(
    tool: Tool,
    input: unknown,
    context: ToolCallContext
  ): Promise<unknown> {
    const secretCheck = checkTeamMemSecrets(JSON.stringify(input));
    if (!secretCheck.allowed) {
      this.fireHook(HookEvent.PermissionDenied, {
        tool: tool.name,
        reason: secretCheck.reason,
        context
      });
      throw new Error(`Permission denied for tool ${tool.name}: ${secretCheck.reason}`);
    }

    this.fireHook(HookEvent.PreToolUse, {
      toolName: tool.name,
      toolInput: input,
      context
    });

    try {
      const result = await tool.call(input, context);
      
      this.fireHook(HookEvent.PostToolUse, {
        toolName: tool.name,
        toolInput: input,
        toolResult: result,
        context
      });

      return result;
    } catch (error) {
      this.fireHook(HookEvent.PostToolUseFailure, {
        toolName: tool.name,
        toolInput: input,
        error: (error as Error).message,
        context
      });
      throw error;
    }
  }

  private async connectMCPServers(servers?: MCPServerConfig[]): Promise<void> {
    if (!servers || servers.length === 0) return;

    for (const serverConfig of servers) {
      try {
        const client = new MCPClient();
        await client.connect(serverConfig);
        this.mcpClients.set(serverConfig.name, client);
      } catch (error) {
        console.error(`Failed to connect to MCP server ${serverConfig.name}:`, error);
      }
    }
  }

  private getAgentDefinitionForType(agentType: AgentType): ReturnType<typeof createAgentDefinition> {
    return createAgentDefinition(agentType, {
      whenToUse: this.getWhenToUseForType(agentType),
      maxTurns: this.getMaxTurnsForType(agentType)
    });
  }

  private getWhenToUseForType(agentType: AgentType): string {
    switch (agentType) {
      case AgentType.EXPLORE:
        return "READ-ONLY file exploration and understanding";
      case AgentType.PLAN:
        return "Architecture planning and system design";
      case AgentType.VERIFICATION:
        return "Adversarial testing and security verification";
      case AgentType.GENERAL_PURPOSE:
      default:
        return "General purpose agent for any task";
    }
  }

  private getMaxTurnsForType(agentType: AgentType): number {
    switch (agentType) {
      case AgentType.EXPLORE:
        return 10;
      case AgentType.PLAN:
        return 20;
      case AgentType.VERIFICATION:
        return 15;
      case AgentType.GENERAL_PURPOSE:
      default:
        return 50;
    }
  }

  async spawnSubagent(
    agentType: AgentType,
    task: Task,
    subagentId: string
  ): Promise<unknown> {
    const agentDef = this.getAgentDefinitionForType(agentType);

    this.fireHook(HookEvent.SubagentStart, {
      agentId: subagentId,
      agentType,
      taskId: task.id
    });

    if (agentDef.mcpServers) {
      const convertedServers = agentDef.mcpServers.map(s => ({
        ...s,
        transport: s.transport || MCPTransportType.STDIO
      }));
      await this.connectMCPServers(convertedServers);
    }

    return await this.router.route(task, await this.getTaskContext(task));
  }

  /** Entry point called by SystemTrigger */
  async handleRequest(task: Task): Promise<unknown> {
    this.emit("task_received", task);
    
    try {
      await this.storeTaskMemory(task);
      const context = await this.getTaskContext(task);
      
      const result = await this.errorCollector.safeExecute(
        'chief-architect',
        task.id,
        async () => {
          return await this.router.route(task, context);
        },
        { context, taskType: task.type }
      );
      
      await this.storeResultMemory(task, result);
      
      this.emit("task_completed", { taskId: task.id, result });
      return result;
    } catch (err) {
      this.emit("task_failed", { taskId: task.id, error: err });
      throw err;
    }
  }

  async queryContext(query: ContextQuery): Promise<MemoryEntry[]> {
    return await this.memoryBank.queryContext(query);
  }

  getRegistry(): AgentRegistry {
    return this.registry;
  }

  getMemoryBank(): MemoryBankManager {
    return this.memoryBank;
  }

  getErrorCollector(): ErrorGoldCollector {
    return this.errorCollector;
  }

  getAgentFactory(): AgentFactory {
    return this.agentFactory;
  }

  getHooksManager(): HooksManager | undefined {
    return this.hooksManager;
  }

  getSkillsRegistry(): ReturnType<typeof getSkillsRegistry> | undefined {
    return this.skillsRegistry;
  }

  getTeamMemoryService(): TeamMemoryService | undefined {
    return this.teamMemoryService;
  }

  async registerAgent(
    agentId: string,
    agentType: string,
    specialization: TaskType,
    capabilities: string[],
    config: any = {}
  ): Promise<void> {
    try {
      const agent = await this.agentFactory.createAgent(
        agentId,
        agentType,
        config,
        specialization
      );

      this.router.registerAgent(agent);

      const agentInfo = this.agentFactory.createAgentInfo(
        agentId,
        agentType,
        capabilities
      );

      this.registry.register(agentInfo);

      const token = this.authenticator.generateToken(agentId, capabilities);

      if (config.mcpServers) {
        await this.connectMCPServers(config.mcpServers);
      }

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

  async unregisterAgent(agentId: string): Promise<boolean> {
    try {
      await this.agentFactory.removeAgent(agentId);
      
      const removed = this.registry.unregister(agentId);
      
      this.authenticator.revokeToken(agentId);
      
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

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    agents: any;
    memory: any;
    errors: any;
    uptime: number;
  }> {
    const startTime = Date.now();
    
    try {
      const agentHealth = await this.agentFactory.performHealthCheck();
      const agentStats = this.agentFactory.getStats();
      
      const memoryStats = this.memoryBank.getMemoryStats();
      
      const errorStats = this.errorCollector.getErrorStats('chief-architect');
      
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

  async shutdown(): Promise<void> {
    this.emit('shutting_down');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    for (const [name, client] of this.mcpClients) {
      try {
        await client.disconnect(name);
      } catch (err) {
        console.error(`Error disconnecting MCP client ${name}:`, err);
      }
    }
    this.mcpClients.clear();
    
    await this.memoryBank.performCleanup();
    
    const agents = this.registry.getAllAgents();
    for (const agent of agents) {
      await this.unregisterAgent(agent.id);
    }
    
    this.fireHook(HookEvent.Notification, { sessionId: 'chief-architect', type: 'shutdown' });
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
    this.registry.on('agent_registered', (agent) => {
      this.emit('agent_status_change', { type: 'registered', agent });
    });

    this.registry.on('agent_unregistered', (agent) => {
      this.emit('agent_status_change', { type: 'unregistered', agent });
    });

    this.memoryBank.on('memory_stored', (entry) => {
      this.emit('memory_update', { type: 'stored', entry });
    });

    this.errorCollector.on('critical_error', (error) => {
      this.emit('critical_error', error);
    });
  }

  private startHealthChecks(): void {
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
