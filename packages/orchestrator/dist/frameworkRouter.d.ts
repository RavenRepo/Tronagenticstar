import { Task } from "./types.js";
import { BaseAgent } from "./agent.js";
export declare class FrameworkRouter {
    private agents;
    registerAgent(agent: BaseAgent): void;
    private score;
    private selectOptimalAgent;
    route(task: Task): Promise<unknown>;
}
