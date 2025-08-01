# activeFocus – Sprint E3 (CodeCraft Micro-service Scaffold)

**Sprint Window:** 2025-01-07 → 2025-01-10

## Objectives
1. Complete CodeCraft micro-service scaffolding following SecuriShield pattern.
2. Implement core code generation and refactoring endpoints.
3. Integrate CodeCraft into docker-compose.dev.yml on port 8012.
4. Prepare for E4 sprint (PerfPulse micro-service).

## Recently Completed (E2 Sprint)
* ✅ SecuriShield micro-service scaffolding complete
* ✅ FastAPI service with /scan, /health, /metrics endpoints
* ✅ Dockerfile and requirements.txt created
* ✅ docker-compose.dev.yml updated with SecuriShield on port 8011

## In-Progress (E3 Sprint)
* 🔄 CodeCraft micro-service scaffolding (next priority)

## Blockers / Risks
* Container count increase may exceed dev laptop resources.
* Need to ensure consistent port allocation and service patterns.

## Next 48-hour Tasks (E3 Sprint)
| E3.1 | Scaffold CodeCraft micro-service (FastAPI) | AI/Dev | Day 1 | � |
| E3.2 | Create /generate, /refactor, /health, /metrics endpoints | AI/Dev | Day 1 | 🔜 |
| E3.3 | Add CodeCraft Dockerfile & requirements.txt | DevOps | Day 1 | 🔜 |
| E3.4 | Update docker-compose.dev.yml for CodeCraft | DevOps | Day 1 | 🔜 |
| E3.5 | Port assignment (8012) and service integration | DevOps | Day 1 | 🔜 |
| E3.6 | Test CodeCraft service startup and endpoints | QA | Day 2 | 🔜 |

## Upcoming (E4 Sprint)
| E4.1 | Scaffold PerfPulse micro-service | AI/Dev | Day 3 | 🔜 |
| E4.2 | Performance monitoring endpoints | AI/Dev | Day 3 | 🔜 |

<!-- Historical sprints retained below -->

## ✅ Sprint B – Week 2 Completed
The Error & RAG Core sprint delivered all planned items:
* **GPU-Capable Embedding Service** (`services/embedding`, CUDA-enabled Dockerfile, Prometheus metrics)
* **Hybrid Relationship Retrieval** – Retriever now indexes `related_ids` in Neo4j and exposes `/related` endpoint
* **SDK & Tests** – TypeScript `retrieveRelated` helper and Vitest suite, plus `pytest/test_relationship.py`
* **Observability** – New Prometheus scrape jobs and 4 Grafana dashboards (retriever, embedding, Neo4j, error overview)
* **Docker Stack** – Rebuilt images, resolved missing `numpy`, validated metrics and embedding outputs

## ↗️ Sprint C – Embedding Optimisation & Hybrid Reranker (Kick-off)

### Objectives (Phase C-1)
1. Batch-processing in `services/embedding` to maximise GPU utilisation
2. Integrate lightweight reranker for hybrid vector-graph retrieval
3. Extend metrics & dashboards (batch latency, reranker quality)

### Upcoming Tasks
| C1 | Implement /embed/batch endpoint with queue + asyncio gather | AI/Dev | Week 1 | 🔜 |
| C2 | Add reranker module (sentence-transformers “ms-marco-MiniLM”) to Retriever | AI/Dev | Week 1 | 🔜 |
| C3 | Update SDK for batch embeddings & reranker opts | SDK | Week 1 | 🔜 |
| C4 | Grafana panels for batch throughput & reranker P@k | DevOps | Week 1 | 🔜 |

--- 