import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name: string) => `https://agentforge.dev/eslint-rules/${name}`
);

export const agentTestCoverage = createRule({
  name: 'agent-test-coverage',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Ensure agents have corresponding test files and proper test coverage',
      recommended: 'warn'
    },
    fixable: false,
    schema: [],
    messages: {
      missingTestFile: 'Agent "{{agentName}}" is missing a corresponding test file',
      missingTestCases: 'Agent test file should include tests for core methods: {{methods}}',
      insufficientTestCoverage: 'Agent should have tests for error scenarios and edge cases'
    }
  },
  defaultOptions: [],
  create(context: any) {
    const filename = context.getFilename();
    
    // Only check agent files, not test files
    if (filename.includes('.test.') || filename.includes('.spec.')) {
      return {};
    }

    let agentClassName: string | null = null;
    const agentMethods: string[] = [];

    return {
      ClassDeclaration(node: any) {
        if (node.superClass && 
            node.superClass.type === 'Identifier' && 
            (node.superClass.name === 'SpecialistAgent' || node.superClass.name === 'BaseAgent')) {
          
          agentClassName = node.id?.name;
          
          // Collect method names
          node.body.body.forEach((member: any) => {
            if (member.type === 'MethodDefinition' && 
                member.key?.name && 
                !member.key.name.startsWith('_') && 
                member.key.name !== 'constructor') {
              agentMethods.push(member.key.name);
            }
          });
        }
      },

      'Program:exit'() {
        if (!agentClassName) return;

        // Check if test file exists
        const testFile = getTestFilePath(filename);
        const fs = require('fs');
        
        if (!fs.existsSync(testFile)) {
          context.report({
            node: context.getSourceCode().ast,
            messageId: 'missingTestFile',
            data: {
              agentName: agentClassName
            }
          });
          return;
        }

        // Read test file and check coverage
        try {
          const testContent = fs.readFileSync(testFile, 'utf-8');
          checkTestCoverage(testContent, agentClassName, agentMethods);
        } catch (error) {
          // Test file exists but can't be read
        }
      }
    };

    function getTestFilePath(agentFile: string): string {
      const dir = agentFile.substring(0, agentFile.lastIndexOf('/'));
      const baseName = agentFile.substring(agentFile.lastIndexOf('/') + 1);
      const nameWithoutExt = baseName.replace(/\.(ts|js)$/, '');
      
      return `${dir}/${nameWithoutExt}.test.ts`;
    }

    function checkTestCoverage(testContent: string, agentName: string, methods: string[]): void {
      const coreMethodsToTest = ['execute', '_executeSpecialist', ...methods];
      const missingTests: string[] = [];

      coreMethodsToTest.forEach(method => {
        if (!testContent.includes(method) && !testContent.includes(`'${method}'`) && !testContent.includes(`"${method}"`)) {
          missingTests.push(method);
        }
      });

      if (missingTests.length > 0) {
        context.report({
          node: context.getSourceCode().ast,
          messageId: 'missingTestCases',
          data: {
            methods: missingTests.join(', ')
          }
        });
      }

      // Check for error scenario tests
      const hasErrorTests = testContent.includes('error') || 
                           testContent.includes('throw') || 
                           testContent.includes('reject') ||
                           testContent.includes('fail');

      if (!hasErrorTests) {
        context.report({
          node: context.getSourceCode().ast,
          messageId: 'insufficientTestCoverage'
        });
      }
    }
  }
});
