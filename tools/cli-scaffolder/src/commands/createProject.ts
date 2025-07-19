import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

export interface ProjectOptions {
  template: string;
  dir?: string;
  skipInstall: boolean;
  skipGit: boolean;
}

const PROJECT_TEMPLATES = {
  microservice: 'Microservice architecture with individual services',
  monolith: 'Monolithic architecture with integrated services',
  plugin: 'Plugin/extension development template'
};

export async function createProject(name: string | undefined, options: ProjectOptions): Promise<void> {
  const spinner = ora('Creating new AgentForge project...').start();

  try {
    // Get project name if not provided
    if (!name) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectName',
          message: 'Project name:',
          validate: (input: string) => {
            if (!input || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(input)) {
              return 'Please enter a valid project name (alphanumeric, hyphens, underscores)';
            }
            return true;
          }
        }
      ]);
      name = answers.projectName;
    }

    const projectName = name!;
    const targetDir = options.dir || path.join(process.cwd(), projectName);

    // Check if directory already exists
    if (await fs.pathExists(targetDir)) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Directory ${targetDir} already exists. Overwrite?`,
          default: false
        }
      ]);

      if (!answers.overwrite) {
        spinner.info('Project creation cancelled');
        return;
      }

      await fs.remove(targetDir);
    }

    spinner.text = 'Creating project structure...';

    // Create project directory
    await fs.ensureDir(targetDir);

    // Generate project files based on template
    await generateProjectStructure(targetDir, projectName, options.template);

    // Initialize git repository
    if (!options.skipGit) {
      spinner.text = 'Initializing git repository...';
      try {
        execSync('git init', { cwd: targetDir, stdio: 'pipe' });
        execSync('git add .', { cwd: targetDir, stdio: 'pipe' });
        execSync('git commit -m "Initial commit: AgentForge project scaffold"', { 
          cwd: targetDir, 
          stdio: 'pipe' 
        });
      } catch (error) {
        console.warn(chalk.yellow('Warning: Failed to initialize git repository'));
      }
    }

    // Install dependencies
    if (!options.skipInstall) {
      spinner.text = 'Installing dependencies...';
      try {
        execSync('npm install', { cwd: targetDir, stdio: 'pipe' });
      } catch (error) {
        console.warn(chalk.yellow('Warning: Failed to install dependencies. Run npm install manually.'));
      }
    }

    spinner.succeed(chalk.green(`Project '${projectName}' created successfully!`));
    
    console.log(chalk.cyan('\nNext steps:'));
    console.log(chalk.gray(`  1. cd ${projectName}`));
    if (options.skipInstall) {
      console.log(chalk.gray(`  2. npm install`));
    }
    console.log(chalk.gray(`  3. npm run dev`));
    console.log(chalk.gray(`  4. Open VS Code and install AgentForge extension`));

  } catch (error) {
    spinner.fail(chalk.red('Failed to create project'));
    console.error(error);
    process.exit(1);
  }
}

async function generateProjectStructure(targetDir: string, projectName: string, template: string): Promise<void> {
  // Create basic project structure
  const dirs = [
    'src',
    'src/agents',
    'src/services',
    'src/utils',
    'test',
    'docs',
    'config',
    '.vscode'
  ];

  for (const dir of dirs) {
    await fs.ensureDir(path.join(targetDir, dir));
  }

  // Generate package.json
  await generatePackageJson(targetDir, projectName, template);

  // Generate TypeScript config
  await generateTsConfig(targetDir);

  // Generate orchestrator config
  await generateOrchestratorConfig(targetDir);

  // Generate VS Code settings
  await generateVSCodeSettings(targetDir);

  // Generate Docker files
  await generateDockerFiles(targetDir, template);

  // Generate README
  await generateProjectReadme(targetDir, projectName, template);

  // Generate environment files
  await generateEnvFiles(targetDir);

  // Generate example agent
  await generateExampleAgent(targetDir);

  // Generate test files
  await generateTestFiles(targetDir);
}

async function generatePackageJson(targetDir: string, projectName: string, template: string): Promise<void> {
  const packageJson = {
    name: projectName,
    version: '1.0.0',
    description: `AgentForge project - ${template} template`,
    main: 'dist/index.js',
    type: 'module',
    scripts: {
      build: 'tsc',
      dev: 'tsx src/index.ts',
      start: 'node dist/index.js',
      test: 'vitest',
      'test:watch': 'vitest --watch',
      lint: 'eslint src --ext .ts',
      'lint:fix': 'eslint src --ext .ts --fix',
      format: 'prettier --write src/**/*.ts'
    },
    keywords: ['agentforge', 'agents', 'ai', 'development'],
    author: '',
    license: 'MIT',
    dependencies: {
      '@agentforge/orchestrator': '^0.1.0',
      'fastify': '^4.24.3',
      'dotenv': '^16.3.1'
    },
    devDependencies: {
      '@types/node': '^20.8.7',
      'typescript': '^5.2.2',
      'tsx': '^3.14.0',
      'vitest': '^0.34.6',
      'eslint': '^8.51.0',
      '@typescript-eslint/eslint-plugin': '^6.7.4',
      '@typescript-eslint/parser': '^6.7.4',
      'prettier': '^3.0.3'
    }
  };

  await fs.writeJSON(path.join(targetDir, 'package.json'), packageJson, { spaces: 2 });
}

async function generateTsConfig(targetDir: string): Promise<void> {
  const tsConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'node',
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      outDir: 'dist',
      rootDir: 'src',
      declaration: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', '**/*.test.ts']
  };

  await fs.writeJSON(path.join(targetDir, 'tsconfig.json'), tsConfig, { spaces: 2 });
}

async function generateOrchestratorConfig(targetDir: string): Promise<void> {
  const config = {
    orchestrator: {
      port: 3000,
      host: '0.0.0.0',
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:5173'],
        credentials: true
      }
    },
    agents: {
      autoRegister: true,
      maxConcurrent: 10,
      timeout: 30000
    },
    memory: {
      type: 'redis',
      url: 'redis://localhost:6379'
    },
    logging: {
      level: 'info',
      format: 'json'
    }
  };

  await fs.writeJSON(path.join(targetDir, 'config/orchestrator.json'), config, { spaces: 2 });
}

async function generateVSCodeSettings(targetDir: string): Promise<void> {
  const settings = {
    'typescript.preferences.importModuleSpecifier': 'relative',
    'editor.formatOnSave': true,
    'editor.defaultFormatter': 'esbenp.prettier-vscode',
    'agentforge.orchestratorUrl': 'http://localhost:3000',
    'agentforge.enableRealTimeUpdates': true
  };

  await fs.writeJSON(path.join(targetDir, '.vscode/settings.json'), settings, { spaces: 2 });

  const extensions = {
    recommendations: [
      'agentforge.agentforge-vscode',
      'esbenp.prettier-vscode',
      'ms-vscode.vscode-typescript-next'
    ]
  };

  await fs.writeJSON(path.join(targetDir, '.vscode/extensions.json'), extensions, { spaces: 2 });
}

async function generateDockerFiles(targetDir: string, template: string): Promise<void> {
  const dockerfile = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY config/ ./config/

EXPOSE 3000

CMD ["node", "dist/index.js"]
`;

  await fs.writeFile(path.join(targetDir, 'Dockerfile'), dockerfile);

  const dockerCompose = `version: '3.8'

services:
  orchestrator:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:
      - redis
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
`;

  await fs.writeFile(path.join(targetDir, 'docker-compose.yml'), dockerCompose);
}

async function generateProjectReadme(targetDir: string, projectName: string, template: string): Promise<void> {
  const readme = `# ${projectName}

An AgentForge project using the ${template} template.

## Overview

This project is built with AgentForge, a multi-agent development system that provides specialized AI agents for various development tasks.

## Getting Started

### Prerequisites

- Node.js 18+
- Redis (for memory storage)
- Docker (optional)

### Installation

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
# Start in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
\`\`\`

### Docker

\`\`\`bash
# Build and run with Docker Compose
docker-compose up --build
\`\`\`

## Project Structure

\`\`\`
${projectName}/
├── src/
│   ├── agents/          # Custom agents
│   ├── services/        # Microservices
│   ├── utils/           # Utility functions
│   └── index.ts         # Main entry point
├── test/                # Test files
├── config/              # Configuration files
├── docs/                # Documentation
└── .vscode/            # VS Code settings
\`\`\`

## Agents

This project includes the following agents:

- **ExampleAgent**: A sample agent demonstrating the AgentForge pattern

### Creating New Agents

\`\`\`bash
# Create a new specialist agent
agentforge agent my-agent --type specialist --specialization security

# Create a general purpose agent
agentforge agent my-agent --type general
\`\`\`

## Configuration

Configuration files are located in the \`config/\` directory:

- \`orchestrator.json\`: Orchestrator settings
- \`.env\`: Environment variables

## Testing

\`\`\`bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
\`\`\`

## Documentation

- [Agent Development Guide](docs/agents.md)
- [API Reference](docs/api.md)
- [Deployment Guide](docs/deployment.md)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details
`;

  await fs.writeFile(path.join(targetDir, 'README.md'), readme);
}

async function generateEnvFiles(targetDir: string): Promise<void> {
  const envExample = `# Environment Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# AgentForge Configuration
AGENTFORGE_API_KEY=your-api-key-here
AGENTFORGE_ORCHESTRATOR_URL=http://localhost:3000
`;

  await fs.writeFile(path.join(targetDir, '.env.example'), envExample);
  await fs.writeFile(path.join(targetDir, '.env'), envExample);
}

async function generateExampleAgent(targetDir: string): Promise<void> {
  const exampleAgent = `import { SpecialistAgent, registerSpecialist } from "@agentforge/orchestrator";
import { Task, TaskType } from "../types.js";

interface ExampleAgentConfig {
  id: string;
  specialization: TaskType;
}

/**
 * ExampleAgent - Demonstrates AgentForge agent pattern
 */
export class ExampleAgent extends SpecialistAgent {
  static KIND = "example";

  constructor(cfg: ExampleAgentConfig) {
    super(cfg);
  }

  protected async _executeSpecialist(task: Task): Promise<unknown> {
    // Implement your agent logic here
    await this.simulateWork(1000);
    
    return {
      agent: ExampleAgent.KIND,
      taskId: task.id,
      status: "completed",
      result: "Example agent executed successfully",
      timestamp: new Date().toISOString()
    };
  }
}

// Register the agent with the orchestrator
registerSpecialist(ExampleAgent.KIND, ExampleAgent);
`;

  await fs.writeFile(path.join(targetDir, 'src/agents/ExampleAgent.ts'), exampleAgent);
}

async function generateTestFiles(targetDir: string): Promise<void> {
  const testSetup = `import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global test cleanup
});
`;

  await fs.writeFile(path.join(targetDir, 'test/setup.ts'), testSetup);

  const exampleTest = `import { describe, it, expect } from 'vitest';
import { ExampleAgent } from '../src/agents/ExampleAgent.js';

describe('ExampleAgent', () => {
  it('should create agent instance', () => {
    const agent = new ExampleAgent({
      id: 'test-example',
      specialization: 'GENERAL' as any
    });
    
    expect(agent).toBeDefined();
    expect(agent.constructor.name).toBe('ExampleAgent');
  });
});
`;

  await fs.writeFile(path.join(targetDir, 'test/ExampleAgent.test.ts'), exampleTest);
}
