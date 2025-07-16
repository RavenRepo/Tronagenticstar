# ADR-007: Manifest & Code Tag Convention (`project.manifest.json` + `@role` Annotations)

Status: Proposed  
Date: 2025-06-14

## Context
`Docs2/sample1.md` proposes a root-level manifest file and machine-readable comment tags to give agents structural awareness and prevent incorrect auth logic or path drift.

## Decision
1. **Manifest File**: `project.manifest.json` in repo root with at least:
```json
{
  "frontendRoot": "app/",
  "backendRoot": "api/",
  "sharedLibs": ["lib", "hooks"],
  "auth": {
    "strategy": "authjs",
    "publicGuardedRoutes": ["/dashboard", "/account"]
  }
}
```
2. **Comment Tags**: supported directives
```
// @role: public-page | server-util | api-handler | shared-lib
// @auth: none | user | admin
// @data: static | dynamic | secret
```
3. ESLint plugin `eslint-plugin-agentic-tags` validates presence & correctness; CI fails if missing.  
4. Agents must read manifest & tags before suggesting code edits; mutation proposals without tag context are rejected by ChiefArchitect.

## Consequences
• Enforces discipline; slight overhead adding tags to files.  
• Enables future autogen CLI to scaffold tagged files.  
• Facilitates SOC-2 mapping (e.g., @data:secret triggers encryption helper).

## Alternatives Considered
• YML manifest only – loses per-file granularity.  
• Rely on folder naming – brittle in monorepos. 