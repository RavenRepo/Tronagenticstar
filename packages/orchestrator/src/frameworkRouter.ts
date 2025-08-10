import { Task, TaskType, AgentMetrics, AgentInfo, AgentStatus, MemoryEntry } from "./types.js";
import { AgentRegistry } from "./agentRegistry.js";
import axios from 'axios';
import { BaseAgent } from "./agent.js";

export class FrameworkRouter {
  private registry: AgentRegistry;
  private localAgents: Map<string, any> = new Map();

  constructor(registry?: AgentRegistry) {
    this.registry = registry ?? new AgentRegistry();
  }

  private score(metrics: AgentMetrics): number {
    // Simple scoring: lower is better. Penalize high load and slow response time.
    const load = metrics.currentLoad || 0.1;
    const responseTime = metrics.avgResponseTimeMs || 1000; // Default to 1s if no data
    return load * responseTime;
  }

  private selectOptimalAgent(taskType: TaskType): AgentInfo | undefined {
    const capableAgents = this.registry.getAgentsByTaskType(taskType);
    if (capableAgents.length === 0) {
      return undefined;
    }

    // Find the agent with the best (lowest) score
    return capableAgents.reduce((bestAgent, currentAgent) => {
      const bestScore = this.score(bestAgent.metrics);
      const currentScore = this.score(currentAgent.metrics);
      return currentScore < bestScore ? currentAgent : bestAgent;
    });
  }

  async route(task: Task, context?: MemoryEntry[]): Promise<unknown> {
    const agentInfo = this.selectOptimalAgent(task.type);

    if (!agentInfo) {
      throw new Error(`No agent available for task type ${task.type}`);
    }

    const agentUrl = agentInfo.address;
    if (!agentUrl) {
      // Attempt local agent execution if registered (TS in-process agents)
      const local = this.localAgents.get(agentInfo.id);
      if (local && typeof local.execute === 'function') {
        const start = Date.now();
        const result = await local.execute(task);
        this.registry.updateAgentMetrics(agentInfo.id, {
          avgResponseTimeMs: Date.now() - start,
          lastSeen: new Date(),
          totalTasksCompleted: (agentInfo.metrics.totalTasksCompleted || 0) + 1,
        });
        return result;
      }
      throw new Error(`Agent ${agentInfo.id} has no address configured.`);
    }

    const endpoint = `${agentUrl}/execute_task`;

    // Translate high-level TaskType to the microservice-specific task_type
    const mappedTaskType = this.mapToServiceTaskType(task.type, task.parameters?.action);
    const payload: any = {
      task_id: task.id,
      task_type: mappedTaskType,
      parameters: task.parameters ?? {},
    };
    if (context && Array.isArray(context)) {
      // Map MemoryEntry objects to a lean JSON shape for cross-language transport
      payload.context = context.map((entry) => ({
        id: entry.id,
        agentId: entry.agentId,
        timestamp: (entry.timestamp as unknown as Date)?.toISOString?.() || new Date().toISOString(),
        content: entry.content,
        tags: entry.tags,
        metadata: entry.metadata,
      }));
    }

    try {
      const bearerEnv = process.env.AGENT_BEARER || process.env.CODECRAFT_TOKEN;
      const response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...(bearerEnv ? { Authorization: `Bearer ${bearerEnv}` } : {}),
        },
        timeout: 30000, // 30 second timeout
      });

      // Update agent metrics after a successful call
      this.registry.updateAgentMetrics(agentInfo.id, {
        ...agentInfo.metrics,
        lastSeen: new Date(),
        totalTasksCompleted: (agentInfo.metrics.totalTasksCompleted || 0) + 1,
        avgResponseTimeMs: response.data.metrics.processing_time_ms as number,
      });

      return response.data;
    } catch (error) {
      // Update agent metrics on failure
      this.registry.updateAgentMetrics(agentInfo.id, {
        ...agentInfo.metrics,
        lastSeen: new Date(),
        totalTasksFailed: (agentInfo.metrics.totalTasksFailed || 0) + 1,
      });

      if (axios.isAxiosError(error)) {
        console.error(`Error routing task ${task.id} to agent ${agentInfo.id}:`, error.message);
        throw new Error(`Failed to communicate with agent ${agentInfo.id}: ${error.message}`);
      } else {
        console.error(`An unexpected error occurred while routing task ${task.id}:`, error);
        throw new Error('An unexpected error occurred during task routing.');
      }
    }
  }

  private mapToServiceTaskType(type: TaskType, action?: string): string {
    // If explicit action is provided by upstream, use it directly
    if (action && typeof action === 'string') {
      return action;
    }
    switch (type) {
      case TaskType.CODE_GENERATION:
        return 'generate_code';
      case TaskType.REFACTOR:
        return 'refactor_code';
      case TaskType.DESIGN:
      case TaskType.ARCHITECTURE:
        return 'generate_diagram';
      case TaskType.SECURITY:
        return 'scan_target';
      case TaskType.PERFORMANCE_ANALYSIS:
      case TaskType.PERFORMANCE:
        return 'analyze_performance';
      case TaskType.EMBEDDING:
        return 'generate_embedding';
      case TaskType.EVALUATION:
        return 'evaluate_quality';
      case TaskType.COMPLIANCE:
        return 'evaluate_compliance';
      case TaskType.RETRIEVAL:
        return 'retrieve_memories';
      default:
        return action || String(type);
    }
  }

  // Allow wiring of in-memory agents for local execution (optional)
  registerLocalAgent(agentId: string, instance: any): void {
    this.localAgents.set(agentId, instance);
  }

  // Back-compat for tests: register a BaseAgent directly
  registerAgent(agent: BaseAgent): void {
    this.registerLocalAgent(agent.id, agent);
    const info: AgentInfo = {
      id: agent.id,
      specialization: agent.specialization,
      capabilities: [],
      status: AgentStatus.READY,
      metrics: {
        avgResponseTimeMs: 0,
        currentLoad: 0,
        healthStatus: 'healthy',
        lastActivity: new Date(),
        totalTasksCompleted: 0,
        totalTasksFailed: 0,
      },
      lastSeen: new Date(),
    } as AgentInfo;
    this.registry.register(info);
  }
}