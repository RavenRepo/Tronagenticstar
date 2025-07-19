import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  name => `https://agentforge.dev/eslint-rules/${name}`
);

export const agentNamingConvention = createRule({
  name: 'agent-naming-convention',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce proper naming conventions for AgentForge agents',
      recommended: 'error'
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          suffix: {
            type: 'string',
            default: 'Agent'
          },
          pascalCase: {
            type: 'boolean',
            default: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      invalidAgentName: 'Agent class name "{{name}}" should end with "{{suffix}}" and be in PascalCase',
      invalidFileName: 'Agent file name "{{fileName}}" should match the pattern "{{pattern}}"'
    }
  },
  defaultOptions: [{ suffix: 'Agent', pascalCase: true }],
  create(context, [options]) {
    const { suffix, pascalCase } = options;

    function isPascalCase(name: string): boolean {
      return /^[A-Z][a-zA-Z0-9]*$/.test(name);
    }

    function isValidAgentName(name: string): boolean {
      return name.endsWith(suffix) && (!pascalCase || isPascalCase(name));
    }

    return {
      ClassDeclaration(node) {
        if (!node.id?.name) return;

        const className = node.id.name;
        
        // Check if this is an agent class (extends SpecialistAgent or BaseAgent)
        if (node.superClass && 
            node.superClass.type === 'Identifier' && 
            (node.superClass.name === 'SpecialistAgent' || node.superClass.name === 'BaseAgent')) {
          
          if (!isValidAgentName(className)) {
            context.report({
              node: node.id,
              messageId: 'invalidAgentName',
              data: {
                name: className,
                suffix
              },
              fix(fixer) {
                if (!className.endsWith(suffix)) {
                  const newName = className + suffix;
                  return fixer.replaceText(node.id!, newName);
                }
                return null;
              }
            });
          }
        }
      },

      Program(node) {
        const fileName = context.getFilename();
        const baseName = fileName.split('/').pop()?.replace('.ts', '').replace('.js', '');
        
        if (baseName && fileName.includes('/agents/')) {
          const expectedPattern = `${baseName}${suffix}`;
          
          // Find the main class in the file
          const classes = node.body.filter(
            (n): n is any => n.type === 'ClassDeclaration' && n.id?.name.endsWith(suffix)
          );
          
          if (classes.length > 0) {
            const mainClass = classes[0];
            const expectedFileName = mainClass.id.name.replace(suffix, '');
            
            if (baseName !== expectedFileName && baseName !== mainClass.id.name) {
              context.report({
                node: mainClass.id,
                messageId: 'invalidFileName',
                data: {
                  fileName: baseName,
                  pattern: `${expectedFileName}.ts or ${mainClass.id.name}.ts`
                }
              });
            }
          }
        }
      }
    };
  }
});
