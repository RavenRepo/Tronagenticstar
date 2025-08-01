# AgentForge VS Code Extension - Implementation Guide

## 🎯 Overview

This guide provides step-by-step instructions for implementing the VS Code extension as the primary interface for AgentForge. The extension will serve as the main developer interface for interacting with the agent orchestration system.

---

## 📋 Prerequisites

- VS Code 1.74.0 or higher
- Node.js 18+ and npm
- TypeScript 5.0+
- AgentForge Orchestrator running locally or remotely

---

## 🏗️ Project Structure

```
agentforge-vscode/
├── 📁 src/
│   ├── extension.ts              # Main extension entry point
│   ├── 📁 panels/
│   │   ├── AgentActivityPanel.ts # Agent activity webview
│   │   ├── ChatPanel.ts          # Agent chat interface
│   │   ├── DashboardPanel.ts     # Project dashboard
│   │   └── SettingsPanel.ts      # Configuration panel
│   ├── 📁 services/
│   │   ├── OrchestratorAPI.ts    # API client for orchestrator
│   │   ├── WebSocketManager.ts   # Real-time connection
│   │   └── AuthService.ts        # Authentication handling
│   ├── 📁 utils/
│   │   ├── logger.ts             # Logging utilities
│   │   └── config.ts             # Configuration management
│   └── 📁 webview/
│       ├── 📁 components/        # React components for webviews
│       ├── 📁 styles/            # CSS and styling
│       └── index.html            # Webview HTML template
├── 📁 media/                     # Icons and images
├── 📁 out/                       # Compiled output
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
└── webpack.config.js             # Webpack bundling configuration
```

---

## 🚀 Step-by-Step Implementation

### Step 1: Extension Manifest (package.json)

```json
{
  "name": "agentforge",
  "displayName": "AgentForge - AI Agent Orchestration",
  "description": "Orchestrate AI agents for comprehensive software development",
  "version": "0.1.0",
  "engines": {
    "vscode": "^1.74.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "agentforge.showActivity",
        "title": "Show Agent Activity",
        "category": "AgentForge"
      },
      {
        "command": "agentforge.openChat",
        "title": "Chat with Agents",
        "category": "AgentForge"
      },
      {
        "command": "agentforge.showDashboard",
        "title": "Project Dashboard",
        "category": "AgentForge"
      },
      {
        "command": "agentforge.showSettings",
        "title": "Settings",
        "category": "AgentForge"
      },
      {
        "command": "agentforge.triggerArchitectureAnalysis",
        "title": "Analyze Architecture",
        "category": "AgentForge"
      },
      {
        "command": "agentforge.triggerSecurityScan",
        "title": "Security Scan",
        "category": "AgentForge"
      },
      {
        "command": "agentforge.triggerQualityCheck",
        "title": "Quality Check",
        "category": "AgentForge"
      }
    ],
    "views": {
      "explorer": [
        {
          "id": "agentforge.activity",
          "name": "Agent Activity",
          "when": "agentforge.enabled"
        }
      ]
    },
    "viewsContainers": {
      "activitybar": [
        {
          "id": "agentforge",
          "title": "AgentForge",
          "icon": "$(robot)"
        }
      ]
    },
    "configuration": {
      "title": "AgentForge",
      "properties": {
        "agentforge.orchestratorUrl": {
          "type": "string",
          "default": "http://localhost:3000",
          "description": "URL of the AgentForge orchestrator"
        },
        "agentforge.apiKey": {
          "type": "string",
          "description": "API key for orchestrator authentication"
        },
        "agentforge.enableRealTimeUpdates": {
          "type": "boolean",
          "default": true,
          "description": "Enable real-time updates via WebSocket"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "webpack --mode production",
    "watch": "webpack --mode development --watch",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js"
  },
  "devDependencies": {
    "@types/vscode": "^1.74.0",
    "@types/node": "18.x",
    "@typescript-eslint/eslint-plugin": "^6.4.0",
    "@typescript-eslint/parser": "^6.4.0",
    "eslint": "^8.47.0",
    "typescript": "^5.1.6",
    "webpack": "^5.88.0",
    "webpack-cli": "^5.1.4",
    "ts-loader": "^9.4.4"
  },
  "dependencies": {
    "axios": "^1.4.0",
    "socket.io-client": "^4.7.0"
  }
}
```

### Step 2: Main Extension Entry Point

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import { AgentActivityPanel } from './panels/AgentActivityPanel';
import { ChatPanel } from './panels/ChatPanel';
import { DashboardPanel } from './panels/DashboardPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { OrchestratorAPI } from './services/OrchestratorAPI';
import { WebSocketManager } from './services/WebSocketManager';
import { logger } from './utils/logger';

export async function activate(context: vscode.ExtensionContext) {
    logger.info('AgentForge extension is activating...');

    // Initialize services
    const orchestratorAPI = new OrchestratorAPI(context);
    const wsManager = new WebSocketManager(orchestratorAPI);

    // Initialize panels
    const activityPanel = new AgentActivityPanel(context, orchestratorAPI, wsManager);
    const chatPanel = new ChatPanel(context, orchestratorAPI, wsManager);
    const dashboardPanel = new DashboardPanel(context, orchestratorAPI);
    const settingsPanel = new SettingsPanel(context);

    // Register commands
    const commands = [
        vscode.commands.registerCommand('agentforge.showActivity', () => {
            activityPanel.show();
        }),
        
        vscode.commands.registerCommand('agentforge.openChat', () => {
            chatPanel.show();
        }),
        
        vscode.commands.registerCommand('agentforge.showDashboard', () => {
            dashboardPanel.show();
        }),
        
        vscode.commands.registerCommand('agentforge.showSettings', () => {
            settingsPanel.show();
        }),
        
        vscode.commands.registerCommand('agentforge.triggerArchitectureAnalysis', async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                await orchestratorAPI.triggerTask('ARCHITECTURE', {
                    action: 'analyze_architecture',
                    filePath: activeEditor.document.uri.fsPath,
                    workspaceRoot: vscode.workspace.rootPath
                });
                activityPanel.show();
            }
        }),
        
        vscode.commands.registerCommand('agentforge.triggerSecurityScan', async () => {
            await orchestratorAPI.triggerTask('SECURITY', {
                action: 'security_scan',
                workspaceRoot: vscode.workspace.rootPath
            });
            activityPanel.show();
        }),
        
        vscode.commands.registerCommand('agentforge.triggerQualityCheck', async () => {
            await orchestratorAPI.triggerTask('QUALITY', {
                action: 'code_quality_check',
                workspaceRoot: vscode.workspace.rootPath
            });
            activityPanel.show();
        })
    ];

    // Register context menu commands
    const contextCommands = [
        vscode.commands.registerCommand('agentforge.analyzeFile', async (uri: vscode.Uri) => {
            await orchestratorAPI.triggerTask('ARCHITECTURE', {
                action: 'analyze_file',
                filePath: uri.fsPath
            });
        })
    ];

    // Test connection on activation
    try {
        const health = await orchestratorAPI.getHealth();
        if (health.status === 'healthy') {
            vscode.window.showInformationMessage('AgentForge connected successfully!');
            wsManager.connect();
        } else {
            vscode.window.showWarningMessage('AgentForge orchestrator is not healthy');
        }
    } catch (error) {
        vscode.window.showErrorMessage('Failed to connect to AgentForge orchestrator');
        logger.error('Connection failed:', error);
    }

    // Add to context subscriptions
    context.subscriptions.push(...commands, ...contextCommands);
    
    // Set context for when extension is enabled
    vscode.commands.executeCommand('setContext', 'agentforge.enabled', true);

    logger.info('AgentForge extension activated successfully');
}

export function deactivate() {
    logger.info('AgentForge extension deactivated');
}
```

### Step 3: Orchestrator API Service

```typescript
// src/services/OrchestratorAPI.ts
import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { logger } from '../utils/logger';

export interface TaskRequest {
    type: 'ARCHITECTURE' | 'SECURITY' | 'QUALITY' | 'PERFORMANCE';
    parameters: Record<string, any>;
}

export interface TaskResponse {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
}

export interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    agents: any;
    memory: any;
    errors: any;
    uptime: number;
}

export class OrchestratorAPI {
    private client: AxiosInstance;
    private baseUrl: string;
    private apiKey?: string;

    constructor(private context: vscode.ExtensionContext) {
        this.baseUrl = this.getConfiguration('orchestratorUrl');
        this.apiKey = this.getConfiguration('apiKey');
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
            }
        });

        // Add request/response interceptors for logging
        this.client.interceptors.request.use(
            (config) => {
                logger.debug(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error('API Request Error:', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            (response) => {
                logger.debug(`API Response: ${response.status} ${response.config.url}`);
                return response;
            },
            (error) => {
                logger.error('API Response Error:', error.response?.data || error.message);
                return Promise.reject(error);
            }
        );
    }

    private getConfiguration(key: string): string {
        return vscode.workspace.getConfiguration('agentforge').get(key) || '';
    }

    async getHealth(): Promise<HealthResponse> {
        try {
            const response = await this.client.get('/api/v1/health');
            return response.data;
        } catch (error) {
            logger.error('Health check failed:', error);
            throw error;
        }
    }

    async triggerTask(type: TaskRequest['type'], parameters: Record<string, any>): Promise<TaskResponse> {
        try {
            const response = await this.client.post('/api/v1/tasks', {
                type,
                parameters,
                priority: 5,
                correlationId: `vscode_${Date.now()}`,
                manifestHash: 'default_manifest'
            });
            
            logger.info(`Task triggered: ${type}`, response.data);
            return response.data;
        } catch (error) {
            logger.error(`Task trigger failed for ${type}:`, error);
            throw error;
        }
    }

    async getTask(taskId: string): Promise<TaskResponse> {
        try {
            const response = await this.client.get(`/api/v1/tasks/${taskId}`);
            return response.data;
        } catch (error) {
            logger.error(`Get task failed for ${taskId}:`, error);
            throw error;
        }
    }

    async listAgents(): Promise<any[]> {
        try {
            const response = await this.client.get('/api/v1/agents');
            return response.data;
        } catch (error) {
            logger.error('List agents failed:', error);
            throw error;
        }
    }

    async getMetrics(): Promise<any> {
        try {
            const response = await this.client.get('/api/v1/metrics');
            return response.data;
        } catch (error) {
            logger.error('Get metrics failed:', error);
            throw error;
        }
    }
}
```

### Step 4: WebSocket Manager for Real-time Updates

```typescript
// src/services/WebSocketManager.ts
import { io, Socket } from 'socket.io-client';
import * as vscode from 'vscode';
import { OrchestratorAPI } from './OrchestratorAPI';
import { logger } from '../utils/logger';

export interface AgentEvent {
    type: 'task_received' | 'task_completed' | 'task_failed' | 'agent_registered' | 'agent_unregistered';
    data: any;
    timestamp: string;
}

export class WebSocketManager {
    private socket?: Socket;
    private eventEmitter = new vscode.EventEmitter<AgentEvent>();
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;

    // Event emitter for VS Code extension
    public readonly onEvent = this.eventEmitter.event;

    constructor(private orchestratorAPI: OrchestratorAPI) {}

    connect(): void {
        if (this.socket?.connected) {
            return;
        }

        const enableRealTime = vscode.workspace.getConfiguration('agentforge').get('enableRealTimeUpdates');
        if (!enableRealTime) {
            logger.info('Real-time updates disabled');
            return;
        }

        const baseUrl = vscode.workspace.getConfiguration('agentforge').get('orchestratorUrl') as string;
        const apiKey = vscode.workspace.getConfiguration('agentforge').get('apiKey') as string;

        this.socket = io(`${baseUrl}/events`, {
            auth: {
                token: apiKey
            },
            transports: ['websocket']
        });

        this.socket.on('connect', () => {
            logger.info('WebSocket connected to AgentForge');
            this.reconnectAttempts = 0;
            vscode.window.showInformationMessage('Real-time updates enabled');
        });

        this.socket.on('disconnect', (reason) => {
            logger.warn('WebSocket disconnected:', reason);
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, try to reconnect
                this.handleReconnect();
            }
        });

        this.socket.on('connect_error', (error) => {
            logger.error('WebSocket connection error:', error);
            this.handleReconnect();
        });

        // Agent event listeners
        this.socket.on('task_received', (data) => {
            this.emitEvent('task_received', data);
        });

        this.socket.on('task_completed', (data) => {
            this.emitEvent('task_completed', data);
            vscode.window.showInformationMessage(`Task completed: ${data.taskId}`);
        });

        this.socket.on('task_failed', (data) => {
            this.emitEvent('task_failed', data);
            vscode.window.showErrorMessage(`Task failed: ${data.taskId} - ${data.error}`);
        });

        this.socket.on('agent_registered', (data) => {
            this.emitEvent('agent_registered', data);
        });

        this.socket.on('agent_unregistered', (data) => {
            this.emitEvent('agent_unregistered', data);
        });
    }

    private emitEvent(type: AgentEvent['type'], data: any): void {
        const event: AgentEvent = {
            type,
            data,
            timestamp: new Date().toISOString()
        };
        
        logger.debug('WebSocket event received:', event);
        this.eventEmitter.fire(event);
    }

    private handleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnection attempts reached');
            vscode.window.showErrorMessage('Lost connection to AgentForge. Please check your connection.');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
        
        logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connect();
        }, delay);
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = undefined;
        }
    }

    isConnected(): boolean {
        return this.socket?.connected || false;
    }
}
```

### Step 5: Agent Activity Panel

```typescript
// src/panels/AgentActivityPanel.ts
import * as vscode from 'vscode';
import { OrchestratorAPI } from '../services/OrchestratorAPI';
import { WebSocketManager, AgentEvent } from '../services/WebSocketManager';
import { logger } from '../utils/logger';

export class AgentActivityPanel {
    private panel?: vscode.WebviewPanel;
    private readonly viewType = 'agentforge.activity';
    private events: AgentEvent[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private orchestratorAPI: OrchestratorAPI,
        private wsManager: WebSocketManager
    ) {
        // Listen for real-time events
        this.wsManager.onEvent((event) => {
            this.addEvent(event);
            this.updateWebview();
        });
    }

    show(): void {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            this.viewType,
            'Agent Activity',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'activity-light.svg'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'media', 'activity-dark.svg')
        };

        this.panel.webview.html = this.getWebviewContent();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'refresh':
                    this.refreshData();
                    break;
                case 'clear':
                    this.clearEvents();
                    break;
            }
        });

        // Clean up when panel is disposed
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Load initial data
        this.refreshData();
    }

    private addEvent(event: AgentEvent): void {
        this.events.unshift(event); // Add to beginning
        
        // Keep only last 100 events
        if (this.events.length > 100) {
            this.events = this.events.slice(0, 100);
        }
    }

    private clearEvents(): void {
        this.events = [];
        this.updateWebview();
    }

    private async refreshData(): Promise<void> {
        try {
            // Get latest system health
            const health = await this.orchestratorAPI.getHealth();
            
            // Send data to webview
            this.panel?.webview.postMessage({
                command: 'updateData',
                data: {
                    health,
                    events: this.events,
                    connected: this.wsManager.isConnected()
                }
            });
        } catch (error) {
            logger.error('Failed to refresh activity data:', error);
            vscode.window.showErrorMessage('Failed to refresh agent activity data');
        }
    }

    private updateWebview(): void {
        this.panel?.webview.postMessage({
            command: 'updateEvents',
            data: {
                events: this.events,
                connected: this.wsManager.isConnected()
            }
        });
    }

    private getWebviewContent(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Agent Activity</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                    padding: 20px;
                }
                
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .status {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .status-indicator {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }
                
                .status-healthy { background: var(--vscode-charts-green); }
                .status-degraded { background: var(--vscode-charts-yellow); }
                .status-unhealthy { background: var(--vscode-charts-red); }
                .status-disconnected { background: var(--vscode-charts-gray); }
                
                .actions {
                    display: flex;
                    gap: 10px;
                }
                
                button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 2px;
                    cursor: pointer;
                    font-size: 12px;
                }
                
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                
                .event-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .event-item {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    border-left: 3px solid var(--vscode-charts-blue);
                    padding: 12px;
                    border-radius: 4px;
                }
                
                .event-item.task_completed {
                    border-left-color: var(--vscode-charts-green);
                }
                
                .event-item.task_failed {
                    border-left-color: var(--vscode-charts-red);
                }
                
                .event-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                }
                
                .event-type {
                    font-weight: bold;
                    text-transform: uppercase;
                    font-size: 11px;
                    color: var(--vscode-charts-blue);
                }
                
                .event-time {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .event-data {
                    font-family: var(--vscode-editor-font-family);
                    font-size: 12px;
                    background: var(--vscode-textCodeBlock-background);
                    padding: 8px;
                    border-radius: 2px;
                    white-space: pre-wrap;
                    overflow-x: auto;
                }
                
                .empty-state {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    margin: 40px 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>Agent Activity</h2>
                <div class="status">
                    <div id="statusIndicator" class="status-indicator status-disconnected"></div>
                    <span id="statusText">Disconnected</span>
                </div>
                <div class="actions">
                    <button onclick="refresh()">Refresh</button>
                    <button onclick="clear()">Clear</button>
                </div>
            </div>
            
            <div id="eventList" class="event-list">
                <div class="empty-state">
                    <p>No agent activity yet. Trigger some tasks to see them here!</p>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }
                
                function clear() {
                    vscode.postMessage({ command: 'clear' });
                }
                
                function formatTime(timestamp) {
                    return new Date(timestamp).toLocaleTimeString();
                }
                
                function updateStatus(health, connected) {
                    const indicator = document.getElementById('statusIndicator');
                    const text = document.getElementById('statusText');
                    
                    if (!connected) {
                        indicator.className = 'status-indicator status-disconnected';
                        text.textContent = 'Disconnected';
                    } else if (health && health.status === 'healthy') {
                        indicator.className = 'status-indicator status-healthy';
                        text.textContent = 'Healthy';
                    } else if (health && health.status === 'degraded') {
                        indicator.className = 'status-indicator status-degraded';
                        text.textContent = 'Degraded';
                    } else {
                        indicator.className = 'status-indicator status-unhealthy';
                        text.textContent = 'Unhealthy';
                    }
                }
                
                function renderEvents(events) {
                    const eventList = document.getElementById('eventList');
                    
                    if (!events || events.length === 0) {
                        eventList.innerHTML = '<div class="empty-state"><p>No agent activity yet. Trigger some tasks to see them here!</p></div>';
                        return;
                    }
                    
                    eventList.innerHTML = events.map(event => \`
                        <div class="event-item \${event.type}">
                            <div class="event-header">
                                <span class="event-type">\${event.type.replace('_', ' ')}</span>
                                <span class="event-time">\${formatTime(event.timestamp)}</span>
                            </div>
                            <div class="event-data">\${JSON.stringify(event.data, null, 2)}</div>
                        </div>
                    \`).join('');
                }
                
                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'updateData':
                            updateStatus(message.data.health, message.data.connected);
                            renderEvents(message.data.events);
                            break;
                        case 'updateEvents':
                            renderEvents(message.data.events);
                            updateStatus(null, message.data.connected);
                            break;
                    }
                });
            </script>
        </body>
        </html>
        `;
    }
}
```

---

## 🚀 Quick Start Commands

### Development Setup
```bash
# Create extension directory
mkdir agentforge-vscode && cd agentforge-vscode

# Initialize package.json with the manifest above
npm init -y

# Install dependencies
npm install --save-dev @types/vscode typescript webpack webpack-cli ts-loader
npm install axios socket.io-client

# Create tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "out",
    "strict": true,
    "moduleResolution": "node",
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "exclude": ["node_modules", "out"]
}
EOF

# Create webpack.config.js
cat > webpack.config.js << 'EOF'
const path = require('path');

module.exports = {
  target: 'node',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  },
  externals: {
    vscode: 'commonjs vscode'
  }
};
EOF
```

### Testing the Extension
```bash
# Compile the extension
npm run compile

# Open in VS Code for development
code .

# Press F5 to launch Extension Development Host
# Test commands via Command Palette (Ctrl+Shift+P):
# - "AgentForge: Show Agent Activity"
# - "AgentForge: Chat with Agents"
# - "AgentForge: Project Dashboard"
```

### Publishing
```bash
# Install vsce (VS Code Extension CLI)
npm install -g vsce

# Package the extension
vsce package

# Publish to marketplace (requires publisher account)
vsce publish
```

---

## 🔗 Integration Points

### Orchestrator API Endpoints
- `GET /api/v1/health` - System health check
- `POST /api/v1/tasks` - Create new task
- `GET /api/v1/tasks/:id` - Get task status
- `GET /api/v1/agents` - List active agents
- `GET /api/v1/metrics` - Performance metrics
- `WS /api/v1/events` - Real-time event stream

### Required Orchestrator Enhancements
```typescript
// Add to packages/orchestrator/src/index.ts
export interface APIServer {
  routes: {
    "GET /api/v1/health": () => Promise<HealthResponse>;
    "POST /api/v1/tasks": (task: TaskRequest) => Promise<TaskResponse>;
    "GET /api/v1/tasks/:id": (id: string) => Promise<TaskResponse>;
    "GET /api/v1/agents": () => Promise<Agent[]>;
    "GET /api/v1/metrics": () => Promise<Metrics>;
  };
  websocket: {
    "/api/v1/events": WebSocketHandler;
  };
}
```

---

## 📊 Next Steps

1. **Implement remaining panels** (Chat, Dashboard, Settings)
2. **Add REST API server** to orchestrator package
3. **Implement WebSocket events** in orchestrator
4. **Add authentication system**
5. **Create comprehensive testing suite**
6. **Publish to VS Code Marketplace**

This implementation provides a solid foundation for the VS Code extension that serves as the primary interface to the AgentForge system. The extension integrates seamlessly with the existing orchestrator and provides real-time updates through WebSocket connections.
