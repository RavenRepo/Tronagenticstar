import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name: string) => `https://agentforge.dev/eslint-rules/${name}`
);

export const taskHandlerAsync = createRule({
  name: 'task-handler-async',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure task handler methods are async and properly handle promises',
      recommended: 'error'
    },
    fixable: 'code',
    schema: [],
    messages: {
      taskHandlerNotAsync: 'Task handler method "{{methodName}}" should be async',
      missingAwait: 'Promise-returning call should be awaited in async task handler',
      missingErrorHandling: 'Task handler should include proper error handling'
    }
  },
  defaultOptions: [],
  create(context: any) {
    const taskHandlerMethods = ['_executeSpecialist', 'execute', 'processTask'];
    
    return {
      MethodDefinition(node: any) {
        if (!node.key?.name || !taskHandlerMethods.includes(node.key.name)) {
          return;
        }

        const method = node.value;
        
        // Check if method is async
        if (!method.async) {
          context.report({
            node: node.key,
            messageId: 'taskHandlerNotAsync',
            data: {
              methodName: node.key.name
            },
            fix(fixer: any) {
              return fixer.insertTextBefore(method, 'async ');
            }
          });
        }

        // Check for error handling
        const hasErrorHandling = hasProperErrorHandling(method.body);
        if (!hasErrorHandling) {
          context.report({
            node: node.key,
            messageId: 'missingErrorHandling'
          });
        }
      },

      CallExpression(node: any) {
        // Check for unawait Promise calls in task handlers
        const parent = findTaskHandlerParent(node);
        if (!parent) return;

        if (isPromiseReturningCall(node) && !isAwaited(node)) {
          context.report({
            node,
            messageId: 'missingAwait',
            fix(fixer: any) {
              return fixer.insertTextBefore(node, 'await ');
            }
          });
        }
      }
    };

    function findTaskHandlerParent(node: any): any {
      let current = node.parent;
      while (current) {
        if (current.type === 'MethodDefinition' && 
            current.key?.name && 
            taskHandlerMethods.includes(current.key.name)) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    function isPromiseReturningCall(node: any): boolean {
      // Common async patterns
      const asyncMethods = [
        'fetch', 'readFile', 'writeFile', 'query', 'exec',
        'processTask', 'simulateWork', 'analyze', 'scan'
      ];

      if (node.callee?.name && asyncMethods.includes(node.callee.name)) {
        return true;
      }

      if (node.callee?.property?.name && asyncMethods.includes(node.callee.property.name)) {
        return true;
      }

      return false;
    }

    function isAwaited(node: any): boolean {
      const parent = node.parent;
      return parent?.type === 'AwaitExpression' && parent.argument === node;
    }

    function hasProperErrorHandling(body: any): boolean {
      if (!body || body.type !== 'BlockStatement') return false;

      // Look for try-catch blocks
      const hasTryCatch = body.body.some((stmt: any) => stmt.type === 'TryStatement');
      
      // Look for error handling in the method
      const hasErrorCheck = body.body.some((stmt: any) => 
        JSON.stringify(stmt).includes('error') || 
        JSON.stringify(stmt).includes('catch') ||
        JSON.stringify(stmt).includes('throw')
      );

      return hasTryCatch || hasErrorCheck;
    }
  }
});
