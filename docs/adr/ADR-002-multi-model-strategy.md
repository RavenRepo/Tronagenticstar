# ADR-002: Multi-Model LLM Strategy via LiteLLM Router

Status: Proposed  
Date: 2025-06-14

## Context
The system must balance high-quality reasoning with cost efficiency. Docs2/techstack1.md recommends Claude Sonnet 4 for senior-level tasks, GPT-4o for complex generation, and Claude Haiku / GPT-3.5 for routine work. A dynamic router can pick the optimal model per task.

## Decision
Use **LiteLLM** (or equivalent) as a unified API façade. Register three model tiers:

| Tier | Default Model | Use-case |
|---|---|---|
| senior | `claude-sonnet-4` | architecture reviews, strategy planning |
| complex | `gpt-4o` | code generation, cross-module refactors |
| routine | `claude-haiku` (alt `gpt-3.5-turbo`) | formatting, docs, small fixes |

Router policy: select by `(agent_type, task_complexity)` function captured from techstack1.

## Consequences
1. Requires Anthropic & OpenAI API keys at deploy time.  
2. Adds ~25-40 ms router overhead but saves cost on routine tasks.  
3. Allows new models to be swapped with minimal code changes.

## Alternatives Considered
*Single best model (GPT-4o only)* – simpler but 3–6× cost.  
*Custom gRPC router* – more control but re-inventing LiteLLM features. 