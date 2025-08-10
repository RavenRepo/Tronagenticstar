#!/usr/bin/env python3
"""
DesignForge Agent Micro-service (ADR-012 Compliant)
Specialized agent for generating diagrams.
"""

import logging
import os
import time
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Request
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Pydantic Models (ADR-012 Compliant) ---

class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None

class CapabilitiesResponse(BaseModel):
    agent_id: str = "designforge"
    agent_type: str = "specialist"
    task_type: str = "DESIGN"
    capabilities: List[str] = ["generate_diagram"]

class TaskParameters(BaseModel):
    system_name: str

class Task(BaseModel):
    task_id: str
    task_type: str
    parameters: TaskParameters
    context: Optional[List[Dict[str, Any]]] = None

class TaskResultMetrics(BaseModel):
    processing_time_ms: float

class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    metrics: TaskResultMetrics

# --- FastAPI App ---

AGENT_BEARER = os.getenv("AGENT_BEARER")

async def verify_orchestrator(request: Request):
    if not AGENT_BEARER:
        return True
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    if token != AGENT_BEARER:
        raise HTTPException(status_code=403, detail="Invalid token")
    return True

app = FastAPI(
    title="DesignForge Agent",
    description="Specialized agent for generating diagrams",
    version="2.0.0"
)

# --- Agent Logic ---

async def _generate_diagram(params: TaskParameters) -> Dict[str, Any]:
    # placeholder diagram generation
    boxes = [f"[{params.system_name} Component {i}]" for i in range(1,4)]
    diag = " --> ".join(boxes)
    return {"diagram": f"C4_Context: {diag}"}

# --- API Endpoints (ADR-012 Compliant) ---

@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok")

@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities(_: bool = Depends(verify_orchestrator)):
    return CapabilitiesResponse()

@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task, _: bool = Depends(verify_orchestrator)):
    start_time = time.time()

    try:
        if task.task_type == "generate_diagram":
            result_data = await _generate_diagram(task.parameters)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported task type: {task.task_type}")

        processing_time_ms = (time.time() - start_time) * 1000

        return TaskResult(
            task_id=task.task_id,
            status="completed",
            result=result_data,
            metrics=TaskResultMetrics(processing_time_ms=processing_time_ms)
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8003)) # Default port for designforge
    uvicorn.run(app, host="0.0.0.0", port=port)