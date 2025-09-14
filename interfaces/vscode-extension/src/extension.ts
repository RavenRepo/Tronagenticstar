/**
 * Constella AI Architect - VS Code Extension
 * Enterprise AI Operating Platform Integration
 *
 * This extension provides seamless integration with Constella's multi-agent
 * orchestration platform directly within VS Code.
 */

import * as vscode from "vscode";
import axios, { AxiosResponse } from "axios";
import * as WebSocket from "ws";

// Types and Interfaces
interface ConstellaConfig {
  orchestratorUrl: string;
  apiToken?: string;
  projectId?: string;
  autoExecuteWorkflows: boolean;
  notificationLevel: "all" | "errors" | "none";
  defaultTechStack: string[];
  qualityGates: {
    coverage: number;
    codeQuality: string;
    securityScan: boolean;
    performanceCheck: boolean;
  };
}

interface WorkflowTask {
  id: string;
  agent_type: string;
  task_type: string;
  description: string;
  priority: number;
  estimated_duration_minutes: number;
  dependencies: string[];
  status?: "pending" | "running" | "completed" | "failed";
}

interface Workflow {
  workflow_id: string;
  total_subtasks: number;
  subtasks: WorkflowTask[];
  estimated_duration_minutes: number;
  status: "created" | "running" | "completed" | "failed";
}

interface WorkflowStatus {
  workflow_id: string;
  status: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  pending_tasks: number;
  tasks: {
    id: string;
    agent_type: string;
    description: string;
    status: string;
    progress: string;
  }[];
}

// Extension State Management
class ConstellaExtension {
  private config: ConstellaConfig;
  private activeWorkflows: Map<string, Workflow> = new Map();
  private statusBarItem: vscode.StatusBarItem;
  private workflowTreeProvider: WorkflowTreeProvider;
  private agentTreeProvider: AgentTreeProvider;
  private outputChannel: vscode.OutputChannel;
  private webSocket: WebSocket | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.config = this.loadConfiguration();
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.outputChannel = vscode.window.createOutputChannel("Constella AI");

    // Initialize tree providers
    this.workflowTreeProvider = new WorkflowTreeProvider(this);
    this.agentTreeProvider = new AgentTreeProvider(this);

    // Register tree views
    vscode.window.createTreeView("constellaWorkflows", {
      treeDataProvider: this.workflowTreeProvider,
    });
    vscode.window.createTreeView("constellaAgents", {
      treeDataProvider: this.agentTreeProvider,
    });

    // Initialize status bar
    this.updateStatusBar();
    this.statusBarItem.show();

    // Setup WebSocket connection for real-time updates
    this.connectWebSocket();

    context.subscriptions.push(this.statusBarItem, this.outputChannel);
  }

  private loadConfiguration(): ConstellaConfig {
    const config = vscode.workspace.getConfiguration("constella");
    return {
      orchestratorUrl: config.get("orchestratorUrl", "http://localhost:8000"),
      apiToken: config.get("apiToken", ""),
      projectId: config.get("projectId", ""),
      autoExecuteWorkflows: config.get("autoExecuteWorkflows", false),
      notificationLevel: config.get("notificationLevel", "all"),
      defaultTechStack: config.get("defaultTechStack", [
        "JavaScript",
        "TypeScript",
        "Node.js",
        "React",
      ]),
      qualityGates: config.get("qualityGates", {
        coverage: 80,
        codeQuality: "A",
        securityScan: true,
        performanceCheck: true,
      }),
    };
  }

  private updateStatusBar() {
    const activeCount = this.activeWorkflows.size;
    this.statusBarItem.text = `$(robot) Constella (${activeCount})`;
    this.statusBarItem.tooltip = `${activeCount} active workflows`;
    this.statusBarItem.command = "constella.viewWorkflows";
  }

  private connectWebSocket() {
    // WebSocket connection for real-time workflow updates
    try {
      const wsUrl = this.config.orchestratorUrl.replace("http", "ws") + "/ws";
      this.webSocket = new WebSocket(wsUrl);

      this.webSocket.on("open", () => {
        this.log("Connected to Constella orchestrator WebSocket");
        this.sendHeartbeat();
      });

      this.webSocket.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          this.log(`Error parsing WebSocket message: ${error}`);
        }
      });

      this.webSocket.on("error", (error) => {
        this.log(`WebSocket error: ${error}`);
        this.scheduleReconnect();
      });

      this.webSocket.on("close", () => {
        this.log("WebSocket connection closed");
        this.scheduleReconnect();
      });

      // Send periodic heartbeat to keep connection alive
      setInterval(() => {
        this.sendHeartbeat();
      }, 30000); // 30 seconds
    } catch (error) {
      this.log(`Failed to connect WebSocket: ${error}`);
      this.scheduleReconnect();
    }
  }

  private sendHeartbeat() {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify({ type: "ping" }));
    }
  }

  private scheduleReconnect() {
    setTimeout(() => {
      this.log("Attempting to reconnect WebSocket...");
      this.connectWebSocket();
    }, 5000); // Retry after 5 seconds
  }

  private handleWebSocketMessage(message: any) {
    switch (message.type) {
      case "workflow_update":
        this.handleWorkflowUpdate(message.data);
        break;
      case "agent_activity":
        this.handleAgentActivity(message.data);
        break;
      case "task_completed":
        this.handleTaskCompletion(message.data);
        break;
      case "pong":
        // Heartbeat response - connection is alive
        break;
      case "subscribed":
        this.log(`Subscribed to workflow: ${message.workflow_id}`);
        break;
      default:
        this.log(`Unknown WebSocket message type: ${message.type}`);
    }
  }

  private handleWorkflowUpdate(data: any) {
    // Update workflow status and refresh UI
    this.workflowTreeProvider.refresh();
    this.agentTreeProvider.refresh();

    const message = `Workflow ${data.workflow_id}: ${data.message}`;
    this.log(message);

    if (this.config.notificationLevel === "all") {
      if (data.status === "completed") {
        vscode.window.showInformationMessage(`✅ ${message}`);
      } else if (data.status === "failed") {
        vscode.window.showErrorMessage(`❌ ${message}`);
      } else if (data.status === "started") {
        vscode.window.showInformationMessage(`🚀 ${message}`);
      } else {
        vscode.window.showInformationMessage(message);
      }
    }

    // Update status bar
    this.updateStatusBarWithActivity(data.status, data.message);
  }

  private handleAgentActivity(data: any) {
    const activity = `${data.agent_type}: ${data.activity}`;
    this.log(`Agent Activity - ${activity}`);

    // Update agent status in tree view
    this.agentTreeProvider.updateAgentStatus(data.agent_type, data.activity);

    if (
      this.config.notificationLevel === "all" &&
      data.activity.includes("completed")
    ) {
      vscode.window.showInformationMessage(
        `🤖 Agent ${data.agent_type} completed task`,
      );
    }
  }

  private handleTaskCompletion(data: any) {
    this.log(`Task completed: ${data.task_id} by ${data.agent_type}`);

    // Send notification for important task completions
    if (data.agent_type === "securishield") {
      vscode.window.showInformationMessage(
        `🛡️ Security scan completed by ${data.agent_type}`,
      );
    } else if (data.agent_type === "codecraft") {
      vscode.window.showInformationMessage(
        `⚡ Code generation completed by ${data.agent_type}`,
      );
    }
  }

  private updateStatusBarWithActivity(status: string, message: string) {
    const activeCount = this.activeWorkflows.size;
    let icon = "$(robot)";

    switch (status) {
      case "started":
        icon = "$(loading~spin)";
        break;
      case "completed":
        icon = "$(check)";
        break;
      case "failed":
        icon = "$(error)";
        break;
    }

    this.statusBarItem.text = `${icon} Constella (${activeCount})`;
    this.statusBarItem.tooltip = message || `${activeCount} active workflows`;

    // Reset icon after 3 seconds
    setTimeout(() => {
      this.statusBarItem.text = `$(robot) Constella (${activeCount})`;
    }, 3000);
  }

  public log(message: string) {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);

    if (this.config.notificationLevel === "all") {
      console.log(`[Constella] ${message}`);
    }
  }

  // Main orchestration method
  public async orchestrateTask(
    taskDescription: string,
    taskType: string,
    options: {
      priority?: number;
      techStack?: string[];
      requirements?: any;
    } = {},
  ): Promise<Workflow> {
    try {
      this.log(`Orchestrating task: ${taskDescription}`);

      const payload = {
        task_description: taskDescription,
        task_type: taskType,
        project_id: this.config.projectId || this.generateProjectId(),
        priority: options.priority || 5,
        requirements: {
          ...options.requirements,
          quality_gates: this.config.qualityGates,
        },
        technology_stack: options.techStack || this.config.defaultTechStack,
      };

      const response: AxiosResponse<Workflow> = await axios.post(
        `${this.config.orchestratorUrl}/orchestrate`,
        payload,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        },
      );

      const workflow = response.data;
      this.activeWorkflows.set(workflow.workflow_id, workflow);
      this.updateStatusBar();
      this.workflowTreeProvider.refresh();

      this.log(
        `Workflow created: ${workflow.workflow_id} with ${workflow.total_subtasks} tasks`,
      );

      if (this.config.notificationLevel === "all") {
        const action = await vscode.window.showInformationMessage(
          `Workflow created with ${workflow.total_subtasks} tasks. Estimated duration: ${workflow.estimated_duration_minutes} minutes`,
          "Execute Now",
          "View Details",
          "Subscribe to Updates",
        );

        if (action === "Execute Now") {
          await this.executeWorkflow(workflow.workflow_id);
        } else if (action === "View Details") {
          this.showWorkflowDetails(workflow);
        } else if (action === "Subscribe to Updates") {
          this.subscribeToWorkflow(workflow.workflow_id);
        }
      }

      // Auto-subscribe to workflow updates
      this.subscribeToWorkflow(workflow.workflow_id);

      // Auto-execute if configured
      if (this.config.autoExecuteWorkflows) {
        await this.executeWorkflow(workflow.workflow_id);
      }

      return workflow;
    } catch (error: any) {
      const message = `Failed to orchestrate task: ${error.response?.data?.detail || error.message}`;
      this.log(message);

      if (this.config.notificationLevel !== "none") {
        vscode.window.showErrorMessage(message);
      }

      throw error;
    }
  }

  public async executeWorkflow(workflowId: string): Promise<void> {
    try {
      this.log(`Executing workflow: ${workflowId}`);

      // Show progress notification
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Executing Workflow",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: `Starting workflow ${workflowId}...` });

          await axios.post(
            `${this.config.orchestratorUrl}/workflows/${workflowId}/execute`,
            {},
            {
              headers: this.getAuthHeaders(),
              timeout: 10000,
            },
          );

          progress.report({
            message: "Workflow execution started successfully",
          });
        },
      );

      this.log(`Workflow execution started: ${workflowId}`);
    } catch (error: any) {
      const message = `Failed to execute workflow: ${error.response?.data?.detail || error.message}`;
      this.log(message);

      if (this.config.notificationLevel !== "none") {
        vscode.window.showErrorMessage(message);
      }
    }
  }

  public subscribeToWorkflow(workflowId: string): void {
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(
        JSON.stringify({
          type: "subscribe_workflow",
          workflow_id: workflowId,
        }),
      );
      this.log(`Subscribed to workflow updates: ${workflowId}`);
    }
  }

  public async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
    const response: AxiosResponse<WorkflowStatus> = await axios.get(
      `${this.config.orchestratorUrl}/workflows/${workflowId}/status`,
      {
        headers: this.getAuthHeaders(),
        timeout: 10000,
      },
    );

    return response.data;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiToken) {
      headers["Authorization"] = `Bearer ${this.config.apiToken}`;
    }

    return headers;
  }

  private generateProjectId(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return workspaceFolder.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    }
    return "default_project";
  }

  private showWorkflowDetails(workflow: Workflow) {
    const panel = vscode.window.createWebviewPanel(
      "constellaWorkflow",
      `Workflow: ${workflow.workflow_id}`,
      vscode.ViewColumn.One,
      { enableScripts: true },
    );

    panel.webview.html = this.generateWorkflowHTML(workflow);
  }

  private generateWorkflowHTML(workflow: Workflow): string {
    const tasksHTML = workflow.subtasks
      .map(
        (task) => `
            <div class="task">
                <h3>${task.description}</h3>
                <p><strong>Agent:</strong> ${task.agent_type}</p>
                <p><strong>Type:</strong> ${task.task_type}</p>
                <p><strong>Priority:</strong> ${task.priority}</p>
                <p><strong>Duration:</strong> ${task.estimated_duration_minutes} min</p>
                <p><strong>Status:</strong> <span class="status ${task.status || "pending"}">${task.status || "pending"}</span></p>
            </div>
        `,
      )
      .join("");

    return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; margin: 20px; }
                    .workflow { border: 1px solid #ccc; padding: 20px; margin-bottom: 20px; }
                    .task { border-left: 4px solid #007acc; padding: 10px; margin: 10px 0; background: #f5f5f5; }
                    .status { padding: 2px 8px; border-radius: 3px; color: white; }
                    .status.pending { background-color: #888; }
                    .status.running { background-color: #007acc; }
                    .status.completed { background-color: #28a745; }
                    .status.failed { background-color: #dc3545; }
                </style>
            </head>
            <body>
                <div class="workflow">
                    <h1>Workflow: ${workflow.workflow_id}</h1>
                    <p><strong>Total Tasks:</strong> ${workflow.total_subtasks}</p>
                    <p><strong>Estimated Duration:</strong> ${workflow.estimated_duration_minutes} minutes</p>
                    <p><strong>Status:</strong> ${workflow.status}</p>
                    <h2>Tasks:</h2>
                    ${tasksHTML}
                </div>
            </body>
            </html>
        `;
  }

  public getActiveWorkflows(): Map<string, Workflow> {
    return this.activeWorkflows;
  }

  public refreshWorkflows() {
    this.workflowTreeProvider.refresh();
  }

  public dispose() {
    if (this.webSocket) {
      this.webSocket.close();
    }
  }
}

// Tree Data Provider for Workflows
class WorkflowTreeProvider implements vscode.TreeDataProvider<WorkflowItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    WorkflowItem | undefined | null | void
  > = new vscode.EventEmitter<WorkflowItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    WorkflowItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private extension: ConstellaExtension) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorkflowItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: WorkflowItem): Thenable<WorkflowItem[]> {
    if (!element) {
      // Root level - show workflows
      const workflows = Array.from(
        this.extension.getActiveWorkflows().values(),
      );
      return Promise.resolve(
        workflows.map(
          (workflow) =>
            new WorkflowItem(
              workflow.workflow_id,
              `${workflow.total_subtasks} tasks (${workflow.estimated_duration_minutes}min)`,
              vscode.TreeItemCollapsibleState.Collapsed,
              workflow,
            ),
        ),
      );
    } else {
      // Show tasks for this workflow
      const workflow = element.workflow;
      if (workflow) {
        return Promise.resolve(
          workflow.subtasks.map(
            (task) =>
              new WorkflowItem(
                task.description,
                `${task.agent_type} - ${task.status || "pending"}`,
                vscode.TreeItemCollapsibleState.None,
              ),
          ),
        );
      }
    }
    return Promise.resolve([]);
  }
}

class WorkflowItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly workflow?: Workflow,
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label}: ${this.description}`;
  }
}

// Tree Data Provider for Agents
class AgentTreeProvider implements vscode.TreeDataProvider<AgentItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    AgentItem | undefined | null | void
  > = new vscode.EventEmitter<AgentItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    AgentItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private agentStatuses: Map<
    string,
    { status: string; lastActivity: string; timestamp: Date }
  > = new Map();

  constructor(private extension: ConstellaExtension) {
    // Initialize agent statuses
    this.initializeAgentStatuses();
  }

  private initializeAgentStatuses() {
    const agents = [
      "codecraft",
      "securishield",
      "designforge",
      "perfpulse",
      "evaluator",
      "soc2-compliance",
      "expressops",
      "mobilefirstops",
      "database-agent",
    ];

    agents.forEach((agent) => {
      this.agentStatuses.set(agent, {
        status: "idle",
        lastActivity: "Ready",
        timestamp: new Date(),
      });
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateAgentStatus(agentType: string, activity: string): void {
    const currentStatus = this.agentStatuses.get(agentType.toLowerCase()) || {
      status: "active",
      lastActivity: "Unknown",
      timestamp: new Date(),
    };

    const newStatus = activity.includes("completed")
      ? "idle"
      : activity.includes("failed")
        ? "error"
        : "active";

    this.agentStatuses.set(agentType.toLowerCase(), {
      status: newStatus,
      lastActivity: activity,
      timestamp: new Date(),
    });

    this.refresh();
  }

  getTreeItem(element: AgentItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AgentItem): Thenable<AgentItem[]> {
    if (!element) {
      // Show available agents with real-time status
      const agents = [
        {
          name: "CodeCraft",
          key: "codecraft",
          description: "Code generation and implementation",
          category: "Core Agents",
        },
        {
          name: "SecuriShield",
          key: "securishield",
          description: "Security scanning and compliance",
          category: "Core Agents",
        },
        {
          name: "DesignForge",
          key: "designforge",
          description: "Architecture and design",
          category: "Core Agents",
        },
        {
          name: "PerfPulse",
          key: "perfpulse",
          description: "Performance optimization",
          category: "Core Agents",
        },
        {
          name: "Evaluator",
          key: "evaluator",
          description: "Quality assessment",
          category: "Core Agents",
        },
        {
          name: "SOC2-Compliance",
          key: "soc2-compliance",
          description: "Compliance verification",
          category: "Core Agents",
        },
        {
          name: "ExpressOps",
          key: "expressops",
          description: "Express.js/Node.js backend specialist",
          category: "Framework Agents",
        },
        {
          name: "MobileFirstOps",
          key: "mobilefirstops",
          description: "React Native/Flutter mobile specialist",
          category: "Framework Agents",
        },
        {
          name: "Database Agent",
          key: "database-agent",
          description: "Database design and optimization",
          category: "Framework Agents",
        },
      ];

      return Promise.resolve(
        agents.map((agent) => {
          const statusInfo = this.agentStatuses.get(agent.key) || {
            status: "idle",
            lastActivity: "Ready",
            timestamp: new Date(),
          };

          return new AgentItem(
            agent.name,
            agent.description,
            statusInfo.status,
            statusInfo.lastActivity,
            agent.category,
          );
        }),
      );
    }
    return Promise.resolve([]);
  }
}

class AgentItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly status: string,
    public readonly lastActivity: string = "Ready",
    public readonly category: string = "Core Agents",
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    const statusText =
      status === "active"
        ? "🔄 Working"
        : status === "error"
          ? "❌ Error"
          : status === "completed"
            ? "✅ Completed"
            : "⭕ Ready";

    this.tooltip = `${this.label} (${this.category})
Status: ${statusText}
Last Activity: ${this.lastActivity}
Description: ${this.description}`;

    this.description = `${statusText} - ${this.lastActivity}`;

    // Set appropriate icon based on status
    switch (status) {
      case "active":
        this.iconPath = new vscode.ThemeIcon("loading~spin");
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon("error");
        break;
      case "completed":
        this.iconPath = new vscode.ThemeIcon("check");
        break;
      default:
        this.iconPath = new vscode.ThemeIcon("circle-outline");
    }

    // Add context value for right-click actions
    this.contextValue = "agent";
  }
}

// Global extension instance
let extensionInstance: ConstellaExtension;

// Extension activation
export function activate(context: vscode.ExtensionContext) {
  console.log("Constella AI Architect extension is now active");

  // Initialize extension
  extensionInstance = new ConstellaExtension(context);

  // Register commands
  const commands = [
    vscode.commands.registerCommand("constella.orchestrateTask", async () => {
      const taskDescription = await vscode.window.showInputBox({
        prompt: "Describe the task you want to orchestrate",
        placeholder: "e.g., Add user authentication with JWT tokens",
        ignoreFocusOut: true,
      });

      if (!taskDescription) return;

      const taskType = await vscode.window.showQuickPick(
        [
          { label: "Feature Development", value: "feature_development" },
          { label: "Bug Fix", value: "bug_fix" },
          { label: "Security Audit", value: "security_audit" },
          {
            label: "Performance Optimization",
            value: "performance_optimization",
          },
          { label: "Code Review", value: "code_review" },
          { label: "Refactoring", value: "refactoring" },
          { label: "Documentation", value: "documentation" },
          { label: "Testing", value: "testing" },
        ],
        {
          placeHolder: "Select task type",
          ignoreFocusOut: true,
        },
      );

      if (!taskType) return;

      try {
        await extensionInstance.orchestrateTask(
          taskDescription,
          taskType.value,
        );
      } catch (error) {
        // Error already handled in orchestrateTask
      }
    }),

    vscode.commands.registerCommand("constella.generateFeature", async () => {
      const editor = vscode.window.activeTextEditor;
      const selectedText = editor?.selection
        ? editor.document.getText(editor.selection)
        : "";

      const featureDescription = await vscode.window.showInputBox({
        prompt: "Describe the feature to generate",
        value: selectedText,
        ignoreFocusOut: true,
      });

      if (featureDescription) {
        await extensionInstance.orchestrateTask(
          featureDescription,
          "feature_development",
        );
      }
    }),

    vscode.commands.registerCommand("constella.fixBug", async () => {
      const editor = vscode.window.activeTextEditor;
      const selectedText = editor?.selection
        ? editor.document.getText(editor.selection)
        : "";

      const bugDescription = await vscode.window.showInputBox({
        prompt: "Describe the bug to fix",
        value: selectedText,
        ignoreFocusOut: true,
      });

      if (bugDescription) {
        await extensionInstance.orchestrateTask(bugDescription, "bug_fix", {
          priority: 2,
        });
      }
    }),

    vscode.commands.registerCommand("constella.securityAudit", async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder open");
        return;
      }

      await extensionInstance.orchestrateTask(
        `Perform comprehensive security audit of ${workspaceFolder.name}`,
        "security_audit",
        { priority: 1 },
      );
    }),

    vscode.commands.registerCommand(
      "constella.optimizePerformance",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showErrorMessage("No active editor");
          return;
        }

        const fileName = editor.document.fileName;
        await extensionInstance.orchestrateTask(
          `Optimize performance of ${fileName}`,
          "performance_optimization",
        );
      },
    ),

    vscode.commands.registerCommand("constella.codeReview", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor");
        return;
      }

      const selectedText = editor.selection
        ? editor.document.getText(editor.selection)
        : editor.document.getText();
      const fileName = editor.document.fileName;

      await extensionInstance.orchestrateTask(
        `Perform code review of ${fileName}`,
        "code_review",
        { requirements: { code_content: selectedText } },
      );
    }),

    vscode.commands.registerCommand("constella.viewWorkflows", () => {
      extensionInstance.refreshWorkflows();
      vscode.commands.executeCommand("constellaWorkflows.focus");
    }),

    vscode.commands.registerCommand("constella.configureProject", async () => {
      // Open settings for Constella configuration
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "constella",
      );
    }),

    vscode.commands.registerCommand("constella.showAgentStatus", () => {
      vscode.commands.executeCommand("constellaAgents.focus");
    }),
  ];

  // Add all commands to subscriptions
  context.subscriptions.push(...commands);

  // Configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("constella")) {
        extensionInstance.log("Configuration changed, reloading...");
        // Reload configuration
        (extensionInstance as any).config = (
          extensionInstance as any
        ).loadConfiguration();
      }
    }),
  );
}

// Extension deactivation
export function deactivate() {
  if (extensionInstance) {
    extensionInstance.dispose();
  }
}
