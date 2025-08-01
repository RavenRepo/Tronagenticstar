#!/usr/bin/env python3
"""
Evaluator Agent Micro-service (ADR-012 Compliant)
Specialized agent for code quality assessment, performance evaluation, and technical debt analysis.
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
    agent_id: str = "evaluator"
    agent_type: str = "guardian"
    task_type: str = "EVALUATION"
    capabilities: List[str] = ["evaluate_quality", "evaluate_performance", "evaluate_technical_debt"]

class TaskParameters(BaseModel):
    code: Optional[str] = None
    language: str = "python"
    metrics: Optional[List[str]] = None
    # Add other params from old models as needed
    performance_criteria: Optional[List[str]] = None
    code_snippets: Optional[List[str]] = None
    debt_types: Optional[List[str]] = None

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
    title="Evaluator Agent",
    description="Specialized agent for code quality assessment and performance evaluation",
    version="2.0.0"
)

# --- Agent Logic (Simplified stubs) ---

async def _evaluate_quality(params: TaskParameters) -> Dict[str, Any]:
    if not params.code:
        raise HTTPException(status_code=422, detail="'code' is required for quality evaluation.")
    # Dummy response
    return {
        "evaluation_type": "code_quality",
        "overall_score": 85.5,
        "detailed_metrics": {"complexity": 80, "maintainability": 90},
        "issues": [],
        "recommendations": ["Consider adding more comments."]
    }

async def _evaluate_performance(params: TaskParameters) -> Dict[str, Any]:
    if not params.code:
        raise HTTPException(status_code=422, detail="'code' is required for performance evaluation.")
    # Dummy response
    return {
        "evaluation_type": "performance",
        "overall_score": 92.0,
        "detailed_metrics": {"time_complexity": "O(n)", "space_complexity": "O(1)"},
        "issues": [],
        "recommendations": ["The algorithm appears efficient."]
    }

async def _evaluate_technical_debt(params: TaskParameters) -> Dict[str, Any]:
    if not params.code_snippets:
        raise HTTPException(status_code=422, detail="'code_snippets' is required for tech debt evaluation.")
    # Dummy response
    return {
        "evaluation_type": "technical_debt",
        "overall_score": 78.0,
        "detailed_metrics": {"debt_ratio": 15.2},
        "issues": [{"type": "duplication", "severity": "medium"}],
        "recommendations": ["Refactor duplicated code."]
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
        if task.task_type == "evaluate_quality":
            result_data = await _evaluate_quality(task.parameters)
        elif task.task_type == "evaluate_performance":
            result_data = await _evaluate_performance(task.parameters)
        elif task.task_type == "evaluate_technical_debt":
            result_data = await _evaluate_technical_debt(task.parameters)
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
    port = int(os.getenv("PORT", 8002)) # Default port for evaluator
    uvicorn.run(app, host="0.0.0.0", port=port)