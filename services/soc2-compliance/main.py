#!/usr/bin/env python3
"""
SOC-2 Compliance Agent Micro-service (ADR-012 Compliant)
Specialized agent for SOC-2 compliance monitoring, rule evaluation, and evidence collection.
"""

import logging
import os
import time
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Enums and Constants ---

class TrustServiceCategory(str, Enum):
    SECURITY = "security"
    AVAILABILITY = "availability"
    PROCESSING_INTEGRITY = "processing_integrity"
    CONFIDENTIALITY = "confidentiality"
    PRIVACY = "privacy"

# --- Pydantic Models (ADR-012 Compliant) ---

class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None

class CapabilitiesResponse(BaseModel):
    agent_id: str = "soc2-compliance"
    agent_type: str = "guardian"
    task_type: str = "COMPLIANCE"
    capabilities: List[str] = ["evaluate_compliance", "export_evidence", "get_rules", "get_history"]

class TaskParameters(BaseModel):
    service_name: Optional[str] = None
    rules: Optional[List[str]] = None
    include_evidence: bool = True
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    categories: Optional[List[TrustServiceCategory]] = None
    limit: int = 10

class Task(BaseModel):
    task_id: str
    task_type: str
    parameters: TaskParameters

class TaskResultMetrics(BaseModel):
    processing_time_ms: float

class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    metrics: TaskResultMetrics

# --- FastAPI App ---

app = FastAPI(title="SOC-2 Compliance Agent", version="2.0.0")

# --- In-memory data stores (for demonstration) ---
COMPLIANCE_RULES: Dict[str, Any] = {
    "CC6.1": {"rule_id": "CC6.1", "category": "security", "title": "Logical and Physical Access Controls"},
    "A1.1": {"rule_id": "A1.1", "category": "availability", "title": "System Availability"},
}
compliance_history: List[Dict[str, Any]] = []

# --- Agent Logic (Simplified stubs) ---

async def _evaluate_compliance(params: TaskParameters) -> Dict[str, Any]:
    if not params.service_name:
        raise HTTPException(status_code=422, detail="'service_name' is required.")
    # Dummy response
    report = {
        "service_name": params.service_name,
        "timestamp": datetime.now().isoformat(),
        "overall_status": "compliant",
        "violations": [],
        "score": 98.5
    }
    compliance_history.append(report)
    return report

async def _export_evidence(params: TaskParameters) -> Dict[str, Any]:
    # Dummy response
    return {
        "export_id": f"export_{int(time.time())}",
        "download_url": f"/evidence/download/export_{int(time.time())}",
        "format": "json",
        "size_mb": 1.2,
        "records_count": len(compliance_history)
    }

async def _get_rules(params: TaskParameters) -> Dict[str, Any]:
    return {"rules": list(COMPLIANCE_RULES.values())}

async def _get_history(params: TaskParameters) -> Dict[str, Any]:
    if not params.service_name:
        raise HTTPException(status_code=422, detail="'service_name' is required.")
    history = [r for r in compliance_history if r['service_name'] == params.service_name][-params.limit:]
    return {"service_name": params.service_name, "records": history}

# --- API Endpoints ---

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
        if task.task_type == "evaluate_compliance":
            result_data = await _evaluate_compliance(task.parameters)
        elif task.task_type == "export_evidence":
            result_data = await _export_evidence(task.parameters)
        elif task.task_type == "get_rules":
            result_data = await _get_rules(task.parameters)
        elif task.task_type == "get_history":
            result_data = await _get_history(task.parameters)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported task type: {task.task_type}")
        
        processing_time_ms = (time.time() - start_time) * 1000
        return TaskResult(task_id=task.task_id, result=result_data, metrics=TaskResultMetrics(processing_time_ms=processing_time_ms))

    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8008))
    uvicorn.run(app, host="0.0.0.0", port=port)