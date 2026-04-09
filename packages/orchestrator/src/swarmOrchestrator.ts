// ─── Swarm Orchestrator — LLM-Driven Multi-Agent Intelligence Layer ─────────
//
// This is the "brain" that was missing. Before this file, the ChiefArchitect
// was a mechanical dispatcher: receive task with TaskType → route to matching
// agent. No thinking. No delegation decisions. No multi-agent composition.
//
// SwarmOrchestrator sits on top of the existing infrastructure and adds the
// intelligence layer:
//
//   1. User sends natural language (no TaskType needed)
//   2. LLM analyzes the request and produces a PLAN (which agents, what order)
//   3. Orchestrator executes the plan — calling agents sequentially or in parallel
//   4. LLM synthesizes the results into a coherent final answer
//
// This wires together:
//   - LLMManager (from @constella/llm-core) for thinking
//   - FrameworkRouter (existing) for agent execution
//   - AgentRegistry (existing) for agent discovery
//   - MemoryBankManager (existing) for context retrieval
//   - SessionTools (Phase 1 OpenClaw) for NATS-based agent messaging
//
// ─────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from "eventemitter3";
import {
  createLLMManager,
  LLMManager,
  LLMMessage,
  AGENT_CONFIGS,
} from "@constella/llm-core";
import { Task, TaskType, MemoryEntry } from "./types.js";
import { FrameworkRouter } from "./frameworkRouter.js";
import { AgentRegistry } from "./agentRegistry.js";
import { MemoryBankManager } from "./memoryBank.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SwarmOrchestratorConfig {
  /** LLM API keys — at least one provider required */
  llmApiKeys: {
    openai?: string;
    anthropic?: string;
    gemini?: string;
    openrouter?: string;
  };
  /** Maximum number of agent calls per single user request */
  maxAgentCalls?: number;
  /** Timeout for the entire orchestration pipeline (ms) */
  pipelineTimeoutMs?: number;
  /** Whether to include memory context in agent calls */
  useMemoryContext?: boolean;
  /** Maximum tokens for the planning step */
  planningMaxTokens?: number;
  /** Maximum tokens for the synthesis step */
  synthesisMaxTokens?: number;
}

/**
 * A step in the execution plan produced by the LLM planner.
 */
export interface PlanStep {
  /** Which agent to call */
  agentId: string;
  /** The TaskType to route through FrameworkRouter */
  taskType: TaskType;
  /** The specific action the agent should perform */
  action: string;
  /** Parameters to pass to the agent */
  parameters: Record<string, unknown>;
  /** Human-readable reason for calling this agent */
  reason: string;
  /**
   * Dependency: index of a prior step whose output this step needs.
   * -1 or undefined = no dependency (can run in parallel with other independent steps)
   */
  dependsOn?: number;
}

/**
 * The full plan produced by the LLM planner.
 */
export interface ExecutionPlan {
  /** Brief summary of what the plan will accomplish */
  summary: string;
  /** Ordered list of agent calls */
  steps: PlanStep[];
  /** Whether this is a simple single-agent request or multi-agent collaboration */
  complexity: "simple" | "multi-agent" | "research";
  /** The planner's confidence that this plan addresses the user's request (0-1) */
  confidence: number;
}

/**
 * Result from executing a single plan step.
 */
export interface StepResult {
  stepIndex: number;
  agentId: string;
  action: string;
  success: boolean;
  result: unknown;
  error?: string;
  durationMs: number;
}

/**
 * Final output from the orchestration pipeline.
 */
export interface OrchestrationResult {
  /** The synthesised final answer */
  answer: string;
  /** The plan that was executed */
  plan: ExecutionPlan;
  /** Results from each step */
  stepResults: StepResult[];
  /** Total pipeline duration */
  totalDurationMs: number;
  /** Which agents contributed */
  agentsUsed: string[];
  /** Whether the pipeline completed successfully */
  success: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_AGENT_CALLS = 5;
const DEFAULT_PIPELINE_TIMEOUT_MS = 120_000; // 2 minutes
const DEFAULT_PLANNING_MAX_TOKENS = 2000;
const DEFAULT_SYNTHESIS_MAX_TOKENS = 3000;

// ─── Agent Catalog ──────────────────────────────────────────────────────────

/**
 * Static description of each agent's capabilities for the LLM planner.
 * This is what teaches the LLM *when* and *why* to call each agent.
 *
 * This is the single most important piece of this entire file.
 * The quality of orchestration depends on how well these descriptions
 * communicate each agent's strengths, limitations, and ideal use cases.
 */
const AGENT_CATALOG: Record<
  string,
  { taskType: TaskType; actions: string[]; description: string }
> = {
  "architecture-agent-001": {
    taskType: TaskType.ARCHITECTURE,
    actions: ["analyze_architecture", "generate_c4_model", "suggest_patterns"],
    description:
      "Senior system architect. Call for: system design review, " +
      "scalability analysis, C4 model generation, design pattern suggestions, " +
      "technology stack evaluation, microservice decomposition. " +
      "Needs: description, techStack, scale, constraints.",
  },
  "security-agent-001": {
    taskType: TaskType.SECURITY,
    actions: ["security_scan", "policy_check", "vulnerability_assessment"],
    description:
      "Cybersecurity expert. Call for: vulnerability scanning, threat modeling, " +
      "security code review, compliance checks (SOC2/GDPR/HIPAA), " +
      "penetration test analysis, dependency audit. " +
      "Needs: target (code/URL/config), appType, compliance requirements.",
  },
  "quality-agent-001": {
    taskType: TaskType.QUALITY,
    actions: ["code_quality_check", "run_tests", "analyze_coverage"],
    description:
      "Code quality engineer. Call for: code review, maintainability analysis, " +
      "test coverage assessment, complexity metrics, refactoring suggestions, " +
      "best practice violations. " +
      "Needs: codeSnippet or projectType, language.",
  },
};

// ─── System Prompts ─────────────────────────────────────────────────────────

function buildPlannerSystemPrompt(
  agentDescriptions: string,
  memoryContext: string,
): string {
  return `You are the Chief Architect of the Constella AI Platform — an intelligent orchestrator that routes user requests to specialist AI agents.

Your job is to THINK about what the user needs and produce an EXECUTION PLAN — a JSON object describing which agents to call, in what order, with what parameters.

## Available Agents

${agentDescriptions}

## Rules

1. For SIMPLE requests that clearly map to one agent, produce a plan with a single step. Do NOT over-engineer.
2. For COMPLEX requests that span multiple domains (e.g. "review my API for security and code quality"), call multiple agents. Steps without dependencies can run in parallel.
3. Each step's "parameters" must include an "action" field matching one of the agent's actions listed above, plus any data the agent needs.
4. If the user's request doesn't match ANY agent's capabilities, set steps to an empty array and explain in the summary.
5. NEVER fabricate agent IDs. Only use IDs from the catalog above.
6. Set "dependsOn" to the index of a prior step ONLY if the current step genuinely needs the prior step's output. Otherwise omit it so steps can run in parallel.
7. Keep confidence between 0 and 1. Below 0.5 means you're guessing.

${memoryContext ? `## Recent Context\n\n${memoryContext}\n` : ""}

## Output Format

Respond with ONLY a JSON object (no markdown fences, no explanation outside the JSON):

{
  "summary": "Brief description of the plan",
  "steps": [
    {
      "agentId": "architecture-agent-001",
      "taskType": "ARCHITECTURE",
      "action": "analyze_architecture",
      "parameters": { "action": "analyze_architecture", "description": "..." },
      "reason": "Why this agent is needed",
      "dependsOn": -1
    }
  ],
  "complexity": "simple",
  "confidence": 0.9
}`;
}

function buildSynthesisSystemPrompt(): string {
  return `You are the Chief Architect of the Constella AI Platform. Multiple specialist agents have completed their work. Your job is to SYNTHESIZE their outputs into a single, coherent, actionable answer for the user.

## Rules

1. Combine insights from all agents. Do not simply concatenate their outputs.
2. Resolve contradictions — if the architecture agent says one thing and the security agent disagrees, acknowledge both perspectives and give your recommendation.
3. Prioritize actionable advice. The user wants to know WHAT TO DO, not just what was analyzed.
4. If any agent failed, acknowledge the gap and work with what you have.
5. Use clear structure: headings, bullet points, numbered steps where appropriate.
6. Keep the tone professional but direct. No fluff.
7. If only one agent was called, enhance its output with your own architectural perspective — don't just parrot it back.`;
}

// ─── SwarmOrchestrator Class ────────────────────────────────────────────────

export class SwarmOrchestrator extends EventEmitter {
  private readonly llm: LLMManager;
  private readonly router: FrameworkRouter;
  private readonly registry: AgentRegistry;
  private readonly memoryBank: MemoryBankManager;
  private readonly config: Required<
    Pick<
      SwarmOrchestratorConfig,
      | "maxAgentCalls"
      | "pipelineTimeoutMs"
      | "useMemoryContext"
      | "planningMaxTokens"
      | "synthesisMaxTokens"
    >
  >;

  constructor(
    config: SwarmOrchestratorConfig,
    router: FrameworkRouter,
    registry: AgentRegistry,
    memoryBank: MemoryBankManager,
  ) {
    super();

    this.llm = createLLMManager(config.llmApiKeys);
    this.router = router;
    this.registry = registry;
    this.memoryBank = memoryBank;

    this.config = {
      maxAgentCalls: config.maxAgentCalls ?? DEFAULT_MAX_AGENT_CALLS,
      pipelineTimeoutMs: config.pipelineTimeoutMs ?? DEFAULT_PIPELINE_TIMEOUT_MS,
      useMemoryContext: config.useMemoryContext ?? true,
      planningMaxTokens: config.planningMaxTokens ?? DEFAULT_PLANNING_MAX_TOKENS,
      synthesisMaxTokens:
        config.synthesisMaxTokens ?? DEFAULT_SYNTHESIS_MAX_TOKENS,
    };
  }

  // ── Main Entry Point ────────────────────────────────────────────────────

  /**
   * Process a natural language request through the full pipeline:
   *   1. Gather context from memory
   *   2. Ask the LLM to produce an execution plan
   *   3. Execute the plan (calling agents)
   *   4. Ask the LLM to synthesize the results
   *   5. Return the final answer
   */
  async chat(userMessage: string): Promise<OrchestrationResult> {
    const pipelineStart = Date.now();

    this.emit("pipeline_start", { userMessage });

    // ── Step 0: Timeout guard ──────────────────────────────────────────
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Orchestration pipeline timed out")),
        this.config.pipelineTimeoutMs,
      );
    });

    try {
      const result = await Promise.race([
        this._executePipeline(userMessage, pipelineStart),
        timeoutPromise,
      ]);
      return result;
    } catch (err) {
      const totalDurationMs = Date.now() - pipelineStart;
      const errorMsg =
        err instanceof Error ? err.message : "Unknown pipeline error";

      this.emit("pipeline_error", { error: errorMsg, totalDurationMs });

      return {
        answer: `I encountered an error while processing your request: ${errorMsg}. Please try again or rephrase your question.`,
        plan: {
          summary: "Pipeline failed",
          steps: [],
          complexity: "simple",
          confidence: 0,
        },
        stepResults: [],
        totalDurationMs,
        agentsUsed: [],
        success: false,
      };
    }
  }

  // ── Pipeline Implementation ─────────────────────────────────────────────

  private async _executePipeline(
    userMessage: string,
    pipelineStart: number,
  ): Promise<OrchestrationResult> {
    // ── 1. Gather memory context ─────────────────────────────────────────
    let memoryContext = "";
    if (this.config.useMemoryContext) {
      try {
        const memories = await this.memoryBank.queryContext({
          query: userMessage,
          limit: 3,
        });
        if (memories.length > 0) {
          memoryContext = memories
            .map(
              (m) =>
                `[${m.tags?.join(", ") || "context"}] ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`,
            )
            .join("\n");
        }
      } catch {
        // Memory retrieval is best-effort
      }
    }

    // ── 2. Build agent catalog for the planner ───────────────────────────
    const agentDescriptions = this._buildAgentCatalog();

    // ── 3. Ask the LLM to plan ───────────────────────────────────────────
    this.emit("planning_start", { userMessage });
    const plan = await this._planExecution(
      userMessage,
      agentDescriptions,
      memoryContext,
    );
    this.emit("planning_complete", { plan });

    // ── 4. Execute the plan ──────────────────────────────────────────────
    if (plan.steps.length === 0) {
      // The planner decided no agents are needed
      const totalDurationMs = Date.now() - pipelineStart;
      return {
        answer: plan.summary || "I'm not sure which agent can help with that request. Could you rephrase or provide more detail?",
        plan,
        stepResults: [],
        totalDurationMs,
        agentsUsed: [],
        success: true,
      };
    }

    this.emit("execution_start", {
      stepCount: plan.steps.length,
      complexity: plan.complexity,
    });

    const stepResults = await this._executeSteps(plan.steps);
    this.emit("execution_complete", { stepResults });

    // ── 5. Synthesize the results ────────────────────────────────────────
    this.emit("synthesis_start", { resultCount: stepResults.length });

    const answer = await this._synthesize(userMessage, plan, stepResults);

    const totalDurationMs = Date.now() - pipelineStart;
    const agentsUsed = [
      ...new Set(stepResults.filter((r) => r.success).map((r) => r.agentId)),
    ];

    this.emit("pipeline_complete", {
      totalDurationMs,
      agentsUsed,
      stepCount: stepResults.length,
      successCount: stepResults.filter((r) => r.success).length,
    });

    // ── 6. Store the interaction in memory ───────────────────────────────
    try {
      await this.memoryBank.storeMemory({
        id: `swarm_${Date.now()}`,
        agentId: "chief-architect",
        timestamp: new Date(),
        content: {
          type: "swarm_orchestration",
          userMessage,
          plan: plan.summary,
          agentsUsed,
          success: true,
        },
        tags: ["swarm", "orchestration", plan.complexity],
        metadata: {
          totalDurationMs,
          stepCount: plan.steps.length,
          confidence: plan.confidence,
        },
      });
    } catch {
      // Memory storage is best-effort
    }

    return {
      answer,
      plan,
      stepResults,
      totalDurationMs,
      agentsUsed,
      success: stepResults.some((r) => r.success),
    };
  }

  // ── Planning ────────────────────────────────────────────────────────────

  /**
   * Build a human-readable catalog of available agents for the planner prompt.
   * Uses the static AGENT_CATALOG as the base, then overlays any agents
   * that are actually registered in the live AgentRegistry.
   */
  private _buildAgentCatalog(): string {
    const lines: string[] = [];

    // Start with the static catalog (known agents with rich descriptions)
    for (const [agentId, info] of Object.entries(AGENT_CATALOG)) {
      const registered = this.registry.getAgent(agentId);
      const status = registered ? "✅ online" : "⚠️ registered (static)";
      lines.push(
        `### ${agentId} [${status}]`,
        `Task type: ${info.taskType}`,
        `Actions: ${info.actions.join(", ")}`,
        `${info.description}`,
        "",
      );
    }

    // Add any registered agents NOT in the static catalog (e.g. discovered external agents)
    for (const agent of this.registry.getAllAgents()) {
      if (AGENT_CATALOG[agent.id]) continue; // Already listed
      lines.push(
        `### ${agent.id} [✅ online]`,
        `Task type: ${agent.specialization}`,
        `Capabilities: ${(agent.capabilities || []).join(", ") || "general"}`,
        `(Dynamically discovered agent — limited description available)`,
        "",
      );
    }

    return lines.join("\n");
  }

  /**
   * Ask the LLM to produce an execution plan from the user's natural language request.
   */
  private async _planExecution(
    userMessage: string,
    agentDescriptions: string,
    memoryContext: string,
  ): Promise<ExecutionPlan> {
    const systemPrompt = buildPlannerSystemPrompt(
      agentDescriptions,
      memoryContext,
    );

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    try {
      const response = await this.llm.completion(messages, {
        quality: "high",
        costPriority: "medium",
      }, {
        maxTokens: this.config.planningMaxTokens,
        temperature: 0.2, // Low temperature for reliable structured output
      });

      const plan = this._parsePlan(response.content);

      // Enforce limits
      if (plan.steps.length > this.config.maxAgentCalls) {
        plan.steps = plan.steps.slice(0, this.config.maxAgentCalls);
        plan.summary += ` (truncated to ${this.config.maxAgentCalls} steps)`;
      }

      // Validate agent IDs — remove steps referencing unknown agents
      plan.steps = plan.steps.filter((step) => {
        const known =
          AGENT_CATALOG[step.agentId] ||
          this.registry.getAgent(step.agentId);
        if (!known) {
          this.emit("planning_warning", {
            message: `Planner referenced unknown agent "${step.agentId}", removing step`,
          });
        }
        return !!known;
      });

      return plan;
    } catch (err) {
      // If planning fails entirely, fall back to a simple heuristic plan
      this.emit("planning_fallback", {
        error: err instanceof Error ? err.message : "Unknown planning error",
      });
      return this._heuristicPlan(userMessage);
    }
  }

  /**
   * Parse the LLM's response into an ExecutionPlan.
   * Handles various malformed responses gracefully.
   */
  private _parsePlan(raw: string): ExecutionPlan {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    try {
      const parsed = JSON.parse(cleaned);

      return {
        summary: parsed.summary || "Executing plan",
        steps: Array.isArray(parsed.steps)
          ? parsed.steps.map((s: any, i: number) => ({
              agentId: String(s.agentId || ""),
              taskType: this._resolveTaskType(s.taskType),
              action: String(s.action || s.parameters?.action || ""),
              parameters: s.parameters || {},
              reason: String(s.reason || ""),
              dependsOn:
                typeof s.dependsOn === "number" && s.dependsOn >= 0 && s.dependsOn < i
                  ? s.dependsOn
                  : undefined,
            }))
          : [],
        complexity: ["simple", "multi-agent", "research"].includes(
          parsed.complexity,
        )
          ? parsed.complexity
          : "simple",
        confidence:
          typeof parsed.confidence === "number"
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0.5,
      };
    } catch {
      // If JSON parsing fails, try to extract from the text
      return {
        summary: "Could not parse plan from LLM response",
        steps: [],
        complexity: "simple",
        confidence: 0,
      };
    }
  }

  /**
   * Resolve a string TaskType value to the enum.
   */
  private _resolveTaskType(raw: unknown): TaskType {
    if (typeof raw !== "string") return TaskType.ARCHITECTURE;
    const upper = raw.toUpperCase();
    if (upper in TaskType) {
      return TaskType[upper as keyof typeof TaskType];
    }
    return TaskType.ARCHITECTURE;
  }

  /**
   * Fallback: keyword-based heuristic plan when LLM planning fails.
   * This is deliberately simple — it exists so the system degrades
   * gracefully rather than returning nothing.
   */
  private _heuristicPlan(userMessage: string): ExecutionPlan {
    const lower = userMessage.toLowerCase();
    const steps: PlanStep[] = [];

    if (
      lower.includes("security") ||
      lower.includes("vulnerab") ||
      lower.includes("threat") ||
      lower.includes("compliance") ||
      lower.includes("audit") ||
      lower.includes("penetration") ||
      lower.includes("cve")
    ) {
      steps.push({
        agentId: "security-agent-001",
        taskType: TaskType.SECURITY,
        action: "security_scan",
        parameters: { action: "security_scan", target: userMessage },
        reason: "Request mentions security-related terms",
      });
    }

    if (
      lower.includes("architect") ||
      lower.includes("design") ||
      lower.includes("scalab") ||
      lower.includes("microservice") ||
      lower.includes("system") ||
      lower.includes("pattern") ||
      lower.includes("c4")
    ) {
      steps.push({
        agentId: "architecture-agent-001",
        taskType: TaskType.ARCHITECTURE,
        action: "analyze_architecture",
        parameters: {
          action: "analyze_architecture",
          description: userMessage,
        },
        reason: "Request mentions architecture-related terms",
      });
    }

    if (
      lower.includes("quality") ||
      lower.includes("review") ||
      lower.includes("test") ||
      lower.includes("coverage") ||
      lower.includes("lint") ||
      lower.includes("refactor") ||
      lower.includes("complexity")
    ) {
      steps.push({
        agentId: "quality-agent-001",
        taskType: TaskType.QUALITY,
        action: "code_quality_check",
        parameters: {
          action: "code_quality_check",
          codeSnippet: userMessage,
        },
        reason: "Request mentions code quality-related terms",
      });
    }

    // If nothing matched, default to the architecture agent
    if (steps.length === 0) {
      steps.push({
        agentId: "architecture-agent-001",
        taskType: TaskType.ARCHITECTURE,
        action: "analyze_architecture",
        parameters: {
          action: "analyze_architecture",
          description: userMessage,
        },
        reason: "Default fallback — routing to Chief Architect for triage",
      });
    }

    return {
      summary: `Heuristic plan: ${steps.map((s) => s.agentId).join(" + ")}`,
      steps,
      complexity: steps.length > 1 ? "multi-agent" : "simple",
      confidence: 0.4, // Low confidence — this is a keyword heuristic
    };
  }

  // ── Execution ───────────────────────────────────────────────────────────

  /**
   * Execute plan steps, respecting dependency ordering.
   *
   * Steps with no dependencies run in parallel.
   * Steps that depend on a prior step wait for it to complete first.
   */
  private async _executeSteps(steps: PlanStep[]): Promise<StepResult[]> {
    const results: StepResult[] = new Array(steps.length);
    const completionPromises: Promise<void>[] = new Array(steps.length);

    // For each step, create a promise that resolves when the step completes.
    // If the step has a dependency, it awaits the dependency's promise first.
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepIndex = i;

      const execute = async (): Promise<void> => {
        // Wait for dependency if needed
        if (
          step.dependsOn !== undefined &&
          step.dependsOn >= 0 &&
          step.dependsOn < stepIndex
        ) {
          await completionPromises[step.dependsOn];

          // If the dependency failed, pass its output as context anyway
          // (the synthesis step will handle partial results)
        }

        const stepStart = Date.now();
        this.emit("step_start", {
          stepIndex,
          agentId: step.agentId,
          action: step.action,
        });

        try {
          // Build the task from the plan step
          const task: Task = {
            id: `swarm_${Date.now()}_step${stepIndex}`,
            type: step.taskType,
            parameters: {
              ...step.parameters,
              action: step.action,
              // Inject prior step results if this step has a dependency
              ...(step.dependsOn !== undefined &&
              results[step.dependsOn]?.success
                ? {
                    priorAgentOutput: results[step.dependsOn].result,
                    priorAgentId: results[step.dependsOn].agentId,
                  }
                : {}),
            },
          };

          // Get memory context for this specific step
          let context: MemoryEntry[] = [];
          if (this.config.useMemoryContext) {
            try {
              context = await this.memoryBank.queryContext({
                query: `${step.action} ${step.reason}`,
                taskType: step.taskType,
                limit: 2,
              });
            } catch {
              // Best-effort
            }
          }

          const result = await this.router.route(task, context);
          const durationMs = Date.now() - stepStart;

          results[stepIndex] = {
            stepIndex,
            agentId: step.agentId,
            action: step.action,
            success: true,
            result,
            durationMs,
          };

          this.emit("step_complete", {
            stepIndex,
            agentId: step.agentId,
            success: true,
            durationMs,
          });
        } catch (err) {
          const durationMs = Date.now() - stepStart;
          const errorMsg =
            err instanceof Error ? err.message : "Unknown agent error";

          results[stepIndex] = {
            stepIndex,
            agentId: step.agentId,
            action: step.action,
            success: false,
            result: null,
            error: errorMsg,
            durationMs,
          };

          this.emit("step_error", {
            stepIndex,
            agentId: step.agentId,
            error: errorMsg,
            durationMs,
          });
        }
      };

      completionPromises[i] = execute();
    }

    // Wait for ALL steps to complete (parallel + sequential)
    await Promise.allSettled(completionPromises);

    return results.filter(Boolean); // Remove any undefined slots
  }

  // ── Synthesis ───────────────────────────────────────────────────────────

  /**
   * Ask the LLM to synthesize all step results into a coherent answer.
   */
  private async _synthesize(
    userMessage: string,
    plan: ExecutionPlan,
    stepResults: StepResult[],
  ): Promise<string> {
    // If only one step and it succeeded, we can do a lighter synthesis
    if (stepResults.length === 1 && stepResults[0].success) {
      return this._synthesizeSingle(
        userMessage,
        stepResults[0],
      );
    }

    // Multi-agent synthesis
    const resultSummaries = stepResults
      .map((r) => {
        const status = r.success ? "✅ Success" : `❌ Failed: ${r.error}`;
        const output = r.success
          ? typeof r.result === "string"
            ? r.result
            : JSON.stringify(r.result, null, 2)
          : "No output";

        return `### Agent: ${r.agentId} (${r.action}) — ${status}\n${output}`;
      })
      .join("\n\n---\n\n");

    const messages: LLMMessage[] = [
      { role: "system", content: buildSynthesisSystemPrompt() },
      {
        role: "user",
        content: `## User's Original Request\n\n${userMessage}\n\n## Execution Plan\n\n${plan.summary}\n\n## Agent Results\n\n${resultSummaries}\n\n---\n\nPlease synthesize these results into a single, coherent answer for the user.`,
      },
    ];

    try {
      const response = await this.llm.completion(messages, {
        quality: "high",
        costPriority: "low", // We want the best synthesis
      }, {
        maxTokens: this.config.synthesisMaxTokens,
        temperature: 0.3,
      });

      return response.content;
    } catch (err) {
      // If synthesis fails, return raw results as a fallback
      this.emit("synthesis_fallback", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
      return this._rawResultsFallback(stepResults);
    }
  }

  /**
   * Lighter synthesis for single-agent responses.
   * The LLM adds architectural perspective on top of the agent's output.
   */
  private async _synthesizeSingle(
    userMessage: string,
    result: StepResult,
  ): Promise<string> {
    const output =
      typeof result.result === "string"
        ? result.result
        : JSON.stringify(result.result, null, 2);

    const messages: LLMMessage[] = [
      {
        role: "system",
        content:
          "You are the Chief Architect of the Constella AI Platform. " +
          "A specialist agent has produced the following output in response to a user request. " +
          "Present this information clearly to the user. Add your own architectural insights " +
          "if relevant, but don't pad the response with fluff. If the agent's output is already " +
          "well-structured, clean it up and present it directly.",
      },
      {
        role: "user",
        content: `User asked: ${userMessage}\n\nAgent ${result.agentId} (${result.action}) responded:\n\n${output}`,
      },
    ];

    try {
      const response = await this.llm.completion(messages, {
        quality: "balanced",
        costPriority: "medium",
      }, {
        maxTokens: this.config.synthesisMaxTokens,
        temperature: 0.3,
      });

      return response.content;
    } catch {
      // If synthesis fails, return the raw agent output
      return output;
    }
  }

  /**
   * Emergency fallback: return raw results when synthesis LLM call fails.
   */
  private _rawResultsFallback(stepResults: StepResult[]): string {
    const parts: string[] = [
      "I was unable to synthesize the results, but here are the raw agent outputs:\n",
    ];

    for (const r of stepResults) {
      if (r.success) {
        const output =
          typeof r.result === "string"
            ? r.result
            : JSON.stringify(r.result, null, 2);
        parts.push(`**${r.agentId}** (${r.action}):\n${output}\n`);
      } else {
        parts.push(
          `**${r.agentId}** (${r.action}): ❌ Failed — ${r.error}\n`,
        );
      }
    }

    return parts.join("\n");
  }

  // ── Public Utilities ────────────────────────────────────────────────────

  /**
   * Get the catalog of agents available to the planner.
   * Useful for debugging and admin UIs.
   */
  getAgentCatalog(): typeof AGENT_CATALOG {
    return { ...AGENT_CATALOG };
  }

  /**
   * Register a new agent in the catalog at runtime.
   * This teaches the planner about a new agent without restarting.
   */
  registerAgentInCatalog(
    agentId: string,
    info: { taskType: TaskType; actions: string[]; description: string },
  ): void {
    (AGENT_CATALOG as any)[agentId] = info;
    this.emit("catalog_updated", { agentId, info });
  }
}
