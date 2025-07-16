import { EventEmitter } from "eventemitter3";
import { AgentInfo, AgentStatus, TaskType } from "./types.js";
export declare class AgentRegistry extends EventEmitter {
    private agents;
    private agentsByType;
    private agentsByCapability;
    constructor();
    private initializeTypeMaps;
    /**
     * Register a new agent in the registry
     */
    register(agentInfo: AgentInfo): void;
    /**
     * Unregister an agent
     */
    unregister(agentId: string): boolean;
    /**
     * Get agent by ID
     */
    getAgent(agentId: string): AgentInfo | undefined;
    /**
     * Get all agents of a specific type
     */
    getAgentsByType(type: TaskType): AgentInfo[];
    /**
     * Get agents by capability
     */
    getAgentsByCapability(capability: string): AgentInfo[];
    /**
     * Get healthy agents by type
     */
    getHealthyAgentsByType(type: TaskType): AgentInfo[];
    /**
     * Update agent status
     */
    updateStatus(agentId: string, status: AgentStatus): void;
    /**
     * Get all registered agents
     */
    getAllAgents(): AgentInfo[];
    /**
     * Get registry statistics
     */
    getStats(): {
        total: number;
        byType: Record<TaskType, number>;
        byStatus: Record<AgentStatus, number>;
    };
    /**
     * Find agents matching criteria
     */
    findAgents(criteria: {
        type?: TaskType;
        capabilities?: string[];
        status?: AgentStatus;
        metadata?: Record<string, unknown>;
    }): AgentInfo[];
    /**
     * Health check - remove stale agents
     */
    performHealthCheck(): void;
}
