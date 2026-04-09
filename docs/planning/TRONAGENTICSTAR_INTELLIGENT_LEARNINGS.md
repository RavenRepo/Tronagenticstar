# 🧠 TRONAGENTICSTAR INTELLIGENT LEARNINGS
## ClaudeTerminal Source Code Analysis

**Source:** /home/luciousfox/Projects/ClaudeTerminal/src/  
**Analysis Date:** 2026-04-02  
**Project:** Tronagenticstar-from-mint (Constella)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Tool System Architecture](#2-tool-system-architecture)
3. [Agent Orchestration](#3-agent-orchestration)
4. [Memory & Context Systems](#4-memory--context-systems)
5. [Hooks System](#5-hooks-system)
6. [Skills System](#6-skills-system)
7. [MCP Integration](#7-mcp-integration)
8. [Analytics & Observability](#8-analytics--observability)
9. [UI Components](#9-ui-components)
10. [Security Model](#10-security-model)
11. [Implementation Patterns](#11-implementation-patterns)

---

## 1. Executive Summary

ClaudeTerminal is an AI-native terminal application (Claude Code) with extremely sophisticated systems for:
- Multi-agent orchestration
- Tool execution with permissions
- Knowledge management
- Extensibility via hooks
- Enterprise analytics

These learnings are extracted from **500,000+ lines** of TypeScript source code and will be integrated into Tronagenticstar.

---

## 2. Tool System Architecture

### 2.1 buildTool() Factory Pattern

```typescript
// Core factory at Tool.ts (line 783)
export function buildTool<ToolDef>(config: ToolDef): Tool {
  // Applies sensible defaults
  // Enforces consistent tool interface
  // Provides permission defaults (fail-closed)
  // Type-safe via Zod v4 schemas
}
```

### 2.2 Tool Permission Modes

```typescript
enum PermissionMode {
  // External modes
  'acceptEdits' = 'acceptEdits',      // Auto-accept file edits
  'bypassPermissions' = 'bypassPermissions', // Skip all checks
  'default' = 'default',              // Standard prompts
  'dontAsk' = 'dontAsk',              // Silent denial
  'plan' = 'plan',                   // Plan mode only
  
  // Internal modes  
  'auto' = 'auto',                   // Auto-approve safe actions
  'bubble' = 'bubble'                // Bubble up decisions
}

enum PermissionBehavior {
  'allow' = 'allow',
  'deny' = 'deny', 
  'ask' = 'ask'
}
```

### 2.3 Execution Pipeline

```
validateInput()
    │
    ├──► Speculative Classifier (YOLO bash check)
    │
    ├──► Backfill (pre-fetch data)
    │
    ├──► Pre-Tool Hooks (PreToolUse)
    │
    ├──► Permission Check (match rules)
    │
    ├──► Tool Call (execute)
    │
    └──► Post-Tool Hooks (PostToolUse)
```

### 2.4 Key Tool Implementations

| Tool | Lines | Key Features |
|------|-------|---------------|
| **FileReadTool** | 1183 | Deduplication, skill discovery, PDF/image/notebook support |
| **FileWriteTool** | 434 | Atomic write, LSP notify, git diff |
| **FileEditTool** | 625 | Quote preservation, patch generation |
| **GlobTool** | 198 | VCS exclusions, relativization |
| **GrepTool** | 577 | Multiline, column limits |
| **MCPTool** | Dynamic | Transport abstraction, tool proxying |
| **LSPTool** | 860 | 8 operations (definition, references, hover, etc.) |
| **BashTool** | Sandboxed | Docker ephemeral execution |

### 2.5 Zod Schema Pattern

```typescript
// Lazy-loaded schemas for performance
const inputSchema = lazySchema(() => z.strictObject({
  file_path: z.string(),
  offset: z.number().optional(),
  limit: z.number().optional()
}))

const outputSchema = lazySchema(() => z.object({
  text: z.string().optional(),
  image: z.string().optional(),
  notebook: z.string().optional()
}))
```

---

## 3. Agent Orchestration

### 3.1 Agent Types

```typescript
enum AgentType {
  'generalPurpose' = 'generalPurpose',  // Research, complex questions
  'explore' = 'explore',                 // Fast READ-ONLY file search
  'plan' = 'plan',                       // Architecture + planning
  'verification' = 'verification'        // Adversarial testing
}
```

### 3.2 Agent Definition Schema

```typescript
interface AgentDefinition {
  agentType: string
  whenToUse: string
  tools?: string[]           // ['*'] = all tools
  disallowedTools?: string[]
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit'
  permissionMode?: PermissionMode
  mcpServers?: AgentMcpServerSpec[]
  hooks?: HooksSettings
  maxTurns?: number
  background?: boolean
  memory?: 'user' | 'project' | 'local'
  isolation?: 'worktree' | 'remote'
  omitClaudeMd?: boolean
}
```

### 3.3 Execution Flow

```
handleRequest(task)
    │
    ├──► Resolve Agent Type (subagent_type or FORK_AGENT)
    │
    ├──► Validate MCP Requirements (poll 30s)
    │
    ├──► Determine Mode (sync vs async)
    │
    ├──► Build Context (system prompt, messages, tool pool)
    │
    ├──► Setup Isolation (worktree/remote if requested)
    │
    └──► Execute (runAgent or runAsyncAgentLifecycle)
```

### 3.4 Fork Subagents (Context Inheritance)

```typescript
// Omit subagent_type when fork enabled:
// - Inherits parent's full conversation context
// - Shares prompt cache with parent
// - Uses parent's exact tool definitions
// - Cannot fork recursively (guard at call time)
```

### 3.5 Background Execution

```typescript
// runAsyncAgentLifecycle():
// 1. Register async task via registerAsyncAgent()
// 2. Start progress tracker
// 3. Enable summarization (optional)
// 4. Iterate messages -> update progress -> emit events
// 5. On completion: finalizeAgentTool() -> completeAsyncAgent()
// 6. On error: killAsyncAgent() -> enqueueNotification()
// 7. Cleanup: clear skills, clear dump state
```

---

## 4. Memory & Context Systems

### 4.1 Team Memory Sync

**Storage Structure:**
- Flat key-value: keys = relative file paths
- Per-entry SHA-256 checksums for delta
- Per-repo scope via Git remote hash
- Max file size: 250KB

**Sync Mechanism:**
```
Pull (server → local):
- Server content wins (overwrites local)
- ETag caching with If-None-Match
- Returns 304 if unchanged

Push (local → server):
- Delta upload (only changed hashes)
- Batch splitting under 200KB
- Optimistic locking (If-Match header)
- Conflict resolution on 412
```

### 4.2 Secret Scanner (Client-Side)

**50+ Patterns Detected:**
- Cloud: AWS, GCP, Azure, DigitalOcean
- AI APIs: Anthropic (sk-ant-*), OpenAI, HuggingFace
- GitHub: PAT, Fine-grained, OAuth, Refresh tokens
- Communication: Slack, Twilio, SendGrid
- Dev: NPM, PyPI, Databricks, HashiCorp
- Payment: Stripe, Shopify
- Crypto: Private keys (PEM)

**Runtime Guard:**
```typescript
// Called from FileWriteTool/FileEditTool validateInput
checkTeamMemSecrets(content: string): CheckResult {
  // Scans before write
  // Returns error with detected labels
  // Feature-gated with TEAMMEM flag
}
```

### 4.3 CLAUDE.md Context

```typescript
// context.ts - System context generation
// - Memoized git status
// - CLAUDE.md file reading
// - .claude/ directory scanning
// - Environment info
```

---

## 5. Hooks System

### 5.1 Event Types

```typescript
enum HookEvent {
  'PreToolUse' = 'PreToolUse',
  'PostToolUse' = 'PostToolUse',
  'PostToolUseFailure' = 'PostToolUseFailure',
  'UserPromptSubmit' = 'UserPromptSubmit',
  'SessionStart' = 'SessionStart',
  'Setup' = 'Setup',
  'SubagentStart' = 'SubagentStart',
  'PermissionDenied' = 'PermissionDenied',
  'Notification' = 'Notification',
  'PermissionRequest' = 'PermissionRequest',
  'Elicitation' = 'Elicitation',
  'ElicitationResult' = 'ElicitationResult',
  'CwdChanged' = 'CwdChanged',
  'FileChanged' = 'FileChanged',
  'WorktreeCreate' = 'WorktreeCreate'
}
```

### 5.2 Hook Callback Types

```typescript
interface HookCallback {
  type: 'callback'
  callback: (
    input: HookInput,
    toolUseID: string | null,
    abort: AbortSignal | undefined,
    hookIndex?: number,
    context?: HookCallbackContext
  ) => Promise<HookJSONOutput>
  timeout?: number
  internal?: boolean
}

interface HookResult {
  message?: Message
  systemMessage?: Message
  blockingError?: HookBlockingError
  outcome: 'success' | 'blocking' | 'non_blocking_error' | 'cancelled'
  preventContinuation?: boolean
  permissionBehavior?: 'ask' | 'deny' | 'allow' | 'passthrough'
  updatedInput?: Record<string, unknown>
  retry?: boolean
}
```

### 5.3 Hook Execution Pipeline

```typescript
async function executeHooks(event: HookEvent, input: HookInput) {
  // 1. Collect all hooks for event
  const hooks = getHooksForEvent(event)
  
  // 2. Execute in order (async)
  const results = await Promise.all(
    hooks.map(hook => executeHook(hook, input))
  )
  
  // 3. Aggregate results
  return aggregateResults(results)
}
```

---

## 6. Skills System

### 6.1 Bundled Skills (19 Total)

| Skill | Description | Enabled |
|-------|-------------|---------|
| `/batch` | Parallel work with 5-30 worktree agents | Always |
| `/debug` | Session debugging via log reading | Always |
| `/keybindings` | Display keyboard shortcuts | Always |
| `/lorem-ipsum` | Generate filler text | ants only |
| `/remember` | Auto-memory review and promotion | isAutoMemoryEnabled() |
| `/simplify` | Simplify code changes | Always |
| `/skillify` | Convert prompt to skill | Always |
| `/stuck` | Help when stuck | Always |
| `/update-config` | Update settings | Always |
| `/verify` | Verify code changes | ants only |
| `/claude-in-chrome` | Chrome extension | shouldAutoEnable() |
| `/loop` | Cron-based triggers | AGENT_TRIGGERS |
| `/schedule-remote-agents` | Remote scheduling | AGENT_TRIGGERS_REMOTE |
| `/claude-api` | Claude Apps API | BUILDING_CLAUDE_APPS |
| `/dream` | Dream mode | KAIROS |
| `/hunter` | Review artifacts | REVIEW_ARTIFACT |
| `/run-skill-generator` | Generate skills | RUN_SKILL_GENERATOR |

### 6.2 Skill Definition Type

```typescript
type BundledSkillDefinition = {
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  isEnabled?: () => boolean
  hooks?: HooksSettings
  context?: 'inline' | 'fork'
  agent?: string
  files?: Record<string, string>
  getPromptForCommand: (args: string, context: ToolUseContext) => Promise<ContentBlockParam[]>
}
```

### 6.3 Multi-Source Loading

```typescript
// Priority order:
// 1. policySettings - ~/.claude/.claude/skills/
// 2. userSettings - ~/.claude/skills/
// 3. projectSettings - .claude/skills/
// 4. mcp - Dynamic from MCP servers
// 5. bundled - Compiled in CLI
// 6. commands_DEPRECATED - Legacy format
```

---

## 7. MCP Integration

### 7.1 Transport Types

```typescript
enum MCPTransportType {
  'stdio' = 'stdio',           // Local subprocess
  'sse' = 'sse',               // Server-Sent Events
  'sse-ide' = 'sse-ide',       // IDE extension (SSE)
  'http' = 'http',             // Streamable HTTP
  'ws' = 'ws',                 // WebSocket
  'ws-ide' = 'ws-ide',         // IDE extension (WS)
  'sdk' = 'sdk',               // In-process SDK
  'claudeai-proxy' = 'claudeai-proxy'  // Claude.ai hosted
}
```

### 7.2 Connection Lifecycle

```
State Machine:
- pending → Attempting connection
- connected → Successfully connected
- failed → Connection failed
- needs-auth → Requires authentication
- disabled → User-disabled

Reconnection Strategy:
- Exponential backoff: 1s → 2s → 4s → ... max 30s
- Max 5 retry attempts
- Automatic for remote transports
- Manual toggle for local stdio
```

### 7.3 OAuth Flow

```typescript
// Dynamic Client Registration (DCR)
// Authorization code flow with PKCE
// Token refresh with automatic retry
// Cross-App Access (XAA) for enterprise SSO
// IdP token caching for SSO sessions
```

### 7.4 Tool Naming Convention

```typescript
// mcp__<normalized_server>__<tool_name>
// Example: mcp__slack__send_message

// Normalization: ^[a-zA-Z0-9_-]{1,64}$
```

---

## 8. Analytics & Observability

### 8.1 Multi-Sink Architecture

```
logEvent()
    │
    ▼
┌─────────────┐
│  sink.ts    │  ← Routes events, handles sampling, killswitches
└──────┬──────┘
       │
       ▼
┌──────────────┐         ┌─────────────────┐
│   Datadog    │         │ First-Party     │
│  (US5)       │         │ (BigQuery)     │
└──────────────┘         └─────────────────┘
                                  │
                                  ▼
                        firstPartyEventLoggingExporter.ts
                        (Disk-backed retry)
```

### 8.2 GrowthBook Integration

```typescript
// Features:
// - Remote evaluation with disk cache fallback
// - User attributes: id, sessionId, deviceID, platform, etc.
// - Multiple getter methods:
//   - getFeatureValue_CACHED_MAY_BE_STALE()
//   - checkGate_CACHED_OR_BLOCKING()
//   - getDynamicConfig_CACHED_MAY_BE_STALE()
// - Periodic refresh: 20 min (ants) / 6 hours (external)
```

### 8.3 Event Metadata

```typescript
interface EventMetadata {
  // Core
  model: string
  sessionId: string
  userType: string
  betas: string[]
  isInteractive: boolean
  clientType: string
  
  // Environment
  platform: string
  arch: string
  nodeVersion: string
  terminal: string
  isRunningWithBun: boolean
  isCi: boolean
  
  // Agent/Swarm
  agentId?: string
  parentSessionId?: string
  agentType?: string
  teamName?: string
}
```

### 8.4 Killswitch System

```typescript
// config: tengu_frond_boric (JSON)
// { datadog?: boolean, firstParty?: boolean }
// Fail-open: missing config = sink stays enabled
```

---

## 9. UI Components

### 9.1 Ink Framework (React for Terminal)

```typescript
// Core components:
// - Box, Text, Button, Link, RawAnsi, ScrollBox
// - useInput, useTerminalFocus, useTerminalViewport, useSelection
// - 60fps render loop with throttled updates

// Screen buffer:
// - Packed cells (2 Int32 per cell)
// - Zero GC pressure
// - Double-buffered rendering
```

### 9.2 Companion System

```typescript
// Deterministic generation:
// mulberry32 PRNG seeded with hash(userId + SALT)
// Bones regenerate from hash; soul persists in config

// Rarity System:
// - common: 60%
// - uncommon: 25%  
// - rare: 10%
// - epic: 4%
// - legendary: 1%
// - shiny: 1%

// Species (18):
// duck, goose, blob, cat, dragon, octopus, owl, penguin,
// turtle, snail, ghost, axolotl, capybara, cactus, 
// robot, rabbit, mushroom, chonk

// Animation:
// - 3 frames per species for fidget
// - Idle: mostly frame 0, occasional 1-2
// - Excited: cycles all frames fast (500ms tick)
```

---

## 10. Security Model

### 10.1 Permission Architecture

```typescript
// Read-before-write requirement:
// - FileWriteTool requires prior FileReadTool
// - FileEditTool requires file exists

// Staleness detection:
// - mtime comparison
// - Content hash fallback

// Path handling:
// - expandPath() for absolute normalization
// - toRelativePath() for token savings
// - UNC path blocking
// - Device file blocking (/dev/zero, etc.)
```

### 10.2 Bash Security (YOLO Classifier)

```typescript
interface YoloClassifierResult {
  thinking?: string
  shouldBlock: boolean
  reason: string
  model: string
  usage?: ClassifierUsage
  durationMs?: number
  stage?: 'fast' | 'thinking'
}
```

### 10.3 MCP Authentication

```typescript
// OAuth flow:
// - 401 errors trigger needs-auth state
// - 15-minute cache to avoid re-probing
// - MCP auth tool exposed for user re-authentication
```

---

## 11. Implementation Patterns

### 11.1 Feature Flags with DCE

```typescript
// Conditional import
const voiceNs = feature('VOICE_MODE') 
  ? require('./useVoice.js') 
  : { ... }

// Conditional hook
const voiceEnabled = feature('VOICE_MODE') 
  ? useVoiceEnabled() 
  : false

// bun:bundle for compile-time elimination
```

### 11.2 AppState Integration

```typescript
// Custom store (observer pattern):
type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: Listener) => () => void
}

// useSyncExternalStore for React 18
export function useAppState<T>(selector: (state: AppState) => T): T
```

### 11.3 Memoization Pattern

```typescript
// lodash-es/memoize for expensive operations
const getCachedBranch = memoize(
  () => readGitBranch(),
  () => getCwd()
)

// 3-state cache pattern:
// undefined = needs disk check
// null = no files
// string = cached value
```

### 11.4 Error Handling

```typescript
// Circuit breaker:
interface CircuitBreaker {
  failureThreshold: number  // 3 failures
  recoveryTimeout: number  // 60 seconds
  state: 'closed' | 'open' | 'half-open'
}

// Error classification:
type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low'
```

---

## Summary: Features to Integrate

| # | Feature | Complexity | Priority |
|---|---------|------------|----------|
| 1 | Tool System 2.0 (Zod + Permissions) | High | P0 |
| 2 | Hooks System | High | P0 |
| 3 | Agent Orchestration 2.0 | Medium | P1 |
| 4 | Team Memory + Secret Scanner | Medium | P1 |
| 5 | Skills System | Medium | P2 |
| 6 | MCP Integration | Medium | P2 |
| 7 | Companion System | Low | P3 |
| 8 | Analytics Stack | Low | P3 |

---

*Document Version: 1.0*  
*Source: ClaudeTerminal /home/luciousfox/Projects/ClaudeTerminal/src/*  
*Last Updated: 2026-04-02*
