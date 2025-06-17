import { EventEmitter } from "eventemitter3";
import { Task, AgentMetrics, TaskType } from "./types.js";
export interface AgentConfig {
    id: string;
    specialization: TaskType;
}
export declare abstract class BaseAgent extends EventEmitter {
    readonly id: string;
    readonly specialization: TaskType;
    private metrics;
    constructor(config: AgentConfig);
    getMetrics(): AgentMetrics;
    protected updateMetrics(partial: Partial<AgentMetrics>): void;
    /** Execute a task and return result payload */
    abstract execute(task: Task): Promise<unknown>;
}
