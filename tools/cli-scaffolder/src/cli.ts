#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import { createAgent } from './commands/createAgent.js';
import { createProject } from './commands/createProject.js';
import { setupEnvironment } from './commands/setupEnvironment.js';
import { validateProject } from './commands/validateProject.js';
import { generateDocs } from './commands/generateDocs.js';

const program = new Command();

// CLI Header
console.log(
  chalk.cyan(
    figlet.textSync('AgentForge', { horizontalLayout: 'full' })
  )
);
console.log(chalk.gray('🤖 Multi-Agent Development System CLI\n'));

program
  .name('agentforge')
  .description('CLI for scaffolding AgentForge projects and agents')
  .version('0.1.0');

// Create new project
program
  .command('create [name]')
  .alias('new')
  .description('Create a new AgentForge project')
  .option('-t, --template <template>', 'Project template (microservice, monolith, plugin)', 'microservice')
  .option('-d, --dir <directory>', 'Target directory')
  .option('--skip-install', 'Skip dependency installation')
  .option('--skip-git', 'Skip git initialization')
  .action(createProject);

// Create new agent
program
  .command('agent <name>')
  .description('Create a new agent')
  .option('-t, --type <type>', 'Agent type (specialist, general, orchestrator)', 'specialist')
  .option('-s, --specialization <spec>', 'Agent specialization (security, quality, architecture, etc.)')
  .option('-d, --dir <directory>', 'Target directory', './src/agents')
  .option('--no-tests', 'Skip test files generation')
  .action(createAgent);

// Setup development environment
program
  .command('setup')
  .description('Setup AgentForge development environment')
  .option('--docker', 'Setup with Docker containers')
  .option('--local', 'Setup for local development')
  .option('--prod', 'Setup for production deployment')
  .action(setupEnvironment);

// Validate project structure
program
  .command('validate')
  .description('Validate AgentForge project structure and configuration')
  .option('-f, --fix', 'Auto-fix common issues')
  .option('--strict', 'Use strict validation rules')
  .action(validateProject);

// Generate documentation
program
  .command('docs')
  .description('Generate project documentation')
  .option('-t, --type <type>', 'Documentation type (api, agents, architecture)', 'all')
  .option('-o, --output <dir>', 'Output directory', './docs')
  .action(generateDocs);

// Global options
program
  .option('--verbose', 'Enable verbose logging')
  .option('--quiet', 'Suppress non-essential output')
  .option('--config <path>', 'Path to config file');

// Error handling
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s\n'), program.args.join(' '));
  console.log(chalk.yellow('See --help for a list of available commands.'));
  process.exit(1);
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
