#!/usr/bin/env python3
"""
SOC-2 Compliance Agent Micro-service (ADR-012 Compliant)
Specialized agent for SOC-2 compliance monitoring, rule evaluation, and evidence collection.
"""

import json

# Configure logging
import logging
import os
import time
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from llm_provider import LLMProvider, LLMRequest, get_llm_provider
from pydantic import BaseModel, Field


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Disable uvicorn default access log formatting if it exists
logging.getLogger("uvicorn.access").handlers = []


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
    llm_configured: bool = False
    llm_cost_usd: Optional[float] = None


class CapabilitiesResponse(BaseModel):
    agent_id: str = "soc2-compliance"
    agent_type: str = "guardian"
    task_type: str = "COMPLIANCE"
    capabilities: List[str] = [
        "evaluate_compliance",
        "export_evidence",
        "get_rules",
        "get_history",
    ]


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

AGENT_BEARER = os.getenv("AGENT_BEARER") or os.getenv("CODECRAFT_TOKEN")


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


app = FastAPI(title="SOC-2 Compliance Agent", version="2.0.0")

# Global LLM provider instance
_llm: Optional[LLMProvider] = None


async def get_llm() -> LLMProvider:
    global _llm
    if _llm is None:
        _llm = await get_llm_provider()
    return _llm


# --- In-memory data stores (for demonstration) ---
COMPLIANCE_RULES: Dict[str, Any] = {
    "CC6.1": {
        "rule_id": "CC6.1",
        "category": "security",
        "title": "Logical and Physical Access Controls",
    },
    "A1.1": {
        "rule_id": "A1.1",
        "category": "availability",
        "title": "System Availability",
    },
}
compliance_history: List[Dict[str, Any]] = []

# --- Agent Logic (Simplified stubs) ---


async def _evaluate_compliance(params: TaskParameters) -> Dict[str, Any]:
    if not params.service_name:
        raise HTTPException(status_code=422, detail="'service_name' is required.")

    llm = await get_llm()

    prompt = f"""
    Evaluate SOC-2 compliance for the service: {params.service_name}.
    Rules to evaluate: {params.rules or "All applicable rules"}
    Categories: {params.categories or "All categories"}

    Provide a detailed compliance report in JSON format with the following structure:
    {{
        "service_name": "{params.service_name}",
        "overall_status": "compliant" | "non_compliant" | "needs_review",
        "score": <float 0-100>,
        "violations": [
            {{
                "rule_id": "string",
                "description": "string",
                "severity": "high" | "medium" | "low",
                "remediation": "string"
            }}
        ],
        "compliant_controls": [
            {{
                "rule_id": "string",
                "description": "string"
            }}
        ]
    }}
    """

    response = await llm.complete(
        LLMRequest(
            system_prompt="You are an expert SOC-2 compliance auditor. Evaluate the provided service and rules, and return a strict JSON response.",
            user_prompt=prompt,
            temperature=0.2,
            require_json=True,
        )
    )

    try:
        content = response.content
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        report = json.loads(content)
    except Exception as e:
        logger.error(f"Failed to parse LLM response: {e}\nContent: {response.content}")
        report = {
            "service_name": params.service_name,
            "overall_status": "needs_review",
            "violations": [],
            "score": 0.0,
            "error": "Failed to parse LLM response",
        }

    report["timestamp"] = datetime.now().isoformat()
    report["llm_provider"] = response.provider
    report["llm_model"] = response.model
    report["cost_usd"] = response.cost_usd

    compliance_history.append(report)
    return report


async def _export_evidence(params: TaskParameters) -> Dict[str, Any]:
    # Dummy response
    return {
        "export_id": f"export_{int(time.time())}",
        "download_url": f"/evidence/download/export_{int(time.time())}",
        "format": "json",
        "size_mb": 1.2,
        "records_count": len(compliance_history),
    }


async def _get_rules(params: TaskParameters) -> Dict[str, Any]:
    return {"rules": list(COMPLIANCE_RULES.values())}


async def _get_history(params: TaskParameters) -> Dict[str, Any]:
    if not params.service_name:
        raise HTTPException(status_code=422, detail="'service_name' is required.")
    history = [
        r for r in compliance_history if r["service_name"] == params.service_name
    ][-params.limit :]
    return {"service_name": params.service_name, "records": history}


# --- API Endpoints ---


@app.get("/health", response_model=HealthResponse)
async def health_check():
    try:
        llm = await get_llm()
        llm_ok = llm is not None and llm._initialized
        return HealthResponse(
            status="ok" if llm_ok else "degraded",
            details="LLM provider active" if llm_ok else "LLM provider not initialized",
            llm_configured=llm_ok,
            llm_cost_usd=llm.get_cost_today() if llm_ok else 0.0,
        )
    except Exception as e:
        return HealthResponse(
            status="degraded",
            details=f"LLM provider error: {str(e)}",
            llm_configured=False,
        )


@app.get("/llm-metrics")
async def llm_metrics(_: bool = Depends(verify_orchestrator)):
    """Return LLM usage metrics for monitoring."""
    try:
        llm = await get_llm()
        return {
            "status": "ok",
            "cost_today_usd": llm.get_cost_today(),
            "provider_health": {
                name: health.model_dump()
                for name, health in llm.get_provider_health().items()
            },
            "rate_limits": llm.get_rate_limit_status(),
        }
    except Exception as e:
        return {"error": str(e), "status": "llm_not_initialized"}


@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities(_: bool = Depends(verify_orchestrator)):
    return CapabilitiesResponse()


@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task, _: bool = Depends(verify_orchestrator)):
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
            raise HTTPException(
                status_code=400, detail=f"Unsupported task type: {task.task_type}"
            )

        processing_time_ms = (time.time() - start_time) * 1000
        return TaskResult(
            task_id=task.task_id,
            result=result_data,
            metrics=TaskResultMetrics(processing_time_ms=processing_time_ms),
        )

    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8020))
    uvicorn.run(app, host="0.0.0.0", port=port)
