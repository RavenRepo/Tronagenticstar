# AgentForge Overview

AgentForge (aka Café Star / CAFS) is an **enterprise-grade multi-agent framework** that empowers a *Chief Architect* orchestrator to route tasks to a constellation of specialist, guardian, processing, and interface agents.  
It couples **LangGraph**-driven orchestration (Python) with a **TypeScript SDK/UI** and bakes in ErrorGold error handling, SOC-2 compliance tooling, and a Retrieval-Augmented Generation layer backed by a hybrid datastore (Qdrant + Neo4j + Redis).

## Vision
1. **Language-agnostic** – core concepts implementable in any runtime.
2. **Governed & Observable** – every agent action is traceable (OTEL), auditable, and subject to quality gates.
3. **Secure by Default** – encrypted messaging, JWT auth, compliance checker agents.
4. **Self-evolving** – adaptive learning loops upgrade prompts & models based on performance metrics.

## Scope
✔ Orchestration engine, agent SDKs, error handling, quality gates, security layer, datastore adapters, docs & CI scaffolding.  
✖ Building domain-specific agents (left to downstream teams).

## Non-Goals
* Compete with full AutoGPT-style autonomy.  
* Provide generic UI dashboard (only reference Grafana dashboards).

## Key Components
| Component | Runtime | Description |
|-----------|---------|-------------|
| `agentforge_core` | Python | Abstract classes, message formats, load-balancer, error handling, health monitoring. |
| `agentforge_sdk` | TypeScript | Front-end bindings, manifest schema, agent registry client. |
| `retriever_service` | Python | Unified RAG interface to Qdrant / Neo4j / Redis. |
| `errorgold` | Polyglot | Language-agnostic ErrorGold SDK stubs. |
| `devops/` | YAML | Docker-Compose, Helm charts, GitHub Actions. |

## Current Status
* 2024-06-17: Documentation split initiated (this file).  
* Next sprint: scaffold `agentforge_core` + RAG adapters.

---
*Maintainer*: **Chief Architect** (<mailto:architecture@venvagents.io>) 