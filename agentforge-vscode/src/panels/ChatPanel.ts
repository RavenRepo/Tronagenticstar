import * as vscode from 'vscode';
import { OrchestratorAPI } from '../services/OrchestratorAPI';
import { WebSocketManager } from '../services/WebSocketManager';
import { logger } from '../utils/logger';

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private _panel?: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private orchestratorAPI: OrchestratorAPI,
        private wsManager: WebSocketManager
    ) {
        // Panel will be created in show method
    }

    public show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (ChatPanel.currentPanel?._panel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'agentChat',
            'Chat with Agents',
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
        ChatPanel.currentPanel = this;

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
        ChatPanel.currentPanel = undefined;

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
        this._panel.title = 'Chat with Agents';
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat.css')
        );

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>Chat with Agents</title>
        </head>
        <body>
            <div class="container">
                <div class="chat-header">
                    <h1>Agent Chat Interface</h1>
                    <select id="agentSelect">
                        <option value="">Select an agent...</option>
                        <option value="DesignForge">DesignForge</option>
                        <option value="SecuriShield">SecuriShield</option>
                        <option value="CodeCraft">CodeCraft</option>
                        <option value="PerfPulse">PerfPulse</option>
                    </select>
                </div>
                
                <div class="chat-messages" id="chatMessages">
                    <div class="system-message">
                        Welcome! Select an agent and start chatting.
                    </div>
                </div>
                
                <div class="chat-input">
                    <input type="text" id="messageInput" placeholder="Type your message..." disabled>
                    <button id="sendButton" onclick="sendMessage()" disabled>Send</button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('agentSelect').addEventListener('change', function(e) {
                    const agent = e.target.value;
                    const messageInput = document.getElementById('messageInput');
                    const sendButton = document.getElementById('sendButton');
                    
                    if (agent) {
                        messageInput.disabled = false;
                        sendButton.disabled = false;
                        messageInput.placeholder = \`Chat with \${agent}...\`;
                        messageInput.focus();
                    } else {
                        messageInput.disabled = true;
                        sendButton.disabled = true;
                        messageInput.placeholder = 'Type your message...';
                    }
                });
                
                document.getElementById('messageInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendMessage();
                    }
                });
                
                function sendMessage() {
                    const messageInput = document.getElementById('messageInput');
                    const agentSelect = document.getElementById('agentSelect');
                    const message = messageInput.value.trim();
                    const agent = agentSelect.value;
                    
                    if (!message || !agent) return;
                    
                    // Add user message to chat
                    addMessage('user', message);
                    
                    // Clear input
                    messageInput.value = '';
                    
                    // Send to agent
                    vscode.postMessage({
                        command: 'sendMessage',
                        agent: agent,
                        message: message
                    });
                }
                
                function addMessage(sender, message, isError = false) {
                    const chatMessages = document.getElementById('chatMessages');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`message \${sender}-message\${isError ? ' error' : ''}\`;
                    messageDiv.innerHTML = \`
                        <div class="message-sender">\${sender === 'user' ? 'You' : sender}</div>
                        <div class="message-content">\${message}</div>
                        <div class="message-time">\${new Date().toLocaleTimeString()}</div>
                    \`;
                    chatMessages.appendChild(messageDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                
                // Listen for messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'agentResponse') {
                        addMessage(message.agent, message.response, message.isError);
                    }
                });
            </script>
        </body>
        </html>`;
    }

    private async _handleMessage(message: any) {
        switch (message.command) {
            case 'sendMessage':
                await this._sendMessageToAgent(message.agent, message.message);
                break;
        }
    }

    private async _sendMessageToAgent(agent: string, message: string) {
        try {
            // For now, we'll simulate agent responses
            // In a real implementation, this would use the orchestrator API
            setTimeout(() => {
                this._panel?.webview.postMessage({
                    command: 'agentResponse',
                    agent: agent,
                    response: `Hello! I'm ${agent}. I received your message: "${message}". This is a simulated response.`,
                    isError: false
                });
            }, 1000);

        } catch (error) {
            logger.error(`Failed to send message to agent ${agent}`, error);
            this._panel?.webview.postMessage({
                command: 'agentResponse',
                agent: agent,
                response: `Error communicating with ${agent}: ${error}`,
                isError: true
            });
        }
    }
}
