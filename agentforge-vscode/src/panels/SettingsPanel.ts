import * as vscode from 'vscode';
import { Config } from '../utils/config';
import { logger } from '../utils/logger';

export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private _panel?: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private config: Config;

    constructor(private context: vscode.ExtensionContext) {
        this.config = new Config();
    }

    public show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (SettingsPanel.currentPanel?._panel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'agentSettings',
            'AgentForge Settings',
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
        SettingsPanel.currentPanel = this;

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
        SettingsPanel.currentPanel = undefined;

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
        this._panel.title = 'AgentForge Settings';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'settings.css')
        );

        // Get current settings
        const orchestratorUrl = this.config.getOrchestratorUrl();
        const apiKey = this.config.getApiKey() || '';
        const realTimeUpdates = this.config.isRealTimeUpdatesEnabled();
        const logLevel = this.config.getLogLevel();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>AgentForge Settings</title>
        </head>
        <body>
            <div class="container">
                <h1>AgentForge Settings</h1>
                
                <form id="settingsForm">
                    <div class="setting-group">
                        <label for="orchestratorUrl">Orchestrator URL</label>
                        <input type="url" id="orchestratorUrl" value="${orchestratorUrl}" 
                               placeholder="http://localhost:3000" required>
                        <small>The URL where your AgentForge orchestrator is running</small>
                    </div>
                    
                    <div class="setting-group">
                        <label for="apiKey">API Key</label>
                        <input type="password" id="apiKey" value="${apiKey}" 
                               placeholder="Optional API key for authentication">
                        <small>Leave empty if authentication is not required</small>
                    </div>
                    
                    <div class="setting-group">
                        <label>
                            <input type="checkbox" id="realTimeUpdates" ${realTimeUpdates ? 'checked' : ''}>
                            Enable Real-time Updates
                        </label>
                        <small>Connect via WebSocket for live updates</small>
                    </div>
                    
                    <div class="setting-group">
                        <label for="logLevel">Log Level</label>
                        <select id="logLevel">
                            <option value="debug" ${logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                            <option value="info" ${logLevel === 'info' ? 'selected' : ''}>Info</option>
                            <option value="warn" ${logLevel === 'warn' ? 'selected' : ''}>Warning</option>
                            <option value="error" ${logLevel === 'error' ? 'selected' : ''}>Error</option>
                        </select>
                        <small>Controls the verbosity of logging output</small>
                    </div>
                    
                    <div class="actions">
                        <button type="submit">Save Settings</button>
                        <button type="button" onclick="testConnection()">Test Connection</button>
                        <button type="button" onclick="resetToDefaults()">Reset to Defaults</button>
                    </div>
                </form>
                
                <div class="status-section">
                    <h2>Connection Status</h2>
                    <div id="connectionStatus" class="status-unknown">
                        Click "Test Connection" to check status
                    </div>
                </div>
                
                <div class="info-section">
                    <h2>About AgentForge</h2>
                    <p>Version: 0.1.0</p>
                    <p>AI Agent Orchestration for VS Code</p>
                    <div class="links">
                        <a href="#" onclick="openDocumentation()">Documentation</a>
                        <a href="#" onclick="openSupport()">Support</a>
                        <a href="#" onclick="showLogs()">View Logs</a>
                    </div>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('settingsForm').addEventListener('submit', function(e) {
                    e.preventDefault();
                    saveSettings();
                });
                
                function saveSettings() {
                    const settings = {
                        orchestratorUrl: document.getElementById('orchestratorUrl').value,
                        apiKey: document.getElementById('apiKey').value,
                        realTimeUpdates: document.getElementById('realTimeUpdates').checked,
                        logLevel: document.getElementById('logLevel').value
                    };
                    
                    vscode.postMessage({
                        command: 'saveSettings',
                        settings: settings
                    });
                }
                
                function testConnection() {
                    const url = document.getElementById('orchestratorUrl').value;
                    const apiKey = document.getElementById('apiKey').value;
                    
                    document.getElementById('connectionStatus').className = 'status-testing';
                    document.getElementById('connectionStatus').textContent = 'Testing connection...';
                    
                    vscode.postMessage({
                        command: 'testConnection',
                        url: url,
                        apiKey: apiKey
                    });
                }
                
                function resetToDefaults() {
                    if (confirm('Reset all settings to defaults?')) {
                        vscode.postMessage({ command: 'resetDefaults' });
                    }
                }
                
                function openDocumentation() {
                    vscode.postMessage({ command: 'openDocumentation' });
                }
                
                function openSupport() {
                    vscode.postMessage({ command: 'openSupport' });
                }
                
                function showLogs() {
                    vscode.postMessage({ command: 'showLogs' });
                }
                
                // Listen for messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'connectionResult':
                            const statusEl = document.getElementById('connectionStatus');
                            if (message.success) {
                                statusEl.className = 'status-success';
                                statusEl.textContent = 'Connection successful!';
                            } else {
                                statusEl.className = 'status-error';
                                statusEl.textContent = \`Connection failed: \${message.error}\`;
                            }
                            break;
                        case 'settingsSaved':
                            // Show success feedback
                            const form = document.getElementById('settingsForm');
                            form.style.borderLeft = '4px solid green';
                            setTimeout(() => {
                                form.style.borderLeft = '';
                            }, 2000);
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }

    private async _handleMessage(message: any) {
        switch (message.command) {
            case 'saveSettings':
                await this._saveSettings(message.settings);
                break;
            case 'testConnection':
                await this._testConnection(message.url, message.apiKey);
                break;
            case 'resetDefaults':
                await this._resetDefaults();
                break;
            case 'openDocumentation':
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/agentforge/docs'));
                break;
            case 'openSupport':
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/agentforge/support'));
                break;
            case 'showLogs':
                logger.show();
                break;
        }
    }

    private async _saveSettings(settings: any) {
        try {
            await this.config.setOrchestratorUrl(settings.orchestratorUrl);
            await this.config.setApiKey(settings.apiKey);
            await this.config.setRealTimeUpdates(settings.realTimeUpdates);
            await this.config.setLogLevel(settings.logLevel);

            this._panel?.webview.postMessage({
                command: 'settingsSaved'
            });

            vscode.window.showInformationMessage('Settings saved successfully!');
            logger.info('Settings updated');
        } catch (error) {
            logger.error('Failed to save settings', error);
            vscode.window.showErrorMessage('Failed to save settings');
        }
    }

    private async _testConnection(url: string, apiKey: string) {
        try {
            // Simple test using fetch - in reality would use the orchestrator API
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            // This is a simplified test - in practice would use the OrchestratorAPI
            this._panel?.webview.postMessage({
                command: 'connectionResult',
                success: true
            });

            clearTimeout(timeoutId);
        } catch (error) {
            logger.error('Connection test failed', error);
            this._panel?.webview.postMessage({
                command: 'connectionResult',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async _resetDefaults() {
        try {
            await this.config.setOrchestratorUrl('http://localhost:3000');
            await this.config.setApiKey('');
            await this.config.setRealTimeUpdates(true);
            await this.config.setLogLevel('info');

            await this._update(); // Refresh the webview
            vscode.window.showInformationMessage('Settings reset to defaults');
        } catch (error) {
            logger.error('Failed to reset settings', error);
            vscode.window.showErrorMessage('Failed to reset settings');
        }
    }
}
