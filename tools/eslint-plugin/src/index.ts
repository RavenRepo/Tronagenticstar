import { agentNamingConvention } from './rules/agent-naming-convention.js';
import { agentRegistration } from './rules/agent-registration.js';
import { taskHandlerAsync } from './rules/task-handler-async.js';
import { properErrorHandling } from './rules/proper-error-handling.js';
import { agentTestCoverage } from './rules/agent-test-coverage.js';

const plugin = {
  meta: {
    name: '@agentforge/eslint-plugin',
    version: '0.1.0'
  },
  rules: {
    'agent-naming-convention': agentNamingConvention,
    'agent-registration': agentRegistration,
    'task-handler-async': taskHandlerAsync,
    'proper-error-handling': properErrorHandling,
    'agent-test-coverage': agentTestCoverage
  },
  configs: {
    recommended: {
      plugins: ['@agentforge'],
      rules: {
        '@agentforge/agent-naming-convention': 'error',
        '@agentforge/agent-registration': 'error',
        '@agentforge/task-handler-async': 'error',
        '@agentforge/proper-error-handling': 'warn',
        '@agentforge/agent-test-coverage': 'warn'
      }
    },
    strict: {
      plugins: ['@agentforge'],
      rules: {
        '@agentforge/agent-naming-convention': 'error',
        '@agentforge/agent-registration': 'error',
        '@agentforge/task-handler-async': 'error',
        '@agentforge/proper-error-handling': 'error',
        '@agentforge/agent-test-coverage': 'error'
      }
    }
  }
};

export default plugin;
