"""ChiefArchitect Orchestrator – Python service (MVP).
Provides agent registration and basic task routing stubs.
"""
from __future__ import annotations

import logging
from typing import Any, Dict
import os

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from agent_registry import AgentRecord, AgentRegistry
from circuit_breaker import CircuitBreaker
from load_balancer import WeightedResponseTimeLB
from quality_gate import verify as quality_verify
import httpx
from redis_registry import RedisAgentRegistry
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

logger = logging.getLogger("chiefarchitect")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ChiefArchitect", version="0.1.0")
FastAPIInstrumentor.instrument_app(app)

backend = os.getenv("REGISTRY_BACKEND", "memory")
if backend == "redis":
    registry = RedisAgentRegistry(os.getenv("REDIS_URL", "redis://redis:6379/0"))
else:
    registry = AgentRegistry()

cb_registry: dict[str, CircuitBreaker] = {}

# Setup OTEL tracing early
resource = Resource.create({"service.name": "chiefarchitect"})
provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter())
provider.add_span_processor(processor)
from opentelemetry import trace
trace.set_tracer_provider(provider)

# ---------------------------------------------------------------------------
# Pydantic models (public API)
# ---------------------------------------------------------------------------
class RegisterPayload(BaseModel):
    agent_id: str = Field(..., example="apex-architect-01")
    capabilities: list[str] = Field(..., example=["architecture", "adr"])
    endpoint: str = Field(..., example="http://apex:8000")
    avg_response_time: float | None = None
    current_load: int | None = None


class TaskPayload(BaseModel):
    task_type: str
    payload: Dict[str, Any]
    required_capability: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.post("/register", status_code=status.HTTP_202_ACCEPTED)
async def register_agent(body: RegisterPayload):
    record = AgentRecord(
        agent_id=body.agent_id,
        capabilities=body.capabilities,
        endpoint=body.endpoint,
        avg_response_time=body.avg_response_time or 0.0,
        current_load=body.current_load or 0,
    )
    registry.register(record)
    logger.info("Registered agent %s", body.agent_id)
    return {"status": "ok"}


@app.post("/deregister", status_code=status.HTTP_202_ACCEPTED)
async def deregister_agent(agent_id: str):
    registry.deregister(agent_id)
    logger.info("Deregistered agent %s", agent_id)
    return {"status": "ok"}


@app.get("/healthz", status_code=status.HTTP_200_OK)
async def health_check():
    return {"status": "healthy"}


async def _forward_task(agent_endpoint: str, task_json: dict) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{agent_endpoint}/task", json=task_json)
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Optional LLM client (GPT-4 Turbo / GPT-4o or local OpenAI-compatible server)
# ---------------------------------------------------------------------------
try:
    from openai import AsyncOpenAI  # type: ignore
except ImportError:  # OpenAI SDK not installed – fall back to LB only
    AsyncOpenAI = None  # type: ignore

# Environment-driven toggle – no key ⇒ no LLM routing
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE")  # optional self-hosted endpoint
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

USE_LLM_ROUTING = bool(OPENAI_API_KEY and AsyncOpenAI)

if USE_LLM_ROUTING:
    llm_client = AsyncOpenAI(
        api_key=OPENAI_API_KEY,
        base_url=OPENAI_API_BASE or None,
    )


# ---------------------------------------------------------------------------
# Helper – smart agent selection
# ---------------------------------------------------------------------------
async def choose_agent(candidates: list[AgentRecord], task: "TaskPayload") -> AgentRecord | None:  # noqa: F821
    """Pick an agent via LLM when configured, otherwise deterministic LB."""

    if not candidates:
        return None

    # Fast path – no LLM configured
    if not USE_LLM_ROUTING:
        return WeightedResponseTimeLB.select(candidates)

    # Build compact prompt with candidate stats
    summary_lines = [
        f"{idx}. id={c.agent_id} rt={c.avg_response_time:.3f} load={c.current_load} caps={','.join(c.capabilities)}"
        for idx, c in enumerate(candidates, start=1)
    ]
    user_prompt = (
        "Task type: "
        f"{task.task_type}\nRequired capability: {task.required_capability}\n"
        "Candidates:\n" + "\n".join(summary_lines) + "\n\n"
        "Respond ONLY with the agent id best suited for the task."
    )

    try:
        rsp = await llm_client.chat.completions.create(  # type: ignore[attr-defined]
            model=OPENAI_MODEL,
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are ChiefArchitect's selector. Choose the optimal agent for a task "
                        "based on response-time, load and capability match. Output the id only."
                    ),
                },
                {"role": "user", "content": user_prompt},
            ],
        )

        agent_id = rsp.choices[0].message.content.strip()
        selected = next((c for c in candidates if c.agent_id == agent_id), None)
        if selected:
            return selected
        logger.warning("LLM returned unknown agent id '%s'; falling back to LB", agent_id)
    except Exception as exc:  # pragma: no cover
        logger.warning("LLM routing error: %s – falling back to LB", exc)

    # Fallback – deterministic selection
    return WeightedResponseTimeLB.select(candidates)


@app.post("/route_task")
async def route_task(task: TaskPayload):
    # 1. Select agent via LB or LLM if configured
    candidates = registry.get_by_capability(task.required_capability)
    agent = await choose_agent(candidates, task)

    if agent is None:
        raise HTTPException(status_code=503, detail="No capable agent available")

    # 2. Quality Gate
    if not await quality_verify(agent.agent_id):  # Placeholder uses id
        raise HTTPException(status_code=428, detail="Agent failed quality gate")

    # 3. Circuit breaker per agent
    cb = cb_registry.setdefault(agent.agent_id, CircuitBreaker())

    try:
        result = await cb.call(_forward_task, agent.endpoint, task.payload)
    except Exception as exc:
        logger.error("Task forwarding failed: %s", exc)
        raise HTTPException(status_code=502, detail="Agent invocation failed") from exc

    logger.info("Task %s executed by %s", task.task_type, agent.agent_id)
    return result 