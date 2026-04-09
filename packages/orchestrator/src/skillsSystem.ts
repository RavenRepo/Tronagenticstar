export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image" | "input" | "thinking" | "redacted";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  thinking?: string;
  [key: string]: unknown;
}

export interface ToolUseContext {
  sessionId?: string;
  agentId?: string;
  messages: ContentBlock[];
  userMessage?: string;
  cwd?: string;
  [key: string]: unknown;
}

export type SkillModel = "sonnet" | "opus" | "haiku" | "inherit";

export interface SkillDefinition {
  name: string;
  description: string;
  aliases?: string[];
  whenToUse?: string;
  argumentHint?: string;
  allowedTools?: string[];
  model?: SkillModel;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  isEnabled?: () => boolean;
  context?: "inline" | "fork";
  agent?: string;
  files?: Record<string, string>;
  getPromptForCommand: (args: string, context: ToolUseContext) => Promise<ContentBlock[]>;
}

export interface SkillsConfig {
  policySettingsPath?: string;
  userSettingsPath?: string;
  projectSettingsPath?: string;
  isAutoMemoryEnabled?: () => boolean;
  BUILDING_CLAUDE_APPS?: boolean;
  AGENT_TRIGGERS?: boolean;
  AGENT_TRIGGERS_REMOTE?: boolean;
  KAIROS?: boolean;
  REVIEW_ARTIFACT?: boolean;
  RUN_SKILL_GENERATOR?: boolean;
  shouldAutoEnable?: () => boolean;
}

type SkillLoader = (config: SkillsConfig) => Promise<SkillDefinition[]>;

class SkillsRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private aliases: Map<string, string> = new Map();

  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
    if (skill.aliases) {
      for (const alias of skill.aliases) {
        this.aliases.set(alias, skill.name);
      }
    }
  }

  unregisterSkill(name: string): void {
    const skill = this.skills.get(name);
    if (skill?.aliases) {
      for (const alias of skill.aliases) {
        this.aliases.delete(alias);
      }
    }
    this.skills.delete(name);
  }

  getSkill(name: string): SkillDefinition | null {
    const resolved = this.aliases.get(name) ?? name;
    return this.skills.get(resolved) ?? null;
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getEnabledSkills(): SkillDefinition[] {
    return Array.from(this.skills.values()).filter((skill) => {
      if (!skill.isEnabled) return true;
      return skill.isEnabled();
    });
  }
}

const globalSkillsRegistry = new SkillsRegistry();

export function getSkillsRegistry(): SkillsRegistry {
  return globalSkillsRegistry;
}

async function loadBundledSkills(config: SkillsConfig): Promise<SkillDefinition[]> {
  const alwaysEnabled = () => true;
  const isAutoMemoryEnabled = config.isAutoMemoryEnabled ?? (() => false);
  const shouldAutoEnable = config.shouldAutoEnable ?? (() => false);

  const skills: SkillDefinition[] = [
    {
      name: "/batch",
      description: "Parallel work with 5-30 worktree agents",
      aliases: ["batch"],
      whenToUse: "When you need to run multiple agents in parallel to speed up work",
      argumentHint: "<description> [numAgents=5]",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Run batch: ${args}` }];
      },
    },
    {
      name: "/debug",
      description: "Session debugging via log reading",
      aliases: ["debug"],
      whenToUse: "When debugging session issues or reading logs",
      argumentHint: "[logType=errors]",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Debug session: ${args}` }];
      },
    },
    {
      name: "/keybindings",
      description: "Display keyboard shortcuts",
      aliases: ["keybindings", "shortcuts"],
      whenToUse: "When user wants to see available keyboard shortcuts",
      argumentHint: "",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (_args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: "Show keybindings" }];
      },
    },
    {
      name: "/lorem-ipsum",
      description: "Generate filler text",
      aliases: ["lorem"],
      whenToUse: "When generating placeholder text",
      argumentHint: "[paragraphs=3]",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Generate lorem ipsum: ${args}` }];
      },
    },
    {
      name: "/remember",
      description: "Auto-memory review and promotion",
      aliases: ["remember"],
      whenToUse: "When reviewing and promoting auto-memory entries",
      argumentHint: "",
      userInvocable: true,
      isEnabled: isAutoMemoryEnabled,
      getPromptForCommand: async (_args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: "Review auto-memory" }];
      },
    },
    {
      name: "/simplify",
      description: "Simplify code changes",
      aliases: ["simplify"],
      whenToUse: "When simplifying or refactoring code",
      argumentHint: "<file> [target=current]",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Simplify code: ${args}` }];
      },
    },
    {
      name: "/skillify",
      description: "Convert prompt to skill",
      aliases: ["skillify"],
      whenToUse: "When converting a prompt into a reusable skill",
      argumentHint: "<prompt>",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Create skill from: ${args}` }];
      },
    },
    {
      name: "/stuck",
      description: "Help when stuck",
      aliases: ["stuck"],
      whenToUse: "When you need help getting unstuck",
      argumentHint: "",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (_args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: "Get unstuck help" }];
      },
    },
    {
      name: "/update-config",
      description: "Update settings",
      aliases: ["update-config", "config"],
      whenToUse: "When updating user or project settings",
      argumentHint: "<key=value>",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Update config: ${args}` }];
      },
    },
    {
      name: "/verify",
      description: "Verify code changes",
      aliases: ["verify"],
      whenToUse: "When verifying code changes or running tests",
      argumentHint: "<target>",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Verify: ${args}` }];
      },
    },
    {
      name: "/claude-in-chrome",
      description: "Chrome extension integration",
      aliases: ["chrome"],
      whenToUse: "When using Chrome extension features",
      argumentHint: "",
      userInvocable: true,
      isEnabled: shouldAutoEnable,
      getPromptForCommand: async (_args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: "Chrome extension mode" }];
      },
    },
    {
      name: "/loop",
      description: "Cron-based triggers for agent execution",
      aliases: ["loop"],
      whenToUse: "When setting up cron-based agent triggers",
      argumentHint: "<cron> <agent>",
      userInvocable: true,
      isEnabled: () => config.AGENT_TRIGGERS ?? false,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Setup loop: ${args}` }];
      },
    },
    {
      name: "/schedule-remote-agents",
      description: "Remote agent scheduling",
      aliases: ["schedule-remote"],
      whenToUse: "When scheduling remote agents",
      argumentHint: "<cron> <agent> <remote>",
      userInvocable: true,
      isEnabled: () => config.AGENT_TRIGGERS_REMOTE ?? false,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Schedule remote: ${args}` }];
      },
    },
    {
      name: "/claude-api",
      description: "Claude Apps API integration",
      aliases: ["claude-api"],
      whenToUse: "When building Claude Apps with API integration",
      argumentHint: "",
      userInvocable: true,
      isEnabled: () => config.BUILDING_CLAUDE_APPS ?? false,
      getPromptForCommand: async (_args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: "Claude API mode" }];
      },
    },
    {
      name: "/dream",
      description: "Dream mode exploration",
      aliases: ["dream"],
      whenToUse: "When in dream mode for creative exploration",
      argumentHint: "<prompt>",
      userInvocable: true,
      isEnabled: () => config.KAIROS ?? false,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Dream: ${args}` }];
      },
    },
    {
      name: "/hunter",
      description: "Review artifacts",
      aliases: ["hunter"],
      whenToUse: "When reviewing and hunting artifacts",
      argumentHint: "",
      userInvocable: true,
      isEnabled: () => config.REVIEW_ARTIFACT ?? false,
      getPromptForCommand: async (_args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: "Review artifacts" }];
      },
    },
    {
      name: "/run-skill-generator",
      description: "Generate new skills",
      aliases: ["skill-generator"],
      whenToUse: "When generating new skills",
      argumentHint: "<description>",
      userInvocable: true,
      isEnabled: () => config.RUN_SKILL_GENERATOR ?? false,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Generate skill: ${args}` }];
      },
    },
    {
      name: "/mcp-tools",
      description: "MCP tools integration",
      aliases: ["mcp"],
      whenToUse: "When using MCP server tools",
      argumentHint: "<server>",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Use MCP tools: ${args}` }];
      },
    },
    {
      name: "/agent-call",
      description: "Call another agent directly",
      aliases: ["call"],
      whenToUse: "When you need to call another agent for help",
      argumentHint: "<agent> <task>",
      userInvocable: true,
      isEnabled: alwaysEnabled,
      getPromptForCommand: async (args: string, _ctx: ToolUseContext) => {
        return [{ type: "text", text: `Call agent: ${args}` }];
      },
    },
  ];

  return skills;
}

async function loadFromSettings(
  _settingsPath: string
): Promise<SkillDefinition[]> {
  return [];
}

async function loadFromMCP(): Promise<SkillDefinition[]> {
  return [];
}

export async function initializeSkillsSystem(config: SkillsConfig): Promise<void> {
  const loaders: { source: string; loader: SkillLoader }[] = [
    { source: "policySettings", loader: (c) => loadFromSettings(c.policySettingsPath ?? "") },
    { source: "userSettings", loader: (c) => loadFromSettings(c.userSettingsPath ?? "") },
    { source: "projectSettings", loader: (c) => loadFromSettings(c.projectSettingsPath ?? "") },
    { source: "mcp", loader: loadFromMCP },
    { source: "bundled", loader: loadBundledSkills },
  ];

  for (const { source, loader } of loaders) {
    try {
      const skills = await loader(config);
      for (const skill of skills) {
        globalSkillsRegistry.registerSkill(skill);
      }
    } catch (error) {
      console.error(`Failed to load skills from ${source}:`, error);
    }
  }
}

export async function executeSkill(
  name: string,
  args: string,
  context: ToolUseContext
): Promise<ContentBlock[]> {
  const skill = globalSkillsRegistry.getSkill(name);
  if (!skill) {
    throw new Error(`Skill not found: ${name}`);
  }

  const enabled = skill.isEnabled?.() ?? true;
  if (!enabled) {
    throw new Error(`Skill is disabled: ${name}`);
  }

  return skill.getPromptForCommand(args, context);
}

export async function extractReferenceFiles(
  skill: SkillDefinition,
  targetDir: string
): Promise<void> {
  if (!skill.files) return;

  for (const [filename, content] of Object.entries(skill.files)) {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(targetDir, filename);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }
}

export type { SkillDefinition as BundledSkillDefinition };
