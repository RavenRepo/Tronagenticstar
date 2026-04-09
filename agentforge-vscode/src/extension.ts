import * as vscode from 'vscode';
import { AgentActivityPanel } from './panels/AgentActivityPanel';
import { ChatPanel } from './panels/ChatPanel';
import { DashboardPanel } from './panels/DashboardPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { OrchestratorAPI } from './services/OrchestratorAPI';
import { WebSocketManager } from './services/WebSocketManager';
import { AgentActivityProvider } from './providers/AgentActivityProvider';
import { AgentsProvider } from './providers/AgentsProvider';
import { logger } from './utils/logger';
import { Config } from './utils/config';

export async function activate(context: vscode.ExtensionContext) {
    logger.info('Tronagenticstar extension is activating...');

    const config = new Config();
    
    await vscode.commands.executeCommand('setContext', 'tronagenticstar.enabled', true);

    const orchestratorAPI = new OrchestratorAPI(context);
    const wsManager = new WebSocketManager(orchestratorAPI);

    const activityProvider = new AgentActivityProvider(orchestratorAPI);
    const agentsProvider = new AgentsProvider(orchestratorAPI);

    vscode.window.registerTreeDataProvider('tronagenticstar.activity', activityProvider);
    vscode.window.registerTreeDataProvider('tronagenticstar.agents', agentsProvider);

    const activityPanel = new AgentActivityPanel(context, orchestratorAPI, wsManager);
    const chatPanel = new ChatPanel(context, orchestratorAPI, wsManager);
    const dashboardPanel = new DashboardPanel(context, orchestratorAPI);
    const settingsPanel = new SettingsPanel(context);

    const commands = [
        vscode.commands.registerCommand('tronagenticstar.showActivity', () => {
            activityPanel.show();
        }),
        
        vscode.commands.registerCommand('tronagenticstar.openChat', () => {
            chatPanel.show();
        }),
        
        vscode.commands.registerCommand('tronagenticstar.showDashboard', () => {
            dashboardPanel.show();
        }),
        
        vscode.commands.registerCommand('tronagenticstar.showSettings', () => {
            settingsPanel.show();
        }),
        
        vscode.commands.registerCommand('tronagenticstar.triggerArchitectureAnalysis', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('No workspace folder found');
                return;
            }
            
            try {
                await orchestratorAPI.triggerAgent('DesignForge', {
                    action: 'analyze_architecture',
                    workspace: workspaceFolder.uri.fsPath
                });
                vscode.window.showInformationMessage('Architecture analysis started');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start architecture analysis: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.triggerSecurityScan', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('No workspace folder found');
                return;
            }
            
            try {
                await orchestratorAPI.triggerAgent('SecuriShield', {
                    action: 'security_scan',
                    workspace: workspaceFolder.uri.fsPath
                });
                vscode.window.showInformationMessage('Security scan started');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start security scan: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.triggerQualityCheck', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('No workspace folder found');
                return;
            }
            
            try {
                await orchestratorAPI.triggerAgent('CodeCraft', {
                    action: 'quality_check',
                    workspace: workspaceFolder.uri.fsPath
                });
                vscode.window.showInformationMessage('Quality check started');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start quality check: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.generateAgent', async () => {
            const agentName = await vscode.window.showInputBox({
                prompt: 'Enter agent name',
                placeHolder: 'e.g., MyCustomAgent'
            });
            
            if (!agentName) {
                return;
            }
            
            const agentType = await vscode.window.showQuickPick([
                'Specialist Agent',
                'Generic Agent',
                'Custom Agent'
            ], {
                placeHolder: 'Select agent type'
            });
            
            if (!agentType) {
                return;
            }
            
            try {
                await orchestratorAPI.generateAgent(agentName, agentType);
                vscode.window.showInformationMessage(`Agent ${agentName} generated successfully`);
                agentsProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to generate agent: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.refreshActivity', () => {
            activityProvider.refresh();
            agentsProvider.refresh();
        }),

        vscode.commands.registerCommand('tronagenticstar.executeTool', async () => {
            const toolName = await vscode.window.showInputBox({
                prompt: 'Enter tool name to execute',
                placeHolder: 'e.g., read_file, grep'
            });
            
            if (!toolName) {
                return;
            }
            
            const toolArgs = await vscode.window.showInputBox({
                prompt: 'Enter tool arguments (JSON)',
                placeHolder: '{"path": "/path/to/file"}'
            });
            
            try {
                const args = toolArgs ? JSON.parse(toolArgs) : {};
                await orchestratorAPI.executeTool(toolName, args);
                vscode.window.showInformationMessage(`Tool ${toolName} executed successfully`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to execute tool: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.listTools', async () => {
            try {
                const tools = await orchestratorAPI.listTools();
                const toolList = tools.map(t => `${t.name}: ${t.description}`).join('\n');
                
                const doc = await vscode.window.showTextDocument(
                    vscode.Uri.parse(`tronagenticstar://tools`),
                    { viewColumn: vscode.ViewColumn.One, preserveFocus: true }
                );
                await doc.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), toolList);
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list tools: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.forkAgent', async () => {
            const agentType = await vscode.window.showQuickPick([
                'generalPurpose',
                'explore',
                'plan',
                'verification'
            ], {
                placeHolder: 'Select agent type to fork'
            });
            
            if (!agentType) {
                return;
            }
            
            const contextOption = await vscode.window.showQuickPick([
                'Current file',
                'Selected code',
                'Open files',
                'Entire workspace'
            ], {
                placeHolder: 'Select context for subagent'
            });
            
            try {
                await orchestratorAPI.forkAgent(agentType, contextOption);
                vscode.window.showInformationMessage(`Forked ${agentType} agent with ${contextOption} context`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to fork agent: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.exploreFiles', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('No workspace folder found');
                return;
            }
            
            const pattern = await vscode.window.showInputBox({
                prompt: 'Enter file pattern',
                placeHolder: '*.ts, *.js, src/**'
            });
            
            try {
                await orchestratorAPI.exploreFiles(workspaceFolder.uri.fsPath, pattern || '*');
                vscode.window.showInformationMessage('File exploration started');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to explore files: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.verifyChanges', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('No workspace folder found');
                return;
            }
            
            try {
                await orchestratorAPI.triggerAgent('Verifier', {
                    action: 'verify_changes',
                    workspace: workspaceFolder.uri.fsPath
                });
                vscode.window.showInformationMessage('Verification started');
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to run verification: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.listSkills', async () => {
            try {
                const skills = await orchestratorAPI.listSkills();
                const skillList = skills.map(s => `${s.name}: ${s.description}`).join('\n');
                
                vscode.window.showInformationMessage(`Available skills: ${skills.length}`);
                
                const doc = await vscode.window.showTextDocument(
                    vscode.Uri.parse(`tronagenticstar://skills`),
                    { viewColumn: vscode.ViewColumn.One, preserveFocus: true }
                );
                await doc.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), skillList);
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list skills: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.executeSkill', async () => {
            const skillName = await vscode.window.showInputBox({
                prompt: 'Enter skill name to execute',
                placeHolder: 'e.g., apex-architect, context7-mcp'
            });
            
            if (!skillName) {
                return;
            }
            
            const skillArgs = await vscode.window.showInputBox({
                prompt: 'Enter skill arguments (JSON)',
                placeHolder: '{}'
            });
            
            try {
                const args = skillArgs ? JSON.parse(skillArgs) : {};
                await orchestratorAPI.executeSkill(skillName, args);
                vscode.window.showInformationMessage(`Skill ${skillName} executed successfully`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to execute skill: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.connectMCP', async () => {
            const serverName = await vscode.window.showInputBox({
                prompt: 'Enter MCP server name',
                placeHolder: 'e.g., filesystem, github'
            });
            
            if (!serverName) {
                return;
            }
            
            const serverConfig = await vscode.window.showInputBox({
                prompt: 'Enter server configuration (JSON)',
                placeHolder: '{"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]}'
            });
            
            try {
                const config = serverConfig ? JSON.parse(serverConfig) : {};
                await orchestratorAPI.connectMCP(serverName, config);
                vscode.window.showInformationMessage(`MCP server ${serverName} connected`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to connect MCP server: ${error}`);
            }
        }),
        
        vscode.commands.registerCommand('tronagenticstar.listMCPTools', async () => {
            try {
                const tools = await orchestratorAPI.listMCPTools();
                const toolList = tools.map(t => `${t.server}: ${t.name} - ${t.description}`).join('\n');
                
                vscode.window.showInformationMessage(`MCP Tools: ${tools.length} available`);
                
                const doc = await vscode.window.showTextDocument(
                    vscode.Uri.parse(`tronagenticstar://mcp-tools`),
                    { viewColumn: vscode.ViewColumn.One, preserveFocus: true }
                );
                await doc.edit(edit => {
                    edit.insert(new vscode.Position(0, 0), toolList);
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list MCP tools: ${error}`);
            }
        })
    ];

    commands.forEach(command => context.subscriptions.push(command));

    if (config.get('enableRealTimeUpdates')) {
        try {
            await wsManager.connect();
            logger.info('WebSocket connection established');
        } catch (error) {
            logger.error('Failed to establish WebSocket connection', error);
        }
    }

    const hasShownWelcome = context.globalState.get('tronagenticstar.hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Welcome to Tronagenticstar! Your AI agent orchestration is ready.',
            'Show Dashboard',
            'Open Settings'
        ).then(selection => {
            switch (selection) {
                case 'Show Dashboard':
                    vscode.commands.executeCommand('tronagenticstar.showDashboard');
                    break;
                case 'Open Settings':
                    vscode.commands.executeCommand('tronagenticstar.showSettings');
                    break;
            }
        });
        
        context.globalState.update('tronagenticstar.hasShownWelcome', true);
    }

    logger.info('Tronagenticstar extension activated successfully');
}

export function deactivate() {
    logger.info('Tronagenticstar extension is deactivating...');
}
