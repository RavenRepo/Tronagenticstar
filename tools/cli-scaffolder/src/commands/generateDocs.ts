import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';

export interface DocsOptions {
  type: string;
  output: string;
}

export async function generateDocs(options: DocsOptions): Promise<void> {
  const spinner = ora('Generating documentation...').start();

  try {
    const outputDir = options.output;
    await fs.ensureDir(outputDir);

    switch (options.type) {
      case 'api':
        await generateApiDocs(outputDir);
        break;
      case 'agents':
        await generateAgentDocs(outputDir);
        break;
      case 'architecture':
        await generateArchitectureDocs(outputDir);
        break;
      case 'all':
      default:
        await generateApiDocs(outputDir);
        await generateAgentDocs(outputDir);
        await generateArchitectureDocs(outputDir);
        await generateIndexDocs(outputDir);
        break;
    }

    spinner.succeed(chalk.green('Documentation generated successfully!'));
    console.log(chalk.cyan(`Documentation available in: ${outputDir}`));

  } catch (error) {
    spinner.fail(chalk.red('Failed to generate documentation'));
    console.error(error);
    process.exit(1);
  }
}

async function generateApiDocs(outputDir: string): Promise<void> {
  const apiDoc = `# API Documentation

## Overview

This document describes the AgentForge API endpoints and their usage.

## Base URL

\`\`\`
http://localhost:3000/api/v1
\`\`\`

## Authentication

All API requests require authentication using an API key:

\`\`\`bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/v1/health
\`\`\`

## Endpoints

### Health Check

\`\`\`http
GET /health
\`\`\`

Returns the system health status.

**Response:**
\`\`\`json
{
  "status": "healthy",
  "timestamp": "2023-10-01T12:00:00Z",
  "agents": {
    "active": 5,
    "registered": 8
  }
}
\`\`\`

### Task Management

#### Create Task

\`\`\`http
POST /tasks
\`\`\`

Creates a new task for agent execution.

**Request Body:**
\`\`\`json
{
  "type": "ARCHITECTURE",
  "parameters": {
    "action": "analyze_codebase",
    "path": "/src"
  },
  "priority": 5
}
\`\`\`

**Response:**
\`\`\`json
{
  "id": "task-123",
  "status": "pending",
  "createdAt": "2023-10-01T12:00:00Z"
}
\`\`\`

#### Get Task Status

\`\`\`http
GET /tasks/{id}
\`\`\`

Returns the status and result of a specific task.

**Response:**
\`\`\`json
{
  "id": "task-123",
  "status": "completed",
  "result": {
    "agent": "architecture",
    "analysis": "..."
  },
  "completedAt": "2023-10-01T12:01:30Z"
}
\`\`\`

### Agent Management

#### List Agents

\`\`\`http
GET /agents
\`\`\`

Returns a list of registered agents.

**Response:**
\`\`\`json
{
  "agents": [
    {
      "id": "security-agent",
      "type": "specialist",
      "specialization": "security",
      "status": "active"
    }
  ]
}
\`\`\`

## Error Handling

All API endpoints return standard HTTP status codes:

- \`200\` - Success
- \`400\` - Bad Request
- \`401\` - Unauthorized
- \`404\` - Not Found
- \`500\` - Internal Server Error

Error responses include a message:

\`\`\`json
{
  "error": "Invalid task type",
  "code": "INVALID_TASK_TYPE"
}
\`\`\`

## Rate Limiting

API requests are rate-limited to 100 requests per 15-minute window per IP address.

## WebSocket Events

Real-time events are available via WebSocket:

\`\`\`javascript
const socket = io('http://localhost:3000/events');

socket.on('task_completed', (data) => {
  console.log('Task completed:', data);
});
\`\`\`

### Event Types

- \`task_received\` - New task received
- \`task_completed\` - Task execution completed
- \`task_failed\` - Task execution failed
- \`agent_registered\` - New agent registered
- \`agent_unregistered\` - Agent unregistered
`;

  await fs.writeFile(path.join(outputDir, 'api.md'), apiDoc);
}

async function generateAgentDocs(outputDir: string): Promise<void> {
  const agentDoc = `# Agent Development Guide

## Overview

Agents are the core components of AgentForge that perform specific tasks. This guide covers how to create, configure, and deploy agents.

## Agent Types

### Specialist Agents

Specialist agents focus on specific domains:

- **Security Agent**: Vulnerability scanning, security analysis
- **Quality Agent**: Code quality analysis, testing
- **Architecture Agent**: Design patterns, dependency analysis
- **Performance Agent**: Performance optimization, monitoring

### General Purpose Agents

General purpose agents handle flexible, multi-domain tasks.

## Creating an Agent

### Using the CLI

\`\`\`bash
# Create a specialist agent
agentforge agent security-scanner --type specialist --specialization security

# Create a general purpose agent
agentforge agent utility-agent --type general
\`\`\`

### Manual Creation

1. Create agent file in \`src/agents/\`
2. Extend \`SpecialistAgent\` or \`BaseAgent\`
3. Implement required methods
4. Register with orchestrator

### Example Agent

\`\`\`typescript
import { SpecialistAgent, registerSpecialist } from "@agentforge/orchestrator";
import { Task, TaskType } from "../types.js";

export class SecurityAgent extends SpecialistAgent {
  static KIND = "security";

  constructor(cfg: { id: string; specialization: TaskType }) {
    super(cfg);
  }

  protected async _executeSpecialist(task: Task): Promise<unknown> {
    // Implement security analysis logic
    const result = await this.performSecurityScan(task.parameters);
    
    return {
      agent: SecurityAgent.KIND,
      taskId: task.id,
      vulnerabilities: result.vulnerabilities,
      score: result.securityScore
    };
  }

  private async performSecurityScan(params: any): Promise<any> {
    // Security scanning implementation
    return {
      vulnerabilities: [],
      securityScore: 95
    };
  }
}

registerSpecialist(SecurityAgent.KIND, SecurityAgent);
\`\`\`

## Agent Configuration

Agents are configured through \`agent.json\` files:

\`\`\`json
{
  "name": "security-agent",
  "type": "specialist",
  "specialization": "security",
  "version": "1.0.0",
  "capabilities": [
    "vulnerability-scanning",
    "security-analysis",
    "compliance-checking"
  ],
  "resources": {
    "memory": "512MB",
    "cpu": "0.5",
    "timeout": "30s"
  },
  "environment": {
    "SECURITY_DB_URL": "https://security-db.example.com"
  }
}
\`\`\`

## Agent Lifecycle

1. **Registration**: Agent registers with orchestrator
2. **Discovery**: Orchestrator discovers agent capabilities
3. **Task Assignment**: Tasks are routed to appropriate agents
4. **Execution**: Agent processes tasks and returns results
5. **Monitoring**: Agent health and performance are monitored

## Best Practices

### Error Handling

\`\`\`typescript
protected async _executeSpecialist(task: Task): Promise<unknown> {
  try {
    const result = await this.processTask(task);
    return result;
  } catch (error) {
    this.logger.error('Task execution failed', { error, taskId: task.id });
    throw new AgentExecutionError(\`Failed to process task: \${error.message}\`);
  }
}
\`\`\`

### Logging

\`\`\`typescript
export class MyAgent extends SpecialistAgent {
  constructor(cfg: any) {
    super(cfg);
    this.logger = this.getLogger('MyAgent');
  }

  protected async _executeSpecialist(task: Task): Promise<unknown> {
    this.logger.info('Processing task', { taskId: task.id });
    // ... implementation
  }
}
\`\`\`

### Testing

Create comprehensive tests for your agents:

\`\`\`typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityAgent } from './SecurityAgent.js';

describe('SecurityAgent', () => {
  let agent: SecurityAgent;

  beforeEach(() => {
    agent = new SecurityAgent({
      id: 'test-security',
      specialization: TaskType.SECURITY
    });
  });

  it('should detect vulnerabilities', async () => {
    const task = createMockTask({
      type: TaskType.SECURITY,
      parameters: { scanType: 'vulnerability' }
    });

    const result = await agent.execute(task);
    
    expect(result.vulnerabilities).toBeDefined();
    expect(result.score).toBeGreaterThan(0);
  });
});
\`\`\`

## Deployment

### Local Development

\`\`\`bash
npm run dev
\`\`\`

### Production

\`\`\`bash
npm run build
npm start
\`\`\`

### Docker

\`\`\`dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
\`\`\`

## Monitoring

Agents expose metrics for monitoring:

- Task execution time
- Success/failure rates
- Resource usage
- Error rates

Access metrics at \`/metrics\` endpoint or via Prometheus.
`;

  await fs.writeFile(path.join(outputDir, 'agents.md'), agentDoc);
}

async function generateArchitectureDocs(outputDir: string): Promise<void> {
  const archDoc = `# Architecture Documentation

## Overview

AgentForge follows a microservices architecture with a central orchestrator managing multiple specialized agents.

## System Architecture

\`\`\`
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   VS Code       │    │   Web Dashboard │    │   CLI Tools     │
│   Extension     │    │                 │    │                 │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼───────────────┐
                    │       API Gateway           │
                    │   (Express.js/Fastify)      │
                    └─────────────┬───────────────┘
                                 │
                    ┌─────────────▼───────────────┐
                    │      Orchestrator           │
                    │    (Task Management)        │
                    └─────────────┬───────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
┌─────────▼───────┐   ┌─────────▼───────┐   ┌─────────▼───────┐
│  Security Agent │   │  Quality Agent  │   │Architecture Agt │
│                 │   │                 │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼───────────────┐
                    │        Memory Store         │
                    │      (Redis/Neo4j)          │
                    └─────────────────────────────┘
\`\`\`

## Core Components

### Orchestrator

The orchestrator is the central component responsible for:

- Task routing and distribution
- Agent lifecycle management
- Resource allocation
- Event coordination
- Health monitoring

**Key Features:**
- Event-driven architecture
- Horizontal scaling support
- Circuit breaker patterns
- Rate limiting
- Metrics collection

### Agents

Agents are specialized microservices that perform specific tasks:

**Specialist Agents:**
- Security: Vulnerability scanning, security analysis
- Quality: Code quality, testing, metrics
- Architecture: Design patterns, dependency analysis
- Performance: Optimization, monitoring

**Communication:**
- Event-based messaging
- REST API integration
- WebSocket for real-time updates

### Memory Store

Centralized storage for:
- Task history and results
- Agent state and configuration
- Knowledge graphs
- Vector embeddings

**Technologies:**
- Redis: Fast caching and pub/sub
- Neo4j: Knowledge graphs and relationships
- Qdrant: Vector similarity search

## Data Flow

1. **Task Creation**: Client creates task via API
2. **Task Routing**: Orchestrator routes to appropriate agent
3. **Task Execution**: Agent processes task
4. **Result Storage**: Results stored in memory store
5. **Event Notification**: Clients notified of completion

## Design Patterns

### Event-Driven Architecture

\`\`\`typescript
// Event emission
this.eventBus.emit('task.completed', {
  taskId,
  agentId,
  result
});

// Event handling
this.eventBus.on('task.failed', async (event) => {
  await this.handleTaskFailure(event);
});
\`\`\`

### Circuit Breaker

\`\`\`typescript
class AgentCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
\`\`\`

### Repository Pattern

\`\`\`typescript
interface TaskRepository {
  create(task: Task): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  update(id: string, updates: Partial<Task>): Promise<Task>;
  delete(id: string): Promise<void>;
}

class RedisTaskRepository implements TaskRepository {
  constructor(private client: RedisClient) {}

  async create(task: Task): Promise<Task> {
    await this.client.set(\`task:\${task.id}\`, JSON.stringify(task));
    return task;
  }
}
\`\`\`

## Scaling Considerations

### Horizontal Scaling

- Stateless agent design
- Load balancing with consistent hashing
- Database sharding strategies
- Container orchestration (Kubernetes)

### Performance Optimization

- Caching frequently accessed data
- Connection pooling
- Batch processing for similar tasks
- Async/await patterns

### Monitoring and Observability

- Distributed tracing (Jaeger)
- Metrics collection (Prometheus)
- Log aggregation (ELK stack)
- Health checks and alerting

## Security

### Authentication & Authorization

- JWT-based authentication
- Role-based access control (RBAC)
- API key management
- OAuth2 integration

### Data Protection

- Encryption at rest and in transit
- Secure communication channels
- Input validation and sanitization
- Rate limiting and DDoS protection

## Deployment

### Development

\`\`\`bash
# Local development with hot reload
npm run dev

# Docker development stack
docker-compose -f docker-compose.dev.yml up
\`\`\`

### Production

\`\`\`bash
# Production build
npm run build

# Docker production deployment
docker-compose -f docker-compose.prod.yml up -d

# Kubernetes deployment
kubectl apply -f k8s/
\`\`\`

## Configuration Management

Environment-based configuration:

\`\`\`typescript
export const config = {
  orchestrator: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  agents: {
    maxConcurrent: parseInt(process.env.MAX_AGENTS) || 10,
    timeout: parseInt(process.env.AGENT_TIMEOUT) || 30000
  }
};
\`\`\`

## Testing Strategy

### Unit Tests

- Agent logic testing
- Utility function testing
- Mock external dependencies

### Integration Tests

- Agent-orchestrator communication
- Database interactions
- API endpoint testing

### End-to-End Tests

- Complete workflow testing
- Performance testing
- Load testing

## Future Enhancements

- Multi-cloud deployment support
- Advanced AI/ML capabilities
- Real-time collaboration features
- Enhanced security features
- Performance optimizations
`;

  await fs.writeFile(path.join(outputDir, 'architecture.md'), archDoc);
}

async function generateIndexDocs(outputDir: string): Promise<void> {
  const indexDoc = `# AgentForge Documentation

Welcome to the AgentForge documentation! This guide will help you understand, use, and contribute to the AgentForge multi-agent development system.

## Quick Start

1. **Installation**: \`npm install -g @agentforge/cli\`
2. **Create Project**: \`agentforge create my-project\`
3. **Start Development**: \`cd my-project && npm run dev\`
4. **Install VS Code Extension**: Search for "AgentForge" in the marketplace

## Documentation Sections

### 📚 [API Reference](api.md)
Complete API documentation including endpoints, authentication, and examples.

### 🤖 [Agent Development Guide](agents.md)
Learn how to create, configure, and deploy custom agents.

### 🏗️ [Architecture Overview](architecture.md)
Understand the system architecture, design patterns, and deployment strategies.

## Key Concepts

### Agents
Specialized AI components that perform specific development tasks:
- **Security Agents**: Vulnerability scanning, security analysis
- **Quality Agents**: Code quality, testing, metrics collection
- **Architecture Agents**: Design pattern analysis, dependency management

### Orchestrator
Central coordination service that:
- Routes tasks to appropriate agents
- Manages agent lifecycle
- Coordinates communication between components

### Tasks
Units of work that agents execute:
- Created via API, CLI, or VS Code extension
- Routed based on agent capabilities
- Results stored and accessible via multiple interfaces

## Getting Help

- **GitHub Issues**: Report bugs and request features
- **Discussions**: Ask questions and share ideas
- **Documentation**: Comprehensive guides and API reference
- **Examples**: Sample projects and code snippets

## Contributing

We welcome contributions! Please see our:
- **Contributing Guide**: How to contribute code
- **Code of Conduct**: Community guidelines
- **Development Setup**: Local development instructions

## License

AgentForge is released under the MIT License. See LICENSE file for details.

---

**Need help?** Check out our [troubleshooting guide](troubleshooting.md) or [open an issue](https://github.com/agentforge/agentforge/issues).
`;

  await fs.writeFile(path.join(outputDir, 'README.md'), indexDoc);
}
