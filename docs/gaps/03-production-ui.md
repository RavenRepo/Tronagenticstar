# Gap 3: Production-Ready UI and Dashboard Integration

## Problem Statement

Current UI components are not connected to live intelligence and lack production readiness:
- VS Code extension panels show static/mock data
- No real-time agent activity monitoring
- Missing comprehensive dashboard for system oversight
- No user management or multi-tenant support
- Limited visualization of agent interactions and results

## Current State Analysis

**Existing Components:**
- VS Code extension with basic panel structure
- Static HTML/CSS for dashboard, activity, and settings panels
- Basic WebSocket manager (not fully implemented)
- Orchestrator API service (placeholder implementations)

**Identified Issues:**
- Panels display hardcoded data instead of live agent metrics
- No real-time updates or WebSocket connections
- Missing authentication and user management
- No visualization for agent workflows and task execution
- Limited responsive design and accessibility

## Technical Architecture

### 1. Web Dashboard Application

```typescript
// New service: services/web-dashboard/
├── src/
│   ├── components/
│   │   ├── common/           // Shared UI components
│   │   ├── dashboard/        // Main dashboard views
│   │   ├── agents/           // Agent management UI
│   │   ├── tasks/            // Task monitoring UI
│   │   ├── analytics/        // Metrics and charts
│   │   └── settings/         // Configuration UI
│   ├── services/
│   │   ├── api.ts            // API client
│   │   ├── websocket.ts      // Real-time connections
│   │   ├── auth.ts           // Authentication
│   │   └── state.ts          // State management
│   ├── hooks/
│   │   ├── useAgents.ts      // Agent data hooks
│   │   ├── useMetrics.ts     // Metrics hooks
│   │   └── useWebSocket.ts   // WebSocket hooks
│   ├── stores/
│   │   ├── agentStore.ts     // Agent state
│   │   ├── taskStore.ts      // Task state
│   │   └── userStore.ts      // User state
│   └── utils/
│       ├── formatters.ts     // Data formatting
│       ├── charts.ts         // Chart utilities
│       └── validation.ts     // Form validation
```

### 2. Enhanced VS Code Extension

```typescript
// Enhanced agentforge-vscode/
├── src/
│   ├── panels/
│   │   ├── DashboardPanel.ts      // Live dashboard
│   │   ├── AgentActivityPanel.ts  // Real-time activity
│   │   ├── TaskMonitorPanel.ts    // Task execution tracking
│   │   ├── MetricsPanel.ts        // Performance metrics
│   │   └── ConfigPanel.ts         // Configuration management
│   ├── services/
│   │   ├── LiveAPI.ts             // Real-time API client
│   │   ├── WebSocketService.ts    // WebSocket management
│   │   ├── NotificationService.ts // VS Code notifications
│   │   └── CacheService.ts        // Local caching
│   ├── commands/
│   │   ├── agentCommands.ts       // Agent interaction commands
│   │   ├── taskCommands.ts        // Task management commands
│   │   └── debugCommands.ts       // Debugging utilities
│   └── webview/
│       ├── components/            // React components
│       ├── hooks/                 // Custom hooks
│       └── stores/                // State management
```

### 3. Real-time Communication Layer

```typescript
// Enhanced WebSocket architecture
interface WebSocketMessage {
  type: 'agent_status' | 'task_update' | 'metric_update' | 'error' | 'notification';
  payload: unknown;
  timestamp: string;
  source: string;
}

interface AgentStatusMessage extends WebSocketMessage {
  type: 'agent_status';
  payload: {
    agentId: string;
    status: AgentStatus;
    metrics: AgentMetrics;
    lastActivity: string;
  };
}

interface TaskUpdateMessage extends WebSocketMessage {
  type: 'task_update';
  payload: {
    taskId: string;
    status: TaskStatus;
    progress: number;
    result?: TaskResult;
    error?: string;
  };
}
```

## Implementation Plan

### Week 1: Web Dashboard Foundation

**Day 1-2: Project Setup**
```bash
# Create Next.js dashboard application
npx create-next-app@latest services/web-dashboard --typescript --tailwind --app
cd services/web-dashboard
npm install @tanstack/react-query @tanstack/react-table
npm install recharts lucide-react @radix-ui/react-*
npm install socket.io-client zustand
```

**Day 3-4: Core Dashboard Components**
```typescript
// src/components/dashboard/AgentGrid.tsx
import { useAgents } from '@/hooks/useAgents';
import { AgentCard } from '@/components/agents/AgentCard';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export function AgentGrid() {
  const { agents, isLoading, error } = useAgents();

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          onTrigger={handleTriggerAgent}
          onConfigure={handleConfigureAgent}
        />
      ))}
    </div>
  );
}

// src/components/agents/AgentCard.tsx
interface AgentCardProps {
  agent: Agent;
  onTrigger: (agentId: string, action: string) => void;
  onConfigure: (agentId: string) => void;
}

export function AgentCard({ agent, onTrigger, onConfigure }: AgentCardProps) {
  const statusColor = {
    ready: 'bg-green-500',
    busy: 'bg-yellow-500',
    degraded: 'bg-orange-500',
    unavailable: 'bg-red-500',
  }[agent.status];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${statusColor}`} />
          <h3 className="text-lg font-semibold">{agent.name}</h3>
        </div>
        <Badge variant="secondary">{agent.specialization}</Badge>
      </div>

      <div className="space-y-2 mb-4">
        <MetricRow 
          label="Response Time" 
          value={`${agent.metrics.avgResponseTimeMs}ms`} 
        />
        <MetricRow 
          label="Tasks Completed" 
          value={agent.metrics.totalTasksCompleted} 
        />
        <MetricRow 
          label="Success Rate" 
          value={`${calculateSuccessRate(agent.metrics)}%`} 
        />
      </div>

      <div className="flex space-x-2">
        <Button
          onClick={() => onTrigger(agent.id, 'default')}
          disabled={agent.status !== 'ready'}
          className="flex-1"
        >
          Execute Task
        </Button>
        <Button
          variant="outline"
          onClick={() => onConfigure(agent.id)}
          size="sm"
        >
          Configure
        </Button>
      </div>
    </Card>
  );
}
```

**Day 5: Real-time Data Integration**
```typescript
// src/hooks/useAgents.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './useWebSocket';
import { api } from '@/services/api';

export function useAgents() {
  const queryClient = useQueryClient();
  
  const { data: agents, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: api.getAgents,
    refetchInterval: 30000, // Fallback polling
  });

  // Real-time updates via WebSocket
  useWebSocket({
    onMessage: (message) => {
      if (message.type === 'agent_status') {
        queryClient.setQueryData(['agents'], (old: Agent[]) =>
          old?.map(agent =>
            agent.id === message.payload.agentId
              ? { ...agent, ...message.payload }
              : agent
          )
        );
      }
    },
  });

  return { agents, isLoading, error };
}

// src/hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketOptions {
  onMessage: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket({ onMessage, onConnect, onDisconnect }: UseWebSocketOptions) {
  const socketRef = useRef<Socket>();

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080', {
      auth: {
        token: localStorage.getItem('auth_token'),
      },
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket');
      onConnect?.();
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
      onDisconnect?.();
    });

    socket.on('message', onMessage);

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [onMessage, onConnect, onDisconnect]);

  return {
    socket: socketRef.current,
    emit: (event: string, data: unknown) => socketRef.current?.emit(event, data),
  };
}
```

### Week 2: Advanced Dashboard Features

**Day 1-2: Task Monitoring**
```typescript
// src/components/tasks/TaskMonitor.tsx
import { useTasks } from '@/hooks/useTasks';
import { TaskTimeline } from './TaskTimeline';
import { TaskMetrics } from './TaskMetrics';

export function TaskMonitor() {
  const { tasks, metrics } = useTasks();

  return (
    <div className="space-y-6">
      <TaskMetrics metrics={metrics} />
      <TaskTimeline tasks={tasks} />
    </div>
  );
}

// src/components/tasks/TaskTimeline.tsx
interface TaskTimelineProps {
  tasks: Task[];
}

export function TaskTimeline({ tasks }: TaskTimelineProps) {
  const groupedTasks = groupTasksByDate(tasks);

  return (
    <div className="space-y-4">
      {Object.entries(groupedTasks).map(([date, dateTasks]) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-gray-500 mb-2">{date}</h3>
          <div className="space-y-2">
            {dateTasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// src/components/tasks/TaskItem.tsx
interface TaskItemProps {
  task: Task;
}

export function TaskItem({ task }: TaskItemProps) {
  const statusIcon = {
    pending: Clock,
    running: Play,
    completed: CheckCircle,
    failed: XCircle,
  }[task.status];

  const StatusIcon = statusIcon;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <StatusIcon className={`w-5 h-5 ${getStatusColor(task.status)}`} />
          <div>
            <p className="font-medium">{task.type}</p>
            <p className="text-sm text-gray-500">{task.agentId}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">{formatDuration(task.duration)}</p>
          <p className="text-xs text-gray-500">{formatTime(task.startedAt)}</p>
        </div>
      </div>
      
      {task.status === 'running' && (
        <div className="mt-3">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{task.progress}%</span>
          </div>
          <Progress value={task.progress} className="mt-1" />
        </div>
      )}
      
      {task.result && (
        <div className="mt-3">
          <Collapsible>
            <CollapsibleTrigger className="text-sm font-medium">
              View Result
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                {JSON.stringify(task.result, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </Card>
  );
}
```

**Day 3-4: Analytics and Metrics**
```typescript
// src/components/analytics/MetricsDashboard.tsx
import { useMetrics } from '@/hooks/useMetrics';
import { PerformanceChart } from './PerformanceChart';
import { AgentUtilization } from './AgentUtilization';
import { ErrorRateChart } from './ErrorRateChart';

export function MetricsDashboard() {
  const { metrics, timeRange, setTimeRange } = useMetrics();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Analytics</h2>
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Total Tasks"
          value={metrics.totalTasks}
          change={metrics.taskGrowth}
          icon={Activity}
        />
        <MetricCard
          title="Success Rate"
          value={`${metrics.successRate}%`}
          change={metrics.successRateChange}
          icon={CheckCircle}
        />
        <MetricCard
          title="Avg Response Time"
          value={`${metrics.avgResponseTime}ms`}
          change={metrics.responseTimeChange}
          icon={Clock}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Performance Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <PerformanceChart data={metrics.performance} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentUtilization data={metrics.utilization} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Error Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorRateChart data={metrics.errors} />
        </CardContent>
      </Card>
    </div>
  );
}

// src/components/analytics/PerformanceChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PerformanceChartProps {
  data: PerformanceDataPoint[];
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="timestamp" 
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => formatTime(value)}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip 
          labelFormatter={(value) => formatTime(value)}
          formatter={(value, name) => [
            name === 'responseTime' ? `${value}ms` : value,
            name === 'responseTime' ? 'Response Time' : 'Tasks/min'
          ]}
        />
        <Line 
          type="monotone" 
          dataKey="responseTime" 
          stroke="#8884d8" 
          strokeWidth={2}
          dot={false}
        />
        <Line 
          type="monotone" 
          dataKey="throughput" 
          stroke="#82ca9d" 
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Day 5: Authentication and Security**
```typescript
// src/services/auth.ts
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
  permissions: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export class AuthService {
  private static instance: AuthService;
  private state: AuthState = {
    user: null,
    token: null,
    isAuthenticated: false,
  };

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const { user, token } = await response.json();
      
      this.state = {
        user,
        token,
        isAuthenticated: true,
      };

      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));

      return { success: true, user, token };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      };
    }
  }

  async logout(): Promise<void> {
    this.state = {
      user: null,
      token: null,
      isAuthenticated: false,
    };

    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');

    // Notify server
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.state.token}` },
    });
  }

  getUser(): User | null {
    return this.state.user;
  }

  getToken(): string | null {
    return this.state.token;
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }

  hasPermission(permission: string): boolean {
    return this.state.user?.permissions.includes(permission) || false;
  }
}

// src/components/auth/ProtectedRoute.tsx
interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  fallback?: React.ReactNode;
}

export function ProtectedRoute({ 
  children, 
  requiredPermission,
  fallback = <UnauthorizedPage />
}: ProtectedRouteProps) {
  const auth = AuthService.getInstance();

  if (!auth.isAuthenticated()) {
    return <LoginPage />;
  }

  if (requiredPermission && !auth.hasPermission(requiredPermission)) {
    return fallback;
  }

  return <>{children}</>;
}
```

### Week 3: VS Code Extension Enhancement

**Day 1-2: Enhanced Panels**
```typescript
// agentforge-vscode/src/panels/LiveDashboardPanel.ts
import { WebviewPanel, window, ViewColumn } from 'vscode';
import { LiveAPIService } from '../services/LiveAPI';
import { WebSocketService } from '../services/WebSocketService';

export class LiveDashboardPanel {
  private panel: WebviewPanel;
  private apiService: LiveAPIService;
  private wsService: WebSocketService;

  constructor() {
    this.apiService = new LiveAPIService();
    this.wsService = new WebSocketService();
    this.panel = window.createWebviewPanel(
      'agentforge-dashboard',
      'AgentForge Dashboard',
      ViewColumn.One,
      {
        enableScripts: true,
        enableCommandUris: true,
        retainContextWhenHidden: true,
      }
    );

    this.setupWebview();
    this.setupWebSocket();
  }

  private async setupWebview(): Promise<void> {
    this.panel.webview.html = await this.getWebviewContent();
    
    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'triggerAgent':
          await this.handleTriggerAgent(message.agentId, message.action);
          break;
        case 'getAgents':
          await this.sendAgentsData();
          break;
        case 'getMetrics':
          await this.sendMetricsData();
          break;
      }
    });
  }

  private setupWebSocket(): void {
    this.wsService.onMessage((message) => {
      this.panel.webview.postMessage({
        command: 'websocket_message',
        data: message,
      });
    });

    this.wsService.connect();
  }

  private async handleTriggerAgent(agentId: string, action: string): Promise<void> {
    try {
      const result = await this.apiService.triggerAgent(agentId, action);
      
      this.panel.webview.postMessage({
        command: 'agent_triggered',
        agentId,
        result,
      });

      window.showInformationMessage(`Agent ${agentId} executed successfully`);
    } catch (error) {
      window.showErrorMessage(`Failed to execute agent: ${error.message}`);
    }
  }

  private async getWebviewContent(): Promise<string> {
    const agents = await this.apiService.getAgents();
    const metrics = await this.apiService.getMetrics();

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AgentForge Dashboard</title>
        <style>
          ${await this.getStyles()}
        </style>
      </head>
      <body>
        <div id="dashboard">
          <header class="dashboard-header">
            <h1>AgentForge Dashboard</h1>
            <div class="status-indicator" id="connection-status">Connected</div>
          </header>

          <main class="dashboard-main">
            <section class="metrics-section">
              <h2>System Metrics</h2>
              <div class="metrics-grid" id="metrics-grid">
                <!-- Metrics will be populated by JavaScript -->
              </div>
            </section>

            <section class="agents-section">
              <h2>Active Agents</h2>
              <div class="agents-grid" id="agents-grid">
                <!-- Agents will be populated by JavaScript -->
              </div>
            </section>

            <section class="activity-section">
              <h2>Recent Activity</h2>
              <div class="activity-list" id="activity-list">
                <!-- Activity will be populated by JavaScript -->
              </div>
            </section>
          </main>
        </div>

        <script>
          ${await this.getScripts()}
        </script>
      </body>
      </html>
    `;
  }
}

// agentforge-vscode/src/services/LiveAPI.ts
export class LiveAPIService {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    this.baseUrl = this.getConfiguredUrl();
    this.token = this.getStoredToken();
  }

  private getConfiguredUrl(): string {
    const config = workspace.getConfiguration('agentforge');
    return config.get<string>('orchestratorUrl', 'http://localhost:3000');
  }

  async getAgents(): Promise<Agent[]> {
    const response = await this.makeRequest('/api/agents');
    return response.json();
  }

  async getMetrics(): Promise<SystemMetrics> {
    const response = await this.makeRequest('/api/metrics');
    return response.json();
  }

  async triggerAgent(agentId: string, action: string, parameters: any = {}): Promise<TaskResult> {
    const response = await this.makeRequest(`/api/agents/${agentId}/trigger`, {
      method: 'POST',
      body: JSON.stringify({ action, parameters }),
    });
    return response.json();
  }

  async getTasks(limit: number = 50): Promise<Task[]> {
    const response = await this.makeRequest(`/api/tasks?limit=${limit}`);
    return response.json();
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers);
    
    headers.set('Content-Type', 'application/json');
    
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response;
  }
}
```

**Day 3-4: Real-time Notifications**
```typescript
// agentforge-vscode/src/services/NotificationService.ts
import { window, ProgressLocation, CancellationToken, Progress } from 'vscode';

interface TaskNotification {
  taskId: string;
  agentId: string;
  type: string;
  progress: number;
  status: 'running' | 'completed' | 'failed';
}

export class NotificationService {
  private activeNotifications = new Map<string, any>();

  showTaskStarted(task: Task): void {
    window.showInformationMessage(
      `Task started: ${task.type} (${task.agentId})`,
      'View Details'
    ).then((selection) => {
      if (selection === 'View Details') {
        this.showTaskDetails(task);
      }
    });
  }

  showTaskProgress(task: TaskNotification): void {
    if (!this.activeNotifications.has(task.taskId)) {
      this.createProgressNotification(task);
    } else {
      this.updateProgressNotification(task);
    }
  }

  showTaskCompleted(task: Task): void {
    this.activeNotifications.delete(task.id);
    
    window.showInformationMessage(
      `Task completed: ${task.type} (${formatDuration(task.duration)})`,
      'View Result'
    ).then((selection) => {
      if (selection === 'View Result') {
        this.showTaskResult(task);
      }
    });
  }

  showTaskFailed(task: Task, error: string): void {
    this.activeNotifications.delete(task.id);
    
    window.showErrorMessage(
      `Task failed: ${task.type} - ${error}`,
      'View Details',
      'Retry'
    ).then((selection) => {
      if (selection === 'View Details') {
        this.showTaskDetails(task);
      } else if (selection === 'Retry') {
        this.retryTask(task);
      }
    });
  }

  private createProgressNotification(task: TaskNotification): void {
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `${task.type} (${task.agentId})`,
        cancellable: true,
      },
      async (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => {
        this.activeNotifications.set(task.taskId, { progress, token });
        
        progress.report({
          increment: task.progress,
          message: `${task.progress}% complete`,
        });

        return new Promise((resolve) => {
          const checkCompletion = () => {
            if (token.isCancellationRequested) {
              this.cancelTask(task.taskId);
              resolve(undefined);
            } else if (task.status === 'completed' || task.status === 'failed') {
              resolve(undefined);
            } else {
              setTimeout(checkCompletion, 1000);
            }
          };
          
          checkCompletion();
        });
      }
    );
  }

  private updateProgressNotification(task: TaskNotification): void {
    const notification = this.activeNotifications.get(task.taskId);
    if (notification) {
      notification.progress.report({
        increment: task.progress - (notification.lastProgress || 0),
        message: `${task.progress}% complete`,
      });
      notification.lastProgress = task.progress;
    }
  }

  private async showTaskDetails(task: Task): Promise<void> {
    const panel = window.createWebviewPanel(
      'task-details',
      `Task Details: ${task.type}`,
      ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = this.getTaskDetailsHtml(task);
  }

  private async showTaskResult(task: Task): Promise<void> {
    const document = await workspace.openTextDocument({
      content: JSON.stringify(task.result, null, 2),
      language: 'json',
    });
    
    await window.showTextDocument(document);
  }

  private async retryTask(task: Task): Promise<void> {
    // Implementation to retry failed task
    const apiService = new LiveAPIService();
    await apiService.triggerAgent(task.agentId, task.type, task.parameters);
  }

  private async cancelTask(taskId: string): Promise<void> {
    // Implementation to cancel running task
    const apiService = new LiveAPIService();
    await apiService.makeRequest(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
  }
}
```

**Day 5: Configuration and Settings**
```typescript
// agentforge-vscode/src/panels/ConfigPanel.ts
export class ConfigPanel {
  private panel: WebviewPanel;
  private config: WorkspaceConfiguration;

  constructor() {
    this.config = workspace.getConfiguration('agentforge');
    this.panel = window.createWebviewPanel(
      'agentforge-config',
      'AgentForge Configuration',
      ViewColumn.One,
      { enableScripts: true }
    );

    this.setupWebview();
  }

  private setupWebview(): void {
    this.panel.webview.html = this.getConfigHtml();
    
    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'updateConfig':
          await this.updateConfiguration(message.config);
          break;
        case 'testConnection':
          await this.testConnection();
          break;
        case 'resetConfig':
          await this.resetConfiguration();
          break;
      }
    });
  }

  private async updateConfiguration(newConfig: any): Promise<void> {
    try {
      for (const [key, value] of Object.entries(newConfig)) {
        await this.config.update(key, value, ConfigurationTarget.Workspace);
      }

      this.panel.webview.postMessage({
        command: 'configUpdated',
        success: true,
      });

      window.showInformationMessage('Configuration updated successfully');
    } catch (error) {
      this.panel.webview.postMessage({
        command: 'configUpdated',
        success: false,
        error: error.message,
      });

      window.showErrorMessage(`Failed to update configuration: ${error.message}`);
    }
  }

  private async testConnection(): Promise<void> {
    try {
      const apiService = new LiveAPIService();
      const response = await apiService.makeRequest('/health');
      
      if (response.ok) {
        this.panel.webview.postMessage({
          command: 'connectionTest',
          success: true,
        });
        window.showInformationMessage('Connection test successful');
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.panel.webview.postMessage({
        command: 'connectionTest',
        success: false,
        error: error.message,
      });
      window.showErrorMessage(`Connection test failed: ${error.message}`);
    }
  }

  private getConfigHtml(): string {
    const currentConfig = {
      orchestratorUrl: this.config.get('orchestratorUrl'),
      apiKey: this.config.get('apiKey'),
      autoRefresh: this.config.get('autoRefresh'),
      refreshInterval: this.config.get('refreshInterval'),
      notifications: this.config.get('notifications'),
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>AgentForge Configuration</title>
        <style>
          body { 
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
          }
          .config-section {
            margin-bottom: 30px;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
          }
          .config-field {
            margin-bottom: 15px;
          }
          label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
          }
          input, select {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
          }
          button {
            padding: 8px 16px;
            margin-right: 10px;
            border: none;
            border-radius: 3px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            cursor: pointer;
          }
          button:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .status {
            padding: 10px;
            margin: 10px 0;
            border-radius: 3px;
          }
          .success {
            background: var(--vscode-testing-iconPassed);
            color: white;
          }
          .error {
            background: var(--vscode-testing-iconFailed);
            color: white;
          }
        </style>
      </head>
      <body>
        <h1>AgentForge Configuration</h1>
        
        <div class="config-section">
          <h2>Connection Settings</h2>
          <div class="config-field">
            <label for="orchestratorUrl">Orchestrator URL:</label>
            <input type="url" id="orchestratorUrl" value="${currentConfig.orchestratorUrl}" 
                   placeholder="http://localhost:3000">
          </div>
          <div class="config-field">
            <label for="apiKey">API Key:</label>
            <input type="password" id="apiKey" value="${currentConfig.apiKey || ''}" 
                   placeholder="Optional API key">
          </div>
          <button onclick="testConnection()">Test Connection</button>
        </div>

        <div class="config-section">
          <h2>Update Settings</h2>
          <div class="config-field">
            <label for="autoRefresh">Auto Refresh:</label>
            <select id="autoRefresh">
              <option value="true" ${currentConfig.autoRefresh ? 'selected' : ''}>Enabled</option>
              <option value="false" ${!currentConfig.autoRefresh ? 'selected' : ''}>Disabled</option>
            </select>
          </div>
          <div class="config-field">
            <label for="refreshInterval">Refresh Interval (seconds):</label>
            <input type="number" id="refreshInterval" value="${currentConfig.refreshInterval || 30}" 
                   min="5" max="300">
          </div>
        </div>

        <div class="config-section">
          <h2>Notification Settings</h2>
          <div class="config-field">
            <label for="notifications">Enable Notifications:</label>
            <select id="notifications">
              <option value="true" ${currentConfig.notifications ? 'selected' : ''}>Enabled</option>
              <option value="false" ${!currentConfig.notifications ? 'selected' : ''}>Disabled</option>
            </select>
          </div>
        </div>

        <div class="config-section">
          <button onclick="saveConfig()">Save Configuration</button>
          <button onclick="resetConfig()">Reset to Defaults</button>
        </div>

        <div id="status"></div>

        <script>
          const vscode = acquireVsCodeApi();

          function saveConfig() {
            const config = {
              orchestratorUrl: document.getElementById('orchestratorUrl').value,
              apiKey: document.getElementById('apiKey').value,
              autoRefresh: document.getElementById('autoRefresh').value === 'true',
              refreshInterval: parseInt(document.getElementById('refreshInterval').value),
              notifications: document.getElementById('notifications').value === 'true',
            };

            vscode.postMessage({
              command: 'updateConfig',
              config: config
            });
          }

          function testConnection() {
            vscode.postMessage({ command: 'testConnection' });
          }

          function resetConfig() {
            vscode.postMessage({ command: 'resetConfig' });
          }

          window.addEventListener('message', event => {
            const message = event.data;
            const statusDiv = document.getElementById('status');

            switch (message.command) {
              case 'configUpdated':
                statusDiv.innerHTML = message.success
                  ? '<div class="status success">Configuration saved successfully</div>'
                  : '<div class="status error">Failed to save configuration: ' + message.error + '</div>';
                break;
              case 'connectionTest':
                statusDiv.innerHTML = message.success
                  ? '<div class="status success">Connection test successful</div>'
                  : '<div class="status error">Connection test failed: ' + message.error + '</div>';
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
```

## Testing Strategy

### 1. Component Testing
```typescript
// tests/components/AgentCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentCard } from '@/components/agents/AgentCard';

const mockAgent: Agent = {
  id: 'test-agent',
  name: 'Test Agent',
  specialization: 'testing',
  status: 'ready',
  metrics: {
    avgResponseTimeMs: 500,
    totalTasksCompleted: 10,
    totalTasksFailed: 1,
    currentLoad: 0,
  },
};

describe('AgentCard', () => {
  it('renders agent information correctly', () => {
    const onTrigger = jest.fn();
    const onConfigure = jest.fn();

    render(
      <AgentCard
        agent={mockAgent}
        onTrigger={onTrigger}
        onConfigure={onConfigure}
      />
    );

    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('testing')).toBeInTheDocument();
    expect(screen.getByText('500ms')).toBeInTheDocument();
  });

  it('calls onTrigger when execute button is clicked', () => {
    const onTrigger = jest.fn();
    const onConfigure = jest.fn();

    render(
      <AgentCard
        agent={mockAgent}
        onTrigger={onTrigger}
        onConfigure={onConfigure}
      />
    );

    fireEvent.click(screen.getByText('Execute Task'));
    expect(onTrigger).toHaveBeenCalledWith('test-agent', 'default');
  });

  it('disables execute button when agent is not ready', () => {
    const busyAgent = { ...mockAgent, status: 'busy' as const };
    const onTrigger = jest.fn();
    const onConfigure = jest.fn();

    render(
      <AgentCard
        agent={busyAgent}
        onTrigger={onTrigger}
        onConfigure={onConfigure}
      />
    );

    const executeButton = screen.getByText('Execute Task');
    expect(executeButton).toBeDisabled();
  });
});
```

### 2. Integration Testing
```typescript
// tests/integration/dashboard.test.ts
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '@/pages/dashboard';

// Mock API service
jest.mock('@/services/api', () => ({
  api: {
    getAgents: jest.fn().mockResolvedValue([
      {
        id: 'agent-1',
        name: 'Architecture Agent',
        status: 'ready',
        specialization: 'architecture',
        metrics: { avgResponseTimeMs: 500, totalTasksCompleted: 10 },
      },
    ]),
    getMetrics: jest.fn().mockResolvedValue({
      totalTasks: 100,
      successRate: 95,
      avgResponseTime: 500,
    }),
  },
}));

describe('Dashboard Integration', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it('loads and displays agent data', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Architecture Agent')).toBeInTheDocument();
    });

    expect(screen.getByText('architecture')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    const { api } = require('@/services/api');
    api.getAgents.mockRejectedValueOnce(new Error('API Error'));

    render(
      <QueryClientProvider client={queryClient}>
        <Dashboard />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });
});
```

### 3. VS Code Extension Testing
```typescript
// agentforge-vscode/src/test/extension.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import { LiveAPIService } from '../services/LiveAPI';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('API service initialization', () => {
    const apiService = new LiveAPIService();
    assert.ok(apiService);
  });

  test('Configuration reading', () => {
    const config = vscode.workspace.getConfiguration('agentforge');
    const orchestratorUrl = config.get<string>('orchestratorUrl');
    assert.ok(orchestratorUrl);
  });

  test('Panel creation', () => {
    const panel = vscode.window.createWebviewPanel(
      'test',
      'Test Panel',
      vscode.ViewColumn.One,
      {}
    );
    assert.ok(panel);
    panel.dispose();
  });
});
```

## Deployment Configuration

### 1. Web Dashboard Deployment
```dockerfile
# services/web-dashboard/Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm ci --only=production

EXPOSE 3000

CMD ["npm", "start"]
```

### 2. Kubernetes Manifests
```yaml
# k8s/web-dashboard.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-dashboard
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-dashboard
  template:
    metadata:
      labels:
        app: web-dashboard
    spec:
      containers:
      - name: web-dashboard
        image: agentforge/web-dashboard:latest
        ports:
        - containerPort: 3000
        env:
        - name: NEXT_PUBLIC_API_URL
          value: "https://api.agentforge.com"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"

---
apiVersion: v1
kind: Service
metadata:
  name: web-dashboard
spec:
  selector:
    app: web-dashboard
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

## Success Criteria

### Functional Requirements
- ✅ Real-time dashboard with live agent status
- ✅ Task monitoring with progress tracking
- ✅ Comprehensive analytics and metrics
- ✅ Enhanced VS Code extension with live data
- ✅ Authentication and user management

### Performance Requirements
- ✅ Dashboard loads in <3 seconds
- ✅ Real-time updates with <500ms latency
- ✅ Support for 100+ concurrent users
- ✅ Mobile-responsive design
- ✅ Offline capability in VS Code extension

### User Experience Requirements
- ✅ Intuitive navigation and workflow
- ✅ Accessibility compliance (WCAG 2.1)
- ✅ Comprehensive error handling
- ✅ Context-sensitive help and documentation
- ✅ Customizable dashboards and views

### Integration Requirements
- ✅ Seamless VS Code integration
- ✅ SSO/OAuth integration support
- ✅ Export capabilities (CSV, JSON, PDF)
- ✅ Webhook integrations for external tools
- ✅ API compatibility with existing clients

---

**Implementation Owner**: Frontend Team  
**Estimated Effort**: 3-4 weeks  
**Dependencies**: Unified API Gateway, LLM Integration  
**Risk Level**: Medium  
**Success Metrics**: <3s load time, <500ms real-time latency, >95% user satisfaction