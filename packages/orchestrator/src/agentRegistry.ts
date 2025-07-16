import { EventEmitter } from "eventemitter3";
import { AgentInfo, AgentStatus, TaskType } from "./types.js";

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();
  private agentsByType: Map<TaskType, Set<string>> = new Map();
  private agentsByCapability: Map<string, Set<string>> = new Map();

  constructor() {
    super();
    this.initializeTypeMaps();
  }

  private initializeTypeMaps(): void {
    // Initialize type maps
    Object.values(TaskType).forEach(type => {
      this.agentsByType.set(type as TaskType, new Set());
    });
  }

  /**
   * Register a new agent in the registry
   */
  register(agentInfo: AgentInfo): void {
    const existingAgent = this.agents.get(agentInfo.id);
    
    if (existingAgent) {
      // Update existing agent
      this.agents.set(agentInfo.id, agentInfo);
      this.emit('agent_updated', agentInfo);
    } else {
      // Register new agent
      this.agents.set(agentInfo.id, agentInfo);
      
      // Update type mapping
      this.agentsByType.get(agentInfo.specialization)?.add(agentInfo.id);
      
      // Update capability mapping
      agentInfo.capabilities.forEach(capability => {
        if (!this.agentsByCapability.has(capability)) {
          this.agentsByCapability.set(capability, new Set());
        }
        this.agentsByCapability.get(capability)?.add(agentInfo.id);
      });
      
      this.emit('agent_registered', agentInfo);
    }
  }

  /**
   * Unregister an agent
   */
  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    // Remove from main registry
    this.agents.delete(agentId);

    // Remove from type mapping
    this.agentsByType.get(agent.specialization)?.delete(agentId);

    // Remove from capability mapping
    agent.capabilities.forEach(capability => {
      this.agentsByCapability.get(capability)?.delete(agentId);
    });

    this.emit('agent_unregistered', agent);
    return true;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents of a specific type
   */
  getAgentsByType(type: TaskType): AgentInfo[] {
    const agentIds = this.agentsByType.get(type) || new Set();
    return Array.from(agentIds)
      .map(id => this.agents.get(id))
      .filter((agent): agent is AgentInfo => agent !== undefined);
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: string): AgentInfo[] {
    const agentIds = this.agentsByCapability.get(capability) || new Set();
    return Array.from(agentIds)
      .map(id => this.agents.get(id))
      .filter((agent): agent is AgentInfo => agent !== undefined);
  }

  /**
   * Get healthy agents by type
   */
  getHealthyAgentsByType(type: TaskType): AgentInfo[] {
    return this.getAgentsByType(type).filter(
      agent => agent.status === AgentStatus.READY
    );
  }

  /**
   * Update agent status
   */
  updateStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      this.emit('agent_status_changed', { agentId, status, agent });
    }
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    total: number;
    byType: Record<TaskType, number>;
    byStatus: Record<AgentStatus, number>;
  } {
    const agents = this.getAllAgents();
    
    const byType = {} as Record<TaskType, number>;
    const byStatus = {} as Record<AgentStatus, number>;

    // Initialize counters
    Object.values(TaskType).forEach(type => {
      byType[type as TaskType] = 0;
    });
    Object.values(AgentStatus).forEach(status => {
      byStatus[status] = 0;
    });

    // Count agents
    agents.forEach(agent => {
      byType[agent.specialization]++;
      byStatus[agent.status]++;
    });

    return {
      total: agents.length,
      byType,
      byStatus
    };
  }

  /**
   * Find agents matching criteria
   */
  findAgents(criteria: {
    type?: TaskType;
    capabilities?: string[];
    status?: AgentStatus;
    metadata?: Record<string, unknown>;
  }): AgentInfo[] {
    return this.getAllAgents().filter(agent => {
      // Filter by type
      if (criteria.type && agent.specialization !== criteria.type) {
        return false;
      }

      // Filter by capabilities
      if (criteria.capabilities) {
        const hasAllCapabilities = criteria.capabilities.every(cap =>
          agent.capabilities.includes(cap)
        );
        if (!hasAllCapabilities) return false;
      }

      // Filter by status
      if (criteria.status && agent.status !== criteria.status) {
        return false;
      }

      // Filter by metadata (simple key-value matching)
      if (criteria.metadata) {
        for (const [key, value] of Object.entries(criteria.metadata)) {
          if (agent.metadata[key] !== value) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Health check - remove stale agents
   */
  performHealthCheck(): void {
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    const now = new Date();
    
    const staleAgents = this.getAllAgents().filter(agent => {
      if (!agent.metadata.lastHeartbeat) return false;
      const lastHeartbeat = new Date(agent.metadata.lastHeartbeat as string);
      return (now.getTime() - lastHeartbeat.getTime()) > staleThreshold;
    });

    staleAgents.forEach(agent => {
      this.updateStatus(agent.id, AgentStatus.FAILED);
      this.emit('agent_stale', agent);
    });
  }
}
