# @agentforge/eslint-plugin

ESLint plugin for AgentForge development that enforces best practices, coding standards, and patterns specific to agent development.

## Installation

```bash
npm install --save-dev @agentforge/eslint-plugin
```

## Usage

Add to your ESLint configuration:

### `.eslintrc.js`

```javascript
module.exports = {
  plugins: ['@agentforge'],
  extends: ['plugin:@agentforge/recommended'],
  rules: {
    // Override specific rules if needed
    '@agentforge/agent-naming-convention': 'error',
    '@agentforge/agent-registration': 'error'
  }
};
```

### `.eslintrc.json`

```json
{
  "plugins": ["@agentforge"],
  "extends": ["plugin:@agentforge/recommended"],
  "rules": {
    "@agentforge/agent-naming-convention": "error",
    "@agentforge/agent-registration": "error"
  }
}
```

## Configurations

### `recommended` (Default)

Enables all rules with recommended severity levels:

```json
{
  "extends": ["plugin:@agentforge/recommended"]
}
```

### `strict`

Enables all rules with strict error levels:

```json
{
  "extends": ["plugin:@agentforge/strict"]
}
```

## Rules

### `@agentforge/agent-naming-convention`

**Type**: `suggestion`  
**Fixable**: `code`  
**Recommended**: `error`

Enforces proper naming conventions for AgentForge agents.

#### Options

```json
{
  "@agentforge/agent-naming-convention": ["error", {
    "suffix": "Agent",
    "pascalCase": true
  }]
}
```

#### Examples

❌ **Incorrect**:
```typescript
class security extends SpecialistAgent { }
class securityagent extends SpecialistAgent { }
class Security_Agent extends SpecialistAgent { }
```

✅ **Correct**:
```typescript
class SecurityAgent extends SpecialistAgent { }
class QualityAgent extends SpecialistAgent { }
class ArchitectureAgent extends SpecialistAgent { }
```

### `@agentforge/agent-registration`

**Type**: `problem`  
**Fixable**: `code`  
**Recommended**: `error`

Ensures agents are properly registered with the orchestrator.

#### Examples

❌ **Incorrect**:
```typescript
export class SecurityAgent extends SpecialistAgent {
  static KIND = "security";
  // Missing registration
}
```

✅ **Correct**:
```typescript
export class SecurityAgent extends SpecialistAgent {
  static KIND = "security";
}

registerSpecialist(SecurityAgent.KIND, SecurityAgent);
```

### `@agentforge/task-handler-async`

**Type**: `problem`  
**Fixable**: `code`  
**Recommended**: `error`

Ensures task handler methods are async and properly handle promises.

#### Examples

❌ **Incorrect**:
```typescript
class SecurityAgent extends SpecialistAgent {
  _executeSpecialist(task: Task) { // Missing async
    this.processTask(task); // Missing await
    return result;
  }
}
```

✅ **Correct**:
```typescript
class SecurityAgent extends SpecialistAgent {
  async _executeSpecialist(task: Task) {
    try {
      const result = await this.processTask(task);
      return result;
    } catch (error) {
      this.logger.error('Task execution failed', error);
      throw error;
    }
  }
}
```

### `@agentforge/proper-error-handling`

**Type**: `suggestion`  
**Fixable**: `code`  
**Recommended**: `warn`

Enforces proper error handling patterns in AgentForge agents.

#### Examples

❌ **Incorrect**:
```typescript
try {
  await this.processTask(task);
} catch (error) {
  // Empty catch block
}

try {
  await this.processTask(task);
} catch (error) {
  // No logging or rethrowing
  return null;
}
```

✅ **Correct**:
```typescript
try {
  await this.processTask(task);
} catch (error) {
  this.logger.error('Task processing failed', { error, taskId: task.id });
  throw error;
}
```

### `@agentforge/agent-test-coverage`

**Type**: `suggestion`  
**Fixable**: `false`  
**Recommended**: `warn`

Ensures agents have corresponding test files and proper test coverage.

#### Checks

- ✅ Test file exists for each agent
- ✅ Core methods are tested
- ✅ Error scenarios are covered
- ✅ Edge cases are included

#### Examples

For `SecurityAgent.ts`, expects `SecurityAgent.test.ts`:

```typescript
// SecurityAgent.test.ts
import { describe, it, expect } from 'vitest';
import { SecurityAgent } from './SecurityAgent.js';

describe('SecurityAgent', () => {
  it('should execute security analysis', async () => {
    // Test implementation
  });

  it('should handle errors gracefully', async () => {
    // Error scenario test
  });
});
```

## Configuration Options

### Global Configuration

Create `.agentforge-eslint.json` in your project root:

```json
{
  "agentDirectory": "./src/agents",
  "testDirectory": "./test",
  "namingConvention": {
    "suffix": "Agent",
    "pascalCase": true
  },
  "errorHandling": {
    "requireLogging": true,
    "requireRethrowing": true
  }
}
```

### Per-File Configuration

Use ESLint comments to configure rules per file:

```typescript
/* eslint @agentforge/agent-naming-convention: ["error", { "suffix": "Service" }] */

class SecurityService extends SpecialistAgent {
  // This will use "Service" suffix instead of "Agent"
}
```

## Integration with AgentForge CLI

The ESLint plugin works seamlessly with the AgentForge CLI:

```bash
# Generate agent with proper linting
agentforge agent security-scanner --type specialist

# Validate with ESLint rules
agentforge validate --fix

# Auto-fix ESLint issues
npm run lint:fix
```

## TypeScript Support

The plugin fully supports TypeScript and provides type-aware linting:

```typescript
interface AgentConfig {
  id: string;
  specialization: TaskType;
}

class SecurityAgent extends SpecialistAgent {
  constructor(config: AgentConfig) { // Type checking
    super(config);
  }
}
```

## Custom Rules

You can disable or customize rules as needed:

```json
{
  "rules": {
    "@agentforge/agent-naming-convention": "off",
    "@agentforge/agent-registration": ["error", {
      "requireKindProperty": true
    }],
    "@agentforge/proper-error-handling": ["warn", {
      "allowEmptyCatch": false,
      "requireLogging": true
    }]
  }
}
```

## VS Code Integration

For optimal developer experience, install the ESLint VS Code extension:

1. Install "ESLint" extension
2. Configure in VS Code settings:

```json
{
  "eslint.validate": ["typescript", "javascript"],
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Migration Guide

### From Standard ESLint Rules

If you're migrating from standard ESLint rules:

1. Install the plugin: `npm install --save-dev @agentforge/eslint-plugin`
2. Add to extends: `"plugin:@agentforge/recommended"`
3. Run: `npm run lint:fix` to auto-fix issues
4. Review and adjust rule configurations

### Gradual Adoption

Start with warnings and gradually increase to errors:

```json
{
  "rules": {
    "@agentforge/agent-naming-convention": "warn",
    "@agentforge/agent-registration": "warn",
    "@agentforge/task-handler-async": "error"
  }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new rules
4. Update documentation
5. Submit a pull request

### Rule Development

To create a new rule:

1. Add rule file in `src/rules/`
2. Export from `src/index.ts`
3. Add tests in `test/rules/`
4. Update documentation

```typescript
// src/rules/my-new-rule.ts
import { ESLintUtils } from '@typescript-eslint/utils';

export const myNewRule = ESLintUtils.RuleCreator(
  name => `https://agentforge.dev/eslint-rules/${name}`
)({
  name: 'my-new-rule',
  meta: {
    // Rule definition
  },
  create(context) {
    // Rule implementation
  }
});
```

## License

MIT License - see LICENSE file for details

## Support

- [GitHub Issues](https://github.com/agentforge/eslint-plugin/issues)
- [Documentation](https://agentforge.dev/docs/eslint-plugin)
- [Discord Community](https://discord.gg/agentforge)
