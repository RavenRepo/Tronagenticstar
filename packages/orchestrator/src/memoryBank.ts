import { EventEmitter } from "eventemitter3";
import { MemoryEntry, ContextQuery } from "./types.js";

/**
 * Memory Bank Manager - handles agent memory and context retrieval
 * Integrates with the RAG layer for semantic search and context building
 */
export class MemoryBankManager extends EventEmitter {
  private localMemory: Map<string, MemoryEntry[]> = new Map();
  private retrieverServiceUrl?: string;

  constructor(retrieverServiceUrl?: string) {
    super();
    this.retrieverServiceUrl = retrieverServiceUrl;
  }

  /**
   * Store a memory entry for an agent
   */
  async storeMemory(entry: MemoryEntry): Promise<void> {
    const agentMemories = this.localMemory.get(entry.agentId) || [];
    agentMemories.push(entry);
    
    // Keep only last 1000 entries per agent to prevent memory bloat
    if (agentMemories.length > 1000) {
      agentMemories.splice(0, agentMemories.length - 1000);
    }
    
    this.localMemory.set(entry.agentId, agentMemories);
    
    // If retriever service is available, index for semantic search
    if (this.retrieverServiceUrl) {
      try {
        await this.indexMemoryEntry(entry);
      } catch (error) {
        this.emit('indexing_error', { entry, error });
      }
    }
    
    this.emit('memory_stored', entry);
  }

  /**
   * Retrieve memories for an agent
   */
  getAgentMemories(agentId: string, limit?: number): MemoryEntry[] {
    const memories = this.localMemory.get(agentId) || [];
    
    if (limit) {
      return memories.slice(-limit); // Get most recent entries
    }
    
    return memories;
  }

  /**
   * Search memories by tags
   */
  searchByTags(agentId: string, tags: string[]): MemoryEntry[] {
    const memories = this.localMemory.get(agentId) || [];
    
    return memories.filter(memory => 
      tags.some(tag => memory.tags.includes(tag))
    );
  }

  /**
   * Query context using semantic search (RAG integration)
   */
  async queryContext(query: ContextQuery): Promise<MemoryEntry[]> {
    if (!this.retrieverServiceUrl) {
      // Fallback to local text search
      return this.localTextSearch(query);
    }

    try {
      const response = await fetch(`${this.retrieverServiceUrl}/retrieve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.query,
          top_k: query.limit || 10,
          sources: query.filters?.sources || undefined
        })
      });

      if (!response.ok) {
        throw new Error(`Retriever service error: ${response.statusText}`);
      }

      const results = await response.json();
      return this.formatRetrievalResults(results);
    } catch (error) {
      this.emit('retrieval_error', { query, error });
      // Fallback to local search
      return this.localTextSearch(query);
    }
  }

  /**
   * Get shared context across all agents
   */
  getSharedContext(taskType?: string, limit: number = 50): MemoryEntry[] {
    const allMemories: MemoryEntry[] = [];
    
    for (const memories of this.localMemory.values()) {
      allMemories.push(...memories);
    }
    
    // Sort by timestamp (most recent first)
    allMemories.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Filter by task type if specified
    const filtered = taskType 
      ? allMemories.filter(memory => 
          memory.tags.includes(taskType) || 
          memory.metadata.taskType === taskType
        )
      : allMemories;
    
    return filtered.slice(0, limit);
  }

  /**
   * Clear memories for an agent
   */
  clearAgentMemories(agentId: string): void {
    this.localMemory.delete(agentId);
    this.emit('memories_cleared', { agentId });
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): {
    totalEntries: number;
    agentCount: number;
    memoryByAgent: Record<string, number>;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    let totalEntries = 0;
    const memoryByAgent: Record<string, number> = {};
    let oldestEntry: Date | undefined;
    let newestEntry: Date | undefined;

    for (const [agentId, memories] of this.localMemory.entries()) {
      memoryByAgent[agentId] = memories.length;
      totalEntries += memories.length;

      for (const memory of memories) {
        if (!oldestEntry || memory.timestamp < oldestEntry) {
          oldestEntry = memory.timestamp;
        }
        if (!newestEntry || memory.timestamp > newestEntry) {
          newestEntry = memory.timestamp;
        }
      }
    }

    return {
      totalEntries,
      agentCount: this.localMemory.size,
      memoryByAgent,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Index memory entry in retriever service
   */
  private async indexMemoryEntry(entry: MemoryEntry): Promise<void> {
    if (!this.retrieverServiceUrl) return;

    await fetch(`${this.retrieverServiceUrl}/index`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: entry.id,
        content: entry.content,
        metadata: {
          agentId: entry.agentId,
          timestamp: entry.timestamp.toISOString(),
          tags: entry.tags,
          ...entry.metadata
        }
      })
    });
  }

  /**
   * Fallback local text search
   */
  private localTextSearch(query: ContextQuery): MemoryEntry[] {
    const allMemories: MemoryEntry[] = [];
    
    // Collect memories from relevant agents
    if (query.agentId) {
      const agentMemories = this.localMemory.get(query.agentId) || [];
      allMemories.push(...agentMemories);
    } else {
      for (const memories of this.localMemory.values()) {
        allMemories.push(...memories);
      }
    }

    // Simple text matching
    const searchTerms = query.query.toLowerCase().split(' ');
    const results = allMemories.filter(memory => {
      const contentStr = JSON.stringify(memory.content).toLowerCase();
      const tagStr = memory.tags.join(' ').toLowerCase();
      const searchText = `${contentStr} ${tagStr}`;
      
      return searchTerms.some(term => searchText.includes(term));
    });

    // Sort by timestamp (most recent first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return results.slice(0, query.limit || 10);
  }

  /**
   * Format retrieval results from RAG service
   */
  private formatRetrievalResults(results: any[]): MemoryEntry[] {
    return results.map(result => ({
      id: result.id || `retrieved_${Date.now()}`,
      agentId: result.metadata?.agentId || 'unknown',
      timestamp: new Date(result.metadata?.timestamp || Date.now()),
      content: result.content,
      tags: result.metadata?.tags || [],
      metadata: {
        ...result.metadata,
        retrievalScore: result.score,
        source: 'rag_retrieval'
      }
    }));
  }

  /**
   * Cleanup old memories
   */
  async performCleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    let cleanedCount = 0;

    for (const [agentId, memories] of this.localMemory.entries()) {
      const filtered = memories.filter(memory => memory.timestamp > cutoff);
      cleanedCount += memories.length - filtered.length;
      this.localMemory.set(agentId, filtered);
    }

    this.emit('cleanup_completed', { cleanedCount, cutoff });
  }
}
