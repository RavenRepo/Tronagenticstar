# ChiefArchitect (Python Service)

This micro-service provides the runtime control-plane for the Starforge constellation.

## Responsibilities
1. **Dynamic Agent Management** – register, deregister, query agent health.
2. **Task Routing** – receive tasks from clients or other agents and dispatch to the optimal specialist agent.
3. **Quality Gates** – verify target agent image SHA and health metrics before dispatch.
4. **Observability** – expose OpenTelemetry spans, Prometheus metrics, and a `/healthz` endpoint.

## Tech Stack
| Layer | Choice |
|-------|--------|
| Framework | FastAPI + Uvicorn (asyncio) |
| Data Store | In-memory registry (MVP) → Redis cluster (future) |
| Messaging | HTTP/JSON (MVP) → NATS / Kafka (future) |
| Language | Python 3.11 |

## Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/register` | Register/heartbeat for an agent |
| `POST` | `/deregister` | Gracefully remove agent |
| `POST` | `/route_task` | Route task to agent (stub) |
| `GET` | `/healthz` | Liveness/readiness probe |

## Running Locally
```bash
cd services/orchestrator-py
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

## Next Steps
* Implement weighted response-time load balancer
* Integrate Redis-backed registry
* Add circuit breaker & quality-gate hooks 