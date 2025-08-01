import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import Handlebars from 'handlebars';

export interface AgentOptions {
  type: string;
  specialization?: string;
  dir: string;
  tests: boolean;
}

const AGENT_TYPES = {
  specialist: 'Specialist Agent (focused on specific tasks)',
  general: 'General Purpose Agent (flexible capabilities)',
  orchestrator: 'Orchestrator Agent (manages other agents)'
};

const SPECIALIZATIONS = {
  security: 'Security analysis and vulnerability scanning',
  quality: 'Code quality analysis and testing',
  architecture: 'Architecture analysis and design patterns',
  performance: 'Performance optimization and monitoring',
  documentation: 'Documentation generation and maintenance',
  deployment: 'Deployment and DevOps automation',
  custom: 'Custom specialization (you define the capabilities)'
};

export async function createAgent(name: string, options: AgentOptions): Promise<void> {
  const spinner = ora('Creating new agent...').start();

  try {
    // Validate agent name
    if (!name || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      spinner.fail('Invalid agent name. Use alphanumeric characters, hyphens, and underscores only.');
      return;
    }

    // Interactive prompts if options not provided
    let agentConfig = { ...options };

    if (!agentConfig.specialization && agentConfig.type === 'specialist') {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'specialization',
          message: 'Select agent specialization:',
          choices: Object.entries(SPECIALIZATIONS).map(([key, description]) => ({
            name: `${key} - ${description}`,
            value: key
          }))
        }
      ]);
      agentConfig.specialization = answers.specialization;
    }

    spinner.text = 'Generating agent files...';

    // Create agent directory
    const agentDir = path.join(agentConfig.dir, name);
    await fs.ensureDir(agentDir);

    // Generate main agent file
    await generateAgentFile(agentDir, name, agentConfig);

    // Generate test file if requested
    if (agentConfig.tests) {
      await generateTestFile(agentDir, name, agentConfig);
    }

    // Generate configuration file
    await generateConfigFile(agentDir, name, agentConfig);

    // Generate README
    await generateReadmeFile(agentDir, name, agentConfig);

    spinner.succeed(chalk.green(`Agent '${name}' created successfully!`));
    
    console.log(chalk.cyan('\nNext steps:'));
    console.log(chalk.gray(`  1. cd ${agentDir}`));
    console.log(chalk.gray(`  2. Implement agent logic in ${name}.ts`));
    console.log(chalk.gray(`  3. Run tests with: npm test`));
    console.log(chalk.gray(`  4. Register agent in orchestrator`));

  } catch (error) {
    spinner.fail(chalk.red('Failed to create agent'));
    console.error(error);
    process.exit(1);
  }
}

async function generateAgentFile(dir: string, name: string, config: AgentOptions): Promise<void> {
  const template = await getAgentTemplate(config.type);
  const compiled = Handlebars.compile(template);
  
  const content = compiled({
    name,
    className: toPascalCase(name),
    specialization: config.specialization,
    timestamp: new Date().toISOString()
  });

  await fs.writeFile(path.join(dir, `${name}.ts`), content);
}

async function generateTestFile(dir: string, name: string, config: AgentOptions): Promise<void> {
  const template = await getTestTemplate();
  const compiled = Handlebars.compile(template);
  
  const content = compiled({
    name,
    className: toPascalCase(name),
    specialization: config.specialization
  });

  await fs.writeFile(path.join(dir, `${name}.test.ts`), content);
}

async function generateConfigFile(dir: string, name: string, config: AgentOptions): Promise<void> {
  const agentConfig = {
    name,
    type: config.type,
    specialization: config.specialization,
    version: '1.0.0',
    capabilities: getCapabilitiesBySpecialization(config.specialization || 'custom'),
    resources: {
      memory: '512MB',
      cpu: '0.5',
      timeout: '30s'
    },
    dependencies: [],
    environment: {
      NODE_ENV: 'development'
    }
  };

  await fs.writeJSON(path.join(dir, 'agent.json'), agentConfig, { spaces: 2 });
}

async function generateReadmeFile(dir: string, name: string, config: AgentOptions): Promise<void> {
  const template = await getReadmeTemplate();
  const compiled = Handlebars.compile(template);
  
  const content = compiled({
    name,
    className: toPascalCase(name),
    type: config.type,
    specialization: config.specialization,
    description: getDescriptionBySpecialization(config.specialization || 'custom')
  });

  await fs.writeFile(path.join(dir, 'README.md'), content);
}

function getAgentTemplate(type: string): string {
  return `import { SpecialistAgent, registerSpecialist } from "../agentTemplates.js";
import { Task, TaskType } from "../types.js";

interface {{className}}Config {
  id: string;
  specialization: TaskType;
}

/**
 * {{className}} - {{#if specialization}}{{specialization}} specialist{{else}}{{type}}{{/if}}
 * Generated on: {{timestamp}}
 */
export class {{className}} extends SpecialistAgent {
  static KIND = "{{name}}";

  constructor(cfg: {{className}}Config) {
    super(cfg);
  }

  protected async _executeSpecialist(task: Task): Promise<unknown> {
    // TODO: Implement agent logic here
    {{#if specialization}}
    // This agent specializes in: {{specialization}}
    {{/if}}
    
    await this.simulateWork(1000);
    
    return {
      agent: {{className}}.KIND,
      taskId: task.id,
      status: "completed",
      {{#if specialization}}
      specialization: "{{specialization}}",
      {{/if}}
      result: "Agent execution completed successfully",
      timestamp: new Date().toISOString()
    };
  }

  // Add your custom methods here
}

// Register the agent with the orchestrator
registerSpecialist({{className}}.KIND, {{className}});
`;
}

function getTestTemplate(): string {
  return `import { describe, it, expect, beforeEach } from 'vitest';
import { {{className}} } from './{{name}}.js';
import { Task, TaskType } from '../types.js';

describe('{{className}}', () => {
  let agent: {{className}};

  beforeEach(() => {
    agent = new {{className}}({
      id: 'test-{{name}}',
      specialization: TaskType.{{#if specialization}}{{uppercase specialization}}{{else}}GENERAL{{/if}}
    });
  });

  it('should create agent instance', () => {
    expect(agent).toBeDefined();
    expect(agent.constructor.name).toBe('{{className}}');
  });

  it('should execute task successfully', async () => {
    const task: Task = {
      id: 'test-task-1',
      type: TaskType.{{#if specialization}}{{uppercase specialization}}{{else}}GENERAL{{/if}},
      priority: 5,
      manifestHash: 'test-manifest',
      correlationId: 'test-correlation',
      parameters: {}
    };

    const result = await agent.execute(task);
    
    expect(result).toBeDefined();
    expect(result.agent).toBe('{{name}}');
    expect(result.taskId).toBe(task.id);
    expect(result.status).toBe('completed');
  });

  {{#if specialization}}
  it('should handle {{specialization}} specific tasks', async () => {
    // TODO: Add {{specialization}}-specific test cases
    expect(true).toBe(true); // Placeholder test
  });
  {{/if}}
});
`;
}

function getReadmeTemplate(): string {
  return `# {{className}} Agent

{{description}}

## Overview

The {{className}} is a {{type}} agent{{#if specialization}} specialized in {{specialization}}{{/if}}. This agent is part of the AgentForge multi-agent development system.

## Features

{{#if specialization}}
- {{specialization}} analysis and processing
- Automated {{specialization}} workflows
- Integration with AgentForge orchestrator
{{else}}
- General purpose task execution
- Flexible capability handling
- Integration with AgentForge orchestrator
{{/if}}

## Configuration

The agent can be configured through the \`agent.json\` file:

\`\`\`json
{
  "name": "{{name}}",
  "type": "{{type}}",
  {{#if specialization}}"specialization": "{{specialization}}",{{/if}}
  "version": "1.0.0"
}
\`\`\`

## Usage

\`\`\`typescript
import { {{className}} } from './{{name}}.js';

const agent = new {{className}}({
  id: 'my-{{name}}-agent',
  specialization: TaskType.{{#if specialization}}{{uppercase specialization}}{{else}}GENERAL{{/if}}
});

// Execute a task
const result = await agent.execute(task);
\`\`\`

## Development

1. Install dependencies: \`npm install\`
2. Run tests: \`npm test\`
3. Build: \`npm run build\`

## Testing

Run the test suite:

\`\`\`bash
npm test
\`\`\`

## Contributing

1. Follow the AgentForge coding standards
2. Add tests for new functionality
3. Update documentation as needed

## License

MIT License - see LICENSE file for details
`;
}

function getCapabilitiesBySpecialization(specialization: string): string[] {
  const capabilities: Record<string, string[]> = {
    security: ['vulnerability-scanning', 'security-analysis', 'compliance-checking'],
    quality: ['code-analysis', 'testing', 'metrics-collection'],
    architecture: ['pattern-analysis', 'design-review', 'dependency-analysis'],
    performance: ['performance-analysis', 'optimization', 'monitoring'],
    documentation: ['doc-generation', 'markdown-processing', 'api-documentation'],
    deployment: ['deployment-automation', 'infrastructure-management', 'ci-cd'],
    custom: ['custom-processing', 'flexible-execution']
  };

  return capabilities[specialization] || capabilities.custom;
}

function getDescriptionBySpecialization(specialization: string): string {
  const descriptions: Record<string, string> = {
    security: 'A security-focused agent that performs vulnerability scanning, security analysis, and compliance checking.',
    quality: 'A code quality agent that analyzes code, runs tests, and collects quality metrics.',
    architecture: 'An architecture agent that reviews design patterns, analyzes dependencies, and provides architectural guidance.',
    performance: 'A performance optimization agent that analyzes system performance and provides optimization recommendations.',
    documentation: 'A documentation agent that generates and maintains project documentation.',
    deployment: 'A deployment agent that handles deployment automation and infrastructure management.',
    custom: 'A custom agent with flexible capabilities that can be tailored to specific needs.'
  };

  return descriptions[specialization] || descriptions.custom;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// Register Handlebars helpers
Handlebars.registerHelper('uppercase', (str: string) => str.toUpperCase());
