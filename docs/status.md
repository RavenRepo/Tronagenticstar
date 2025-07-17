# Project Status – CAFS / AgenticStar

_Last updated: 2025-07-16_

## Current Phase
Sprint C – Embedding Optimisation & Hybrid Retrieval (Kick-off)

## Locked Roadmap
| Phase | Timeline | Deliverables | Status |
|-------|----------|--------------|--------|
| Foundation | Month 0-1 | Python Orchestrator service, Event-Bus, SDKs, Docker Compose stack | ✅ Complete |
| Error & RAG Core | Month 1-2 | ErrorGold MVP, Retriever Service, GPU Embedding, Prom/Grafana dashboards | ✅ Complete |
| Specialist Agents v1 | Month 2-3 | DesignForge, SecuriShield, CodeCraft, PerfPulse | ⏳ Pending |
| Compliance Alpha | Month 3-4 | SOC-2 rule sets, evidence exporter, dashboards | ⏳ Pending |
| Dev-Tooling Beta | Month 4-5 | CLI scaffolder, ESLint plugin, VS-Code extension | ⏳ Pending |
| Private Beta | Month 5-6 | Helm install, docs site GA, pilot onboarding | ⏳ Pending |
| GA Hardening | Month 6-9 | Additional agents, chaos tests, cost governor | ⏳ Pending |

## Sprint A – Task Board (Foundation)
| ID | Task | Owner | Due | State |
|----|------|-------|-----|-------|
| A1 | Scaffold services/orchestrator-py (FastAPI + LangGraph) | AI/Dev | Week 1 | ✅ Done |
| A2 | Create docker-compose.dev.yml with core services | DevOps | Week 1 | ✅ Done |
| A3 | Implement ErrorGold Node SDK + unit tests | SecuriShield team | Week 1 | ✅ Done |

## Sprint B – Task Board (Error & RAG Core)
| ID | Task | Owner | Due | State |
|----|------|-------|-----|-------|
| B1 | GPU Embedding micro-service with Prom metrics | AI/Dev | Week 2 | ✅ Done |
| B2 | Relationship graph indexing & /related endpoint | AI/Dev | Week 2 | ✅ Done |
| B3 | SDK helpers + Vitest / Pytest suites | SDK | Week 2 | ✅ Done |
| B4 | Grafana dashboards for Retriever/Embedding/Neo4j | DevOps | Week 2 | ✅ Done |
| B5 | Docker stack rebuild & validation | DevOps | Week 2 | ✅ Done |

## Sprint C – Task Board (Embedding Optimisation & Hybrid Reranker)
| ID | Task | Owner | Due | State |
|----|------|-------|-----|-------|
| C1 | `/embed/batch` endpoint with asyncio gather | AI/Dev | Week 1 | 🔜 |
| C2 | Lightweight reranker integration (ms-marco-MiniLM) | AI/Dev | Week 1 | 🔜 |
| C3 | SDK updates for batch + reranker | SDK | Week 1 | 🔜 |
| C4 | Grafana panels for batch throughput & P@k | DevOps | Week 1 | 🔜 |

## KPIs (Running)
* P95 Retriever Latency < 400 ms
* Embedding Batch Throughput target > 250 qps
* ErrorGold auto-remediation ≥ 35 %
* SOC-2 violations < 0.5 %

Progress is reviewed every Friday and auto-synced via GitHub Action `doc-sync` (see `.github/workflows/doc-sync.yml`). 