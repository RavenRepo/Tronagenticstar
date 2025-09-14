import { BaseAgent, AgentConfig } from "./agent.js";
import { Task } from "./types.js";
/**
 * Architecture Agent - Handles system design and architectural decisions
 * Enhanced with real LLM intelligence
 */
export declare class ArchitectureAgent extends BaseAgent {
    private tools;
    private llmManager;
    constructor(config: AgentConfig);
    execute(task: Task): Promise<unknown>;
    private analyzeArchitecture;
    private generateC4Model;
    private suggestPatterns;
    /**
     * Parse structured JSON response from LLM, with fallback for unstructured text
     */
    private parseStructuredResponse;
    /**
     * Simulate work delay for fallback/placeholder methods
     */
    private simulateWork;
}
/**
 * Security Agent - Handles security analysis and policy enforcement
 * Enhanced with real AI-powered security analysis
 */
export declare class SecurityAgent extends BaseAgent {
    private tools;
    private llmManager;
    constructor(config: AgentConfig);
    execute(task: Task): Promise<unknown>;
    private performSecurityScan;
    private checkPolicies;
    private assessVulnerabilities;
    /**
     * Parse structured JSON response from LLM, with fallback for unstructured text
     */
    private parseStructuredResponse;
    /**
     * Simulate work delay for fallback/placeholder methods
     */
    private simulateWork;
}
/**
 * Quality Agent - Handles code quality analysis and testing
 * Enhanced with AI-powered code review and quality assessment
 */
export declare class QualityAgent extends BaseAgent {
    private tools;
    private llmManager;
    constructor(config: AgentConfig);
    execute(task: Task): Promise<unknown>;
    private checkCodeQuality;
    private runTests;
    private analyzeCoverage;
    /**
     * Parse structured JSON response from LLM, with fallback for unstructured text
     */
    private parseStructuredResponse;
    /**
     * Simulate work delay for fallback/placeholder methods
     */
    private simulateWork;
}
