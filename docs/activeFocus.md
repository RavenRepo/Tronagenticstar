# activeFocus – Sprint D (Specialist Agents v1)

**Sprint Window:** 2025-07-29 → 2025-08-12

## Objectives
1. Scaffold first wave of specialist agents (DesignForge, SecuriShield, CodeCraft, PerfPulse) as reusable subclasses of `BaseAgent`.
2. Implement agent registration & discovery: ensure `noAgentDupes.md` updated automatically.
3. Provide minimal functional endpoints for each agent plus health & metrics.
4. Author ADR-010 documenting specialist-agent design decisions.

## In-Progress
* Sprint planning complete; agent templates drafted.
* ADR-010 outline created (pending review).

## Blockers / Risks
* Capability overlap between DesignForge & existing ChiefArchitect – careful SRP analysis required.
* SecuriShield early PoC needs mock vulnerability DB until external feed finalised.

## Next 48-hour Tasks
| D1 | Create `agentTemplates.ts` with abstract utilities & register factory hooks | Framework | Week 1 | 🔜 |
| D2 | Scaffold DesignForge agent with C4 diagram generation stub | AI/Dev | Week 1 | 🔜 |
| D3 | Scaffold SecuriShield agent with CVE lookup stub | AI/Dev | Week 1 | 🔜 |
| D4 | Scaffold CodeCraft agent with ESLint/mutation stub | AI/Dev | Week 1 | 🔜 |
| D5 | Scaffold PerfPulse agent with k6 load test stub | AI/Dev | Week 1 | 🔜 |
| D6 | Write ADR-010 Specialist Agent Architecture | Arch | Week 1 | 🔜 |
| D7 | Update `noAgentDupes.md` + integration tests | QA | Week 1 | 🔜 |

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