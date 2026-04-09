import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'eventemitter3';

export enum MCPTransportType {
  STDIO = 'stdio',
  SSE = 'sse',
  SSE_IDE = 'sse-ide',
  HTTP = 'http',
  WS = 'ws',
  WS_IDE = 'ws-ide',
  SDK = 'sdk',
  CLAUDEAI_PROXY = 'claudeai-proxy',
}

export interface MCPOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  scope?: string[];
  authType?: 'client_credentials' | 'bearer' | 'basic';
}

export interface MCPServerConfig {
  name: string;
  transport: MCPTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  oauth?: MCPOAuthConfig;
}

export type ConnectionStatus = 'pending' | 'connected' | 'failed' | 'needs-auth' | 'disabled';

export interface Tool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPServerConnection {
  config: MCPServerConfig;
  status: ConnectionStatus;
  tools: Tool[];
  process?: ChildProcess;
  reconnectAttempts: number;
  lastError?: Error;
  emitter: InstanceType<typeof EventEmitter>;
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface ToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

const NORMALIZE_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

function normalizeServerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64);
}

function formatToolName(serverName: string, toolName: string): string {
  const normalized = normalizeServerName(serverName);
  const cleanTool = toolName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 64);
  return `mcp__${normalized}__${cleanTool}`;
}

function calculateBackoff(attempt: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY_MS);
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export class MCPClient {
  private servers: Map<string, MCPServerConnection> = new Map();
  private pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map();

  async connect(config: MCPServerConfig): Promise<void> {
    const connection: MCPServerConnection = {
      config,
      status: 'pending',
      tools: [],
      reconnectAttempts: 0,
      emitter: new EventEmitter(),
    };

    this.servers.set(config.name, connection);
    await this.establishConnection(connection);
  }

  private async establishConnection(connection: MCPServerConnection): Promise<void> {
    const { config } = connection;

    try {
      switch (config.transport) {
        case MCPTransportType.STDIO:
          await this.connectStdio(connection);
          break;
        case MCPTransportType.HTTP:
        case MCPTransportType.SSE:
          await this.connectHttp(connection);
          break;
        case MCPTransportType.WS:
        case MCPTransportType.WS_IDE:
          await this.connectWs(connection);
          break;
        case MCPTransportType.SSE_IDE:
        case MCPTransportType.SDK:
        case MCPTransportType.CLAUDEAI_PROXY:
          throw new Error(`Transport ${config.transport} not yet implemented`);
        default:
          throw new Error(`Unknown transport type: ${config.transport}`);
      }

      connection.status = 'connected';
      connection.reconnectAttempts = 0;
      await this.initializeServer(connection);
    } catch (error) {
      connection.status = 'failed';
      connection.lastError = error as Error;
      await this.handleConnectionFailure(connection);
    }
  }

  private async connectStdio(connection: MCPServerConnection): Promise<void> {
    const { config } = connection;
    if (!config.command) {
      throw new Error('stdio transport requires command');
    }

    const env = { ...process.env, ...config.env };
    const child = spawn(config.command, config.args || [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    connection.process = child;

    let buffer = '';
    let headerComplete = false;

    child.stdout?.on('data', (data: Buffer) => {
      if (headerComplete) {
        this.handleStdioMessage(connection, data.toString());
      } else {
        buffer += data.toString();
        const headerEnd = buffer.indexOf('\n\n');
        if (headerEnd !== -1) {
          headerComplete = true;
          const header = buffer.slice(0, headerEnd);
          const remaining = buffer.slice(headerEnd + 2);
          if (remaining) {
            this.handleStdioMessage(connection, remaining);
          }
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[MCP ${config.name}] stderr:`, data.toString());
    });

    child.on('error', (error) => {
      connection.status = 'failed';
      connection.lastError = error;
      connection.emitter.emit('error', error);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        connection.status = 'failed';
        connection.lastError = new Error(`Process exited with code ${code}`);
        connection.emitter.emit('exit', code);
        this.handleConnectionFailure(connection);
      }
    });

    await this.waitForConnection(connection, 5000);
  }

  private handleStdioMessage(connection: MCPServerConnection, data: string): void {
    try {
      const response = JSON.parse(data) as JSONRPCResponse;
      this.handleJsonRpcResponse(connection, response);
    } catch (e) {
      console.warn(`[MCP ${connection.config.name}] Failed to parse JSON:`, data);
    }
  }

  private async connectHttp(connection: MCPServerConnection): Promise<void> {
    const { config } = connection;
    if (!config.url) {
      throw new Error('HTTP/SSE transport requires url');
    }

    connection.emitter.on('request', async (request: JSONRPCRequest) => {
      try {
        const response = await fetch(config.url!, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...config.headers,
          },
          body: JSON.stringify(request),
        });

        const data = await response.json() as JSONRPCResponse;
        this.handleJsonRpcResponse(connection, data);
      } catch (error) {
        const req = this.pendingRequests.get(String(request.id));
        if (req) {
          req.reject(error as Error);
          this.pendingRequests.delete(String(request.id));
        }
      }
    });

    if (config.transport === MCPTransportType.SSE) {
      const eventSource = new EventTarget();
      const eventSourceUrl = new URL(config.url!);
      eventSourceUrl.searchParams.set('endpoint', 'sse');

      const sseConnection = await fetch(eventSourceUrl.toString(), {
        headers: config.headers,
      });

      const reader = sseConnection.body?.getReader();
      const decoder = new TextDecoder();

      const readSSE = async () => {
        if (!reader) return;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') break;
                try {
                  const response = JSON.parse(data) as JSONRPCResponse;
                  this.handleJsonRpcResponse(connection, response);
                } catch {}
              }
            }
          }
        } catch (e) {
          connection.status = 'failed';
          connection.emitter.emit('error', e);
        }
      };

      readSSE();
    }

    connection.status = 'connected';
  }

  private async connectWs(connection: MCPServerConnection): Promise<void> {
    const { config } = connection;
    if (!config.url) {
      throw new Error('WebSocket transport requires url');
    }

    const WebSocketClass = (await import('ws')).default;
    const ws = new WebSocketClass(config.url, {
      headers: config.headers,
    }) as unknown as {
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      send: (data: string) => void;
      readyState: number;
      OPEN: number;
      CLOSED: number;
      CLOSING: number;
    };

    ws.on('open', () => {
      connection.status = 'connected';
    });

    ws.on('message', (data: unknown) => {
      try {
        const response = JSON.parse(String(data)) as JSONRPCResponse;
        this.handleJsonRpcResponse(connection, response);
      } catch (e) {
        console.warn(`[MCP ${config.name}] Failed to parse WS message:`, data);
      }
    });

    ws.on('error', (error: unknown) => {
      connection.status = 'failed';
      connection.lastError = error as Error;
      connection.emitter.emit('error', error);
    });

    ws.on('close', () => {
      connection.status = 'failed';
      connection.emitter.emit('close');
      this.handleConnectionFailure(connection);
    });

    connection.emitter.on('ws-send', (message: string) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    });

    await this.waitForConnection(connection, 10000);
  }

  private async waitForConnection(connection: MCPServerConnection, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (connection.status === 'pending') {
          reject(new Error('Connection timeout'));
        } else {
          resolve();
        }
      }, timeoutMs);

      connection.emitter.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });

      connection.emitter.once('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async initializeServer(connection: MCPServerConnection): Promise<void> {
    const tools = await this.listToolsInternal(connection);
    connection.tools = tools;
  }

  private async listToolsInternal(connection: MCPServerConnection): Promise<Tool[]> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: generateId(),
      method: 'tools/list',
      params: {},
    };

    const response = await this.sendRequest(connection, request);
    if (response && typeof response === 'object' && 'tools' in response) {
      return (response as { tools: Tool[] }).tools;
    }
    return [];
  }

  private handleJsonRpcResponse(connection: MCPServerConnection, response: JSONRPCResponse): void {
    if (response.id) {
      const pending = this.pendingRequests.get(String(response.id));
      if (pending) {
        if (response.error) {
          pending.reject(new Error(response.error.message));
        } else {
          pending.resolve(response.result);
        }
        this.pendingRequests.delete(String(response.id));
      }
    }

    if (response.result && typeof response.result === 'object' && 'tools' in response.result) {
      connection.tools = (response.result as { tools: Tool[] }).tools;
    }
  }

  private async sendRequest(connection: MCPServerConnection, request: JSONRPCRequest): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(String(request.id), { resolve, reject });

      const message = JSON.stringify(request);

      switch (connection.config.transport) {
        case MCPTransportType.STDIO:
          connection.process?.stdin?.write(message + '\n');
          break;
        case MCPTransportType.HTTP:
          connection.emitter.emit('request', request);
          break;
        case MCPTransportType.WS:
        case MCPTransportType.WS_IDE:
          connection.emitter.emit('ws-send', message);
          break;
        default:
          reject(new Error(`Transport ${connection.config.transport} does not support request/response`));
      }

      setTimeout(() => {
        if (this.pendingRequests.has(String(request.id))) {
          this.pendingRequests.delete(String(request.id));
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  private async handleConnectionFailure(connection: MCPServerConnection): Promise<void> {
    if (connection.reconnectAttempts >= MAX_RETRIES) {
      connection.status = 'failed';
      connection.emitter.emit('max-retries-reached');
      return;
    }

    connection.status = 'pending';
    const delay = calculateBackoff(connection.reconnectAttempts);
    connection.reconnectAttempts++;

    connection.emitter.emit('reconnecting', {
      attempt: connection.reconnectAttempts,
      delay,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));
    await this.establishConnection(connection);
  }

  async disconnect(serverName: string): Promise<void> {
    const connection = this.servers.get(serverName);
    if (!connection) {
      throw new Error(`Server ${serverName} not found`);
    }

    connection.status = 'disabled';

    if (connection.process) {
      connection.process.kill();
      connection.process = undefined;
    }

    this.servers.delete(serverName);
  }

  async listTools(serverName: string): Promise<Tool[]> {
    const connection = this.servers.get(serverName);
    if (!connection) {
      throw new Error(`Server ${serverName} not found`);
    }

    if (connection.status !== 'connected') {
      throw new Error(`Server ${serverName} is not connected (status: ${connection.status})`);
    }

    const tools = await this.listToolsInternal(connection);
    connection.tools = tools;

    return tools.map((tool) => ({
      ...tool,
      name: formatToolName(serverName, tool.name),
    }));
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const connection = this.servers.get(serverName);
    if (!connection) {
      throw new Error(`Server ${serverName} not found`);
    }

    if (connection.status !== 'connected') {
      throw new Error(`Server ${serverName} is not connected (status: ${connection.status})`);
    }

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: generateId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const result = await this.sendRequest(connection, request);

    if (result && typeof result === 'object' && 'content' in result) {
      const toolResult = result as ToolResult;
      if (toolResult.isError) {
        throw new Error(toolResult.content?.[0]?.text || 'Tool execution failed');
      }
      return toolResult.content;
    }

    return result;
  }

  getServerStatus(serverName: string): ConnectionStatus {
    const connection = this.servers.get(serverName);
    return connection?.status || 'disabled';
  }

  getAllServers(): Map<string, MCPServerConnection> {
    return new Map(this.servers);
  }

  formatToolName(serverName: string, toolName: string): string {
    return formatToolName(serverName, toolName);
  }

  normalizeServerName(name: string): string {
    return normalizeServerName(name);
  }

  isValidToolName(name: string): boolean {
    return NORMALIZE_REGEX.test(name);
  }

  getConnection(serverName: string): MCPServerConnection | undefined {
    return this.servers.get(serverName);
  }

  async reconnect(serverName: string): Promise<void> {
    const connection = this.servers.get(serverName);
    if (!connection) {
      throw new Error(`Server ${serverName} not found`);
    }

    connection.reconnectAttempts = 0;
    await this.establishConnection(connection);
  }
}

export function createMCPClient(): MCPClient {
  return new MCPClient();
}