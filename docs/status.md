# Project Status – CAFS / AgenticStar

_Last updated: 2025-07-20_

## Current Phase
Sprint E4 – Next Specialist Agent (PerfPulse Phase) - ✅ COMPLETED

## Locked Roadmap
| Phase | Timeline | Deliverables | Status |
|-------|----------|--------------|--------|
| Foundation | Month 0-1 | Python Orchestrator service, Event-Bus, SDKs, Docker Compose stack | ✅ Complete |
| Error & RAG Core | Month 1-2 | ErrorGold MVP, Retriever Service, GPU Embedding, Prom/Grafana dashboards | ✅ Complete |
| Specialist Agents v1 | Month 2-3 | DesignForge, SecuriShield, CodeCraft, PerfPulse | 🔄 In Progress |
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

## Sprint E2 – Task Board (SecuriShield Micro-service) - ✅ COMPLETED
| ID | Task | Owner | Due | State |
|----|------|-------|-----|-------|
| E2.1 | Scaffold SecuriShield micro-service (FastAPI) | AI/Dev | Day 2 | ✅ Done |
| E2.2 | Create /scan, /health, /metrics endpoints | AI/Dev | Day 2 | ✅ Done |
| E2.3 | Add SecuriShield Dockerfile & requirements.txt | DevOps | Day 2 | ✅ Done |
| E2.4 | Update docker-compose.dev.yml | DevOps | Day 2 | ✅ Done |
| E2.5 | Port assignment (8011) and service integration | DevOps | Day 2 | ✅ Done |

## Sprint E3 – Task Board (CodeCraft Micro-service) - ✅ COMPLETED
| ID | Task | Owner | Due | State |
|----|------|-------|-----|-------|
| E3.1 | Scaffold CodeCraft micro-service (FastAPI) | AI/Dev | Day 3 | ✅ Done |
| E3.2 | Create /generate, /refactor, /health, /metrics endpoints | AI/Dev | Day 3 | ✅ Done |
| E3.3 | Add CodeCraft Dockerfile & requirements.txt | DevOps | Day 3 | ✅ Done |
| E3.4 | Update docker-compose.dev.yml for CodeCraft | DevOps | Day 3 | ✅ Done |
| E3.5 | Port assignment (8012) and service integration | DevOps | Day 3 | ✅ Done |

## Sprint E4 – Task Board (PerfPulse Micro-service) - ✅ COMPLETED
| ID | Task | Owner | Due | State |
|----|------|-------|-----|-------|
| E4.1 | Scaffold PerfPulse micro-service (FastAPI) | AI/Dev | Day 4 | ✅ Done |
| E4.2 | Create /analyze, /optimize, /health, /metrics endpoints | AI/Dev | Day 4 | ✅ Done |
| E4.3 | Add PerfPulse Dockerfile & requirements.txt | DevOps | Day 4 | ✅ Done |
| E4.4 | Update docker-compose.dev.yml for PerfPulse | DevOps | Day 4 | ✅ Done |
| E4.5 | Port assignment (8013) and service integration | DevOps | Day 4 | ✅ Done |

## Sprint D – Task Board (Specialist Agents v1)
| ID | Task | Owner | Due | State |
|----|------|-------|-----|-------|
| D1 | agentTemplates utilities + factory hooks | Framework | Week 1 | 🔜 |
| D2 | DesignForge agent scaffold | AI/Dev | Week 1 | 🔜 |
| D3 | SecuriShield agent scaffold | AI/Dev | Week 1 | ✅ Done (E2 Sprint) |
| D4 | CodeCraft agent scaffold | AI/Dev | Week 1 | � In Progress (E3 Sprint) |
| D5 | PerfPulse agent scaffold | AI/Dev | Week 1 | ✅ Done (E4 Sprint) |
| D6 | ADR-010 Specialist Agent Architecture | Arch | Week 1 | 🔜 |
| D7 | noAgentDupes auto-update & tests | QA | Week 1 | 🔜 |

## KPIs (Running)
* P95 Retriever Latency < 400 ms
* Embedding Batch Throughput target > 250 qps
* ErrorGold auto-remediation ≥ 35 %
* SOC-2 violations < 0.5 %

Progress is reviewed every Friday and auto-synced via GitHub Action `doc-sync` (see `.github/workflows/doc-sync.yml`