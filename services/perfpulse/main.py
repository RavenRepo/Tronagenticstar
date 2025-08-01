#!/usr/bin/env python3
"""
PerfPulse Agent Micro-service (ADR-012 Compliant)
Specialized agent for performance monitoring and analysis.
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
    agent_id: str = "perfpulse"
    agent_type: str = "guardian"
    task_type: str = "PERFORMANCE_ANALYSIS"
    capabilities: List[str] = ["analyze_performance", "suggest_optimizations"]

class TaskParameters(BaseModel):
    service_name: str
    metrics: Optional[Dict[str, float]] = None
    code_snippet: Optional[str] = None
    performance_data: Optional[Dict[str, float]] = None

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
    title="PerfPulse Agent",
    description="Specialized agent for performance monitoring and analysis",
    version="2.0.0"
)

# --- Agent Logic (Simplified stubs) ---

async def _analyze_performance(params: TaskParameters) -> Dict[str, Any]:
    if not params.metrics:
        raise HTTPException(status_code=422, detail="'metrics' are required for performance analysis.")
    # Dummy response
    score = 100.0
    if params.metrics.get("cpu_percent", 0) > 80: score -= 20
    if params.metrics.get("memory_percent", 0) > 80: score -= 20
    return {
        "service_name": params.service_name,
        "analysis": {"status": "healthy" if score > 80 else "warning"},
        "recommendations": ["Consider optimizing CPU usage."],
        "score": score
    }

async def _suggest_optimizations(params: TaskParameters) -> Dict[str, Any]:
    # Dummy response
    return {
        "service_name": params.service_name,
        "optimizations": ["Implement caching for frequent operations."],
        "expected_improvement": "15-30%",
        "priority": "medium"
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
        if task.task_type == "analyze_performance":
            result_data = await _analyze_performance(task.parameters)
        elif task.task_type == "suggest_optimizations":
            result_data = await _suggest_optimizations(task.parameters)
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
    port = int(os.getenv("PORT", 8005)) # Default port for perfpluse
    uvicorn.run(app, host="0.0.0.0", port=port)