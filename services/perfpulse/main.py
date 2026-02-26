#!/usr/bin/env python3
"""
PerfPulse Agent Micro-service (ADR-012 Compliant)
Specialized agent for performance monitoring, analysis, and optimization suggestions.
Now integrated with the Constella LLM Provider.
"""

import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request

# Import shared LLM provider
from llm_provider import LLMProvider, LLMRequest, get_llm_provider
from pydantic import BaseModel


# --- Logging Configuration ---
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


# --- Pydantic Models (ADR-012 Compliant) ---


class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None
    llm_configured: bool = False
    llm_cost_usd: Optional[float] = None


class CapabilitiesResponse(BaseModel):
    agent_id: str = "perfpulse"
    agent_type: str = "guardian"
    task_type: str = "PERFORMANCE_ANALYSIS"
    capabilities: List[str] = ["analyze_performance", "suggest_optimizations"]


class TaskParameters(BaseModel):
    service_name: str
    metrics: Optional[Dict[str, float]] = None
    code_snippet: Optional[str] = None
    performance_data: Optional[Dict[str, Any]] = None


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


# --- Global LLM Provider ---
_llm: Optional[LLMProvider] = None


async def get_llm() -> LLMProvider:
    global _llm
    if _llm is None:
        _llm = await get_llm_provider()
    return _llm


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
    title="PerfPulse Agent",
    description="Specialized agent for performance monitoring and analysis using LLMs",
    version="2.1.0",
)


# --- Helper Functions ---


def _parse_llm_json(content: str) -> Dict[str, Any]:
    """Robustly parse JSON from LLM output, handling markdown code fences."""
    try:
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        return json.loads(content)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from LLM: {e}\nContent: {content}")
        return {"error": "Failed to parse LLM response as JSON", "raw_content": content}


# --- Agent Logic (LLM-Powered) ---


async def _analyze_performance(params: TaskParameters) -> Dict[str, Any]:
    if not params.metrics and not params.performance_data:
        raise HTTPException(
            status_code=422,
            detail="'metrics' or 'performance_data' are required for performance analysis.",
        )

    llm = await get_llm()

    prompt = f"""
    You are an expert performance engineer and SRE. Analyze the following performance data for the service '{params.service_name}'.

    Metrics:
    {json.dumps(params.metrics or {}, indent=2)}

    Additional Performance Data:
    {json.dumps(params.performance_data or {}, indent=2)}

    Provide a detailed performance analysis in strict JSON format with the following structure:
    {{
        "service_name": "{params.service_name}",
        "analysis": {{
            "status": "healthy" | "warning" | "critical",
            "details": "Detailed explanation of the current performance state"
        }},
        "bottlenecks": [
            "List of identified or potential bottlenecks"
        ],
        "recommendations": [
            "Actionable recommendations to improve performance"
        ],
        "score": <float 0-100 representing overall performance health>
    }}
    """

    try:
        response = await llm.complete(
            LLMRequest(
                system_prompt="You are an expert performance engineer. Always return valid JSON.",
                user_prompt=prompt,
                temperature=0.2,
                require_json=True,
            )
        )

        result = _parse_llm_json(response.content)
        result["llm_provider"] = response.provider
        result["llm_model"] = response.model
        result["cost_usd"] = response.cost_usd
        return result

    except Exception as e:
        logger.error(f"Error during performance analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM processing failed: {str(e)}")


async def _suggest_optimizations(params: TaskParameters) -> Dict[str, Any]:
    llm = await get_llm()

    prompt = f"""
    You are an expert software optimizer and performance engineer. Suggest optimizations for the service '{params.service_name}'.

    Metrics context (if any):
    {json.dumps(params.metrics or {}, indent=2)}

    Code Snippet to optimize (if provided):
    {params.code_snippet or "No specific code provided. Provide general architectural optimizations based on the service name and metrics."}

    Provide your optimization suggestions in strict JSON format with the following structure:
    {{
        "service_name": "{params.service_name}",
        "overall_strategy": "High-level optimization strategy",
        "optimizations": [
            {{
                "description": "Detailed description of the optimization",
                "expected_improvement": "Estimated improvement (e.g., '15-30% latency reduction')",
                "priority": "high" | "medium" | "low",
                "implementation_complexity": "high" | "medium" | "low",
                "code_example": "Optional code snippet showing the optimized approach"
            }}
        ]
    }}
    """

    try:
        response = await llm.complete(
            LLMRequest(
                system_prompt="You are an expert performance optimization engineer. Always return valid JSON.",
                user_prompt=prompt,
                temperature=0.3,
                require_json=True,
            )
        )

        result = _parse_llm_json(response.content)
        result["llm_provider"] = response.provider
        result["llm_model"] = response.model
        result["cost_usd"] = response.cost_usd
        return result

    except Exception as e:
        logger.error(f"Error during optimization suggestion: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM processing failed: {str(e)}")


# --- API Endpoints (ADR-012 Compliant) ---


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
        logger.error(f"Health check failed: {e}")
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
            "providers": {
                name: health.dict()
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
        if task.task_type == "analyze_performance":
            result_data = await _analyze_performance(task.parameters)
        elif task.task_type == "suggest_optimizations":
            result_data = await _suggest_optimizations(task.parameters)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported task type: {task.task_type}"
            )

        processing_time_ms = (time.time() - start_time) * 1000

        return TaskResult(
            task_id=task.task_id,
            status="completed",
            result=result_data,
            metrics=TaskResultMetrics(processing_time_ms=processing_time_ms),
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"An unexpected error occurred: {str(e)}"
        )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8005))  # Default port for perfpulse
    uvicorn.run(app, host="0.0.0.0", port=port)
