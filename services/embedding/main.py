#!/usr/bin/env python3
"""
Embedding Agent Micro-service (ADR-012 Compliant)
Specialized agent for generating text embeddings.
"""

import logging
import os
import time
from typing import Any, Dict, List, Optional

import torch
import uvicorn
from fastapi import FastAPI, HTTPException, Depends, Request
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

# Configure logging
import logging
import json
from datetime import datetime

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


# Check for CUDA availability
device = 'cuda' if torch.cuda.is_available() else 'cpu'
logger.info(f"Embedding service using device: {device}")

# Load the model onto the specified device
model = SentenceTransformer('all-MiniLM-L6-v2', device=device)

# --- Pydantic Models (ADR-012 Compliant) ---

class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = f"Using device: {device}"

class CapabilitiesResponse(BaseModel):
    agent_id: str = "embedding"
    agent_type: str = "processing"
    task_type: str = "EMBEDDING"
    capabilities: List[str] = ["generate_embedding", "generate_embedding_batch"]

class TaskParameters(BaseModel):
    text: Optional[str] = None
    texts: Optional[List[str]] = None

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

app = FastAPI(
    title="Embedding Agent",
    description="Specialized agent for generating text embeddings",
    version="2.0.0"
)

# --- Agent Logic ---

async def _generate_embedding(params: TaskParameters) -> Dict[str, Any]:
    if not params.text:
        raise HTTPException(status_code=422, detail="'text' is required for single embedding.")
    embedding = model.encode(params.text).tolist()
    return {"embedding": embedding}

async def _generate_embedding_batch(params: TaskParameters) -> Dict[str, Any]:
    if not params.texts:
        raise HTTPException(status_code=422, detail="'texts' is required for batch embedding.")
    embeddings = model.encode(params.texts).tolist()
    return {"embeddings": embeddings}

# --- API Endpoints (ADR-012 Compliant) ---

@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse()

@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities(_: bool = Depends(verify_orchestrator)):
    return CapabilitiesResponse()

@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task, _: bool = Depends(verify_orchestrator)):
    start_time = time.time()

    try:
        if task.task_type == "generate_embedding":
            result_data = await _generate_embedding(task.parameters)
        elif task.task_type == "generate_embedding_batch":
            result_data = await _generate_embedding_batch(task.parameters)
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
    port = int(os.getenv("PORT", 8004)) # Default port for embedding
    uvicorn.run(app, host="0.0.0.0", port=port)