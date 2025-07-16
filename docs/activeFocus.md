# activeFocus – Sprint B (Error & RAG Core)

**Sprint Window:** 2025-06-29 → 2025-07-12

## Objectives
1. Scaffold Retriever Service (FastAPI + Qdrant/Neo4j/Redis).
2. Integrate retrieval endpoint with ChiefArchitect orchestrator & TS SDK.
3. Add observability metrics and Loki logging for Retriever.

## In-Progress
* Retriever service scaffold initiated (FastAPI stub + Dockerfile + requirements).
* Docker Compose updated with Redis & Retriever containers.
* Grafana now exposes on port **3001** (host) to avoid conflicts.

## Blockers / Risks
* Qdrant & Neo4j readiness on developer machines.
* Schema decisions for vector payloads.

## Next 48-hour Tasks
| B1 | Scaffold `services/retriever` (FastAPI app, Dockerfile, requirements) | AI/Dev | Week 2 | ✅ Done |
| B2 | Update docker-compose.dev.yml with Redis & Retriever | DevOps | Week 2 | ✅ Done |
| B3 | Wire Retriever into orchestrator & write integration tests | AI/Dev | Week 2 | ✅ Done | 

<!-- Sprint B completion update added 2025-07-13 -->

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