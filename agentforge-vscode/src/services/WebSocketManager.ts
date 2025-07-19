import { io, Socket } from 'socket.io-client';
import { OrchestratorAPI } from './OrchestratorAPI';
import { logger } from '../utils/logger';
import { Config } from '../utils/config';

export interface WebSocketEvents {
    'agent:activity': (data: any) => void;
    'agent:status': (data: any) => void;
    'task:completed': (data: any) => void;
    'task:failed': (data: any) => void;
}

export class WebSocketManager {
    private socket: Socket | null = null;
    private config: Config;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectInterval = 5000;

    constructor(private orchestratorAPI: OrchestratorAPI) {
        this.config = new Config();
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
                    resolve();
                });

                this.socket.on('connect_error', (error) => {
                    logger.error('WebSocket connection error', error);
                    reject(error);
                });
            });
        } catch (error) {
            logger.error('Failed to initialize WebSocket connection', error);
            throw error;
        }
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            logger.info('WebSocket disconnected');
        }
    }

    private setupEventHandlers(): void {
        if (!this.socket) return;

        this.socket.on('disconnect', (reason) => {
            logger.warn(`WebSocket disconnected: ${reason}`);
            
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, don't reconnect
                return;
            }

            this.handleReconnection();
        });

        this.socket.on('reconnect', (attemptNumber) => {
            logger.info(`WebSocket reconnected after ${attemptNumber} attempts`);
            this.reconnectAttempts = 0;
        });

        this.socket.on('reconnect_error', (error) => {
            logger.error('WebSocket reconnection failed', error);
        });

        this.socket.on('reconnect_failed', () => {
            logger.error('WebSocket reconnection failed permanently');
        });

        // Agent-specific events
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
    }

    private handleReconnection(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

        setTimeout(() => {
            this.connect().catch((error) => {
                logger.error('Reconnection attempt failed', error);
            });
        }, this.reconnectInterval * this.reconnectAttempts);
    }

    on<K extends keyof WebSocketEvents>(event: K, listener: WebSocketEvents[K]): void {
        // Store listeners for custom event handling
        // This would typically involve a more sophisticated event system
        logger.debug(`Registered listener for event: ${event}`);
    }

    private emit<K extends keyof WebSocketEvents>(event: K, data: any): void {
        // Emit to registered listeners
        // This would typically involve calling the registered listeners
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
}
