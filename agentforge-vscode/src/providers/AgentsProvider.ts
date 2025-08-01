import * as vscode from 'vscode';
import { OrchestratorAPI, Agent } from '../services/OrchestratorAPI';
import { logger } from '../utils/logger';

export class AgentItem extends vscode.TreeItem {
    constructor(
        public readonly agent: Agent,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(agent.name, collapsibleState);

        this.tooltip = `${agent.name} (${agent.type})`;
        this.description = agent.status;

        // Set icon based on status
        switch (agent.status) {
            case 'active':
                this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'));
                break;
            case 'idle':
                this.iconPath = new vscode.ThemeIcon('circle-outline');
                break;
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
                break;
        }

        // Set context value for command contributions
        this.contextValue = `agent-${agent.status}`;
    }
}

export class AgentsProvider implements vscode.TreeDataProvider<AgentItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AgentItem | undefined | null | void> = new vscode.EventEmitter<AgentItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AgentItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private agents: Agent[] = [];

    constructor(private orchestratorAPI: OrchestratorAPI) {
        this.refresh();
    }

    refresh(): void {
        this.loadAgents();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AgentItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AgentItem): Promise<AgentItem[]> {
        if (!element) {
            // Return root level items (agents)
            return Promise.resolve(this.agents.map(agent => 
                new AgentItem(agent, vscode.TreeItemCollapsibleState.Collapsed)
            ));
        } else {
            // Return details for a specific agent
            return Promise.resolve(this.getAgentDetails(element.agent));
        }
    }

    private getAgentDetails(agent: Agent): AgentItem[] {
        const details: AgentItem[] = [];

        // Add basic details as tree items
        details.push(new AgentItem({
            ...agent,
            name: `Type: ${agent.type}`,
            status: agent.status
        }, vscode.TreeItemCollapsibleState.None));

        details.push(new AgentItem({
            ...agent,
            name: `Status: ${agent.status}`,
            status: agent.status
        }, vscode.TreeItemCollapsibleState.None));

        if (agent.description) {
            details.push(new AgentItem({
                ...agent,
                name: `Description: ${agent.description}`,
                status: agent.status
            }, vscode.TreeItemCollapsibleState.None));
        }

        if (agent.lastActivity) {
            details.push(new AgentItem({
                ...agent,
                name: `Last Activity: ${agent.lastActivity.toLocaleString()}`,
                status: agent.status
            }, vscode.TreeItemCollapsibleState.None));
        }

        return details;
    }

    private async loadAgents(): Promise<void> {
        try {
            this.agents = await this.orchestratorAPI.getAgents();
            logger.debug(`Loaded ${this.agents.length} agents`);
        } catch (error) {
            logger.error('Failed to load agents', error);
            this.agents = [];
        }
    }
}
