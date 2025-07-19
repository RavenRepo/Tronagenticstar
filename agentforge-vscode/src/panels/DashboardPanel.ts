import * as vscode from 'vscode';
import { OrchestratorAPI } from '../services/OrchestratorAPI';
import { logger } from '../utils/logger';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private _panel?: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private orchestratorAPI: OrchestratorAPI
    ) {
        // Panel will be created in show method
    }

    public show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (DashboardPanel.currentPanel?._panel) {
            DashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'agentDashboard',
            'AgentForge Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'out')
                ]
            }
        );

        this._panel = panel;
        DashboardPanel.currentPanel = this;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            () => {
                if (this._panel?.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            (message: any) => {
                this._handleMessage(message);
            },
            null,
            this._disposables
        );
    }

    public dispose() {
        DashboardPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel?.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private async _update() {
        if (!this._panel) return;
        const webview = this._panel.webview;
        this._panel.title = 'AgentForge Dashboard';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // Get dashboard data
        let agents: any[] = [];
        let activities: any[] = [];
        let metrics: any = {};

        try {
            [agents, activities, metrics] = await Promise.all([
                this.orchestratorAPI.getAgents(),
                this.orchestratorAPI.getAgentActivity(10),
                this.orchestratorAPI.getMetrics()
            ]);
        } catch (error) {
            logger.error('Failed to load dashboard data', error);
        }

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'dashboard.css')
        );

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>AgentForge Dashboard</title>
        </head>
        <body>
            <div class="container">
                <header class="dashboard-header">
                    <h1>AgentForge Dashboard</h1>
                    <div class="controls">
                        <button onclick="refresh()">Refresh</button>
                        <button onclick="openSettings()">Settings</button>
                    </div>
                </header>
                
                <div class="dashboard-grid">
                    <div class="widget agents-widget">
                        <h2>Active Agents</h2>
                        <div class="agents-count">${agents.length}</div>
                        <div class="agents-list">
                            ${this._generateAgentsHTML(agents)}
                        </div>
                    </div>
                    
                    <div class="widget activity-widget">
                        <h2>Recent Activity</h2>
                        <div class="activity-list">
                            ${this._generateActivityHTML(activities)}
                        </div>
                    </div>
                    
                    <div class="widget metrics-widget">
                        <h2>System Metrics</h2>
                        <div class="metrics">
                            ${this._generateMetricsHTML(metrics)}
                        </div>
                    </div>
                    
                    <div class="widget actions-widget">
                        <h2>Quick Actions</h2>
                        <div class="action-buttons">
                            <button onclick="triggerAction('architecture')">Analyze Architecture</button>
                            <button onclick="triggerAction('security')">Security Scan</button>
                            <button onclick="triggerAction('quality')">Quality Check</button>
                            <button onclick="triggerAction('performance')">Performance Analysis</button>
                        </div>
                    </div>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function refresh() {
                    vscode.postMessage({ command: 'refresh' });
                }
                
                function openSettings() {
                    vscode.postMessage({ command: 'openSettings' });
                }
                
                function triggerAction(action) {
                    vscode.postMessage({ command: 'triggerAction', action });
                }
                
                function viewAgent(agentId) {
                    vscode.postMessage({ command: 'viewAgent', agentId });
                }
            </script>
        </body>
        </html>`;
    }

    private _generateAgentsHTML(agents: any[]): string {
        if (agents.length === 0) {
            return '<div class="no-agents">No agents available</div>';
        }

        return agents.map(agent => `
            <div class="agent-item status-${agent.status}" onclick="viewAgent('${agent.id}')">
                <span class="agent-name">${agent.name}</span>
                <span class="agent-status">${agent.status}</span>
            </div>
        `).join('');
    }

    private _generateActivityHTML(activities: any[]): string {
        if (activities.length === 0) {
            return '<div class="no-activity">No recent activity</div>';
        }

        return activities.slice(0, 5).map(activity => `
            <div class="activity-item">
                <span class="activity-agent">${activity.agentName}</span>
                <span class="activity-action">${activity.action}</span>
                <span class="activity-status status-${activity.status}">${activity.status}</span>
            </div>
        `).join('');
    }

    private _generateMetricsHTML(metrics: any): string {
        return `
            <div class="metric">
                <span class="metric-label">Uptime</span>
                <span class="metric-value">${metrics.uptime || 'N/A'}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Total Tasks</span>
                <span class="metric-value">${metrics.totalTasks || 0}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Success Rate</span>
                <span class="metric-value">${metrics.successRate || 'N/A'}</span>
            </div>
        `;
    }

    private async _handleMessage(message: any) {
        switch (message.command) {
            case 'refresh':
                await this._update();
                break;
            case 'openSettings':
                vscode.commands.executeCommand('agentforge.showSettings');
                break;
            case 'triggerAction':
                await this._triggerAction(message.action);
                break;
            case 'viewAgent':
                vscode.window.showInformationMessage(`Viewing agent: ${message.agentId}`);
                break;
        }
    }

    private async _triggerAction(action: string) {
        try {
            switch (action) {
                case 'architecture':
                    await vscode.commands.executeCommand('agentforge.triggerArchitectureAnalysis');
                    break;
                case 'security':
                    await vscode.commands.executeCommand('agentforge.triggerSecurityScan');
                    break;
                case 'quality':
                    await vscode.commands.executeCommand('agentforge.triggerQualityCheck');
                    break;
                case 'performance':
                    // Implement performance analysis trigger
                    vscode.window.showInformationMessage('Performance analysis triggered');
                    break;
            }
        } catch (error) {
            logger.error(`Failed to trigger action: ${action}`, error);
            vscode.window.showErrorMessage(`Failed to trigger ${action} analysis`);
        }
    }
}
