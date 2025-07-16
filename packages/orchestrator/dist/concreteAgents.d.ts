import { BaseAgent, AgentConfig } from "./agent.js";
import { Task } from "./types.js";
/**
 * Architecture Agent - Handles system design and architectural decisions
 */
export declare class ArchitectureAgent extends BaseAgent {
    private tools;
    constructor(config: AgentConfig);
    execute(task: Task): Promise<unknown>;
    private analyzeArchitecture;
    private generateC4Model;
    private suggestPatterns;
    private simulateWork;
}
/**
 * Security Agent - Handles security analysis and policy enforcement
 */
export declare class SecurityAgent extends BaseAgent {
    private tools;
    constructor(config: AgentConfig);
    execute(task: Task): Promise<unknown>;
    private performSecurityScan;
    private checkPolicies;
    private assessVulnerabilities;
    private simulateWork;
}
/**
 * Quality Agent - Handles code quality analysis and testing
 */
export declare class QualityAgent extends BaseAgent {
    private tools;
    constructor(config: AgentConfig);
    execute(task: Task): Promise<unknown>;
    private checkCodeQuality;
    private runTests;
    private analyzeCoverage;
    private simulateWork;
}
