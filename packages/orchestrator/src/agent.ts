import { EventEmitter } from "eventemitter3";
import { Task, AgentMetrics, TaskType } from "./types.js";

export interface AgentConfig {
  id: string;
  specialization: TaskType;
  llmApiKey?: string;
}

export abstract class BaseAgent extends EventEmitter {
  readonly id: string;
  readonly specialization: TaskType;
  private metrics: AgentMetrics = {
    avgResponseTimeMs: 0,
    currentLoad: 0,
    healthStatus: "healthy",
    lastActivity: new Date(),
  };

  constructor(config: AgentConfig) {
    super();
    this.id = config.id;
    this.specialization = config.specialization;
  }

  getMetrics(): AgentMetrics {
    return this.metrics;
  }

  protected updateMetrics(partial: Partial<AgentMetrics>) {
    this.metrics = { ...this.metrics, ...partial };
    this.emit("metrics", this.metrics);
  }

  /** Execute a task and return result payload */
  abstract execute(task: Task): Promise<unknown>;
}
