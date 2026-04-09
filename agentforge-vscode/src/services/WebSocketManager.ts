import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import { OrchestratorAPI } from './OrchestratorAPI';
import { logger } from '../utils/logger';
import { Config } from '../utils/config';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface WebSocketEvents {
    'agent:activity': (data: any) => void;
    'agent:status': (data: any) => void;
    'task:completed': (data: any) => void;
    'task:failed': (data: any) => void;
    'tool:progress': (data: ToolProgressEvent) => void;
    'tool:completed': (data: any) => void;
    'hook:triggered': (data: HookEvent) => void;
    'skill:stream': (data: SkillStreamEvent) => void;
    'skill:completed': (data: any) => void;
    'mcp:connected': (data: any) => void;
    'mcp:disconnected': (data: any) => void;
    'connection:status': (status: ConnectionStatus) => void;
}

export interface ToolProgressEvent {
    toolName: string;
    toolId: string;
    progress: number;
    status: 'running' | 'completed' | 'failed';
    message?: string;
    result?: any;
}

export interface HookEvent {
    hookName: string;
    eventType: string;
    data: any;
    timestamp: string;
}

export interface SkillStreamEvent {
    skillName: string;
    streamId: string;
    chunk: string;
    type: 'output' | 'error' | 'complete';
}

export class WebSocketManager extends EventEmitter {
    private socket: Socket | null = null;
    private config: Config;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectInterval = 5000;
    private _connectionStatus: ConnectionStatus = 'disconnected';
    private listeners: Map<string, Function[]> = new Map();

    constructor(private orchestratorAPI: OrchestratorAPI) {
        super();
        this.config = new Config();
    }

    get connectionStatus(): ConnectionStatus {
        return this._connectionStatus;
    }

    private setConnectionStatus(status: ConnectionStatus): void {
        this._connectionStatus = status;
        this.emit('connection:status', status);
    }

    async connect(): Promise<void> {
        if (this.socket?.connected) {
            logger.info('WebSocket already connected');
            return;
        }

        const url = this.config.getOrchestratorUrl();
        const apiKey = this.config.getApiKey();

        try {
            this.socket = io(url, {
                auth: {
                    token: apiKey
                },
                transports: ['websocket', 'polling']
            });

            this.setupEventHandlers();
            
            return new Promise((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error('Socket not initialized'));
                    return;
                }

                this.socket.on('connect', () => {
                    logger.info('WebSocket connected successfully');
                    this.reconnectAttempts = 0;
                    this.setConnectionStatus('connected');
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    logger.error('WebSocket connection error', error);
                    this.setConnectionStatus('disconnected');
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('Failed to initialize WebSocket connection', error);
            this.setConnectionStatus('disconnected');
            throw error;
        }
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.setConnectionStatus('disconnected');
            logger.info('WebSocket disconnected');
        }
    }

    private setupEventHandlers(): void {
        if (!this.socket) return;

        this.socket.on('disconnect', (reason) => {
            logger.warn(`WebSocket disconnected: ${reason}`);
            this.setConnectionStatus('disconnected');
            
            if (reason === 'io server disconnect') {
                return;
            }

            this.handleReconnection();
        });

        this.socket.on('reconnect', (attemptNumber) => {
            logger.info(`WebSocket reconnected after ${attemptNumber} attempts`);
            this.reconnectAttempts = 0;
            this.setConnectionStatus('connected');
        });

        this.socket.on('reconnect_error', (error) => {
            logger.error('WebSocket reconnection failed', error);
        });

        this.socket.on('reconnect_failed', () => {
            logger.error('WebSocket reconnection failed permanently');
        });

        this.socket.on('agent:activity', (data) => {
            logger.debug('Received agent activity update', data);
            this.emit('agent:activity', data);
        });

        this.socket.on('agent:status', (data) => {
            logger.debug('Received agent status update', data);
            this.emit('agent:status', data);
        });

        this.socket.on('task:completed', (data) => {
            logger.info('Task completed', data);
            this.emit('task:completed', data);
        });

        this.socket.on('task:failed', (data) => {
            logger.warn('Task failed', data);
            this.emit('task:failed', data);
        });

        this.socket.on('tool:progress', (data: ToolProgressEvent) => {
            logger.debug('Tool progress update', data);
            this.emit('tool:progress', data);
        });

        this.socket.on('tool:completed', (data) => {
            logger.info('Tool execution completed', data);
            this.emit('tool:completed', data);
        });

        this.socket.on('hook:triggered', (data: HookEvent) => {
            logger.info('Hook triggered', data);
            this.emit('hook:triggered', data);
        });

        this.socket.on('skill:stream', (data: SkillStreamEvent) => {
            logger.debug('Skill stream update', data);
            this.emit('skill:stream', data);
        });

        this.socket.on('skill:completed', (data) => {
            logger.info('Skill execution completed', data);
            this.emit('skill:completed', data);
        });

        this.socket.on('mcp:connected', (data) => {
            logger.info('MCP server connected', data);
            this.emit('mcp:connected', data);
        });

        this.socket.on('mcp:disconnected', (data) => {
            logger.warn('MCP server disconnected', data);
            this.emit('mcp:disconnected', data);
        });
    }

    private handleReconnection(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        this.setConnectionStatus('connecting');
        logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

        setTimeout(() => {
            this.connect().catch((error) => {
                logger.error('Reconnection attempt failed', error);
            });
        }, this.reconnectInterval * this.reconnectAttempts);
    }

    on<K extends keyof WebSocketEvents>(event: K, listener: WebSocketEvents[K]): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener as Function);
        logger.debug(`Registered listener for event: ${event}`);
    }

    off<K extends keyof WebSocketEvents>(event: K, listener: WebSocketEvents[K]): void {
        const listeners = this.listeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(listener as Function);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit<K extends keyof WebSocketEvents>(event: K, data: any): void {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    (listener as Function)(data);
                } catch (error) {
                    logger.error(`Error in event listener for ${event}`, error);
                }
            });
        }
        logger.debug(`Emitting event: ${event}`, data);
    }

    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }

    updateConnection(url: string, apiKey?: string): void {
        this.disconnect();
        
        setTimeout(() => {
            this.connect().catch((error) => {
                logger.error('Failed to reconnect with new settings', error);
            });
        }, 1000);
    }

    sendToolExecution(toolName: string, args: any): void {
        if (this.socket?.connected) {
            this.socket.emit('tool:execute', { toolName, args });
        }
    }

    triggerHook(hookName: string, data: any): void {
        if (this.socket?.connected) {
            this.socket.emit('hook:trigger', { hookName, data });
        }
    }

    streamSkillOutput(skillName: string, args: any): void {
        if (this.socket?.connected) {
            this.socket.emit('skill:execute', { skillName, args });
        }
    }
}
