import { EventEmitter } from "eventemitter3";
import { AgentInfo, AgentStatus, TaskType, AgentMetrics } from "./types.js";
import axios from 'axios';

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();

  constructor() {
    super();
  }

  async discoverAndRegisterAgent(agentUrl: string): Promise<AgentInfo | null> {
    try {
      const response = await axios.get(`${agentUrl}/capabilities`, { timeout: 5000 });
      const capabilities = response.data;

      const agentInfo: AgentInfo = {
        id: capabilities.agent_id,
        address: agentUrl,
        specialization: capabilities.task_type,
        capabilities: capabilities.capabilities,
        status: AgentStatus.READY,
        metrics: {
          avgResponseTimeMs: 0,
          totalTasksCompleted: 0,
          totalTasksFailed: 0,
          currentLoad: 0,
        },
        lastSeen: new Date(),
      };

      this.register(agentInfo);
      return agentInfo;
    } catch (error) {
      console.error(`Failed to discover agent at ${agentUrl}:`, error);
      return null;
    }
  }

  register(agentInfo: AgentInfo): void {
    this.agents.set(agentInfo.id, agentInfo);
    this.emit('agent_registered', agentInfo);
  }

  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    this.agents.delete(agentId);
    this.emit('agent_unregistered', agent);
    return true;
  }

  getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  getAgentsByTaskType(type: TaskType): AgentInfo[] {
    return Array.from(this.agents.values()).filter(agent => agent.specialization === type);
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  updateAgentMetrics(agentId: string, metrics: Partial<AgentMetrics>): void {
    const agent = this.getAgent(agentId);
    if (agent) {
      agent.metrics = { ...agent.metrics, ...metrics };
    }
  }

  async performHealthCheck(): Promise<void> {
    for (const agent of this.agents.values()) {
      try {
        const response = await axios.get(`${agent.address}/health`, { timeout: 3000 });
        if (response.data.status === 'ok') {
          agent.status = AgentStatus.READY;
        } else {
          agent.status = AgentStatus.DEGRADED;
        }
        agent.lastSeen = new Date();
      } catch (error) {
        agent.status = AgentStatus.UNAVAILABLE;
        this.emit('agent_unavailable', agent);
      }
    }
  }
}