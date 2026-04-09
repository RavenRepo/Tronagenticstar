import type { SessionMessage } from "./types.js";

export interface HookMessage {
  type: "text" | "tool_use" | "tool_result" | "system";
  text?: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  content?: string;
  [key: string]: unknown;
}

export enum HookEvent {
  PreToolUse = "PreToolUse",
  PostToolUse = "PostToolUse",
  PostToolUseFailure = "PostToolUseFailure",
  UserPromptSubmit = "UserPromptSubmit",
  SessionStart = "SessionStart",
  Setup = "Setup",
  SubagentStart = "SubagentStart",
  PermissionDenied = "PermissionDenied",
  Notification = "Notification",
  PermissionRequest = "PermissionRequest",
  Elicitation = "Elicitation",
  ElicitationResult = "ElicitationResult",
  CwdChanged = "CwdChanged",
  FileChanged = "FileChanged",
  WorktreeCreate = "WorktreeCreate",
}

export interface HookInput {
  sessionId?: string;
  agentId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  userMessage?: string;
  messages?: HookMessage[];
  [key: string]: unknown;
}

export interface HookCallback {
  type: "callback";
  name: string;
  callback: (
    input: HookInput,
    toolUseID: string | null,
    abort?: AbortSignal
  ) => Promise<HookResult>;
  timeout?: number;
  internal?: boolean;
}

export interface HookResult {
  message?: HookMessage;
  systemMessage?: HookMessage;
  blockingError?: { blockingError: string; command: string };
  outcome: "success" | "blocking" | "non_blocking_error" | "cancelled";
  preventContinuation?: boolean;
  updatedInput?: Record<string, unknown>;
  permissionBehavior?: "ask" | "deny" | "allow" | "passthrough";
  retry?: boolean;
}

export interface AggregatedHookResult {
  results: HookResult[];
  shouldStop: boolean;
  finalOutcome: "success" | "blocking" | "non_blocking_error" | "cancelled";
  combinedMessage?: HookMessage;
  combinedSystemMessage?: HookMessage;
  combinedBlockingError?: { blockingError: string; command: string };
  shouldPreventContinuation?: boolean;
  updatedInput?: Record<string, unknown>;
  permissionBehavior?: "ask" | "deny" | "allow" | "passthrough";
}

export class HooksManager {
  private hooks: Map<HookEvent, HookCallback[]> = new Map();

  registerHook(event: HookEvent, callback: HookCallback): void {
    const existing = this.hooks.get(event) || [];
    const filtered = existing.filter((h) => h.name !== callback.name);
    filtered.push(callback);
    this.hooks.set(event, filtered);
  }

  unregisterHook(event: HookEvent, name: string): void {
    const existing = this.hooks.get(event) || [];
    this.hooks.set(
      event,
      existing.filter((h) => h.name !== name)
    );
  }

  getHooks(event: HookEvent): HookCallback[] {
    return this.hooks.get(event) || [];
  }

  async executeHooks(
    event: HookEvent,
    input: HookInput
  ): Promise<AggregatedHookResult> {
    const callbacks = this.getHooks(event);
    const results: HookResult[] = [];

    for (const cb of callbacks) {
      try {
        const result = await executeHook(cb, input);
        results.push(result);

        if (stopOnBlocking(results)) {
          break;
        }
      } catch (error) {
        results.push({
          outcome: "non_blocking_error",
          message: {
            type: "text",
            text: `Hook error: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }

    return aggregateResults(results);
  }
}

export async function executeHook(
  callback: HookCallback,
  input: HookInput
): Promise<HookResult> {
  const timeout = callback.timeout ?? 30000;
  const abortController = new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeout);

  try {
    const result = await callback.callback(
      input,
      null,
      abortController.signal
    );
    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        outcome: "cancelled",
        message: {
          type: "text",
          text: `Hook "${callback.name}" timed out after ${timeout}ms`,
        },
      };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function aggregateResults(results: HookResult[]): AggregatedHookResult {
  if (results.length === 0) {
    return {
      results: [],
      shouldStop: false,
      finalOutcome: "success",
    };
  }

  let finalOutcome: HookResult["outcome"] = "success";
  let combinedMessage: HookMessage | undefined;
  let combinedSystemMessage: HookMessage | undefined;
  let combinedBlockingError: { blockingError: string; command: string } | undefined;
  let shouldPreventContinuation = false;
  let updatedInput: Record<string, unknown> | undefined;
  let permissionBehavior: HookResult["permissionBehavior"];

  for (const result of results) {
    if (result.outcome === "blocking") {
      finalOutcome = "blocking";
      combinedBlockingError = result.blockingError;
      break;
    }
    if (result.outcome === "non_blocking_error") {
      finalOutcome = "non_blocking_error";
    }
    if (result.outcome === "cancelled") {
      finalOutcome = "cancelled";
    }
    if (result.message) {
      combinedMessage = result.message;
    }
    if (result.systemMessage) {
      combinedSystemMessage = result.systemMessage;
    }
    if (result.preventContinuation) {
      shouldPreventContinuation = true;
    }
    if (result.updatedInput && !updatedInput) {
      updatedInput = result.updatedInput;
    }
    if (result.permissionBehavior) {
      permissionBehavior = result.permissionBehavior;
    }
  }

  return {
    results,
    shouldStop: stopOnBlocking(results),
    finalOutcome,
    combinedMessage,
    combinedSystemMessage,
    combinedBlockingError,
    shouldPreventContinuation,
    updatedInput,
    permissionBehavior,
  };
}

export function stopOnBlocking(results: HookResult[]): boolean {
  return results.some(
    (r) => r.outcome === "blocking" || r.outcome === "cancelled"
  );
}