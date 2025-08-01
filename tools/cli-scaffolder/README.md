# AgentForge CLI Scaffolder

A powerful command-line tool for scaffolding AgentForge projects and agents with best practices built-in.

## Installation

```bash
npm install -g @agentforge/cli
```

## Quick Start

```bash
# Create a new project
agentforge create my-project

# Create a new agent
agentforge agent security-scanner --type specialist --specialization security

# Validate project structure
agentforge validate --fix

# Generate documentation
agentforge docs
```

## Commands

### `create [name]`

Create a new AgentForge project with the specified template.

```bash
agentforge create my-project
agentforge create --template microservice --dir ./projects/my-app
```

**Options:**
- `-t, --template <template>` - Project template (microservice, monolith, plugin)
- `-d, --dir <directory>` - Target directory
- `--skip-install` - Skip dependency installation
- `--skip-git` - Skip git initialization

### `agent <name>`

Generate a new agent with proper structure and tests.

```bash
agentforge agent security-scanner --type specialist --specialization security
agentforge agent utility-agent --type general --dir ./src/agents
```

**Options:**
- `-t, --type <type>` - Agent type (specialist, general, orchestrator)
- `-s, --specialization <spec>` - Agent specialization
- `-d, --dir <directory>` - Target directory
- `--no-tests` - Skip test file generation

**Available Specializations:**
- `security` - Security analysis and vulnerability scanning
- `quality` - Code quality analysis and testing
- `architecture` - Architecture analysis and design patterns
- `performance` - Performance optimization and monitoring
- `documentation` - Documentation generation and maintenance
- `deployment` - Deployment and DevOps automation

### `setup`

Setup AgentForge development environment.

```bash
agentforge setup --docker
agentforge setup --local
agentforge setup --prod
```

**Options:**
- `--docker` - Setup with Docker containers
- `--local` - Setup for local development
- `--prod` - Setup for production deployment

### `validate`

Validate project structure and configuration.

```bash
agentforge validate
agentforge validate --fix --strict
```

**Options:**
- `-f, --fix` - Auto-fix common issues
- `--strict` - Use strict validation rules

### `docs`

Generate project documentation.

```bash
agentforge docs
agentforge docs --type api --output ./documentation
```

**Options:**
- `-t, --type <type>` - Documentation type (api, agents, architecture, all)
- `-o, --output <dir>` - Output directory

## Project Templates

### Microservice Template

Creates a project with:
- Individual service architecture
- Docker configuration
- API gateway setup
- Service discovery
- Monitoring and observability

### Monolith Template

Creates a project with:
- Integrated service architecture
- Simplified deployment
- Shared resources
- Centralized configuration

### Plugin Template

Creates a project for:
- VS Code extensions
- CLI tools
- Third-party integrations
- Custom agent types

## Agent Types

### Specialist Agents

Focused on specific domains with pre-configured capabilities:

- **Security Agent**: Vulnerability scanning, compliance checking
- **Quality Agent**: Code analysis, testing, metrics
- **Architecture Agent**: Design patterns, dependency analysis
- **Performance Agent**: Optimization, monitoring
- **Documentation Agent**: API docs, README generation
- **Deployment Agent**: CI/CD, infrastructure management

### General Purpose Agents

Flexible agents that can handle multiple types of tasks:

- Custom capability definition
- Multi-domain processing
- Adaptable behavior
- Dynamic task routing

## Configuration

The CLI can be configured through:

1. **Command-line flags**
2. **Environment variables**
3. **Configuration files** (`.agentforge.json`)

### Configuration File Example

```json
{
  "defaultTemplate": "microservice",
  "agentDirectory": "./src/agents",
  "testDirectory": "./test",
  "orchestratorUrl": "http://localhost:3000",
  "eslintConfig": "@agentforge/eslint-config",
  "prettier": true,
  "typescript": true
}
```

## Generated Project Structure

```
my-project/
├── src/
│   ├── agents/          # Custom agents
│   │   ├── ExampleAgent.ts
│   │   └── index.ts
│   ├── services/        # Microservices
│   ├── utils/           # Utility functions
│   └── index.ts         # Main entry point
├── test/                # Test files
│   ├── setup.ts
│   └── ExampleAgent.test.ts
├── config/              # Configuration files
│   └── orchestrator.json
├── docs/                # Documentation
├── .vscode/            # VS Code settings
│   ├── settings.json
│   └── extensions.json
├── docker-compose.yml   # Docker configuration
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Agent File Structure

```typescript
// Generated agent file
import { SpecialistAgent, registerSpecialist } from "@agentforge/orchestrator";
import { Task, TaskType } from "../types.js";

export class SecurityAgent extends SpecialistAgent {
  static KIND = "security";

  constructor(cfg: { id: string; specialization: TaskType }) {
    super(cfg);
  }

  protected async _executeSpecialist(task: Task): Promise<unknown> {
    // Agent implementation
    await this.simulateWork(1000);
    
    return {
      agent: SecurityAgent.KIND,
      taskId: task.id,
      status: "completed",
      result: "Security analysis completed"
    };
  }
}

// Automatic registration
registerSpecialist(SecurityAgent.KIND, SecurityAgent);
```

## Development Workflow

1. **Create Project**: `agentforge create my-project`
2. **Navigate**: `cd my-project`
3. **Install Dependencies**: `npm install`
4. **Create Agents**: `agentforge agent my-agent --type specialist`
5. **Validate**: `agentforge validate --fix`
6. **Start Development**: `npm run dev`
7. **Generate Docs**: `agentforge docs`

## Integration with VS Code

The CLI works seamlessly with the AgentForge VS Code extension:

1. Install the extension from the marketplace
2. Open your project in VS Code
3. Use the command palette for agent operations
4. View real-time agent activity
5. Access project dashboard

## Best Practices

### Agent Development

- Use descriptive agent names with the "Agent" suffix
- Implement proper error handling
- Include comprehensive tests
- Document agent capabilities
- Follow the AgentForge patterns

### Project Structure

- Organize agents by domain
- Use consistent naming conventions
- Maintain clean separation of concerns
- Include proper documentation
- Set up CI/CD pipelines

### Testing

- Write unit tests for all agents
- Include integration tests
- Test error scenarios
- Mock external dependencies
- Maintain high test coverage

## Troubleshooting

### Common Issues

1. **Permission Errors**: Run with appropriate permissions
2. **Missing Dependencies**: Ensure Node.js 18+ is installed
3. **Port Conflicts**: Check for running services on default ports
4. **Template Errors**: Verify internet connection for template downloads

### Debug Mode

```bash
agentforge --verbose create my-project
agentforge --debug agent my-agent
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details
