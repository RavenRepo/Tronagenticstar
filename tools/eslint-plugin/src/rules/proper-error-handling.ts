import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name: string) => `https://agentforge.dev/eslint-rules/${name}`
);

export const properErrorHandling = createRule({
  name: 'proper-error-handling',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce proper error handling patterns in AgentForge agents',
      recommended: 'warn'
    },
    fixable: 'code',
    schema: [],
    messages: {
      emptyErrorHandler: 'Empty catch block. Add proper error handling or logging.',
      genericErrorCatch: 'Avoid catching generic Error. Catch specific error types when possible.',
      missingErrorLogging: 'Error should be logged for debugging purposes.',
      shouldRethrowError: 'Consider rethrowing error after logging for upstream handling.'
    }
  },
  defaultOptions: [],
  create(context: any) {
    return {
      CatchClause(node: any) {
        const { body } = node;
        
        // Check for empty catch blocks
        if (body.body.length === 0) {
          context.report({
            node,
            messageId: 'emptyErrorHandler',
            fix(fixer: any) {
              const errorName = node.param?.name || 'error';
              const errorHandling = `\n  console.error('Error in agent execution:', ${errorName});\n  throw ${errorName};\n`;
              return fixer.replaceText(body, `{${errorHandling}}`);
            }
          });
          return;
        }

        // Check for generic error catching
        if (node.param?.typeAnnotation?.typeAnnotation?.typeName?.name === 'Error') {
          context.report({
            node: node.param,
            messageId: 'genericErrorCatch'
          });
        }

        // Check for error logging
        const hasLogging = hasErrorLogging(body);
        if (!hasLogging) {
          context.report({
            node,
            messageId: 'missingErrorLogging'
          });
        }

        // Check for error rethrowing
        const hasRethrow = hasErrorRethrow(body);
        if (!hasRethrow && isInAgentMethod(node)) {
          context.report({
            node,
            messageId: 'shouldRethrowError'
          });
        }
      },

      ThrowStatement(node: any) {
        // Validate that thrown errors are meaningful
        if (node.argument?.type === 'NewExpression' && 
            node.argument.callee?.name === 'Error' && 
            node.argument.arguments?.length > 0) {
          
          const message = node.argument.arguments[0];
          if (message?.type === 'Literal' && typeof message.value === 'string') {
            // Check if error message is descriptive
            if (message.value.length < 10 || message.value === 'Error') {
              context.report({
                node: message,
                message: 'Error message should be descriptive and helpful for debugging'
              });
            }
          }
        }
      }
    };

    function hasErrorLogging(body: any): boolean {
      return body.body.some((stmt: any) => {
        const stmtText = context.getSourceCode().getText(stmt);
        return stmtText.includes('console.error') || 
               stmtText.includes('logger.error') || 
               stmtText.includes('log.error') ||
               stmtText.includes('.error(');
      });
    }

    function hasErrorRethrow(body: any): boolean {
      return body.body.some((stmt: any) => stmt.type === 'ThrowStatement');
    }

    function isInAgentMethod(node: any): boolean {
      let current = node.parent;
      while (current) {
        if (current.type === 'MethodDefinition') {
          const methodName = current.key?.name;
          const agentMethods = ['_executeSpecialist', 'execute', 'processTask'];
          return agentMethods.includes(methodName);
        }
        current = current.parent;
      }
      return false;
    }
  }
});
