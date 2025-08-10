import { EventEmitter } from "eventemitter3";
import { Task, TaskType, MemoryEntry, ContextQuery } from "./types.js";
import { AgentRegistry } from "./agentRegistry.js";
import { MemoryBankManager } from "./memoryBank.js";
import { ErrorGoldCollector } from "./errorGold.js";
import { AgentFactory } from "./agentFactory.js";
export interface ChiefArchitectConfig {
    retrieverServiceUrl?: string;
    errorReportingEnabled?: boolean;
    memoryRetentionMs?: number;
    authSecretKey?: string;
}
export declare class ChiefArchitect extends EventEmitter {
    private router;
    private registry;
    private memoryBank;
    private errorCollector;
    private agentFactory;
    private authenticator;
    private healthCheckInterval?;
    constructor(config?: ChiefArchitectConfig);
    /** Entry point called by SystemTrigger */
    handleRequest(task: Task): Promise<unknown>;
    /**
     * Query the memory bank for contextual information
     */
    queryContext(query: ContextQuery): Promise<MemoryEntry[]>;
    /**
     * Get agent registry
     */
    getRegistry(): AgentRegistry;
    /**
     * Get memory bank manager
     */
    getMemoryBank(): MemoryBankManager;
    /**
     * Get error collector
     */
    getErrorCollector(): ErrorGoldCollector;
    /**
     * Get agent factory
     */
    getAgentFactory(): AgentFactory;
    /**
     * Register a new agent
     */
    registerAgent(agentId: string, agentType: string, specialization: TaskType, capabilities: string[], config?: any): Promise<void>;
    /**
     * Unregister an agent
     */
    unregisterAgent(agentId: string): Promise<boolean>;
    /**
     * Get system health status
     */
    getSystemHealth(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        agents: any;
        memory: any;
        errors: any;
        uptime: number;
    }>;
    /**
     * Shutdown the orchestrator
     */
    shutdown(): Promise<void>;
    private storeTaskMemory;
    private getTaskContext;
    private storeResultMemory;
    private setupEventHandlers;
    private startHealthChecks;
}
