export enum AgentType {
  GENERAL_PURPOSE = "generalPurpose",
  EXPLORE = "explore",
  PLAN = "plan",
  VERIFICATION = "verification",
}

export type ModelSize = "sonnet" | "opus" | "haiku" | "inherit";

export type PermissionMode = "allowed" | "denied";

export type MemoryScope = "user" | "project" | "local";

export type IsolationMode = "worktree" | "remote";

export interface AgentHooks {
  onStart?: (agentId: string) => void | Promise<void>;
  onEnd?: (agentId: string, result: unknown) => void | Promise<void>;
  onError?: (agentId: string, error: Error) => void | Promise<void>;
}

import { MCPTransportType } from "./mcpClient.js";

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: MCPTransportType;
}

export interface AgentDefinition {
  agentType: AgentType;
  whenToUse: string;
  tools: string[];
  disallowedTools: string[];
  model: ModelSize;
  permissionMode: PermissionMode;
  mcpServers?: MCPServerConfig[];
  hooks?: AgentHooks;
  maxTurns?: number;
  background?: boolean;
  memory?: MemoryScope;
  isolation?: IsolationMode;
  omitClaudeMd?: boolean;
  omitGitStatus?: boolean;
  async?: boolean;
}

export interface ToolInfo {
  name: string;
  description?: string;
  isAsyncOnly?: boolean;
}

const EXPLORE_DISALLOWED_TOOLS = [
  "Agent",
  "ExitPlanMode",
  "FileEdit",
  "FileWrite",
  "NotebookEdit",
];

const VERIFICATION_DISALLOWED_TOOLS = [
  "ExitPlanMode",
  "Exit",
];

export const generalPurposeConfig: AgentDefinition = {
  agentType: AgentType.GENERAL_PURPOSE,
  whenToUse: "Research, complex tasks, general problem solving",
  tools: ["*"],
  disallowedTools: [],
  model: "inherit",
  permissionMode: "denied",
  maxTurns: 100,
  background: false,
  memory: "local",
  omitClaudeMd: false,
  omitGitStatus: false,
  async: false,
};

export const exploreConfig: AgentDefinition = {
  agentType: AgentType.EXPLORE,
  whenToUse: "Fast READ-ONLY file search, code exploration, understanding codebase",
  tools: ["*"],
  disallowedTools: EXPLORE_DISALLOWED_TOOLS,
  model: "haiku",
  permissionMode: "denied",
  maxTurns: 50,
  background: false,
  memory: "local",
  omitClaudeMd: true,
  omitGitStatus: true,
  async: false,
};

export const planConfig: AgentDefinition = {
  agentType: AgentType.PLAN,
  whenToUse: "Architecture design, implementation planning, step-by-step strategy",
  tools: ["*"],
  disallowedTools: [...EXPLORE_DISALLOWED_TOOLS, ...VERIFICATION_DISALLOWED_TOOLS],
  model: "sonnet",
  permissionMode: "denied",
  maxTurns: 75,
  background: false,
  memory: "project",
  omitClaudeMd: false,
  omitGitStatus: false,
  async: false,
};

export const verificationConfig: AgentDefinition = {
  agentType: AgentType.VERIFICATION,
  whenToUse: "Adversarial testing, code review, finding bugs and edge cases",
  tools: ["*"],
  disallowedTools: VERIFICATION_DISALLOWED_TOOLS,
  model: "opus",
  permissionMode: "denied",
  maxTurns: 60,
  background: true,
  memory: "project",
  omitClaudeMd: false,
  omitGitStatus: false,
  async: true,
};

const agentConfigs: Record<AgentType, AgentDefinition> = {
  [AgentType.GENERAL_PURPOSE]: generalPurposeConfig,
  [AgentType.EXPLORE]: exploreConfig,
  [AgentType.PLAN]: planConfig,
  [AgentType.VERIFICATION]: verificationConfig,
};

export function getAgentConfig(type: AgentType): AgentDefinition {
  const config = agentConfigs[type];
  if (!config) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return { ...config };
}

export function getAgentConfigUnsafe(type: string): AgentDefinition | undefined {
  return agentConfigs[type as AgentType];
}

export function isAgentTypeAvailable(type: AgentType): boolean {
  return type in AgentType && !!agentConfigs[type];
}

export function createAgentDefinition(
  type: AgentType,
  overrides?: Partial<AgentDefinition>,
): AgentDefinition {
  const defaultConfig = getAgentConfig(type);
  return {
    ...defaultConfig,
    ...overrides,
    tools: overrides?.tools ?? defaultConfig.tools,
    disallowedTools: overrides?.disallowedTools ?? defaultConfig.disallowedTools,
  };
}

export function expandToolWildcards(
  tools: string[],
  availableTools: string[],
): string[] {
  if (tools.includes("*")) {
    return [...availableTools];
  }
  return tools;
}

export function filterToolsForAgent(
  agentDef: AgentDefinition,
  availableTools: ToolInfo[],
): string[] {
  const expandedTools = expandToolWildcards(agentDef.tools, availableTools.map(t => t.name));

  const asyncOnlyTools = availableTools
    .filter(t => t.isAsyncOnly && agentDef.async !== true)
    .map(t => t.name);

  const filtered = expandedTools.filter(tool => {
    if (agentDef.disallowedTools.includes(tool)) {
      return false;
    }
    if (asyncOnlyTools.includes(tool)) {
      return false;
    }
    return true;
  });

  return filtered;
}

export function getDefaultModelForType(type: AgentType): ModelSize {
  return agentConfigs[type]?.model ?? "inherit";
}

export function isAsyncAgent(type: AgentType): boolean {
  return agentConfigs[type]?.async ?? false;
}