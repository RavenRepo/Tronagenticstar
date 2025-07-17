# activeFocus – Sprint C (Embedding Optimisation & Hybrid Reranker)

**Sprint Window:** 2025-07-14 → 2025-07-28

## Objectives
1. Batch-processing in `services/embedding` to maximise GPU utilisation
2. Integrate lightweight reranker for hybrid vector-graph retrieval
3. Extend metrics & dashboards (batch latency, reranker quality)

## In-Progress
* GPU service deployed with Prometheus metrics and CUDA build – baseline validated ✅
* Planning batch `/embed/batch` flow (queue + asyncio gather)
* Reranker model selection (`ms-marco-MiniLM` family) prototyped locally

## Blockers / Risks
* GPU memory pressure during batch inference (>8 GB spikes) – may need gradient-checkpointing
* Ranking evaluation dataset selection (MS-MARCO vs domain-specific)

## Next 48-hour Tasks
| C1 | Implement `/embed/batch` endpoint with queue + asyncio gather | AI/Dev | Week 1 | 🔜 |
| C2 | Add reranker module to Retriever (`ms-marco-MiniLM` model) | AI/Dev | Week 1 | 🔜 |
| C3 | Update SDK for batch embeddings & reranker opts | SDK | Week 1 | 🔜 |
| C4 | Grafana panels for batch throughput & reranker P@k | DevOps | Week 1 | 🔜 |

<!-- Sprint B completion retained below for historical reference -->

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