import { EventEmitter } from "eventemitter3";
import { BaseAgent } from "./agent.js";
import { AgentInfo, TaskType, AgentCredentials } from "./types.js";
/**
 * Agent Factory - Creates and manages agent instances
 */
export declare class AgentFactory extends EventEmitter {
    private static agentTypes;
    private instances;
    private agentConfigs;
    constructor();
    /**
     * Register an agent class
     */
    static registerAgentType(typeName: string, agentClass: typeof BaseAgent): void;
    /**
     * Get available agent types
     */
    static getAvailableTypes(): string[];
    /**
     * Create a new agent instance
     */
    createAgent(agentId: string, typeName: string, config: any, specialization: TaskType): Promise<BaseAgent>;
    /**
     * Get an agent instance
     */
    getAgent(agentId: string): BaseAgent | undefined;
    /**
     * Remove an agent instance
     */
    removeAgent(agentId: string): Promise<boolean>;
    /**
     * Get all agent instances
     */
    getAllAgents(): BaseAgent[];
    /**
     * Get agents by specialization
     */
    getAgentsBySpecialization(specialization: TaskType): BaseAgent[];
    /**
     * Create agent info for registry
     */
    createAgentInfo(agentId: string, typeName: string, capabilities: string[], version?: string, metadata?: Record<string, unknown>): AgentInfo;
    /**
     * Perform health check on all agents
     */
    performHealthCheck(): Promise<Map<string, boolean>>;
    /**
     * Get factory statistics
     */
    getStats(): {
        totalAgents: number;
        agentsByType: Record<string, number>;
        agentsBySpecialization: Record<TaskType, number>;
    };
    private setupAgentEventHandlers;
}
/**
 * Authentication Manager for agents
 */
export declare class AgentAuthenticator {
    private credentials;
    private secretKey;
    constructor(secretKey: string);
    /**
     * Generate authentication token for an agent
     */
    generateToken(agentId: string, capabilities: string[], expirationMs?: number): string;
    /**
     * Verify an agent token
     */
    verifyToken(token: string): AgentCredentials | null;
    /**
     * Revoke token for an agent
     */
    revokeToken(agentId: string): boolean;
    /**
     * Check if agent has required capabilities
     */
    hasCapability(agentId: string, requiredCapability: string): boolean;
    /**
     * Refresh token for an agent
     */
    refreshToken(agentId: string): string | null;
    /**
     * Get all active credentials
     */
    getActiveCredentials(): AgentCredentials[];
    /**
     * Cleanup expired credentials
     */
    cleanupExpired(): number;
}
