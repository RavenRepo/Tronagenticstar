# activeFocus – Sprint A (Foundation)

**Sprint Window:** 2025-06-14 → 2025-06-28

## Objectives
1. Establish Python orchestrator service (ApexArchitect + Pathfinder) running in FastAPI.  
2. Local dev stack via docker-compose (orchestrator, NATS, Qdrant, Neo4j, Prometheus, Grafana, Loki).  
3. ErrorGold Node SDK prototype publishing to NATS.

## In-Progress
* ADR-009 merged – Retriever layer planned.
* Package `packages/orchestrator` TS stubs ready.

## Blockers / Risks
* Need Python LangGraph version compatibility (>=0.5).  
* Container resources on dev machines (memory ~4 GB).

## Next 48-hour Tasks
- [ ] Generate FastAPI project scaffold.  
- [ ] Write minimal LangGraph DAG with dummy node.  
- [ ] Define NATS subject schema for ErrorGold events. 