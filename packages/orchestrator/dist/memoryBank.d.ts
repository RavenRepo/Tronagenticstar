import { EventEmitter } from "eventemitter3";
import { MemoryEntry, ContextQuery } from "./types.js";
/**
 * Memory Bank Manager - handles agent memory and context retrieval
 * Integrates with the RAG layer for semantic search and context building
 */
export declare class MemoryBankManager extends EventEmitter {
    private localMemory;
    private retrieverServiceUrl?;
    constructor(retrieverServiceUrl?: string);
    /**
     * Store a memory entry for an agent
     */
    storeMemory(entry: MemoryEntry): Promise<void>;
    /**
     * Retrieve memories for an agent
     */
    getAgentMemories(agentId: string, limit?: number): MemoryEntry[];
    /**
     * Search memories by tags
     */
    searchByTags(agentId: string, tags: string[]): MemoryEntry[];
    /**
     * Query context using semantic search (RAG integration)
     */
    queryContext(query: ContextQuery): Promise<MemoryEntry[]>;
    /**
     * Get shared context across all agents
     */
    getSharedContext(taskType?: string, limit?: number): MemoryEntry[];
    /**
     * Clear memories for an agent
     */
    clearAgentMemories(agentId: string): void;
    /**
     * Get memory statistics
     */
    getMemoryStats(): {
        totalEntries: number;
        agentCount: number;
        memoryByAgent: Record<string, number>;
        oldestEntry?: Date;
        newestEntry?: Date;
    };
    /**
     * Index memory entry in retriever service
     */
    private indexMemoryEntry;
    /**
     * Fallback local text search
     */
    private localTextSearch;
    /**
     * Format retrieval results from RAG service
     */
    private formatRetrievalResults;
    /**
     * Cleanup old memories
     */
    performCleanup(maxAgeMs?: number): Promise<void>;
}
