import { z, ZodSchema } from "zod";

export enum PermissionMode {
  DEFAULT = "default",
  ACCEPT_EDITS = "acceptEdits",
  BYPASS_PERMISSIONS = "bypassPermissions",
  DONT_ASK = "dontAsk",
  PLAN = "plan",
  AUTO = "auto",
  BUBBLE = "bubble",
}

export enum PermissionBehavior {
  ALLOW = "allow",
  DENY = "deny",
  ASK = "ask",
}

export interface ToolInputSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolOutputSchema {
  type: string;
  properties?: Record<string, unknown>;
}

export interface ToolMetadata {
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  isMCP?: boolean;
  category?: string;
  tags?: string[];
}

export interface ToolFactoryDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  outputSchema?: ToolOutputSchema;
  metadata?: ToolMetadata;
}

export interface ToolCallContext {
  agentId: string;
  sessionId?: string;
  permissionMode?: PermissionMode;
  permissionBehavior?: PermissionBehavior;
}

export interface ToolCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTimeMs?: number;
}

export type LazySchemaFactory<T> = () => ZodSchema<T>;

export function lazySchema<T>(factory: LazySchemaFactory<T>): LazySchemaFactory<T> {
  let schema: ZodSchema<T> | null = null;

  return () => {
    if (!schema) {
      schema = factory();
    }
    return schema;
  };
}

export function isValidToolName(name: string): boolean {
  if (!name || typeof name !== "string") {
    return false;
  }

  const validPattern = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  return validPattern.test(name) && name.length <= 64;
}

export interface Tool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  outputSchema?: ToolOutputSchema;
  metadata?: ToolMetadata;

  isReadOnly: boolean;
  isConcurrencySafe: boolean;
  isMCP: boolean;

  validateInput(input: unknown): TInput;
  checkPermissions(context: ToolCallContext): PermissionBehavior;
  call(input: TInput, context?: ToolCallContext): Promise<ToolCallResult<TOutput>>;
}

interface ToolBuilderOptions<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ToolInputSchema | LazySchemaFactory<TInput>;
  outputSchema?: ToolOutputSchema | LazySchemaFactory<TOutput>;
  metadata?: ToolMetadata;
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  isMCP?: boolean;
  validateInputFn?: (input: TInput) => TInput;
  checkPermissionsFn?: (context: ToolCallContext) => PermissionBehavior;
  callFn: (input: TInput, context?: ToolCallContext) => Promise<ToolCallResult<TOutput>>;
}

function compileLazySchema<T>(
  schema: ToolInputSchema | LazySchemaFactory<T>,
): ZodSchema<T> {
  if (typeof schema === "function") {
    return schema();
  }

  return z.object({
    type: z.literal(schema.type),
    properties: schema.properties ? z.record(z.unknown()) : z.optional(z.record(z.unknown())),
    required: schema.required ? z.array(z.string()) : z.optional(z.array(z.string())),
    additionalProperties: schema.additionalProperties !== undefined
      ? z.boolean()
      : z.optional(z.boolean()),
  }) as unknown as ZodSchema<T>;
}

function buildTool<TInput = unknown, TOutput = unknown>(
  options: ToolBuilderOptions<TInput, TOutput>,
): Tool<TInput, TOutput> {
  const {
    name,
    description,
    inputSchema,
    outputSchema,
    metadata = {},
    isReadOnly = false,
    isConcurrencySafe = false,
    isMCP = false,
    validateInputFn,
    checkPermissionsFn,
    callFn,
  } = options;

  if (!isValidToolName(name)) {
    throw new Error(`Invalid tool name: "${name}". Must match pattern: /^[a-zA-Z][a-zA-Z0-9_-]*$/`);
  }

  const compiledInputSchema = compileLazySchema(inputSchema);
  const compiledOutputSchema = outputSchema
    ? compileLazySchema(outputSchema)
    : undefined;

  const tool: Tool<TInput, TOutput> = {
    name,
    description,
    inputSchema: typeof inputSchema === "function" ? { type: "object" } : inputSchema,
    outputSchema: typeof outputSchema === "function" ? undefined : outputSchema,
    metadata,

    get isReadOnly() {
      return metadata.isReadOnly ?? isReadOnly;
    },

    get isConcurrencySafe() {
      return metadata.isConcurrencySafe ?? isConcurrencySafe;
    },

    get isMCP() {
      return metadata.isMCP ?? isMCP;
    },

    validateInput(input: unknown): TInput {
      if (validateInputFn) {
        return validateInputFn(input as TInput);
      }

      try {
        return compiledInputSchema.parse(input) as TInput;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
          throw new Error(`Input validation failed: ${issues}`);
        }
        throw err;
      }
    },

    checkPermissions(context: ToolCallContext): PermissionBehavior {
      if (checkPermissionsFn) {
        return checkPermissionsFn(context);
      }

      const mode = context.permissionMode ?? PermissionMode.DEFAULT;

      switch (mode) {
        case PermissionMode.BYPASS_PERMISSIONS:
          return PermissionBehavior.ALLOW;

        case PermissionMode.DONT_ASK:
        case PermissionMode.PLAN:
          return PermissionBehavior.DENY;

        case PermissionMode.ACCEPT_EDITS:
          return tool.isReadOnly
            ? PermissionBehavior.DENY
            : PermissionBehavior.ALLOW;

        case PermissionMode.AUTO:
          return tool.isConcurrencySafe
            ? PermissionBehavior.ALLOW
            : PermissionBehavior.ASK;

        case PermissionMode.BUBBLE:
          return PermissionBehavior.ASK;

        case PermissionMode.DEFAULT:
        default:
          return PermissionBehavior.DENY;
      }
    },

    async call(input: TInput, context?: ToolCallContext): Promise<ToolCallResult<TOutput>> {
      const startMs = Date.now();

      try {
        const validatedInput = tool.validateInput(input);

        const effectiveContext: ToolCallContext = {
          agentId: context?.agentId ?? "system",
          sessionId: context?.sessionId,
          permissionMode: context?.permissionMode ?? PermissionMode.DEFAULT,
          permissionBehavior: context?.permissionBehavior,
        };

        const permission = tool.checkPermissions(effectiveContext);

        if (permission === PermissionBehavior.DENY) {
          return {
            success: false,
            error: `Permission denied for tool "${name}" with mode "${effectiveContext.permissionMode}"`,
            executionTimeMs: Date.now() - startMs,
          };
        }

        if (permission === PermissionBehavior.ASK) {
          return {
            success: false,
            error: `Permission required for tool "${name}" - user confirmation needed`,
            executionTimeMs: Date.now() - startMs,
          };
        }

        const result = await callFn(validatedInput, effectiveContext);

        return {
          ...result,
          executionTimeMs: result.executionTimeMs ?? Date.now() - startMs,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Tool execution failed: ${errorMessage}`,
          executionTimeMs: Date.now() - startMs,
        };
      }
    },
  };

  return tool;
}

export { buildTool };
export type { ToolBuilderOptions };