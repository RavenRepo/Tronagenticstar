import { Task, MemoryEntry } from "./types.js";
import { AgentRegistry } from "./agentRegistry.js";
import { BaseAgent } from "./agent.js";
export declare class FrameworkRouter {
    private registry;
    private localAgents;
    constructor(registry?: AgentRegistry);
    private score;
    private selectOptimalAgent;
    route(task: Task, context?: MemoryEntry[]): Promise<unknown>;
    private mapToServiceTaskType;
    registerLocalAgent(agentId: string, instance: any): void;
    registerAgent(agent: BaseAgent): void;
}
