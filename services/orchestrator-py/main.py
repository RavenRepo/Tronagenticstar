"""Minimal ChiefArchitect Orchestrator (FastAPI + LangGraph)
This is a Sprint-A scaffold.  It does **not** perform real routing yet – it simply echoes
the incoming task payload and assigns a dummy `task_id`.

Run locally:

    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.responses import JSONResponse
from fastapi import Request
import errorgold  # noqa: E402
import asyncio

try:
    # LangGraph is optional at this stage; fallback to noop if missing
    import langgraph  # type: ignore
except ImportError:  # pragma: no cover
    langgraph = None  # noqa: N816  # camel-case external name

langgraph_app = None  # placeholder

try:
    if langgraph:
        from langgraph.graph import StateGraph, END

        def echo_node(state: dict):
            return {"result": state["parameters"], "processed_by": "echo-node"}

        workflow = StateGraph()
        workflow.add_node("echo", echo_node)
        workflow.set_entry_point("echo")
        workflow.set_finish_point(END)
        langgraph_app = workflow.compile()
except Exception as e:  # pragma: no cover
    print("Failed to init LangGraph DAG", e)

# ---------------------------------------------------------------------------
# Pydantic models – mirrors docs/communication_protocols.md JSON schema
# ---------------------------------------------------------------------------

class TaskRequest(BaseModel):
    task_type: str = Field(..., alias="task_type")
    parameters: Dict[str, Any] = Field(default_factory=dict)
    priority: int = 5


class TaskResponse(BaseModel):
    id: str
    status: str = "completed"
    received_at: datetime
    result: Dict[str, Any]


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="AgentForge Orchestrator (Sprint A Scaffold)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # asynchronously publish error event
    asyncio.create_task(errorgold.publish_error(exc, {"path": str(request.url)}))
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


@app.post("/tasks", response_model=TaskResponse)
async def submit_task(payload: TaskRequest, background_tasks: BackgroundTasks):
    """Accept a task and return an echo response.

    In later sprints we will construct a LangGraph workflow and route to specialist agents.
    """

    # Basic validation placeholder (future: auth, schema check)
    if payload.priority < 1 or payload.priority > 10:
        raise HTTPException(status_code=422, detail="priority must be 1-10")

    task_id = str(uuid.uuid4())

    # TODO: integrate LangGraph DAG once ready
    result = {
        "echo": payload.parameters,
        "note": "Sprint-A stub – no agent execution yet."
    }

    try:
        if langgraph_app:
            state = {"parameters": payload.parameters}
            lg_out = langgraph_app.invoke(state)
            result.update(lg_out)
    except Exception as e:
        asyncio.create_task(errorgold.publish_error(e, {"task_type": payload.task_type}))
        raise

    return TaskResponse(
        id=task_id,
        received_at=datetime.utcnow(),
        result=result,
    )


@app.get("/healthz")
async def healthcheck():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()} 