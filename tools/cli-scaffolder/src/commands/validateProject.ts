import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import glob from 'glob';

export interface ValidateOptions {
  fix: boolean;
  strict: boolean;
}

interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
}

interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  file?: string;
  fixable: boolean;
}

export async function validateProject(options: ValidateOptions): Promise<void> {
  const spinner = ora('Validating AgentForge project...').start();

  try {
    const results = await runValidation(options);
    
    if (results.passed) {
      spinner.succeed(chalk.green('Project validation passed!'));
    } else {
      spinner.warn(chalk.yellow('Project validation completed with issues'));
    }

    // Display results
    displayValidationResults(results);

    // Auto-fix if requested
    if (options.fix && results.issues.some(issue => issue.fixable)) {
      await autoFixIssues(results.issues.filter(issue => issue.fixable));
      console.log(chalk.green('\nAuto-fix completed!'));
    }

  } catch (error) {
    spinner.fail(chalk.red('Validation failed'));
    console.error(error);
    process.exit(1);
  }
}

async function runValidation(options: ValidateOptions): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // Validate project structure
  issues.push(...await validateProjectStructure());

  // Validate configuration files
  issues.push(...await validateConfiguration());

  // Validate agents
  issues.push(...await validateAgents());

  // Validate dependencies
  issues.push(...await validateDependencies());

  // Validate TypeScript configuration
  issues.push(...await validateTypeScriptConfig());

  // Strict validation checks
  if (options.strict) {
    issues.push(...await strictValidation());
  }

  const errors = issues.filter(issue => issue.type === 'error');
  const passed = errors.length === 0;

  return { passed, issues };
}

async function validateProjectStructure(): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const requiredDirs = ['src', 'src/agents', 'config'];
  const requiredFiles = ['package.json', 'tsconfig.json'];

  for (const dir of requiredDirs) {
    if (!await fs.pathExists(dir)) {
      issues.push({
        type: 'error',
        category: 'Structure',
        message: `Missing required directory: ${dir}`,
        fixable: true
      });
    }
  }

  for (const file of requiredFiles) {
    if (!await fs.pathExists(file)) {
      issues.push({
        type: 'error',
        category: 'Structure',
        message: `Missing required file: ${file}`,
        file,
        fixable: false
      });
    }
  }

  return issues;
}

async function validateConfiguration(): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Check package.json
  try {
    const packageJson = await fs.readJSON('package.json');
    
    if (!packageJson.dependencies?.['@agentforge/orchestrator']) {
      issues.push({
        type: 'warning',
        category: 'Configuration',
        message: 'Missing AgentForge orchestrator dependency',
        file: 'package.json',
        fixable: true
      });
    }

    if (!packageJson.scripts?.build) {
      issues.push({
        type: 'warning',
        category: 'Configuration',
        message: 'Missing build script in package.json',
        file: 'package.json',
        fixable: true
      });
    }

  } catch (error) {
    issues.push({
      type: 'error',
      category: 'Configuration',
      message: 'Invalid package.json file',
      file: 'package.json',
      fixable: false
    });
  }

  // Check orchestrator config
  const configFile = 'config/orchestrator.json';
  if (await fs.pathExists(configFile)) {
    try {
      const config = await fs.readJSON(configFile);
      
      if (!config.orchestrator?.port) {
        issues.push({
          type: 'warning',
          category: 'Configuration',
          message: 'Missing orchestrator port configuration',
          file: configFile,
          fixable: true
        });
      }

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'Configuration',
        message: 'Invalid orchestrator configuration',
        file: configFile,
        fixable: false
      });
    }
  }

  return issues;
}

async function validateAgents(): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const agentFiles = glob.sync('src/agents/**/*.ts');

  if (agentFiles.length === 0) {
    issues.push({
      type: 'info',
      category: 'Agents',
      message: 'No agents found in src/agents/',
      fixable: false
    });
  }

  for (const agentFile of agentFiles) {
    try {
      const content = await fs.readFile(agentFile, 'utf-8');

      // Check for required imports
      if (!content.includes('SpecialistAgent') && !content.includes('BaseAgent')) {
        issues.push({
          type: 'error',
          category: 'Agents',
          message: 'Agent does not extend SpecialistAgent or BaseAgent',
          file: agentFile,
          fixable: false
        });
      }

      // Check for agent registration
      if (!content.includes('registerSpecialist')) {
        issues.push({
          type: 'warning',
          category: 'Agents',
          message: 'Agent is not registered with orchestrator',
          file: agentFile,
          fixable: true
        });
      }

      // Check for test files
      const testFile = agentFile.replace(/\.ts$/, '.test.ts');
      if (!await fs.pathExists(testFile)) {
        issues.push({
          type: 'info',
          category: 'Agents',
          message: 'Missing test file for agent',
          file: agentFile,
          fixable: true
        });
      }

    } catch (error) {
      issues.push({
        type: 'error',
        category: 'Agents',
        message: `Cannot read agent file: ${error}`,
        file: agentFile,
        fixable: false
      });
    }
  }

  return issues;
}

async function validateDependencies(): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  try {
    const packageJson = await fs.readJSON('package.json');
    const requiredDeps = [
      '@agentforge/orchestrator',
      'fastify'
    ];

    const requiredDevDeps = [
      'typescript',
      'vitest',
      '@types/node'
    ];

    for (const dep of requiredDeps) {
      if (!packageJson.dependencies?.[dep]) {
        issues.push({
          type: 'error',
          category: 'Dependencies',
          message: `Missing required dependency: ${dep}`,
          file: 'package.json',
          fixable: true
        });
      }
    }

    for (const dep of requiredDevDeps) {
      if (!packageJson.devDependencies?.[dep]) {
        issues.push({
          type: 'warning',
          category: 'Dependencies',
          message: `Missing recommended dev dependency: ${dep}`,
          file: 'package.json',
          fixable: true
        });
      }
    }

  } catch (error) {
    issues.push({
      type: 'error',
      category: 'Dependencies',
      message: 'Cannot validate dependencies - invalid package.json',
      fixable: false
    });
  }

  return issues;
}

async function validateTypeScriptConfig(): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  try {
    const tsConfig = await fs.readJSON('tsconfig.json');

    if (!tsConfig.compilerOptions?.target) {
      issues.push({
        type: 'warning',
        category: 'TypeScript',
        message: 'Missing target in TypeScript configuration',
        file: 'tsconfig.json',
        fixable: true
      });
    }

    if (!tsConfig.compilerOptions?.module) {
      issues.push({
        type: 'warning',
        category: 'TypeScript',
        message: 'Missing module in TypeScript configuration',
        file: 'tsconfig.json',
        fixable: true
      });
    }

    if (!tsConfig.compilerOptions?.strict) {
      issues.push({
        type: 'info',
        category: 'TypeScript',
        message: 'Strict mode not enabled in TypeScript configuration',
        file: 'tsconfig.json',
        fixable: true
      });
    }

  } catch (error) {
    issues.push({
      type: 'error',
      category: 'TypeScript',
      message: 'Invalid TypeScript configuration',
      file: 'tsconfig.json',
      fixable: false
    });
  }

  return issues;
}

async function strictValidation(): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  // Check for security best practices
  if (await fs.pathExists('.env')) {
    const envContent = await fs.readFile('.env', 'utf-8');
    if (envContent.includes('your-api-key-here') || envContent.includes('change-me')) {
      issues.push({
        type: 'error',
        category: 'Security',
        message: 'Default API keys found in .env file',
        file: '.env',
        fixable: false
      });
    }
  }

  // Check for VS Code configuration
  if (!await fs.pathExists('.vscode/settings.json')) {
    issues.push({
      type: 'info',
      category: 'Development',
      message: 'Missing VS Code configuration',
      fixable: true
    });
  }

  // Check for documentation
  if (!await fs.pathExists('README.md')) {
    issues.push({
      type: 'warning',
      category: 'Documentation',
      message: 'Missing README.md file',
      fixable: true
    });
  }

  return issues;
}

function displayValidationResults(results: ValidationResult): void {
  const { issues } = results;
  
  if (issues.length === 0) {
    console.log(chalk.green('\n✅ No issues found!'));
    return;
  }

  console.log(chalk.cyan('\n📋 Validation Results:\n'));

  const categories = [...new Set(issues.map(issue => issue.category))];
  
  for (const category of categories) {
    console.log(chalk.bold(`\n${category}:`));
    
    const categoryIssues = issues.filter(issue => issue.category === category);
    
    for (const issue of categoryIssues) {
      const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
      const color = issue.type === 'error' ? chalk.red : issue.type === 'warning' ? chalk.yellow : chalk.blue;
      
      console.log(`  ${icon} ${color(issue.message)}`);
      if (issue.file) {
        console.log(chalk.gray(`     File: ${issue.file}`));
      }
      if (issue.fixable) {
        console.log(chalk.gray('     Fixable: Yes'));
      }
    }
  }

  // Summary
  const errors = issues.filter(issue => issue.type === 'error').length;
  const warnings = issues.filter(issue => issue.type === 'warning').length;
  const info = issues.filter(issue => issue.type === 'info').length;

  console.log(chalk.cyan('\n📊 Summary:'));
  if (errors > 0) console.log(chalk.red(`  Errors: ${errors}`));
  if (warnings > 0) console.log(chalk.yellow(`  Warnings: ${warnings}`));
  if (info > 0) console.log(chalk.blue(`  Info: ${info}`));
}

async function autoFixIssues(fixableIssues: ValidationIssue[]): Promise<void> {
  console.log(chalk.cyan('\n🔧 Auto-fixing issues...\n'));

  for (const issue of fixableIssues) {
    console.log(chalk.gray(`Fixing: ${issue.message}`));

    try {
      await applyFix(issue);
      console.log(chalk.green(`✅ Fixed: ${issue.message}`));
    } catch (error) {
      console.log(chalk.red(`❌ Failed to fix: ${issue.message}`));
    }
  }
}

async function applyFix(issue: ValidationIssue): Promise<void> {
  switch (issue.category) {
    case 'Structure':
      if (issue.message.includes('Missing required directory')) {
        const dir = issue.message.split(': ')[1];
        await fs.ensureDir(dir);
      }
      break;

    case 'Configuration':
      if (issue.file === 'package.json' && issue.message.includes('Missing build script')) {
        const packageJson = await fs.readJSON('package.json');
        packageJson.scripts = packageJson.scripts || {};
        packageJson.scripts.build = 'tsc';
        await fs.writeJSON('package.json', packageJson, { spaces: 2 });
      }
      break;

    case 'Development':
      if (issue.message.includes('Missing VS Code configuration')) {
        await fs.ensureDir('.vscode');
        const settings = {
          'typescript.preferences.importModuleSpecifier': 'relative',
          'editor.formatOnSave': true
        };
        await fs.writeJSON('.vscode/settings.json', settings, { spaces: 2 });
      }
      break;

    default:
      break;
  }
}
