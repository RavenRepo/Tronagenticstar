import * as vscode from 'vscode';
import { OrchestratorAPI } from '../services/OrchestratorAPI';
import { WebSocketManager } from '../services/WebSocketManager';
import { logger } from '../utils/logger';

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private _panel?: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private skills: any[] = [];
    private mcpTools: any[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private orchestratorAPI: OrchestratorAPI,
        private wsManager: WebSocketManager
    ) {
        this._loadSkillsAndMCP();
    }

    private async _loadSkillsAndMCP() {
        try {
            this.skills = await this.orchestratorAPI.listSkills();
        } catch {
            this.skills = [
                { name: 'agentflow', description: 'Orchestrate agents in dependency graphs' },
                { name: 'apex-architect', description: 'Strategy & market intelligence' },
                { name: 'context7-mcp', description: 'Library documentation & examples' },
                { name: 'find-skills', description: 'Discover available skills' },
                { name: 'hindsight-docs', description: 'Hindsight architecture docs' }
            ];
        }
        
        try {
            this.mcpTools = await this.orchestratorAPI.listMCPTools();
        } catch {
            this.mcpTools = [];
        }
    }

    public show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (ChatPanel.currentPanel?._panel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return;
        }

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

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.onDidChangeViewState(
            () => {
                if (this._panel?.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

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
        let agents: any[] = [];
        try {
            agents = await this.orchestratorAPI.getAgents();
        } catch (error) {
            logger.error('Failed to load agents for chat', error);
            agents = [
                { id: 'generalPurpose', name: 'General Purpose', type: 'generalPurpose', description: 'Versatile agent for any task' },
                { id: 'explore', name: 'Explorer Agent', type: 'explore', description: 'File system exploration & analysis' },
                { id: 'plan', name: 'Planner Agent', type: 'plan', description: 'Task planning & coordination' },
                { id: 'verification', name: 'Verifier Agent', type: 'verification', description: 'Code verification & testing' }
            ];
        }

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'chat.css')
        );

        return this._generateHtml(styleUri.toString(), agents);
    }

    private _generateHtml(styleUri: string, agents: any[]): string {
        const agentOptions = agents.map(agent => `
            <option value="${agent.id}" data-type="${agent.type || ''}" data-status="${agent.status}" data-description="${agent.description || ''}">
                ${agent.name} ${agent.status === 'active' ? '🟢' : agent.status === 'idle' ? '🟡' : '🔴'}
            </option>
        `).join('');

        const skillOptions = this.skills.map(skill => `
            <option value="${skill.name}">/${skill.name} - ${skill.description}</option>
        `).join('');

        const mcpToolCards = this.mcpTools.length > 0 ? this.mcpTools.map(tool => `
            <div class="mcp-tool-card" onclick="selectMCPTool('${tool.name}')">
                <div class="tool-name">${tool.name}</div>
                <div class="tool-desc">${tool.description || 'MCP Tool'}</div>
                <div class="tool-server">${tool.server}</div>
            </div>
        `).join('') : '<div class="no-tools">No MCP tools connected</div>';

        const agentCards = agents.map(agent => `
            <div class="agent-card" onclick="selectAgent('${agent.id}')">
                <div class="agent-name">${agent.name}</div>
                <div class="agent-desc">${agent.description || 'AI Assistant'}</div>
                <div class="agent-type">${agent.type || 'generalPurpose'}</div>
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
                    <h1>🤖 Tronagenticstar Chat</h1>
                    <div class="header-controls">
                        <div class="agent-selector">
                            <select id="agentSelect">
                                <option value="">Select an agent...</option>
                                ${agentOptions}
                            </select>
                            <select id="agentTypeSelect" style="display: none;">
                                <option value="generalPurpose">General Purpose</option>
                                <option value="explore">Explorer</option>
                                <option value="plan">Planner</option>
                                <option value="verification">Verifier</option>
                            </select>
                        </div>
                        <div class="mode-toggle">
                            <button class="mode-btn active" id="chatModeBtn" onclick="setMode('chat')">💬 Chat</button>
                            <button class="mode-btn" id="skillModeBtn" onclick="setMode('skill')">⚡ Skills</button>
                            <button class="mode-btn" id="mcpModeBtn" onclick="setMode('mcp')">🔌 MCP</button>
                        </div>
                    </div>
                    <div id="agentInfo" class="agent-info" style="display: none;">
                        <span id="agentDescription"></span>
                        <button id="clearChat" onclick="clearChat()">Clear Chat</button>
                    </div>
                </div>
                
                <div class="mode-content" id="chatContent">
                    <div class="chat-container">
                        <div class="chat-messages" id="chatMessages">
                            <div class="welcome-message">
                                <div class="welcome-content">
                                    <h3>🎯 Welcome to Tronagenticstar!</h3>
                                    <p>Select an agent or use /skill-name to execute a skill.</p>
                                    <div class="agent-preview">
                                        ${agentCards}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="chat-input-container">
                            <div class="input-wrapper">
                                <textarea id="messageInput" placeholder="Type your message or /skill-name..." disabled rows="1"></textarea>
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
                                    🏗️ Analyze
                                </button>
                                <button class="feature-btn" onclick="insertTemplate('security')" disabled id="secBtn">
                                    🛡️ Security
                                </button>
                                <button class="feature-btn" onclick="insertTemplate('quality')" disabled id="qualBtn">
                                    ⭐ Review
                                </button>
                                <button class="feature-btn" onclick="insertTemplate('performance')" disabled id="perfBtn">
                                    ⚡ Performance
                                </button>
                                <button class="feature-btn" onclick="insertTemplate('verify')" disabled id="verifyBtn">
                                    ✅ Verify
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="mode-content" id="skillContent" style="display: none;">
                    <div class="skills-panel">
                        <h3>⚡ Available Skills</h3>
                        <div class="skill-list">
                            <select id="skillSelect">
                                <option value="">Select a skill...</option>
                                ${skillOptions}
                            </select>
                            <button onclick="executeSelectedSkill()" id="executeSkillBtn" disabled>Execute Skill</button>
                        </div>
                        <div class="skill-output" id="skillOutput">
                            <div class="output-header">Skill Output</div>
                            <div class="output-content" id="outputContent"></div>
                        </div>
                    </div>
                </div>
                
                <div class="mode-content" id="mcpContent" style="display: none;">
                    <div class="mcp-panel">
                        <h3>🔌 MCP Tools</h3>
                        <div class="mcp-tools-grid">
                            ${mcpToolCards}
                        </div>
                        <div class="mcp-tool-details" id="mcpToolDetails" style="display: none;">
                            <h4 id="selectedMcpToolName"></h4>
                            <div class="tool-inputs">
                                <textarea id="mcpToolArgs" placeholder='Enter arguments JSON: {"path": "/file"}'></textarea>
                                <button onclick="executeMCPTool()" id="executeMcpBtn">Execute</button>
                            </div>
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
            let currentMode = 'chat';
            let messageCount = 0;
            let sessionStartTime = Date.now();
            let selectedMCPTool = null;
            
            const state = vscode.getState() || {};
            if (state.chatHistory) {
                restoreChatHistory(state.chatHistory);
            }
            if (state.selectedAgent) {
                selectAgent(state.selectedAgent, false);
            }
            
            document.getElementById('agentSelect').addEventListener('change', function(e) {
                const agentId = e.target.value;
                if (agentId) {
                    selectAgent(agentId);
                } else {
                    deselectAgent();
                }
            });
            
            document.getElementById('skillSelect').addEventListener('change', function(e) {
                document.getElementById('executeSkillBtn').disabled = !e.target.value;
            });
            
            const messageInput = document.getElementById('messageInput');
            messageInput.addEventListener('input', function() {
                autoResizeTextarea(this);
                checkSkillCommand(this.value);
            });
            
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            
            function checkSkillCommand(value) {
                if (value.startsWith('/')) {
                    const skillName = value.substring(1).split(' ')[0];
                    const skillSelect = document.getElementById('skillSelect');
                    if (skillSelect.querySelector('option[value="' + skillName + '"]')) {
                        skillSelect.value = skillName;
                        document.getElementById('executeSkillBtn').disabled = false;
                    }
                }
            }
            
            function setMode(mode) {
                currentMode = mode;
                document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
                document.getElementById(mode + 'ModeBtn').classList.add('active');
                
                document.getElementById('chatContent').style.display = mode === 'chat' ? 'block' : 'none';
                document.getElementById('skillContent').style.display = mode === 'skill' ? 'block' : 'none';
                document.getElementById('mcpContent').style.display = mode === 'mcp' ? 'block' : 'none';
            }
            
            function selectAgent(agentId, showWelcome = true) {
                const select = document.getElementById('agentSelect');
                const option = select.querySelector('option[value="' + agentId + '"]');
                
                if (!option) return;
                
                select.value = agentId;
                currentAgent = agentId;
                
                const messageInput = document.getElementById('messageInput');
                const sendButton = document.getElementById('sendButton');
                const agentInfo = document.getElementById('agentInfo');
                const agentDescription = document.getElementById('agentDescription');
                
                messageInput.disabled = false;
                sendButton.disabled = false;
                document.getElementById('insertCodeButton').disabled = false;
                document.getElementById('attachFileButton').disabled = false;
                messageInput.placeholder = 'Chat with ' + option.text.split(' ')[0] + '...';
                messageInput.focus();
                
                enableFeatureButtons(agentId);
                
                agentInfo.style.display = 'block';
                agentDescription.textContent = option.dataset.description;
                
                const welcomeMessage = document.querySelector('.welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.style.display = 'none';
                }
                
                if (showWelcome) {
                    const agentName = option.text.split(' ')[0];
                    addAgentMessage(agentName, 'Hello! I am ' + agentName + '. ' + (option.dataset.description || 'How can I help you today?'));
                }
                
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
                messageInput.placeholder = 'Select an agent first...';
                agentInfo.style.display = 'none';
                
                document.querySelectorAll('.feature-btn').forEach(btn => btn.disabled = true);
                
                const welcomeMessage = document.querySelector('.welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.style.display = 'block';
                }
            }
            
            function enableFeatureButtons(agentId) {
                document.querySelectorAll('.feature-btn').forEach(btn => btn.disabled = true);
                
                switch(agentId) {
                    case 'generalPurpose':
                        document.querySelectorAll('.feature-btn').forEach(btn => btn.disabled = false);
                        break;
                    case 'explore':
                        document.getElementById('archBtn').disabled = false;
                        break;
                    case 'plan':
                        document.querySelectorAll('.feature-btn').forEach(btn => btn.disabled = false);
                        break;
                    case 'verification':
                        document.getElementById('verifyBtn').disabled = false;
                        document.getElementById('qualBtn').disabled = false;
                        break;
                }
            }
            
            function insertTemplate(type) {
                const templates = {
                    architecture: "Please analyze the architecture of my current project.",
                    security: "Perform a security analysis of my code.",
                    quality: "Review my code quality and suggest improvements.",
                    performance: "Analyze the performance of my application.",
                    verify: "Verify the changes and run tests."
                };
                
                const messageInput = document.getElementById('messageInput');
                messageInput.value = templates[type] || '';
                messageInput.focus();
                autoResizeTextarea(messageInput);
            }
            
            function executeSelectedSkill() {
                const skillSelect = document.getElementById('skillSelect');
                const skillName = skillSelect.value;
                
                if (!skillName) return;
                
                const outputContent = document.getElementById('outputContent');
                outputContent.innerHTML = '<div class="loading">Executing skill: ' + skillName + '...</div>';
                
                vscode.postMessage({
                    command: 'executeSkill',
                    skill: skillName,
                    args: {}
                });
            }
            
            function selectMCPTool(toolName) {
                selectedMCPTool = toolName;
                document.getElementById('mcpToolDetails').style.display = 'block';
                document.getElementById('selectedMcpToolName').textContent = toolName;
            }
            
            function executeMCPTool() {
                if (!selectedMCPTool) return;
                
                const argsInput = document.getElementById('mcpToolArgs');
                let args = {};
                try {
                    args = argsInput.value ? JSON.parse(argsInput.value) : {};
                } catch (e) {
                    alert('Invalid JSON arguments');
                    return;
                }
                
                vscode.postMessage({
                    command: 'executeMCPTool',
                    tool: selectedMCPTool,
                    args: args
                });
            }
            
            function insertCurrentCode() {
                vscode.postMessage({ command: 'getCurrentCode' });
            }
            
            function attachFile() {
                vscode.postMessage({ command: 'getFileContext' });
            }
            
            function sendMessage() {
                const messageInput = document.getElementById('messageInput');
                const message = messageInput.value.trim();
                
                if (!message || !currentAgent) return;
                
                addUserMessage(message);
                messageInput.value = '';
                autoResizeTextarea(messageInput);
                
                addTypingIndicator();
                
                vscode.postMessage({
                    command: 'sendMessage',
                    agent: currentAgent,
                    message: message
                });
                
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
                    '<div class="message-content">' + formatMessage(message) + '</div>';
                chatMessages.appendChild(messageDiv);
                scrollToBottom();
                messageCount++;
            }
            
            function addAgentMessage(agent, message, isError = false) {
                removeTypingIndicator();
                
                const chatMessages = document.getElementById('chatMessages');
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message agent-message' + (isError ? ' error' : '');
                
                const actions = isError ? '' : 
                    '<div class="message-actions">' +
                        '<button onclick="copyMessage(this)">📋 Copy</button>' +
                        '<button onclick="retryMessage(this)">🔄 Retry</button>' +
                    '</div>';
                
                messageDiv.innerHTML = 
                    '<div class="message-header">' +
                        '<span class="message-sender">🤖 ' + agent + '</span>' +
                        '<span class="message-time">' + new Date().toLocaleTimeString() + '</span>' +
                    '</div>' +
                    '<div class="message-content">' + formatMessage(message) + '</div>' +
                    actions;
                
                chatMessages.appendChild(messageDiv);
                scrollToBottom();
                messageCount++;
                saveChatState();
            }
            
            function addTypingIndicator() {
                const chatMessages = document.getElementById('chatMessages');
                const indicator = document.createElement('div');
                indicator.className = 'message agent-message typing-indicator';
                indicator.id = 'typingIndicator';
                indicator.innerHTML = 
                    '<div class="message-header"><span class="message-sender">🤖 Agent</span></div>' +
                    '<div class="message-content"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
                chatMessages.appendChild(indicator);
                scrollToBottom();
            }
            
            function removeTypingIndicator() {
                const indicator = document.getElementById('typingIndicator');
                if (indicator) indicator.remove();
            }
            
            function clearChat() {
                if (confirm('Clear all chat messages?')) {
                    const chatMessages = document.getElementById('chatMessages');
                    chatMessages.innerHTML = '';
                    messageCount = 0;
                    vscode.setState({ ...vscode.getState(), chatHistory: null });
                    if (currentAgent) selectAgent(currentAgent);
                }
            }
            
            function copyMessage(button) {
                const content = button.closest('.message').querySelector('.message-content').textContent;
                navigator.clipboard.writeText(content).then(() => {
                    button.textContent = '✅ Copied';
                    setTimeout(() => button.textContent = '📋 Copy', 2000);
                });
            }
            
            function retryMessage(button) {
                const messageDiv = button.closest('.message');
                const isUser = messageDiv.classList.contains('user-message');
                
                if (isUser) {
                    const content = messageDiv.querySelector('.message-content').textContent;
                    const input = document.getElementById('messageInput');
                    input.value = content;
                    input.focus();
                }
            }
            
            function autoResizeTextarea(textarea) {
                textarea.style.height = 'auto';
                textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
            }
            
            function scrollToBottom() {
                document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
            }
            
            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }
            
            function formatMessage(text) {
                let formatted = escapeHtml(text);
                formatted = formatted.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre class="code-block"><code>$1</code></pre>');
                formatted = formatted.replace(/\`([^\`]*)\`/g, '<code class="inline-code">$1</code>');
                formatted = formatted.replace(/\*\*([^*]*)\*\*/g, '<strong>$1</strong>');
                formatted = formatted.replace(/\*([^*]*)\*/g, '<em>$1</em>');
                formatted = formatted.replace(/\\n/g, '<br>');
                return formatted;
            }
            
            function saveChatState() {
                const chatMessages = document.getElementById('chatMessages');
                const messages = Array.from(chatMessages.children).map(msg => ({
                    className: msg.className,
                    innerHTML: msg.innerHTML
                }));
                vscode.setState({ ...vscode.getState(), chatHistory: messages });
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
                const input = document.getElementById('messageInput');
                const block = '\`\`\`' + (language || '') + '\\n' + code + '\\n\`\`\`';
                input.value = input.value + (input.value ? '\\n\\n' : '') + block;
                autoResizeTextarea(input);
                input.focus();
            }
            
            window.addEventListener('message', event => {
                const message = event.data;
                
                switch (message.command) {
                    case 'agentResponse':
                        addAgentMessage(message.agent, message.response, message.isError);
                        break;
                    case 'skillOutput':
                        document.getElementById('outputContent').innerHTML = formatMessage(message.output);
                        break;
                    case 'mcpToolResult':
                        alert('MCP Tool Result: ' + message.result);
                        break;
                    case 'currentCode':
                        insertCodeIntoMessage(message.code, message.language);
                        break;
                    case 'fileContext':
                        const input = document.getElementById('messageInput');
                        input.value = input.value + 'File: ' + message.fileName + '\\n\`\`\`\\n' + message.content + '\\n\`\`\`';
                        autoResizeTextarea(input);
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
            case 'executeSkill':
                await this._executeSkill(message.skill, message.args);
                break;
            case 'executeMCPTool':
                await this._executeMCPTool(message.tool, message.args);
                break;
            case 'getCurrentCode':
                await this._sendCurrentCode();
                break;
            case 'getFileContext':
                await this._sendFileContext();
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
            if (!editor) return;

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

    private async _sendMessageToAgent(agent: string, message: string) {
        try {
            setTimeout(() => {
                this._panel?.webview.postMessage({
                    command: 'agentResponse',
                    agent: agent,
                    response: `Hello! I'm ${agent}. I received: "${message}".\n\nI can help with:\n- Code analysis & suggestions\n- Security assessments\n- Performance optimizations\n- Architecture reviews\n- Verification & testing`,
                    isError: false
                });
            }, 1000);
        } catch (error) {
            logger.error(`Failed to send message to agent ${agent}`, error);
            this._panel?.webview.postMessage({
                command: 'agentResponse',
                agent: agent,
                response: `Error: ${error}`,
                isError: true
            });
        }
    }

    private async _executeSkill(skillName: string, args: any) {
        try {
            const result = await this.orchestratorAPI.executeSkill(skillName, args);
            this._panel?.webview.postMessage({
                command: 'skillOutput',
                output: result || `Skill ${skillName} executed successfully.`
            });
        } catch (error) {
            this._panel?.webview.postMessage({
                command: 'skillOutput',
                output: `Error executing skill ${skillName}: ${error}`
            });
        }
    }

    private async _executeMCPTool(toolName: string, args: any) {
        try {
            const result = await this.orchestratorAPI.executeMCPTool(toolName, args);
            this._panel?.webview.postMessage({
                command: 'mcpToolResult',
                result: result
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to execute MCP tool: ${error}`);
        }
    }
}
