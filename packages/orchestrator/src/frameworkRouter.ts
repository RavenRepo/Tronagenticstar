import { Task, TaskType, AgentMetrics, AgentInfo, TaskResult } from "./types.js";
import { AgentRegistry } from "./agentRegistry.js";
import axios from 'axios';

export class FrameworkRouter {
  private registry: AgentRegistry;

  constructor(registry: AgentRegistry) {
    this.registry = registry;
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

  async route(task: Task): Promise<TaskResult> {
    const agentInfo = this.selectOptimalAgent(task.type);

    if (!agentInfo) {
      throw new Error(`No agent available for task type ${task.type}`);
    }

    const agentUrl = agentInfo.address;
    if (!agentUrl) {
      throw new Error(`Agent ${agentInfo.id} has no address configured.`);
    }

    const endpoint = `${agentUrl}/execute_task`;

    try {
      const response = await axios.post<TaskResult>(endpoint, task, {
        headers: {
          'Content-Type': 'application/json',
          // TODO: Add Authorization header with JWT token from AgentAuthenticator
        },
        timeout: 30000, // 30 second timeout
      });

      // Update agent metrics after a successful call
      this.registry.updateAgentMetrics(agentInfo.id, {
        ...agentInfo.metrics,
        lastSeen: new Date(),
        totalTasksCompleted: (agentInfo.metrics.totalTasksCompleted || 0) + 1,
        avgResponseTimeMs: response.data.metrics.processing_time_ms,
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
}