import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Config } from '../utils/config';
import { logger } from '../utils/logger';

export interface Agent {
    id: string;
    name: string;
    type: string;
    status: 'active' | 'idle' | 'error';
    lastActivity?: Date;
    description?: string;
}

export interface AgentActivity {
    id: string;
    agentId: string;
    agentName: string;
    action: string;
    status: 'running' | 'completed' | 'failed';
    startTime: Date;
    endTime?: Date;
    result?: any;
    error?: string;
}

export interface TriggerAgentRequest {
    action: string;
    workspace?: string;
    parameters?: Record<string, any>;
}

export class OrchestratorAPI {
    private client: AxiosInstance;
    private config: Config;

    constructor(private context: vscode.ExtensionContext) {
        this.config = new Config();
        this.client = axios.create({
            baseURL: this.config.getOrchestratorUrl(),
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor for authentication
        this.client.interceptors.request.use(
            (config) => {
                const apiKey = this.config.getApiKey();
                if (apiKey) {
                    config.headers.Authorization = `Bearer ${apiKey}`;
                }
                return config;
            },
            (error) => {
                logger.error('Request interceptor error', error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            (response) => response,
            (error) => {
                logger.error('API request failed', error);
                if (error.response?.status === 401) {
                    vscode.window.showErrorMessage('Authentication failed. Please check your API key.');
                } else if (error.response?.status >= 500) {
                    vscode.window.showErrorMessage('Server error. Please try again later.');
                } else if (error.code === 'ECONNREFUSED') {
                    vscode.window.showErrorMessage('Cannot connect to orchestrator. Please check the URL.');
                }
                return Promise.reject(error);
            }
        );
    }

    async getAgents(): Promise<Agent[]> {
        try {
            const response: AxiosResponse<Agent[]> = await this.client.get('/api/agents');
            return response.data;
        } catch (error) {
            logger.error('Failed to fetch agents', error);
            throw error;
        }
    }

    async getAgentActivity(limit: number = 50): Promise<AgentActivity[]> {
        try {
            const response: AxiosResponse<AgentActivity[]> = await this.client.get('/api/activity', {
                params: { limit }
            });
            return response.data;
        } catch (error) {
            logger.error('Failed to fetch agent activity', error);
            throw error;
        }
    }

    async triggerAgent(agentName: string, request: TriggerAgentRequest): Promise<string> {
        try {
            const response: AxiosResponse<{ taskId: string }> = await this.client.post(
                `/api/agents/${agentName}/trigger`,
                request
            );
            return response.data.taskId;
        } catch (error) {
            logger.error(`Failed to trigger agent ${agentName}`, error);
            throw error;
        }
    }

    async generateAgent(name: string, type: string): Promise<void> {
        try {
            await this.client.post('/api/agents/generate', {
                name,
                type,
                workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            });
        } catch (error) {
            logger.error(`Failed to generate agent ${name}`, error);
            throw error;
        }
    }

    async getHealth(): Promise<boolean> {
        try {
            const response = await this.client.get('/health');
            return response.status === 200;
        } catch (error) {
            logger.error('Health check failed', error);
            return false;
        }
    }

    async getMetrics(): Promise<any> {
        try {
            const response = await this.client.get('/api/metrics');
            return response.data;
        } catch (error) {
            logger.error('Failed to fetch metrics', error);
            throw error;
        }
    }

    updateBaseURL(url: string) {
        this.client.defaults.baseURL = url;
        logger.info(`Updated orchestrator URL to: ${url}`);
    }
}
