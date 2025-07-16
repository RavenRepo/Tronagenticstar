import { TaskType, ChiefArchitectConfig } from "./index.js";
/**
 * Example implementation of the AgentForge Orchestrator
 * This demonstrates how to set up and use the complete system
 */
export declare class AgentForgeOrchestrator {
    private chiefArchitect;
    private router;
    constructor(config?: ChiefArchitectConfig);
    /**
     * Initialize the orchestrator with default agents
     */
    initialize(): Promise<void>;
    /**
     * Process a task through the orchestrator
     */
    processTask(taskType: TaskType, parameters: any): Promise<any>;
    /**
     * Query the memory bank for context
     */
    queryContext(query: string, taskType?: TaskType): Promise<any[]>;
    /**
     * Get system health and statistics
     */
    getSystemHealth(): Promise<any>;
    /**
     * Get error statistics
     */
    getErrorStats(): any;
    /**
     * Shutdown the orchestrator
     */
    shutdown(): Promise<void>;
    private registerAgentTypes;
    private createDefaultAgents;
    private setupEventListeners;
}
/**
 * Example usage and demo
 */
export declare function runDemo(): Promise<void>;
