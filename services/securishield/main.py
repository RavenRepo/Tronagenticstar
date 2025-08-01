#!/usr/bin/env python3
"""
SecuriShield Agent Micro-service (ADR-012 Compliant)
Specialized agent for security scanning.
"""

import logging
import os
import time
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Pydantic Models (ADR-012 Compliant) ---

class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None

class CapabilitiesResponse(BaseModel):
    agent_id: str = "securishield"
    agent_type: str = "guardian"
    task_type: str = "SECURITY"
    capabilities: List[str] = ["scan_target"]

class TaskParameters(BaseModel):
    target: str

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

app = FastAPI(
    title="SecuriShield Agent",
    description="Specialized agent for security scanning",
    version="2.0.0"
)

# --- Agent Logic ---

async def _scan_target(params: TaskParameters) -> Dict[str, Any]:
    # placeholder CVE scan
    vulns = [
        {
            "id": "CVE-2024-0001",
            "severity": "LOW",
            "description": "Mock vulnerability for testing"
        }
    ]
    return {
        "target": params.target,
        "vulnerabilities": vulns
    }

# --- API Endpoints (ADR-012 Compliant) ---

@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="ok")

@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities():
    return CapabilitiesResponse()

@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task):
    start_time = time.time()

    try:
        if task.task_type == "scan_target":
            result_data = await _scan_target(task.parameters)
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
    port = int(os.getenv("PORT", 8007)) # Default port for securishield
    uvicorn.run(app, host="0.0.0.0", port=port)