# Constella BeeAI Framework

> **A complete TypeScript implementation of the BeeAI framework patterns for the Constella Enterprise AI Operating Platform**

This framework brings BeeAI's powerful agent orchestration patterns to Constella while maintaining full backward compatibility with your existing microservice architecture.

## 🚀 Quick Start

### Installation

```bash
cd constella-os/framework
npm install
npm run build
```

### Basic Usage (BeeAI Style)

```typescript
import { 
  createChatModel, 
  createThinkTool, 
  createHandoffTool, 
  createConditionalRequirement,
  RequirementAgent 
} from '@constella/beeai-framework';

// Create LLM provider (BeeAI pattern)
const llm = createChatModel("ollama:granite3.3:8b");

// Create tools
const thinkTool = createThinkTool();
const codeAgent = createHandoffTool("http://localhost:8012", {
  name: "CodeCraft",
  description: "Generate and refactor code"
});

// Create agent with requirements (BeeAI pattern)
const agent = new RequirementAgent({
  llm,
  tools: [thinkTool, codeAgent],
  requirements: [
    createConditionalRequirement(thinkTool, { force_at_step: 1 })
  ],
  role: "Senior Developer",
  instructions: "Help with software development tasks"
});

// Execute with BeeAI patterns
const result = await agent.run(
  "Create a user authentication system", 
  { expected_output: "Complete implementation with security best practices" }
);
```

## 🏗️ Architecture Overview

This framework implements exact BeeAI patterns while integrating seamlessly with Constella's existing architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                BeeAI Framework Layer                        │
├─────────────────────────────────────────────────────────────┤
│  RequirementAgent  │  ChatModel  │  Tools  │  Workflows     │
├─────────────────────────────────────────────────────────────┤
│                Constella Integration Layer                   │
├─────────────────────────────────────────────────────────────┤
│  CodeCraft  │  SecuriShield  │  DesignForge  │  PerfPulse   │
│  (8012)     │  (8011)        │  (8010)       │  (8013)      │
├─────────────────────────────────────────────────────────────┤
│           Existing Constella Infrastructure                  │
│  Neo4j  │  Qdrant  │  Redis  │  Orchestrator  │  Memory     │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 BeeAI Pattern Implementation

### 1. RequirementAgent (Core Pattern)

The `RequirementAgent` is the heart of BeeAI's constraint enforcement system:

```typescript
import { RequirementAgent, ConditionalRequirement, ThinkTool } from './framework';

const agent = new RequirementAgent({
  llm: createChatModel("ollama:granite3.3:8b"),
  tools: [new ThinkTool(), codeAgent, securityAgent],
  requirements: [
    // Force thinking at step 1 (BeeAI pattern)
    new ConditionalRequirement(ThinkTool, { force_at_step: 1 }),
    
    // Sequence enforcement
    new SequenceRequirement(['think', 'analyze', 'implement'], {
      severity: 'high'
    }),
    
    // Rate limiting
    new RateLimitRequirement(10, 60000) // 10 calls per minute
  ],
  role: "Chief Architect",
  instructions: "Design and implement enterprise-grade solutions",
  middlewares: [new TrajectoryMiddleware()]
});
```

### 2. HandoffTool (Multi-Agent Coordination)

Enables seamless agent-to-agent delegation:

```typescript
// Create handoff tools for Constella agents
const codeHandoff = new HandoffTool("http://localhost:8012", {
  name: "CodeCraft",
  description: "Generate and optimize code",
  timeout_ms: 120000,
  preserve_context: true
});

const securityHandoff = new HandoffTool("http://localhost:8011", {
  name: "SecuriShield", 
  description: "Security analysis and compliance checking"
});

// Use in agent
const mainAgent = new RequirementAgent({
  llm: createChatModel("ollama:granite3.3:8b"),
  tools: [thinkTool, codeHandoff, securityHandoff],
  requirements: [
    new ConditionalRequirement(ThinkTool, { force_at_step: 1 })
  ]
});

// Execute with handoffs
const result = await mainAgent.run(
  "Create a secure user management API with proper authentication"
);
```

### 3. ChatModel (Provider Abstraction)

BeeAI's provider-agnostic LLM interface:

```typescript
// Different providers, same interface
const openaiModel = ChatModel.fromName("openai:gpt-4");
const ollamaModel = ChatModel.fromName("ollama:granite3.3:8b");
const claudeModel = ChatModel.fromName("anthropic:claude-3-sonnet");

// Seamless switching
const agent = new RequirementAgent({
  llm: ollamaModel, // Can be changed without code changes
  // ... rest of config
});
```

### 4. ConditionalRequirement (Constraint Enforcement)

Ensures deterministic behavior while preserving reasoning:

```typescript
// Force ThinkTool at step 1
const thinkRequirement = new ConditionalRequirement(ThinkTool, {
  force_at_step: 1,
  severity: 'critical'
});

// Custom condition enforcement
const securityRequirement = new ConditionalRequirement(SecuriShield, {
  condition: (context) => context.action === 'deploy',
  severity: 'high',
  enforce_at_step: 3
});
```

## 🔗 Constella Integration

### Existing Agent Integration

The framework works with your existing Constella agents through bridge patterns:

```typescript
// Bridge existing Constella agents
const constellaAgents = {
  codecraft: new HandoffTool("http://localhost:8012", {
    name: "CodeCraft",
    description: "Code generation and refactoring specialist"
  }),
  
  securishield: new HandoffTool("http://localhost:8011", {
    name: "SecuriShield", 
    description: "Security scanning and compliance"
  }),
  
  designforge: new HandoffTool("http://localhost:8010", {
    name: "DesignForge",
    description: "Architecture and design patterns"
  })
};

// Create unified Constella agent
const constellaAgent = new RequirementAgent({
  llm: createChatModel("ollama:granite3.3:8b"),
  tools: [
    new ThinkTool(),
    ...Object.values(constellaAgents)
  ],
  requirements: [
    new ConditionalRequirement(ThinkTool, { force_at_step: 1 }),
    new SequenceRequirement(['think', 'analyze', 'implement', 'verify'])
  ],
  role: "Constella Chief Architect",
  instructions: "Coordinate specialized agents for enterprise development"
});
```

### Memory System Integration

Connects to your existing Neo4j/Qdrant/Redis stack:

```typescript
import { Neo4jMemoryProvider, QdrantMemoryProvider, RedisMemoryProvider } from './framework/memory';

const memoryProvider = new Neo4jMemoryProvider({
  url: process.env.NEO4J_URL,
  username: process.env.NEO4J_USERNAME,
  password: process.env.NEO4J_PASSWORD
});

const agent = new RequirementAgent({
  llm: createChatModel("ollama:granite3.3:8b"),
  tools: [thinkTool, codeAgent],
  memory_provider: memoryProvider, // Persistent context
  // ...
});
```

### WebSocket Real-time Updates

Integrates with Constella's real-time monitoring:

```typescript
import { WebSocketEventEmitter } from './framework/events';

const eventEmitter = new WebSocketEventEmitter({
  url: "ws://localhost:8000/ws"
});

agent.on('tool.execution_started', (event) => {
  eventEmitter.emit('agent.tool_started', {
    agent_id: agent.id,
    tool_name: event.tool_name,
    timestamp: new Date().toISOString()
  });
});
```

## 🛠️ Tool Development

### Creating Custom Tools

```typescript
import { Tool, ToolSchema, ToolExecutionContext, ToolResult } from './framework';

export class DatabaseTool extends Tool {
  public readonly name = 'database_query';
  public readonly description = 'Execute database queries safely';
  public readonly schema: ToolSchema = {
    name: 'database_query',
    description: 'Execute database queries with built-in safety checks',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query to execute' },
        database: { type: 'string', description: 'Target database name' }
      },
      required: ['query']
    }
  };

  protected async executeInternal(
    parameters: JSONObject,
    context: ToolExecutionContext
  ): Promise<JSONValue> {
    const { query, database = 'default' } = parameters;
    
    // Validate query safety
    if (this.isUnsafeQuery(query as string)) {
      throw new Error('Unsafe query detected');
    }
    
    // Execute query
    const result = await this.executeQuery(query as string, database as string);
    
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      executionTime: result.executionTime
    };
  }
  
  private isUnsafeQuery(query: string): boolean {
    const dangerous = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER'];
    return dangerous.some(keyword => 
      query.toUpperCase().includes(keyword)
    );
  }
}
```

### Using Tools in Agents

```typescript
const databaseTool = new DatabaseTool();
const agent = new RequirementAgent({
  llm: createChatModel("ollama:granite3.3:8b"),
  tools: [thinkTool, databaseTool],
  requirements: [
    new ConditionalRequirement(ThinkTool, { force_at_step: 1 })
  ]
});
```

## 🔒 Security & Compliance

### Built-in Security Features

```typescript
// JWT Authentication
const agent = new RequirementAgent({
  llm: createChatModel("ollama:granite3.3:8b"),
  tools: [secureTools],
  auth: {
    jwt_secret: process.env.JWT_SECRET,
    required_permissions: ['agent.execute', 'tools.use']
  }
});

// Rate limiting
const rateLimitRequirement = new RateLimitRequirement(60, 60000); // 60 calls per minute

// Audit logging
agent.on('tool.execution_completed', (event) => {
  auditLogger.log({
    user_id: event.context.user_id,
    action: 'tool_execution',
    tool_name: event.tool_name,
    timestamp: event.timestamp,
    result: event.success ? 'success' : 'failure'
  });
});
```

## 📊 Monitoring & Observability

### Metrics Collection

```typescript
import { MetricCollector, PrometheusExporter } from './framework/metrics';

const collector = new MetricCollector({
  collection_interval_seconds: 30,
  exporters: [new PrometheusExporter()]
});

// Automatic metric collection
agent.on('tool.execution_completed', (event) => {
  collector.recordMetric({
    name: 'tool_execution_duration',
    value: event.execution_time_ms,
    unit: 'milliseconds',
    tags: {
      tool_name: event.tool_name,
      agent_id: event.agent_id,
      success: event.success.toString()
    }
  });
});
```

### Dashboard Integration

Connects to your existing Grafana dashboards:

```typescript
// Metrics automatically exported to Prometheus format
// Available at http://localhost:8000/metrics

// Example Grafana queries:
// - Agent execution rate: rate(agent_executions_total[5m])
// - Tool success rate: tool_executions_success / tool_executions_total
// - Average response time: avg(tool_execution_duration)
```

## 🚀 Deployment

### Docker Integration

The framework integrates with your existing Docker setup:

```dockerfile
# Add to existing Dockerfile
FROM node:18-alpine

WORKDIR /app/framework
COPY constella-os/framework/package*.json ./
RUN npm ci --only=production

COPY constella-os/framework/dist ./dist
COPY constella-os/framework/src ./src

EXPOSE 8000
CMD ["node", "dist/index.js"]
```

### Environment Variables

```bash
# .env.production
OPENAI_API_KEY=your_openai_key
OLLAMA_BASE_URL=http://localhost:11434
NEO4J_URL=bolt://neo4j:7687
QDRANT_URL=http://qdrant:6333
REDIS_URL=redis://redis:6379
JWT_SECRET=your_jwt_secret
AGENT_BEARER=your_agent_token
```

## 🧪 Testing

### Unit Tests

```typescript
import { ThinkTool, createChatModel } from '../src';

describe('ThinkTool', () => {
  let tool: ThinkTool;
  
  beforeEach(() => {
    tool = new ThinkTool();
  });
  
  test('should execute thinking process', async () => {
    const result = await tool.execute({
      thought: 'I need to analyze this problem step by step',
      reasoning_type: 'analysis'
    }, mockContext);
    
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('thinking_id');
  });
});
```

### Integration Tests

```typescript
describe('Constella Agent Integration', () => {
  test('should integrate with CodeCraft agent', async () => {
    const codeAgent = new HandoffTool('http://localhost:8012');
    const agent = new RequirementAgent({
      llm: createChatModel("ollama:granite3.3:8b"),
      tools: [codeAgent]
    });
    
    const result = await agent.run('Create a simple function');
    expect(result.status).toBe('completed');
  });
});
```

## 📈 Performance Optimization

### Caching Strategies

```typescript
// Tool-level caching
const cachedTool = new DatabaseTool({
  cache_enabled: true,
  cache_ttl_seconds: 300
});

// Agent-level memory optimization
const agent = new RequirementAgent({
  llm: createChatModel("ollama:granite3.3:8b"),
  tools: [cachedTool],
  performance: {
    max_concurrent_executions: 5,
    memory_cache_size: 1000
  }
});
```

### Scaling Considerations

```typescript
// Horizontal scaling with load balancing
const agents = [
  createAgent("ollama:granite3.3:8b"),
  createAgent("openai:gpt-4"),
  createAgent("anthropic:claude-3")
];

const loadBalancer = new AgentLoadBalancer(agents, {
  strategy: 'round_robin',
  health_check_interval: 30000
});
```

## 🔧 Migration Guide

### From Existing Constella Setup

1. **Install Framework**: 
   ```bash
   cd constella-os/framework && npm install
   ```

2. **Wrap Existing Agents**:
   ```typescript
   // Before: Direct HTTP calls
   const response = await fetch('http://localhost:8012/execute_task', {...});
   
   // After: Framework integration
   const codeAgent = new HandoffTool('http://localhost:8012');
   const result = await agent.run('Generate code', { tools: [codeAgent] });
   ```

3. **Add Requirements**:
   ```typescript
   // Add constraint enforcement
   const requirements = [
     new ConditionalRequirement(ThinkTool, { force_at_step: 1 }),
     new SequenceRequirement(['analyze', 'implement', 'test'])
   ];
   ```

4. **Update Orchestrator**:
   ```typescript
   // Replace orchestrator-py with framework-based orchestrator
   const orchestrator = new FrameworkOrchestrator({
     agents: constellaAgents,
     requirements: globalRequirements
   });
   ```

## 🤝 Contributing

### Development Setup

```bash
git clone <repository>
cd constella-os/framework
npm install
npm run dev
```

### Code Standards

- Follow existing TypeScript patterns
- Add comprehensive tests for new features
- Update documentation for API changes
- Ensure backward compatibility with Constella

## 📚 API Reference

### Core Classes

- **RequirementAgent**: Main agent class with constraint enforcement
- **Tool**: Base class for all tools
- **ChatModel**: LLM provider abstraction
- **HandoffTool**: Agent-to-agent delegation
- **ThinkTool**: Explicit reasoning tool
- **ConditionalRequirement**: Constraint enforcement

### Complete API documentation available at: `/docs/api`

## 🐛 Troubleshooting

### Common Issues

**Framework not connecting to Constella agents:**
```bash
# Check agent health
curl http://localhost:8012/health

# Verify authentication
export AGENT_BEARER="your-token"
```

**Memory issues with large contexts:**
```typescript
// Limit context size
const agent = new RequirementAgent({
  memory_provider: memoryProvider,
  performance: { memory_cache_size: 500 }
});
```

**Tool execution timeouts:**
```typescript
// Increase timeout
const tool = new CustomTool({
  timeout_ms: 60000 // 1 minute
});
```

## 🎯 Roadmap

- [ ] **v1.1**: Advanced workflow orchestration
- [ ] **v1.2**: GraphQL API integration  
- [ ] **v1.3**: Multi-language agent support
- [ ] **v1.4**: Advanced observability features
- [ ] **v2.0**: Full Kubernetes operator

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details.

---

**The Constella BeeAI Framework brings enterprise-grade AI agent orchestration to your existing infrastructure while maintaining the flexibility and power of the original BeeAI patterns.**

*Questions? Check our [documentation](./docs/) or [open an issue](./issues).*