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
    logger.info('AgentForge extension is activating...');

    // Initialize configuration
    const config = new Config();
    
    // Set context for when clause
    await vscode.commands.executeCommand('setContext', 'agentforge.enabled', true);

    // Initialize services
    const orchestratorAPI = new OrchestratorAPI(context);
    const wsManager = new WebSocketManager(orchestratorAPI);

    // Initialize data providers
    const activityProvider = new AgentActivityProvider(orchestratorAPI);
    const agentsProvider = new AgentsProvider(orchestratorAPI);

    // Register tree data providers
    vscode.window.registerTreeDataProvider('agentforge.activity', activityProvider);
    vscode.window.registerTreeDataProvider('agentforge.agents', agentsProvider);

    // Initialize panels (these will be created on demand)
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
        
        vscode.commands.registerCommand('agentforge.triggerSecurityScan', async () => {
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
        
        vscode.commands.registerCommand('agentforge.triggerQualityCheck', async () => {
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
        
        vscode.commands.registerCommand('agentforge.generateAgent', async () => {
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
        
        vscode.commands.registerCommand('agentforge.refreshActivity', () => {
            activityProvider.refresh();
            agentsProvider.refresh();
        })
    ];

    // Register all commands
    commands.forEach(command => context.subscriptions.push(command));

    // Start WebSocket connection if real-time updates are enabled
    if (config.get('enableRealTimeUpdates')) {
        try {
            await wsManager.connect();
            logger.info('WebSocket connection established');
        } catch (error) {
            logger.error('Failed to establish WebSocket connection', error);
        }
    }

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('agentforge.hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Welcome to AgentForge! Your AI agent orchestration is ready.',
            'Show Dashboard',
            'Open Settings'
        ).then(selection => {
            switch (selection) {
                case 'Show Dashboard':
                    vscode.commands.executeCommand('agentforge.showDashboard');
                    break;
                case 'Open Settings':
                    vscode.commands.executeCommand('agentforge.showSettings');
                    break;
            }
        });
        
        context.globalState.update('agentforge.hasShownWelcome', true);
    }

    logger.info('AgentForge extension activated successfully');
}

export function deactivate() {
    logger.info('AgentForge extension is deactivating...');
}
