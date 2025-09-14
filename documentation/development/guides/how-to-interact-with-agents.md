# Interacting with AgentForge / CAFS Agents

*Last updated: 2025-06-14*

This guide explains **why** we use Python in an otherwise TypeScript-heavy repository, **where** that code lives, and step-by-step instructions for running the stack and talking to the agents.

---
## 1. Why Python?

| Area | Reason for Python | Key Library |
|------|------------------|-------------|
| Chief Orchestrator | LangGraph offers async DAG orchestration only in Python | `langgraph`, `fastapi` |
| Retriever Service (RAG) | Rich SDKs for Qdrant & Neo4j, rapid prototyping | `qdrant-client`, `neo4j`, `fastapi` |
| Data-heavy Specialist Agents | Pandas/Polars ecosystem | `pandas`, `polars` |

Everything customer-facing (SDK, Web UI) remains **TypeScript** so web developers feel at home.

---
## 2. Repository Map (post-Sprint A)
```
repo-root/
├── services/
│   ├── orchestrator-py/    # FastAPI + LangGraph (Chief Architect)
│   └── retriever/          # FastAPI + Qdrant/Neo4j adapters
├── packages/
│   └── orchestrator/       # TypeScript SDK & sample agents
├── docker-compose.dev.yml  # Spins up all containers for local dev
└── website/                # Next.js playground & dashboards (later sprints)
```

---
## 3. Running the Full Stack Locally

```bash
# 0. prerequisites: Docker Desktop + Python 3.11 + pnpm

# 1. start everything (once docker-compose.dev.yml exists)
$ docker compose -f docker-compose.dev.yml up --build

# 2. view services
#   FastAPI Orchestrator:   http://localhost:8000/docs
#   Retriever Service:      http://localhost:8001/docs
#   Grafana Dashboards:     http://localhost:3000
```

---
## 4. Sending Your First Task

### Option A – cURL
```bash
curl -X POST http://localhost:8000/tasks \
     -H "Content-Type: application/json" \
     -d '{
           "task_type": "QUALITY",
           "parameters": { "message": "hello" },
           "priority": 5
         }'
```
Returns JSON with the agent’s response.

### Option B – TypeScript SDK
```ts
import { OrchestratorClient } from "@agenticstar/sdk";

const orch = new OrchestratorClient("http://localhost:8000");
const result = await orch.submitTask({
  type: "QUALITY",
  parameters: { message: "hello" },
});
console.log(result);
```

---
## 5. Where Do the Answers Appear?

1. **Terminal / HTTP response** – immediate JSON payload.
2. **Web Playground** (`website/playground`) – renders markdown or streamed text.
3. **Grafana** – metrics counters (`task_completed_total`) confirm success.

---
## 6. Sprint A Deliverables Checklist

| ID | Deliverable | Status |
|----|-------------|--------|
| A1 | `services/orchestrator-py` scaffold (FastAPI + LangGraph) | ⬜ pending |
| A2 | `docker-compose.dev.yml` with Orchestrator, NATS, Qdrant, Neo4j, Prom/ Grafana/ Loki | ⬜ pending |
| A3 | ErrorGold Node SDK prototype with unit tests | ⬜ pending |

> Update this table in `docs/activeFocus.md` as tasks complete.

---
## 7. Future Sprints

* **Sprint B** – ErrorGold streaming integration.
* **Sprint C** – Retriever (RAG) service implementation.
* **Sprint D** – Specialist agents & auto-scaling.

---
*Maintainer*: Chief Architect (<architecture@venvagents.io>) 