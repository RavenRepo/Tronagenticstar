# venvagents / ai-agentic-kit

> A disciplined, SOC-2–ready multi-agent framework that installs a private "AI engineering squad" into any codebase.

---

## ✨ What Is This?

* **ChiefArchitect Orchestrator** – a LangGraph-powered runtime that plans, routes, and monitors tasks across specialist agents.
* **Specialist Agents** – Architecture, Security, Quality & Performance (with room for ExpressOps, MobileFirstOps, etc.).
* **Compliance First** – built-in SOC-2 validator & policy enforcer on every agent output.
* **Polyglot Runtime** – Python (LangGraph) core with generated TypeScript SDKs for web tooling.
* **Memory-Anchored with RAG** – hybrid datastore (Qdrant + Neo4j + Redis JSON) plus Retriever Service for context-aware LLM prompts, and Build-Bank markdown docs.

---

## 📂 Monorepo Layout

```text
venvagents/              # Next.js marketing site & VS-Code extension
packages/
  orchestrator/          # TypeScript typings + thin JS client (you are here)
services/
  orchestrator-py/       # Python 3.11 FastAPI service running LangGraph DAG (TBD)
docs/
  adr/                   # Architecture Decision Records (001-008…)
  build-bank/            # Chief-Architect markdown knowledge base
```

---

## 🚀 Quick Start (Local Dev)

### 1. Clone & install root deps
```bash
git clone <repo>
cd vavcafsagent
npm install            # installs marketing site + ts packages
```

### 2. Build TypeScript Orchestrator Stubs
```bash
cd packages/orchestrator
npm install           # eventemitter3, typescript
npm run build         # outputs dist/
```

### 3. Run Python Orchestrator (stub)
```bash
cd services/orchestrator-py
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # fastapi, langgraph, uvicorn
uvicorn main:app --reload         # API on http://localhost:8000
```

### 4. Launch Marketing Site
```bash
cd ../../venvagents
npm run dev           # http://localhost:3000
```

---

## 🏗️ Architecture Overview

```mermaid
flowchart TD
    subgraph Entry
        ST[SystemTrigger]\nCLI / VS Code / API
    end
    ST --> CA[ChiefArchitect (LangGraph)]
    CA --> FR[FrameworkRouter]
    FR -->|task| A1[ArchitectureAgent]
    FR -->|task| A2[SecurityAgent]
    FR -->|task| A3[QualityAgent]
    FR -->|task| A4[PerformanceAgent]
    A1 & A2 & A3 & A4 --> MB[MemoryBankUpdater]
    MB --> QD[Qdrant]
    MB --> NJ[Neo4j]
    CA -->|metrics| OT[Prometheus]
    CA -->|logs| LK[Loki]
```

---

## 📝 ADR Snapshot
| ID | Title |
|----|----------------------------|
| 001 | Framework Selection – LangGraph Primary |
| 002 | Multi-Model Strategy via LiteLLM |
| 003 | Hybrid Datastore Architecture |
| 004 | Chief-Architect Build-Bank |
| 005 | Agent Load-Balancer |
| 006 | SOC-2 Compliance Layer |
| 007 | Manifest & Code Tag Convention |
| 008 | Observability Stack |

Full files under `docs/adr/`.

---

## 🔐 Security & Compliance
* **Validator** – `packages/compliance/` (WIP) checks input validation, auth, encryption, logging.
* **Policy Enforcer** – LangGraph node blocks merges if Trust Service Criteria violated.
* **Evidence Export** – Prometheus + Loki + audit logs zipped for auditors.

---

## 🛠️ Development Commands
| Location | Command | Purpose |
|----------|---------|---------|
| `packages/orchestrator` | `npm run build` | Compile TS client |
| `services/orchestrator-py` | `make dev` (future) | Run FastAPI with hot-reload |
| root | `docker compose up` (future) | Bring entire stack (Prom + Loki + Neo4j + Qdrant) |

---

## 🤝 Contributing
1. Read ADRs first; propose new architecture via PR with new ADR draft.
2. Follow manifest & `@role` tag convention in all code.
3. Ensure `npm run lint` and `pytest` pass.
4. All new agents must register in `docs/build-bank/noAgentDupes.md`.

---

## 📄 License
MIT for open-source parts; enterprise license required for compliance modules. 