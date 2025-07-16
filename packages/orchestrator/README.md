# AgentForge Orchestrator

The core orchestration runtime for the AgentForge multi-agent framework. This package provides the ChiefArchitect orchestrator, FrameworkRouter, and base agent infrastructure.

## Features

- **ChiefArchitect Orchestrator**: Master coordinator that routes tasks to specialist agents
- **FrameworkRouter**: Intelligent load balancing and agent selection
- **Memory Bank**: Persistent context and RAG integration
- **ErrorGold**: Enterprise error handling and circuit breakers
- **Agent Registry**: Dynamic agent discovery and management
- **Agent Factory**: Agent lifecycle management
- **Security**: Authentication and authorization for agents

## Components

### Core Components

- `ChiefArchitect`: Master orchestrator and coordination hub
- `FrameworkRouter`: Task routing and load balancing
- `BaseAgent`: Abstract base class for all agents
- `AgentRegistry`: Agent discovery and status management
- `MemoryBankManager`: Context storage and retrieval
- `ErrorGoldCollector`: Error handling and reporting
- `AgentFactory`: Agent creation and lifecycle
- `AgentAuthenticator`: Security and access control

### Concrete Agents

- `ArchitectureAgent`: System design and architectural analysis
- `SecurityAgent`: Security scanning and policy enforcement
- `QualityAgent`: Code quality analysis and testing

## Quick Start

```typescript
import { AgentForgeOrchestrator, TaskType } from '@venvagents/orchestrator';

// Create orchestrator
const orchestrator = new AgentForgeOrchestrator({
  retrieverServiceUrl: 'http://localhost:8080',
  errorReportingEnabled: true,
  authSecretKey: 'your-secret-key'
});

// Initialize with default agents
await orchestrator.initialize();

// Process a task
const result = await orchestrator.processTask(TaskType.ARCHITECTURE, {
  action: 'analyze_architecture',
  codebase: 'my-app',
  focus: 'scalability'
});

console.log('Result:', result);

// Cleanup
await orchestrator.shutdown();
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client API    │───▶│ ChiefArchitect  │───▶│ FrameworkRouter │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                       ┌────────▼────────┐             │
                       │   Memory Bank   │             │
                       └─────────────────┘             │
                                │                       │
                       ┌────────▼────────┐             │
                       │   ErrorGold     │             │
                       └─────────────────┘             │
                                                        ▼
                                               ┌─────────────────┐
                                               │   Agent Pool    │
                                               │                 │
                                               │ ┌─────────────┐ │
                                               │ │Architecture │ │
                                               │ │   Agent     │ │
                                               │ └─────────────┘ │
                                               │ ┌─────────────┐ │
                                               │ │  Security   │ │
                                               │ │   Agent     │ │
                                               │ └─────────────┘ │
                                               │ ┌─────────────┐ │
                                               │ │  Quality    │ │
                                               │ │   Agent     │ │
                                               │ └─────────────┘ │
                                               └─────────────────┘
```

## Configuration

```typescript
interface ChiefArchitectConfig {
  retrieverServiceUrl?: string;    // RAG service endpoint
  errorReportingEnabled?: boolean; // Enable error collection
  memoryRetentionMs?: number;      // Memory retention period
  authSecretKey?: string;          // Authentication secret
}
```

## Task Types

- `ARCHITECTURE`: System design and architectural analysis
- `SECURITY`: Security scanning and policy enforcement  
- `QUALITY`: Code quality analysis and testing
- `PERFORMANCE`: Performance analysis and optimization
- `DEVOPS`: Deployment and infrastructure tasks

## Events

The orchestrator emits various events for monitoring:

- `task_received`: When a new task is received
- `task_completed`: When a task completes successfully
- `task_failed`: When a task fails
- `agent_registered`: When a new agent is registered
- `agent_unregistered`: When an agent is removed
- `critical_error`: When a critical error occurs
- `memory_update`: When memory is updated

## Memory and Context

The Memory Bank provides persistent context across tasks:

```typescript
// Query context
const context = await orchestrator.queryContext(
  "microservices architecture patterns",
  TaskType.ARCHITECTURE
);

// Get system health
const health = await orchestrator.getSystemHealth();
```

## Error Handling

Built-in error handling with circuit breakers:

```typescript
// Get error statistics
const errorStats = orchestrator.getErrorStats();

// Errors are automatically captured and reported
// Circuit breakers prevent cascading failures
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Lint
npm run lint
```

## Example

See `src/example.ts` for a complete working example with demonstrations of all features.

## License

MIT
