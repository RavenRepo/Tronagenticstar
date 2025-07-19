import * as vscode from 'vscode';
import { OrchestratorAPI, AgentActivity } from '../services/OrchestratorAPI';
import { logger } from '../utils/logger';

export class AgentActivityItem extends vscode.TreeItem {
    constructor(
        public readonly activity: AgentActivity,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(activity.action, collapsibleState);

        this.tooltip = `${activity.agentName}: ${activity.action}`;
        this.description = activity.status;

        // Set icon based on status
        switch (activity.status) {
            case 'running':
                this.iconPath = new vscode.ThemeIcon('loading~spin');
                break;
            case 'completed':
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                break;
            case 'failed':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
                break;
        }

        // Set context value for command contributions
        this.contextValue = `activity-${activity.status}`;

        // Add timestamp to label
        const timestamp = activity.startTime.toLocaleTimeString();
        this.label = `[${timestamp}] ${activity.action}`;
    }
}

export class AgentActivityProvider implements vscode.TreeDataProvider<AgentActivityItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<AgentActivityItem | undefined | null | void> = new vscode.EventEmitter<AgentActivityItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<AgentActivityItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private activities: AgentActivity[] = [];

    constructor(private orchestratorAPI: OrchestratorAPI) {
        this.refresh();
    }

    refresh(): void {
        this.loadActivities();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: AgentActivityItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: AgentActivityItem): Promise<AgentActivityItem[]> {
        if (!element) {
            // Return root level items (activities)
            return Promise.resolve(this.activities.map(activity => 
                new AgentActivityItem(activity, vscode.TreeItemCollapsibleState.Collapsed)
            ));
        } else {
            // Return details for a specific activity
            return Promise.resolve(this.getActivityDetails(element.activity));
        }
    }

    private getActivityDetails(activity: AgentActivity): AgentActivityItem[] {
        const details: AgentActivityItem[] = [];

        // Add basic details as tree items
        details.push(new AgentActivityItem({
            ...activity,
            action: `Agent: ${activity.agentName}`,
            status: activity.status
        }, vscode.TreeItemCollapsibleState.None));

        details.push(new AgentActivityItem({
            ...activity,
            action: `Status: ${activity.status}`,
            status: activity.status
        }, vscode.TreeItemCollapsibleState.None));

        details.push(new AgentActivityItem({
            ...activity,
            action: `Started: ${activity.startTime.toLocaleString()}`,
            status: activity.status
        }, vscode.TreeItemCollapsibleState.None));

        if (activity.endTime) {
            details.push(new AgentActivityItem({
                ...activity,
                action: `Ended: ${activity.endTime.toLocaleString()}`,
                status: activity.status
            }, vscode.TreeItemCollapsibleState.None));
        }

        if (activity.error) {
            details.push(new AgentActivityItem({
                ...activity,
                action: `Error: ${activity.error}`,
                status: activity.status
            }, vscode.TreeItemCollapsibleState.None));
        }

        return details;
    }

    private async loadActivities(): Promise<void> {
        try {
            this.activities = await this.orchestratorAPI.getAgentActivity(20);
            logger.debug(`Loaded ${this.activities.length} activities`);
        } catch (error) {
            logger.error('Failed to load agent activities', error);
            this.activities = [];
        }
    }
}
