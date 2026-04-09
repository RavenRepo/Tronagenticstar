import { Tool, ToolCallContext, ToolCallResult, PermissionMode, PermissionBehavior } from "./toolFactory.js";

export { PermissionMode, PermissionBehavior };

export type {
  Tool,
  ToolCallContext,
  ToolCallResult,
};

export interface AdditionalWorkingDirectory {
  path: string;
  allowedPatterns?: string[];
}

export interface PermissionRule {
  source: "userSettings" | "projectSettings" | "localSettings" | "flagSettings" | "policySettings";
  behavior: PermissionBehavior;
  toolName: string;
  ruleContent?: string;
}

export interface ToolPermissionContext {
  mode: PermissionMode;
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>;
  alwaysAllowRules: Map<string, PermissionRule[]>;
  alwaysDenyRules: Map<string, PermissionRule[]>;
  alwaysAskRules: Map<string, PermissionRule[]>;
  isBypassPermissionsModeAvailable: boolean;
}

export type PermissionDecision =
  | PermissionAllowDecision
  | PermissionAskDecision
  | PermissionDenyDecision;

export interface PermissionAllowDecision {
  behavior: "allow";
  updatedInput?: unknown;
  userModified?: boolean;
}

export interface PermissionAskDecision {
  behavior: "ask";
  message: string;
  suggestions?: string[];
}

export interface PermissionDenyDecision {
  behavior: "deny";
  message: string;
}

export interface InputClassification {
  isReadOperation: boolean;
  isWriteOperation: boolean;
  isFileOperation: boolean;
  isNetworkOperation: boolean;
  isSystemOperation: boolean;
  isDangerousOperation: boolean;
  matchedPattern?: string;
}

export type PipelineStage = 
  | "validate" 
  | "classifier" 
  | "backfill" 
  | "preHooks" 
  | "permission" 
  | "tool" 
  | "postHooks"
  | "complete";

export interface PipelineContext {
  currentStage: PipelineStage | `preHooks:${string}` | `postHooks:${string}`;
  previousStage?: PipelineStage;
  stageResults: Map<string, unknown>;
  startTime: number;
}

export interface ToolHook {
  name: string;
  stage: PipelineStage;
  handler: (input: unknown, context: PipelineContext) => Promise<unknown>;
  priority?: number;
}

export interface BackfillResult {
  field: string;
  value: unknown;
  source: string;
}

function classifyInput(tool: Tool, input: unknown): InputClassification {
  const inputObj = input as Record<string, unknown> | null;
  const toolName = tool.name.toLowerCase();

  const isReadOperation = tool.isReadOnly || 
    toolName.includes("read") || 
    toolName.includes("get") || 
    toolName.includes("list") ||
    toolName.includes("search") ||
    toolName.includes("query");

  const isWriteOperation = !tool.isReadOnly &&
    (toolName.includes("write") || 
     toolName.includes("edit") || 
     toolName.includes("create") ||
     toolName.includes("delete") ||
     toolName.includes("update") ||
     toolName.includes("execute") ||
     toolName.includes("run"));

  const isFileOperation = 
    toolName.includes("file") ||
    toolName.includes("read_file") ||
    toolName.includes("write_file") ||
    toolName.includes("edit_file") ||
    toolName.includes("glob") ||
    toolName.includes("search_files");

  const isNetworkOperation = 
    toolName.includes("http") ||
    toolName.includes("fetch") ||
    toolName.includes("request") ||
    toolName.includes("api") ||
    toolName.includes("url");

  const isSystemOperation = 
    toolName.includes("system") ||
    toolName.includes("shell") ||
    toolName.includes("exec") ||
    toolName.includes("command") ||
    toolName.includes("bash");

  const isDangerousOperation = 
    isSystemOperation ||
    (isFileOperation && isWriteOperation && inputObj?.path === "/") ||
    (isNetworkOperation && isWriteOperation);

  return {
    isReadOperation,
    isWriteOperation,
    isFileOperation,
    isNetworkOperation,
    isSystemOperation,
    isDangerousOperation,
  };
}

function matchGlobPattern(pattern: string, value: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  
  try {
    return new RegExp(`^${regexPattern}$`).test(value);
  } catch {
    return false;
  }
}

function matchingRuleForInput(
  rules: PermissionRule[],
  input: unknown,
): PermissionRule | undefined {
  if (!rules || rules.length === 0) {
    return undefined;
  }

  const inputObj = input as Record<string, unknown>;
  
  for (const rule of rules) {
    if (!rule.ruleContent) {
      return rule;
    }

    const inputStr = typeof input === "string" ? input : JSON.stringify(input);
    const toolName = inputObj?.toolName as string | undefined;

    if (toolName && matchGlobPattern(rule.ruleContent, toolName)) {
      return rule;
    }

    if (matchGlobPattern(rule.ruleContent, inputStr)) {
      return rule;
    }

    if (inputObj?.path && matchGlobPattern(rule.ruleContent, inputObj.path as string)) {
      return rule;
    }

    if (inputObj?.command && matchGlobPattern(rule.ruleContent, inputObj.command as string)) {
      return rule;
    }
  }

  return undefined;
}

function applyRuleBehavior(
  rule: PermissionRule,
  input: unknown,
  classification: InputClassification,
): PermissionDecision {
  switch (rule.behavior) {
    case PermissionBehavior.ALLOW:
      return {
        behavior: "allow",
        userModified: false,
      };

    case PermissionBehavior.DENY:
      return {
        behavior: "deny",
        message: `Operation denied by rule: ${rule.source}`,
      };

    case PermissionBehavior.ASK:
      const suggestions: string[] = [];
      
      if (classification.isFileOperation) {
        suggestions.push("Allow read-only access");
        suggestions.push("Allow specific file paths only");
      }
      if (classification.isNetworkOperation) {
        suggestions.push("Allow localhost only");
        suggestions.push("Allow specific domains only");
      }
      if (classification.isSystemOperation) {
        suggestions.push("Allow read-only system commands");
      }

      return {
        behavior: "ask",
        message: `Permission check required for: ${rule.toolName}`,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      };

    default:
      return {
        behavior: "deny",
        message: `Unknown permission behavior: ${rule.behavior}`,
      };
  }
}

function checkPermissionWithRules(
  tool: Tool,
  input: unknown,
  context: ToolPermissionContext,
  classification: InputClassification,
  isWriteOperation: boolean,
): PermissionDecision {
  const toolName = tool.name;

  const alwaysDenyRules = context.alwaysDenyRules.get(toolName) ?? [];
  const denyRule = matchingRuleForInput(alwaysDenyRules, input);
  if (denyRule) {
    return applyRuleBehavior(denyRule, input, classification);
  }

  const alwaysAllowRules = context.alwaysAllowRules.get(toolName) ?? [];
  const allowRule = matchingRuleForInput(alwaysAllowRules, input);
  if (allowRule) {
    return applyRuleBehavior(allowRule, input, classification);
  }

  const alwaysAskRules = context.alwaysAskRules.get(toolName) ?? [];
  const askRule = matchingRuleForInput(alwaysAskRules, input);
  if (askRule) {
    return applyRuleBehavior(askRule, input, classification);
  }

  return { behavior: "deny", message: "No matching permission rule found" };
}

export function checkReadPermissionForTool(
  tool: Tool,
  input: unknown,
  context: ToolPermissionContext,
): PermissionDecision {
  if (context.mode === PermissionMode.BYPASS_PERMISSIONS && context.isBypassPermissionsModeAvailable) {
    return { behavior: "allow" };
  }

  if (context.mode === PermissionMode.DONT_ASK || context.mode === PermissionMode.PLAN) {
    return { behavior: "deny", message: `Permission denied in ${context.mode} mode` };
  }

  const classification = classifyInput(tool, input);

  const result = checkPermissionWithRules(tool, input, context, classification, classification.isReadOperation);
  
  if (result.behavior !== "deny") {
    return result;
  }

  if (context.mode === PermissionMode.AUTO && tool.isConcurrencySafe) {
    return { behavior: "allow" };
  }

  if (context.mode === PermissionMode.ACCEPT_EDITS && classification.isReadOperation) {
    return { behavior: "allow" };
  }

  return result;
}

export function checkWritePermissionForTool(
  tool: Tool,
  input: unknown,
  context: ToolPermissionContext,
): PermissionDecision {
  if (context.mode === PermissionMode.BYPASS_PERMISSIONS && context.isBypassPermissionsModeAvailable) {
    return { behavior: "allow" };
  }

  if (context.mode === PermissionMode.DONT_ASK || context.mode === PermissionMode.PLAN) {
    return { behavior: "deny", message: `Permission denied in ${context.mode} mode` };
  }

  const classification = classifyInput(tool, input);

  const result = checkPermissionWithRules(tool, input, context, classification, classification.isWriteOperation);
  
  if (result.behavior !== "deny") {
    return result;
  }

  if (context.mode === PermissionMode.ACCEPT_EDITS && !tool.isReadOnly) {
    return { behavior: "allow" };
  }

  if (classification.isDangerousOperation) {
    return {
      behavior: "deny",
      message: `Dangerous operation detected: ${classification.isSystemOperation ? "system command" : classification.isNetworkOperation ? "network request" : "file operation"}`,
    };
  }

  return result;
}

function validateInput(input: unknown, tool: Tool): unknown {
  try {
    return tool.validateInput(input);
  } catch (err) {
    throw new Error(`Input validation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function runClassifier(input: unknown, tool: Tool): InputClassification {
  return classifyInput(tool, input);
}

async function runBackfill(input: unknown, tool: Tool, context: ToolPermissionContext): Promise<unknown> {
  const inputObj = input as Record<string, unknown>;
  const toolName = tool.name;

  const additionalDirs = context.additionalWorkingDirectories;
  
  if (additionalDirs.size === 0) {
    return input;
  }

  const backfilledInput = { ...inputObj };

  const dirEntries = Array.from(additionalDirs.entries());
  for (const [dirKey, dirConfig] of dirEntries) {
    if (backfilledInput[dirKey] && dirConfig.allowedPatterns) {
      const value = backfilledInput[dirKey] as string;
      const isAllowed = dirConfig.allowedPatterns.some(pattern => 
        matchGlobPattern(pattern, value)
      );
      
      if (!isAllowed) {
        throw new Error(`Path "${value}" not allowed in working directory context`);
      }
    }
  }

  return backfilledInput;
}

function getHooksForStage(
  hooks: ToolHook[],
  stage: PipelineStage,
  tool: Tool,
): ToolHook[] {
  return hooks
    .filter(h => h.stage === stage && (h.name === tool.name || h.name === "*"))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export async function executeToolPipeline(
  tool: Tool,
  input: unknown,
  context: ToolPermissionContext,
  hooks: ToolHook[] = [],
): Promise<ToolCallResult> {
  const pipelineContext: PipelineContext = {
    currentStage: "validate",
    stageResults: new Map(),
    startTime: Date.now(),
  };

  try {
    const validatedInput = validateInput(input, tool);
    pipelineContext.stageResults.set("validate", validatedInput);

    pipelineContext.currentStage = "classifier";
    const classification = runClassifier(validatedInput, tool);
    pipelineContext.stageResults.set("classifier", classification);

    pipelineContext.currentStage = "backfill";
    const backfilledInput = await runBackfill(validatedInput, tool, context);
    pipelineContext.stageResults.set("backfill", backfilledInput);

    const preHooks = getHooksForStage(hooks, "preHooks", tool);
    let processedInput = backfilledInput;
    
    for (const hook of preHooks) {
      pipelineContext.currentStage = `preHooks:${hook.name}`;
      processedInput = await hook.handler(processedInput, pipelineContext) as typeof processedInput;
    }
    pipelineContext.stageResults.set("preHooks", processedInput);

    pipelineContext.currentStage = "permission";
    const classificationForPermission = classification;
    const isWriteOp = classificationForPermission.isWriteOperation;
    
    const permissionDecision = isWriteOp
      ? checkWritePermissionForTool(tool, processedInput, context)
      : checkReadPermissionForTool(tool, processedInput, context);

    pipelineContext.stageResults.set("permission", permissionDecision);

    if (permissionDecision.behavior === "deny") {
      return {
        success: false,
        error: permissionDecision.message,
        executionTimeMs: Date.now() - pipelineContext.startTime,
      };
    }

    if (permissionDecision.behavior === "ask") {
      return {
        success: false,
        error: `Permission required: ${permissionDecision.message}`,
        executionTimeMs: Date.now() - pipelineContext.startTime,
      };
    }

    const finalInput = permissionDecision.updatedInput ?? processedInput;

    pipelineContext.currentStage = "tool";
    const toolContext: ToolCallContext = {
      agentId: "pipeline",
      permissionMode: context.mode,
    };

    const toolResult = await tool.call(finalInput as any, toolContext);
    pipelineContext.stageResults.set("tool", toolResult);

    const postHooks = getHooksForStage(hooks, "postHooks", tool);
    let processedResult = toolResult;
    
    for (const hook of postHooks) {
      pipelineContext.currentStage = `postHooks:${hook.name}`;
      processedResult = await hook.handler(processedResult, pipelineContext) as typeof processedResult;
    }
    pipelineContext.stageResults.set("postHooks", processedResult);

    pipelineContext.currentStage = "complete";

    return {
      ...processedResult,
      executionTimeMs: Date.now() - pipelineContext.startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: `Pipeline execution failed: ${err instanceof Error ? err.message : String(err)}`,
      executionTimeMs: Date.now() - pipelineContext.startTime,
    };
  }
}

export interface ToolPartition {
  concurrent: Tool[];
  sequential: Tool[];
}

export function partitionToolsByConcurrency(tools: Tool[]): ToolPartition {
  const concurrent: Tool[] = [];
  const sequential: Tool[] = [];

  for (const tool of tools) {
    if (tool.isConcurrencySafe) {
      concurrent.push(tool);
    } else {
      sequential.push(tool);
    }
  }

  return { concurrent, sequential };
}

export function createDefaultPermissionContext(): ToolPermissionContext {
  return {
    mode: PermissionMode.DEFAULT,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: new Map(),
    alwaysDenyRules: new Map(),
    alwaysAskRules: new Map(),
    isBypassPermissionsModeAvailable: false,
  };
}

export function createToolPermissionContext(
  mode: PermissionMode,
  options?: Partial<Omit<ToolPermissionContext, "mode">>,
): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: options?.additionalWorkingDirectories ?? new Map(),
    alwaysAllowRules: options?.alwaysAllowRules ?? new Map(),
    alwaysDenyRules: options?.alwaysDenyRules ?? new Map(),
    alwaysAskRules: options?.alwaysAskRules ?? new Map(),
    isBypassPermissionsModeAvailable: options?.isBypassPermissionsModeAvailable ?? false,
  };
}

export function addPermissionRule(
  context: ToolPermissionContext,
  rule: PermissionRule,
): void {
  let targetMap: Map<string, PermissionRule[]>;
  switch (rule.behavior) {
    case PermissionBehavior.ALLOW:
      targetMap = context.alwaysAllowRules;
      break;
    case PermissionBehavior.DENY:
      targetMap = context.alwaysDenyRules;
      break;
    case PermissionBehavior.ASK:
      targetMap = context.alwaysAskRules;
      break;
    default:
      return;
  }

  const existing = targetMap.get(rule.toolName) ?? [];
  existing.push(rule);
  targetMap.set(rule.toolName, existing);
}

export {
  classifyInput,
  matchingRuleForInput,
  matchGlobPattern,
  validateInput,
  runClassifier,
  runBackfill,
  getHooksForStage,
};