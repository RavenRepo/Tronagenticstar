import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChiefArchitect, Task, TaskType } from '../src';
import { execSync } from 'child_process';

const CODECRAFT_PORT = 8011;

describe('ChiefArchitect Integration Test', () => {
  let chiefArchitect: ChiefArchitect;

  beforeAll(async () => {
    // Start the codecraft agent
    execSync('bash test/run_agent.sh');

    // Initialize the ChiefArchitect
    chiefArchitect = new ChiefArchitect();
    const agentInfo = await chiefArchitect.getRegistry().discoverAndRegisterAgent(`http://localhost:${CODECRAFT_PORT}`);
    
    // Ensure agent was discovered
    if (!agentInfo) {
      throw new Error('Failed to discover and register the codecraft agent.');
    }
  });

  afterAll(() => {
    try {
      const pid = execSync('cat test/.agent_pid').toString().trim();
      if (pid) {
        execSync(`kill ${pid}`);
        execSync('rm test/.agent_pid');
      }
    } catch (error) {
      // Ignore errors if the file doesn't exist
    }
  });

  it('should successfully dispatch a task to the codecraft agent', async () => {
    const task: Task = {
      id: 'test-task-1',
      type: TaskType.CODE_GENERATION,
      parameters: {
        prompt: 'create a hello world function in python',
      },
    };

    const result = await chiefArchitect.handleRequest(task);

    expect(result).toBeDefined();
    expect(result.task_id).toBe('test-task-1');
    expect(result.status).toBe('completed');
    expect(result.result.generated_code).toContain('def hello_world');
  });
});
