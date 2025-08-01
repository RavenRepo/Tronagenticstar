import * as vscode from 'vscode';
import { OrchestratorAPI } from '../services/OrchestratorAPI';
import { WebSocketManager } from '../services/WebSocketManager';
import { logger } from '../utils/logger';

export class AgentActivityPanel {
    public static currentPanel: AgentActivityPanel | undefined;
    private _panel?: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private orchestratorAPI: OrchestratorAPI,
        private wsManager: WebSocketManager
    ) {
        // Initialize panel in show method
    }

    public show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (AgentActivityPanel.currentPanel?._panel) {
            AgentActivityPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'agentActivity',
            'Agent Activity',
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
        AgentActivityPanel.currentPanel = this;

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
        AgentActivityPanel.currentPanel = undefined;

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
        this._panel.title = 'Agent Activity';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // Get activities from API
        let activities: any[] = [];
        try {
            activities = await this.orchestratorAPI.getAgentActivity(50);
        } catch (error) {
            logger.error('Failed to load activities for webview', error);
        }

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'activity.css')
        );

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>Agent Activity</title>
        </head>
        <body>
            <div class="container">
                <h1>Agent Activity Monitor</h1>
                <div class="controls">
                    <button onclick="refreshActivities()">Refresh</button>
                    <button onclick="clearActivities()">Clear</button>
                </div>
                <div class="activity-list">
                    ${this._generateActivityHTML(activities)}
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function refreshActivities() {
                    vscode.postMessage({ command: 'refresh' });
                }
                
                function clearActivities() {
                    vscode.postMessage({ command: 'clear' });
                }
                
                function viewDetails(activityId) {
                    vscode.postMessage({ command: 'viewDetails', activityId });
                }
            </script>
        </body>
        </html>`;
    }

    private _generateActivityHTML(activities: any[]): string {
        if (activities.length === 0) {
            return '<div class="no-activities">No activities found</div>';
        }

        return activities.map(activity => `
            <div class="activity-item status-${activity.status}">
                <div class="activity-header">
                    <span class="agent-name">${activity.agentName}</span>
                    <span class="action">${activity.action}</span>
                    <span class="status">${activity.status}</span>
                </div>
                <div class="activity-time">
                    Started: ${new Date(activity.startTime).toLocaleString()}
                    ${activity.endTime ? `| Ended: ${new Date(activity.endTime).toLocaleString()}` : ''}
                </div>
                ${activity.error ? `<div class="error">Error: ${activity.error}</div>` : ''}
                <button onclick="viewDetails('${activity.id}')">View Details</button>
            </div>
        `).join('');
    }

    private async _handleMessage(message: any) {
        switch (message.command) {
            case 'refresh':
                await this._update();
                break;
            case 'clear':
                // Implement clear functionality if needed
                break;
            case 'viewDetails':
                // Open details view
                vscode.window.showInformationMessage(`Viewing details for activity: ${message.activityId}`);
                break;
        }
    }
}
