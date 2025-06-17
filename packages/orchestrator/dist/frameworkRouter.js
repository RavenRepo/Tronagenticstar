export class FrameworkRouter {
    constructor() {
        this.agents = [];
    }
    registerAgent(agent) {
        this.agents.push(agent);
    }
    score(metrics) {
        return metrics.avgResponseTimeMs * (metrics.currentLoad || 0.1);
    }
    selectOptimalAgent(taskType) {
        const capable = this.agents.filter((a) => a.specialization === taskType);
        if (capable.length === 0)
            return undefined;
        return capable.reduce((best, agent) => {
            return this.score(agent.getMetrics()) < this.score(best.getMetrics()) ? agent : best;
        });
    }
    async route(task) {
        const agent = this.selectOptimalAgent(task.type);
        if (!agent)
            throw new Error(`No agent available for task type ${task.type}`);
        return agent.execute(task);
    }
}
