import { EventEmitter } from "eventemitter3";
import { AgentInfo, TaskType, AgentMetrics } from "./types.js";
export declare class AgentRegistry extends EventEmitter {
    private agents;
    constructor();
    discoverAndRegisterAgent(agentUrl: string): Promise<AgentInfo | null>;
    register(agentInfo: AgentInfo): void;
    unregister(agentId: string): boolean;
    getAgent(agentId: string): AgentInfo | undefined;
    getAgentsByTaskType(type: TaskType): AgentInfo[];
    getAllAgents(): AgentInfo[];
    updateAgentMetrics(agentId: string, metrics: Partial<AgentMetrics>): void;
    performHealthCheck(): Promise<void>;
}
