#!/usr/bin/env python3
"""
CodeCraft Agent Micro-service (ADR-012 Compliant)
Specialized agent for code generation, refactoring, and optimization tasks.
"""

import logging
import os
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import openai
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from starlette.status import HTTP_200_OK

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY
else:
    logger.warning("OPENAI_API_KEY not set. OpenAI integration will not work.")

# --- Pydantic Models (ADR-012 Compliant) ---

class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None

class CapabilitiesResponse(BaseModel):
    agent_id: str = "codecraft"
    agent_type: str = "specialist"
    task_type: str = "CODE_GENERATION"
    capabilities: List[str] = ["generate_code", "refactor_code"]

class TaskParameters(BaseModel):
    prompt: Optional[str] = None
    language: Optional[str] = "python"
    style: Optional[str] = "clean"
    max_lines: Optional[int] = 100
    code: Optional[str] = None
    refactor_type: Optional[str] = "optimize"

class Task(BaseModel):
    task_id: str
    task_type: str
    parameters: TaskParameters
    context: Optional[List[Dict[str, Any]]] = None

class TaskResultMetrics(BaseModel):
    processing_time_ms: float
    tokens_used: Optional[int] = None

class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    metrics: TaskResultMetrics

# --- FastAPI App ---

app = FastAPI(
    title="CodeCraft Agent",
    description="Specialized agent for code generation, refactoring, and optimization",
    version="2.0.0"
)

# --- Agent Logic ---

async def _generate_code(params: TaskParameters) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured.")
    if not params.prompt:
        raise HTTPException(status_code=422, detail="'prompt' is required for code generation.")

    prompt = f"""You are CodeCraft, a senior software engineer. Generate clean, idiomatic {params.language} code for the following task:\n\nTask: {params.prompt}"""
    if params.style:
        prompt += f"\nStyle: {params.style}"
    if params.max_lines:
        prompt += f"\nLimit output to {params.max_lines} lines."

    response = await openai.ChatCompletion.acreate(
        model="gpt-3.5-turbo",
        messages=[{"role": "system", "content": "You are a helpful coding assistant."},
                  {"role": "user", "content": prompt}],
        max_tokens=1024,
        temperature=0.2
    )
    generated_code = response.choices[0].message.content.strip()
    tokens_used = response.usage.total_tokens

    return {
        "generated_code": generated_code,
        "language": params.language,
        "confidence_score": 0.95, # Placeholder
        "tokens_used": tokens_used
    }

async def _refactor_code(params: TaskParameters) -> Dict[str, Any]:
    if not params.code:
        raise HTTPException(status_code=422, detail="'code' is required for refactoring.")

    # In production, this would use a more sophisticated LLM call
    refactored_code = f"""# Refactored {params.language} code ({params.refactor_type})\n{params.code}\n\n# Refactoring applied: {params.refactor_type}"""

    return {
        "refactored_code": refactored_code,
        "language": params.language,
        "confidence_score": 0.92, # Placeholder
    }

# --- API Endpoints (ADR-012 Compliant) ---

@app.get("/health", response_model=HealthResponse)
async def health_check():
    # In a real scenario, we might check DB connections, external services, etc.
    return HealthResponse(status="ok")

@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities():
    return CapabilitiesResponse()

@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task):
    start_time = time.time()

    try:
        if task.task_type == "generate_code":
            result_data = await _generate_code(task.parameters)
        elif task.task_type == "refactor_code":
            result_data = await _refactor_code(task.parameters)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported task type: {task.task_type}")

        processing_time_ms = (time.time() - start_time) * 1000

        return TaskResult(
            task_id=task.task_id,
            status="completed",
            result=result_data,
            metrics=TaskResultMetrics(
                processing_time_ms=processing_time_ms,
                tokens_used=result_data.get("tokens_used")
            )
        )

    except HTTPException as e:
        # Re-raise HTTP exceptions directly
        raise e
    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001)) # Default port for codecraft
    uvicorn.run(app, host="0.0.0.0", port=port)