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
        // Get available agents from API
        let agents: any[] = [];
        try {
            agents = await this.orchestratorAPI.getAgents();
        } catch (error) {
            logger.error('Failed to load agents for chat', error);
            // Fallback to default agents if API is unavailable
            agents = [
                { id: 'designforge', name: 'DesignForge', status: 'active', description: 'Architecture & Design Assistant' },
                { id: 'securishield', name: 'SecuriShield', status: 'active', description: 'Security Analysis Expert' },
                { id: 'codecraft', name: 'CodeCraft', status: 'active', description: 'Code Quality & Refactoring' },
                { id: 'perfpulse', name: 'PerfPulse', status: 'active', description: 'Performance Optimization' },
                { id: 'evaluator', name: 'Evaluator', status: 'active', description: 'Code Quality Assessment & Technical Debt Analysis' }
            ];
        }

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat.css')
        );

        return this._generateHtml(styleUri.toString(), agents);
    }

    private _generateHtml(styleUri: string, agents: any[]): string {
        const agentOptions = agents.map(agent => `
            <option value="${agent.id}" data-status="${agent.status}" data-description="${agent.description || ''}">
                ${agent.name} ${agent.status === 'active' ? '🟢' : agent.status === 'idle' ? '🟡' : '🔴'}
            </option>
        `).join('');

        const agentCards = agents.map(agent => `
            <div class="agent-card" onclick="selectAgent('${agent.id}')">
                <div class="agent-name">${agent.name}</div>
                <div class="agent-desc">${agent.description || 'AI Assistant'}</div>
                <div class="agent-status status-${agent.status}">${agent.status}</div>
            </div>
        `).join('');

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
                    <h1>🤖 Agent Chat Interface</h1>
                    <div class="agent-selector">
                        <select id="agentSelect">
                            <option value="">Select an agent to chat with...</option>
                            ${agentOptions}
                        </select>
                        <div id="agentInfo" class="agent-info" style="display: none;">
                            <span id="agentDescription"></span>
                            <button id="clearChat" onclick="clearChat()">Clear Chat</button>
                        </div>
                    </div>
                </div>
                
                <div class="chat-container">
                    <div class="chat-messages" id="chatMessages">
                        <div class="welcome-message">
                            <div class="welcome-content">
                                <h3>🎯 Welcome to AgentForge Chat!</h3>
                                <p>Select an agent from the dropdown above to start an intelligent conversation.</p>
                                <div class="agent-preview">
                                    ${agentCards}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="chat-input-container">
                        <div class="input-wrapper">
                            <textarea id="messageInput" placeholder="Type your message..." disabled rows="1"></textarea>
                            <div class="input-buttons">
                                <button id="insertCodeButton" onclick="insertCurrentCode()" disabled title="Insert current selection">
                                    📝 Code
                                </button>
                                <button id="attachFileButton" onclick="attachFile()" disabled title="Attach current file context">
                                    📎 File
                                </button>
                                <button id="sendButton" onclick="sendMessage()" disabled>
                                    <span class="send-icon">📤</span>
                                    Send
                                </button>
                            </div>
                        </div>
                        <div class="chat-features">
                            <button class="feature-btn" onclick="insertTemplate('architecture')" disabled id="archBtn">
                                🏗️ Analyze Architecture
                            </button>
                            <button class="feature-btn" onclick="insertTemplate('security')" disabled id="secBtn">
                                🛡️ Security Scan
                            </button>
                            <button class="feature-btn" onclick="insertTemplate('quality')" disabled id="qualBtn">
                                ⭐ Code Review
                            </button>
                            <button class="feature-btn" onclick="insertTemplate('performance')" disabled id="perfBtn">
                                ⚡ Performance Check
                            </button>
                            <button class="feature-btn" onclick="insertTemplate('explain')" disabled id="explainBtn">
                                💡 Explain Code
                            </button>
                            <button class="feature-btn" onclick="insertTemplate('refactor')" disabled id="refactorBtn">
                                🔄 Refactor
                            </button>
                        </div>
                        <div class="chat-tools">
                            <button class="tool-btn" onclick="exportChat()" disabled id="exportBtn">
                                💾 Export Chat
                            </button>
                            <button class="tool-btn" onclick="toggleAgentMetrics()" id="metricsBtn">
                                📊 Metrics
                            </button>
                            <button class="tool-btn" onclick="showKeyboardShortcuts()" id="shortcutsBtn">
                                ⌨️ Shortcuts
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            ${this._getJavaScript()}
        </body>
        </html>`;
    }

    private _getJavaScript(): string {
        return `<script>
            const vscode = acquireVsCodeApi();
            let currentAgent = null;
            let messageCount = 0;
            let sessionStartTime = Date.now();
            
            // Load previous state
            const state = vscode.getState() || {};
            if (state.chatHistory) {
                restoreChatHistory(state.chatHistory);
            }
            if (state.selectedAgent) {
                selectAgent(state.selectedAgent, false);
            }
            
            // Event listeners
            document.getElementById('agentSelect').addEventListener('change', function(e) {
                const agentId = e.target.value;
                if (agentId) {
                    selectAgent(agentId);
                } else {
                    deselectAgent();
                }
            });
            
            // Auto-resize textarea
            const messageInput = document.getElementById('messageInput');
            messageInput.addEventListener('input', function() {
                autoResizeTextarea(this);
            });
            
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            
            // Keyboard shortcuts
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.key === 'k') {
                    e.preventDefault();
                    messageInput.focus();
                } else if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                    e.preventDefault();
                    insertCurrentCode();
                } else if (e.ctrlKey && e.shiftKey && e.key === 'E') {
                    e.preventDefault();
                    exportChat();
                }
            });
            
            function selectAgent(agentId, showWelcome = true) {
                const select = document.getElementById('agentSelect');
                const option = select.querySelector('option[value="' + agentId + '"]');
                
                if (!option) return;
                
                select.value = agentId;
                currentAgent = agentId;
                
                // Update UI
                const messageInput = document.getElementById('messageInput');
                const sendButton = document.getElementById('sendButton');
                const agentInfo = document.getElementById('agentInfo');
                const agentDescription = document.getElementById('agentDescription');
                
                messageInput.disabled = false;
                sendButton.disabled = false;
                document.getElementById('insertCodeButton').disabled = false;
                document.getElementById('attachFileButton').disabled = false;
                document.getElementById('exportBtn').disabled = false;
                messageInput.placeholder = 'Chat with ' + option.text + '...';
                messageInput.focus();
                
                // Enable feature buttons based on agent
                enableFeatureButtons(agentId);
                
                // Show agent info
                agentInfo.style.display = 'block';
                agentDescription.textContent = option.dataset.description;
                
                // Hide welcome message and show agent greeting
                const welcomeMessage = document.querySelector('.welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.style.display = 'none';
                }
                
                if (showWelcome) {
                    const agentName = option.text.split(' ')[0];
                    addAgentMessage(agentName, 'Hello! I am ' + agentName + ', your ' + option.dataset.description + '. How can I help you today?');
                }
                
                // Save state
                vscode.setState({ 
                    ...vscode.getState(), 
                    selectedAgent: agentId 
                });
            }
            
            function deselectAgent() {
                currentAgent = null;
                const messageInput = document.getElementById('messageInput');
                const sendButton = document.getElementById('sendButton');
                const agentInfo = document.getElementById('agentInfo');
                
                messageInput.disabled = true;
                sendButton.disabled = true;
                document.getElementById('insertCodeButton').disabled = true;
                document.getElementById('attachFileButton').disabled = true;
                document.getElementById('exportBtn').disabled = true;
                messageInput.placeholder = 'Select an agent first...';
                agentInfo.style.display = 'none';
                
                // Disable all feature buttons
                document.querySelectorAll('.feature-btn').forEach(btn => btn.disabled = true);
                
                // Show welcome message
                const welcomeMessage = document.querySelector('.welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.style.display = 'block';
                }
            }
            
            function enableFeatureButtons(agentId) {
                // Reset all buttons
                document.querySelectorAll('.feature-btn').forEach(btn => btn.disabled = true);
                
                // Enable relevant buttons for each agent
                switch(agentId) {
                    case 'designforge':
                        document.getElementById('archBtn').disabled = false;
                        document.getElementById('explainBtn').disabled = false;
                        break;
                    case 'securishield':
                        document.getElementById('secBtn').disabled = false;
                        document.getElementById('explainBtn').disabled = false;
                        break;
                    case 'codecraft':
                        document.getElementById('qualBtn').disabled = false;
                        document.getElementById('refactorBtn').disabled = false;
                        document.getElementById('explainBtn').disabled = false;
                        break;
                    case 'perfpulse':
                        document.getElementById('perfBtn').disabled = false;
                        document.getElementById('explainBtn').disabled = false;
                        break;
                    case 'evaluator':
                        document.getElementById('qualBtn').disabled = false;
                        document.getElementById('perfBtn').disabled = false;
                        document.getElementById('explainBtn').disabled = false;
                        break;
                    default:
                        // Enable all for unknown agents
                        document.querySelectorAll('.feature-btn').forEach(btn => btn.disabled = false);
                }
            }
            
            function insertTemplate(type) {
                const templates = {
                    architecture: "Please analyze the architecture of my current project and provide recommendations for improvement.",
                    security: "Perform a security analysis of my code and identify potential vulnerabilities.",
                    quality: "Review my code quality and suggest refactoring opportunities. Include metrics for complexity, maintainability, and readability.",
                    performance: "Analyze the performance of my application and suggest optimizations. Include time/space complexity analysis.",
                    explain: "Please explain how this code works and what it does.",
                    refactor: "Please review this code and suggest refactoring improvements for better maintainability and performance.",
                    evaluate: "Perform a comprehensive evaluation of this code including quality metrics, technical debt analysis, and improvement recommendations."
                };
                
                const messageInput = document.getElementById('messageInput');
                messageInput.value = templates[type];
                messageInput.focus();
                autoResizeTextarea(messageInput);
            }
            
            function insertCurrentCode() {
                vscode.postMessage({
                    command: 'getCurrentCode'
                });
            }
            
            function attachFile() {
                vscode.postMessage({
                    command: 'getFileContext'
                });
            }
            
            function sendMessage() {
                const messageInput = document.getElementById('messageInput');
                const message = messageInput.value.trim();
                
                if (!message || !currentAgent) return;
                
                // Add user message to chat
                addUserMessage(message);
                
                // Clear input
                messageInput.value = '';
                autoResizeTextarea(messageInput);
                
                // Show typing indicator
                addTypingIndicator();
                
                // Send to agent
                vscode.postMessage({
                    command: 'sendMessage',
                    agent: currentAgent,
                    message: message
                });
                
                // Save chat state
                saveChatState();
            }
            
            function addUserMessage(message) {
                const chatMessages = document.getElementById('chatMessages');
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message user-message';
                messageDiv.innerHTML = 
                    '<div class="message-header">' +
                        '<span class="message-sender">👤 You</span>' +
                        '<span class="message-time">' + new Date().toLocaleTimeString() + '</span>' +
                    '</div>' +
                    '<div class="message-content">' + formatMessage(message) + '</div>' +
                    '<div class="message-metadata">' +
                        '<span class="message-chars">' + message.length + ' chars</span>' +
                    '</div>';
                chatMessages.appendChild(messageDiv);
                scrollToBottom();
                messageCount++;
            }
            
            function addAgentMessage(agent, message, isError = false) {
                removeTypingIndicator();
                
                const chatMessages = document.getElementById('chatMessages');
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message agent-message' + (isError ? ' error' : '');
                
                const agentIcon = getAgentIcon(agent);
                const actions = isError ? '' : 
                    '<div class="message-actions">' +
                        '<button onclick="copyMessage(this)">📋 Copy</button>' +
                        '<button onclick="likeMessage(this)">👍</button>' +
                        '<button onclick="retryMessage(this)">🔄 Retry</button>' +
                    '</div>';
                
                messageDiv.innerHTML = 
                    '<div class="message-header">' +
                        '<span class="message-sender">' + agentIcon + ' ' + agent + '</span>' +
                        '<span class="message-time">' + new Date().toLocaleTimeString() + '</span>' +
                    '</div>' +
                    '<div class="message-content">' + formatMessage(message) + '</div>' +
                    actions;
                
                chatMessages.appendChild(messageDiv);
                scrollToBottom();
                messageCount++;
                
                saveChatState();
            }
            
            function getAgentIcon(agent) {
                const icons = {
                    'DesignForge': '🏗️',
                    'SecuriShield': '🛡️',
                    'CodeCraft': '⚒️',
                    'PerfPulse': '⚡',
                    'Evaluator': '📊'
                };
                return icons[agent] || '🤖';
            }
            
            function addTypingIndicator() {
                const chatMessages = document.getElementById('chatMessages');
                const indicator = document.createElement('div');
                indicator.className = 'message agent-message typing-indicator';
                indicator.id = 'typingIndicator';
                indicator.innerHTML = 
                    '<div class="message-header">' +
                        '<span class="message-sender">🤖 Agent</span>' +
                    '</div>' +
                    '<div class="message-content">' +
                        '<div class="typing-dots">' +
                            '<span></span>' +
                            '<span></span>' +
                            '<span></span>' +
                        '</div>' +
                        '<span class="typing-text">is typing...</span>' +
                    '</div>';
                chatMessages.appendChild(indicator);
                scrollToBottom();
            }
            
            function removeTypingIndicator() {
                const indicator = document.getElementById('typingIndicator');
                if (indicator) {
                    indicator.remove();
                }
            }
            
            function clearChat() {
                if (confirm('Clear all chat messages?')) {
                    const chatMessages = document.getElementById('chatMessages');
                    chatMessages.innerHTML = '';
                    messageCount = 0;
                    
                    // Reset state
                    vscode.setState({ ...vscode.getState(), chatHistory: null });
                    
                    // Re-select current agent to show greeting
                    if (currentAgent) {
                        selectAgent(currentAgent);
                    }
                }
            }
            
            function copyMessage(button) {
                const messageContent = button.closest('.message').querySelector('.message-content').textContent;
                navigator.clipboard.writeText(messageContent).then(() => {
                    button.textContent = '✅ Copied';
                    setTimeout(() => {
                        button.textContent = '📋 Copy';
                    }, 2000);
                });
            }
            
            function likeMessage(button) {
                button.textContent = button.textContent === '👍' ? '❤️' : '👍';
            }
            
            function retryMessage(button) {
                const messageDiv = button.closest('.message');
                const isUserMessage = messageDiv.classList.contains('user-message');
                
                if (isUserMessage) {
                    const messageContent = messageDiv.querySelector('.message-content').textContent;
                    const messageInput = document.getElementById('messageInput');
                    messageInput.value = messageContent;
                    messageInput.focus();
                    autoResizeTextarea(messageInput);
                } else {
                    // Retry agent response
                    const chatMessages = document.getElementById('chatMessages');
                    const messages = Array.from(chatMessages.children);
                    const currentIndex = messages.indexOf(messageDiv);
                    
                    // Find the last user message before this agent message
                    for (let i = currentIndex - 1; i >= 0; i--) {
                        const msg = messages[i];
                        if (msg.classList.contains('user-message')) {
                            const userMessage = msg.querySelector('.message-content').textContent;
                            
                            // Remove this agent message and retry
                            messageDiv.remove();
                            
                            // Add typing indicator and retry
                            addTypingIndicator();
                            vscode.postMessage({
                                command: 'sendMessage',
                                agent: currentAgent,
                                message: userMessage
                            });
                            break;
                        }
                    }
                }
            }
            
            function exportChat() {
                const chatMessages = document.getElementById('chatMessages');
                const messages = Array.from(chatMessages.children)
                    .filter(msg => !msg.classList.contains('welcome-message'))
                    .map(msg => {
                        const sender = msg.querySelector('.message-sender')?.textContent || 'Unknown';
                        const content = msg.querySelector('.message-content')?.textContent || '';
                        const time = msg.querySelector('.message-time')?.textContent || '';
                        return '[' + time + '] ' + sender + ': ' + content;
                    }).join('\\n\\n');
                
                vscode.postMessage({
                    command: 'exportChat',
                    content: messages,
                    agent: currentAgent
                });
            }
            
            function toggleAgentMetrics() {
                const metricsDiv = document.getElementById('agentMetrics');
                if (metricsDiv) {
                    metricsDiv.remove();
                } else {
                    showAgentMetrics();
                }
            }
            
            function showAgentMetrics() {
                const container = document.querySelector('.container');
                const metricsDiv = document.createElement('div');
                metricsDiv.id = 'agentMetrics';
                metricsDiv.className = 'agent-metrics';
                metricsDiv.innerHTML = 
                    '<div class="metrics-header">' +
                        '<h3>🤖 Agent Performance Metrics</h3>' +
                        '<button onclick="toggleAgentMetrics()">✕</button>' +
                    '</div>' +
                    '<div class="metrics-content">' +
                        '<div class="metric-item">' +
                            '<span class="metric-label">Messages Sent:</span>' +
                            '<span class="metric-value">' + Math.floor(messageCount / 2) + '</span>' +
                        '</div>' +
                        '<div class="metric-item">' +
                            '<span class="metric-label">Responses Received:</span>' +
                            '<span class="metric-value">' + Math.floor(messageCount / 2) + '</span>' +
                        '</div>' +
                        '<div class="metric-item">' +
                            '<span class="metric-label">Current Agent:</span>' +
                            '<span class="metric-value">' + (currentAgent || 'None') + '</span>' +
                        '</div>' +
                        '<div class="metric-item">' +
                            '<span class="metric-label">Session Duration:</span>' +
                            '<span class="metric-value" id="sessionDuration">00:00</span>' +
                        '</div>' +
                    '</div>';
                container.appendChild(metricsDiv);
                updateSessionDuration();
            }
            
            function showKeyboardShortcuts() {
                const shortcutsDiv = document.getElementById('keyboardShortcuts');
                if (shortcutsDiv) {
                    shortcutsDiv.remove();
                } else {
                    const container = document.querySelector('.container');
                    const shortcutsDiv = document.createElement('div');
                    shortcutsDiv.id = 'keyboardShortcuts';
                    shortcutsDiv.className = 'keyboard-shortcuts';
                    shortcutsDiv.innerHTML = 
                        '<div class="shortcuts-header">' +
                            '<h3>⌨️ Keyboard Shortcuts</h3>' +
                            '<button onclick="showKeyboardShortcuts()">✕</button>' +
                        '</div>' +
                        '<div class="shortcuts-content">' +
                            '<div class="shortcut-item">' +
                                '<span class="shortcut-key">Ctrl + K</span>' +
                                '<span class="shortcut-desc">Focus message input</span>' +
                            '</div>' +
                            '<div class="shortcut-item">' +
                                '<span class="shortcut-key">Ctrl + Shift + C</span>' +
                                '<span class="shortcut-desc">Insert current code selection</span>' +
                            '</div>' +
                            '<div class="shortcut-item">' +
                                '<span class="shortcut-key">Ctrl + Shift + E</span>' +
                                '<span class="shortcut-desc">Export chat</span>' +
                            '</div>' +
                            '<div class="shortcut-item">' +
                                '<span class="shortcut-key">Enter</span>' +
                                '<span class="shortcut-desc">Send message</span>' +
                            '</div>' +
                            '<div class="shortcut-item">' +
                                '<span class="shortcut-key">Shift + Enter</span>' +
                                '<span class="shortcut-desc">New line in message</span>' +
                            '</div>' +
                        '</div>';
                    container.appendChild(shortcutsDiv);
                }
            }
            
            function updateSessionDuration() {
                const durationEl = document.getElementById('sessionDuration');
                if (durationEl) {
                    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
                    const minutes = Math.floor(duration / 60);
                    const seconds = duration % 60;
                    durationEl.textContent = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
                    setTimeout(updateSessionDuration, 1000);
                }
            }
            
            function autoResizeTextarea(textarea) {
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
            }
            
            function scrollToBottom() {
                const chatMessages = document.getElementById('chatMessages');
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            
            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }
            
            function formatMessage(text) {
                // Basic markdown-like formatting
                let formatted = escapeHtml(text);
                
                // Code blocks
                formatted = formatted.replace(/\\\`\\\`\\\`([^]*?)\\\`\\\`\\\`/g, '<pre class="code-block"><code>$1</code></pre>');
                
                // Inline code
                formatted = formatted.replace(/\\\`([^\\\`]*)\\\`/g, '<code class="inline-code">$1</code>');
                
                // Bold
                formatted = formatted.replace(/\\*\\*([^*]*)\\*\\*/g, '<strong>$1</strong>');
                
                // Italic
                formatted = formatted.replace(/\\*([^*]*)\\*/g, '<em>$1</em>');
                
                // Links (basic)
                formatted = formatted.replace(/https?:\\/\\/[^\\s]+/g, '<a href="$&" target="_blank">$&</a>');
                
                // Line breaks
                formatted = formatted.replace(/\\n/g, '<br>');
                
                return formatted;
            }
            
            function saveChatState() {
                const chatMessages = document.getElementById('chatMessages');
                const messages = Array.from(chatMessages.children).map(msg => ({
                    className: msg.className,
                    innerHTML: msg.innerHTML
                }));
                
                vscode.setState({
                    ...vscode.getState(),
                    chatHistory: messages
                });
            }
            
            function restoreChatHistory(history) {
                const chatMessages = document.getElementById('chatMessages');
                chatMessages.innerHTML = '';
                
                history.forEach(msg => {
                    const div = document.createElement('div');
                    div.className = msg.className;
                    div.innerHTML = msg.innerHTML;
                    chatMessages.appendChild(div);
                });
                
                messageCount = history.length;
                scrollToBottom();
            }
            
            function insertCodeIntoMessage(code, language) {
                const messageInput = document.getElementById('messageInput');
                const currentValue = messageInput.value;
                const codeBlock = '\\\`\\\`\\\`' + (language || '') + '\\n' + code + '\\n\\\`\\\`\\\`';
                messageInput.value = currentValue + (currentValue ? '\\n\\n' : '') + codeBlock;
                autoResizeTextarea(messageInput);
                messageInput.focus();
            }
            
            function insertFileContext(fileName, content) {
                const messageInput = document.getElementById('messageInput');
                const currentValue = messageInput.value;
                const fileContext = 'File: ' + fileName + '\\n\\\`\\\`\\\`\\n' + content + '\\n\\\`\\\`\\\`';
                messageInput.value = currentValue + (currentValue ? '\\n\\n' : '') + fileContext;
                autoResizeTextarea(messageInput);
                messageInput.focus();
            }
            
            function updateAgentStatus(agentId, status) {
                const option = document.querySelector('option[value="' + agentId + '"]');
                if (option) {
                    option.dataset.status = status;
                    const statusEmoji = status === 'active' ? '🟢' : status === 'idle' ? '🟡' : '🔴';
                    option.textContent = option.textContent.replace(/[🟢🟡🔴]/, statusEmoji);
                }
            }
            
            // Listen for messages from extension
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'agentResponse':
                        addAgentMessage(message.agent, message.response, message.isError);
                        break;
                    case 'agentStatus':
                        updateAgentStatus(message.agent, message.status);
                        break;
                    case 'currentCode':
                        insertCodeIntoMessage(message.code, message.language);
                        break;
                    case 'fileContext':
                        insertFileContext(message.fileName, message.content);
                        break;
                }
            });
        </script>`;
    }

    private async _handleMessage(message: any) {
        switch (message.command) {
            case 'sendMessage':
                await this._sendMessageToAgent(message.agent, message.message);
                break;
            case 'getCurrentCode':
                await this._sendCurrentCode();
                break;
            case 'getFileContext':
                await this._sendFileContext();
                break;
            case 'exportChat':
                await this._exportChat(message.content, message.agent);
                break;
        }
    }

    private async _sendCurrentCode() {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                this._panel?.webview.postMessage({
                    command: 'currentCode',
                    code: '// No active editor',
                    language: 'text'
                });
                return;
            }

            const selection = editor.selection;
            const code = selection.isEmpty 
                ? editor.document.getText() 
                : editor.document.getText(selection);
            
            const language = editor.document.languageId;

            this._panel?.webview.postMessage({
                command: 'currentCode',
                code: code,
                language: language
            });
        } catch (error) {
            logger.error('Failed to get current code', error);
        }
    }

    private async _sendFileContext() {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const fileName = editor.document.fileName;
            const content = editor.document.getText();

            this._panel?.webview.postMessage({
                command: 'fileContext',
                fileName: fileName,
                content: content
            });
        } catch (error) {
            logger.error('Failed to get file context', error);
        }
    }

    private async _exportChat(content: string, agent: string) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `chat-${agent || 'unknown'}-${timestamp}.txt`;
            
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(fileName),
                filters: {
                    'Text files': ['txt'],
                    'Markdown files': ['md']
                }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage(`Chat exported to ${uri.fsPath}`);
            }
        } catch (error) {
            logger.error('Failed to export chat', error);
            vscode.window.showErrorMessage('Failed to export chat');
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
                    response: `Hello! I'm ${agent}. I received your message: "${message}". This is a simulated response with enhanced formatting support. 

Here's what I can help with:
- **Code analysis** and suggestions
- *Security* assessments  
- \`Performance\` optimizations
- Architecture reviews

\`\`\`typescript
// Example code block
function example() {
    return "This is a code example";
}
\`\`\`

Visit https://example.com for more information.`,
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
