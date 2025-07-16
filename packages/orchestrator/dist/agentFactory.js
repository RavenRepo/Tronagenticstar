import { EventEmitter } from "eventemitter3";
import { TaskType, AgentStatus } from "./types.js";
/**
 * Agent Factory - Creates and manages agent instances
 */
export class AgentFactory extends EventEmitter {
    constructor() {
        super();
        this.instances = new Map();
        this.agentConfigs = new Map();
    }
    /**
     * Register an agent class
     */
    static registerAgentType(typeName, agentClass) {
        this.agentTypes.set(typeName, agentClass);
    }
    /**
     * Get available agent types
     */
    static getAvailableTypes() {
        return Array.from(this.agentTypes.keys());
    }
    /**
     * Create a new agent instance
     */
    async createAgent(agentId, typeName, config, specialization) {
        const AgentClass = AgentFactory.agentTypes.get(typeName);
        if (!AgentClass) {
            throw new Error(`Unknown agent type: ${typeName}`);
        }
        if (this.instances.has(agentId)) {
            throw new Error(`Agent with ID ${agentId} already exists`);
        }
        // Create agent instance using constructor directly
        // Note: In a real implementation, this would use reflection or a different pattern
        // since we can't instantiate abstract classes directly
        let agent;
        switch (typeName) {
            case 'architecture':
                const { ArchitectureAgent } = await import('./concreteAgents.js');
                agent = new ArchitectureAgent({ id: agentId, specialization });
                break;
            case 'security':
                const { SecurityAgent } = await import('./concreteAgents.js');
                agent = new SecurityAgent({ id: agentId, specialization });
                break;
            case 'quality':
                const { QualityAgent } = await import('./concreteAgents.js');
                agent = new QualityAgent({ id: agentId, specialization });
                break;
            default:
                throw new Error(`Unknown agent type: ${typeName}`);
        }
        // Initialize agent with config
        if (typeof agent.initialize === 'function') {
            await agent.initialize(config);
        }
        // Store instance and config
        this.instances.set(agentId, agent);
        this.agentConfigs.set(agentId, config);
        // Listen for agent events
        this.setupAgentEventHandlers(agent);
        this.emit('agent_created', {
            agentId,
            typeName,
            specialization
        });
        return agent;
    }
    /**
     * Get an agent instance
     */
    getAgent(agentId) {
        return this.instances.get(agentId);
    }
    /**
     * Remove an agent instance
     */
    async removeAgent(agentId) {
        const agent = this.instances.get(agentId);
        if (!agent)
            return false;
        // Cleanup agent if it has a cleanup method
        if (typeof agent.cleanup === 'function') {
            await agent.cleanup();
        }
        // Remove from maps
        this.instances.delete(agentId);
        this.agentConfigs.delete(agentId);
        this.emit('agent_removed', { agentId });
        return true;
    }
    /**
     * Get all agent instances
     */
    getAllAgents() {
        return Array.from(this.instances.values());
    }
    /**
     * Get agents by specialization
     */
    getAgentsBySpecialization(specialization) {
        return this.getAllAgents().filter(agent => agent.specialization === specialization);
    }
    /**
     * Create agent info for registry
     */
    createAgentInfo(agentId, typeName, capabilities, version = "1.0.0", metadata = {}) {
        const agent = this.getAgent(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        return {
            id: agentId,
            type: typeName,
            specialization: agent.specialization,
            capabilities,
            status: AgentStatus.READY,
            version,
            metadata: {
                ...metadata,
                createdAt: new Date().toISOString(),
                lastHeartbeat: new Date().toISOString()
            }
        };
    }
    /**
     * Perform health check on all agents
     */
    async performHealthCheck() {
        const results = new Map();
        for (const [agentId, agent] of this.instances.entries()) {
            try {
                // If agent has health check method, use it
                if (typeof agent.healthCheck === 'function') {
                    const health = await agent.healthCheck();
                    results.set(agentId, health.status === 'healthy');
                }
                else {
                    // Basic health check - agent exists and is responsive
                    results.set(agentId, true);
                }
            }
            catch (error) {
                results.set(agentId, false);
                this.emit('agent_health_failed', { agentId, error });
            }
        }
        return results;
    }
    /**
     * Get factory statistics
     */
    getStats() {
        const agentsByType = {};
        // Initialize counters
        AgentFactory.getAvailableTypes().forEach(type => {
            agentsByType[type] = 0;
        });
        const agentsBySpecialization = {
            [TaskType.ARCHITECTURE]: 0,
            [TaskType.SECURITY]: 0,
            [TaskType.QUALITY]: 0,
            [TaskType.PERFORMANCE]: 0,
            [TaskType.DEVOPS]: 0
        };
        // Count agents
        for (const agent of this.instances.values()) {
            // Count by specialization
            agentsBySpecialization[agent.specialization]++;
        }
        // Count by type (would need to track type in agent or config)
        // For now, we'll leave this as initialized values
        return {
            totalAgents: this.instances.size,
            agentsByType,
            agentsBySpecialization
        };
    }
    setupAgentEventHandlers(agent) {
        // Forward agent events to factory events
        agent.on('metrics', (metrics) => {
            this.emit('agent_metrics', {
                agentId: agent.id,
                metrics
            });
        });
        agent.on('error', (error) => {
            this.emit('agent_error', {
                agentId: agent.id,
                error
            });
        });
        // Add more event handlers as needed
    }
}
AgentFactory.agentTypes = new Map();
/**
 * Authentication Manager for agents
 */
export class AgentAuthenticator {
    constructor(secretKey) {
        this.credentials = new Map();
        this.secretKey = secretKey;
    }
    /**
     * Generate authentication token for an agent
     */
    generateToken(agentId, capabilities, expirationMs = 24 * 60 * 60 * 1000 // 24 hours
    ) {
        const expiresAt = new Date(Date.now() + expirationMs);
        const payload = {
            agentId,
            capabilities,
            expiresAt: expiresAt.getTime(),
            issued: Date.now()
        };
        // Simple token generation (in production, use proper JWT library)
        const token = btoa(JSON.stringify(payload));
        this.credentials.set(agentId, {
            agentId,
            token,
            capabilities,
            expiresAt
        });
        return token;
    }
    /**
     * Verify an agent token
     */
    verifyToken(token) {
        try {
            const payload = JSON.parse(atob(token));
            const credentials = this.credentials.get(payload.agentId);
            if (!credentials || credentials.token !== token) {
                return null;
            }
            // Check expiration
            if (Date.now() > credentials.expiresAt.getTime()) {
                this.credentials.delete(payload.agentId);
                return null;
            }
            return credentials;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Revoke token for an agent
     */
    revokeToken(agentId) {
        return this.credentials.delete(agentId);
    }
    /**
     * Check if agent has required capabilities
     */
    hasCapability(agentId, requiredCapability) {
        const credentials = this.credentials.get(agentId);
        return credentials?.capabilities.includes(requiredCapability) ?? false;
    }
    /**
     * Refresh token for an agent
     */
    refreshToken(agentId) {
        const credentials = this.credentials.get(agentId);
        if (!credentials)
            return null;
        return this.generateToken(agentId, credentials.capabilities);
    }
    /**
     * Get all active credentials
     */
    getActiveCredentials() {
        const now = Date.now();
        return Array.from(this.credentials.values()).filter(cred => cred.expiresAt.getTime() > now);
    }
    /**
     * Cleanup expired credentials
     */
    cleanupExpired() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [agentId, credentials] of this.credentials.entries()) {
            if (credentials.expiresAt.getTime() <= now) {
                this.credentials.delete(agentId);
                cleanedCount++;
            }
        }
        return cleanedCount;
    }
}
