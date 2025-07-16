import { Task, TaskType, AgentMetrics } from "./types.js";
import { BaseAgent } from "./agent.js";

export class FrameworkRouter {
  private agents: BaseAgent[] = [];

  registerAgent(agent: BaseAgent) {
    this.agents.push(agent);
  }

  private score(metrics: AgentMetrics): number {
    return metrics.avgResponseTimeMs * (metrics.currentLoad || 0.1);
  }

  private selectOptimalAgent(taskType: TaskType): BaseAgent | undefined {
    const capable = this.agents.filter((a) => a.specialization === taskType);
    if (capable.length === 0) return undefined;
    return capable.reduce((best, agent) => {
      return this.score(agent.getMetrics()) < this.score(best.getMetrics()) ? agent : best;
    });
  }

  async route(task: Task): Promise<unknown> {
    const agent = this.selectOptimalAgent(task.type);
    if (!agent) throw new Error(`No agent available for task type ${task.type}`);
    return agent.execute(task);
  }
} 