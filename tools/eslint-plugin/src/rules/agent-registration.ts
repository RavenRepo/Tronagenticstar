import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name: string) => `https://agentforge.dev/eslint-rules/${name}`
);

export const agentRegistration = createRule({
  name: 'agent-registration',
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure agents are properly registered with the orchestrator',
      recommended: 'error'
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingRegistration: 'Agent "{{agentName}}" is not registered. Add registerSpecialist() call.',
      invalidRegistration: 'Invalid agent registration. Use registerSpecialist(KIND, AgentClass).'
    }
  },
  defaultOptions: [],
  create(context: any) {
    let agentClass: string | null = null;
    let hasRegistration = false;
    let kindProperty: string | null = null;

    return {
      ClassDeclaration(node: any) {
        if (node.superClass && 
            node.superClass.type === 'Identifier' && 
            (node.superClass.name === 'SpecialistAgent' || node.superClass.name === 'BaseAgent')) {
          agentClass = node.id?.name;
          
          // Look for static KIND property
          const kindProp = node.body.body.find((member: any) => 
            member.type === 'PropertyDefinition' &&
            member.key?.name === 'KIND' &&
            member.static === true
          );
          
          if (kindProp && kindProp.value?.type === 'Literal') {
            kindProperty = kindProp.value.value;
          }
        }
      },

      CallExpression(node: any) {
        if (node.callee?.name === 'registerSpecialist') {
          hasRegistration = true;
          
          // Validate registration call
          if (node.arguments.length !== 2) {
            context.report({
              node,
              messageId: 'invalidRegistration'
            });
            return;
          }

          const [kindArg, classArg] = node.arguments;
          
          // Check if KIND matches the static property
          if (kindProperty && kindArg.type === 'MemberExpression') {
            const expectedKind = `${agentClass}.KIND`;
            const actualKind = context.getSourceCode().getText(kindArg);
            
            if (actualKind !== expectedKind) {
              context.report({
                node: kindArg,
                messageId: 'invalidRegistration'
              });
            }
          }
          
          // Check if class name matches
          if (classArg.type === 'Identifier' && classArg.name !== agentClass) {
            context.report({
              node: classArg,
              messageId: 'invalidRegistration'
            });
          }
        }
      },

      'Program:exit'() {
        if (agentClass && !hasRegistration) {
          context.report({
            node: context.getSourceCode().ast,
            messageId: 'missingRegistration',
            data: {
              agentName: agentClass
            },
            fix(fixer: any) {
              const sourceCode = context.getSourceCode();
              const lastStatement = sourceCode.ast.body[sourceCode.ast.body.length - 1];
              
              const registrationCode = `\n\n// Register the agent with the orchestrator\nregisterSpecialist(${agentClass}.KIND, ${agentClass});`;
              
              return fixer.insertTextAfter(lastStatement, registrationCode);
            }
          });
        }
      }
    };
  }
});
