#!/usr/bin/env python3
"""
Retriever Agent Micro-service (ADR-012 Compliant)
Specialized agent for retrieving information from vector and graph databases.
"""

import logging
import os
import time
import json
from typing import Any, Dict, List, Optional

import torch
import uvicorn
import httpx
from fastapi import FastAPI, HTTPException, Depends, Request
from pydantic import BaseModel
from qdrant_client import QdrantClient, models
from neo4j import GraphDatabase
from sentence_transformers import SentenceTransformer, CrossEncoder

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


# --- Environment and Clients ---

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
NEO4J_URL = os.getenv("NEO4J_URL", "bolt://neo4j:7687")
COLLECTION = os.getenv("QDRANT_COLLECTION", "memories")
EMBEDDING_SERVICE_URL = os.getenv("EMBEDDING_SERVICE_URL")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
RERANKER_MODEL_NAME = os.getenv("RERANKER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-12-v2")

_embedder: Optional[SentenceTransformer] = None
_reranker: Optional[CrossEncoder] = None

VECTOR_SIZE = int(os.getenv("EMBEDDING_DIM", 384))

qdrant = QdrantClient(url=QDRANT_URL)
driver = GraphDatabase.driver(NEO4J_URL, auth=())

# --- Pydantic Models (ADR-012 Compliant) ---

class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None

class CapabilitiesResponse(BaseModel):
    agent_id: str = "retriever"
    agent_type: str = "processing"
    task_type: str = "RETRIEVAL"
    capabilities: List[str] = ["retrieve_memories", "index_memory", "get_related_memories"]

class TaskParameters(BaseModel):
    query: Optional[str] = None
    top_k: int = 5
    id: Optional[str] = None
    content: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    related_ids: Optional[List[str]] = None
    depth: int = 1

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

app = FastAPI(title="Retriever Agent", version="2.0.0")

# --- Agent Logic ---

def get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _embedder

def get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _reranker = CrossEncoder(RERANKER_MODEL_NAME, device=device)
    return _reranker

async def _embed(text: str) -> list[float]:
    if EMBEDDING_SERVICE_URL:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(f"{EMBEDDING_SERVICE_URL}/execute_task", json={"task_type": "generate_embedding", "parameters": {"text": text}}, timeout=10.0)
                resp.raise_for_status()
                return resp.json()['result']['embedding']
        except Exception as e:
            logger.warning(f"Remote embedding failed: {e}. Falling back to local.")
    return get_embedder().encode(text).tolist()

async def _retrieve_memories(params: TaskParameters) -> Dict[str, Any]:
    if not params.query:
        raise HTTPException(status_code=422, detail="'query' is required.")
    vector = await _embed(params.query)
    res = qdrant.search(collection_name=COLLECTION, query_vector=vector, limit=params.top_k)
    results = [point.payload.get("content", "") for point in res]
    if len(results) > 1:
        reranker = get_reranker()
        pairs = [(params.query, doc) for doc in results]
        scores = reranker.predict(pairs)
        results = [doc for _, doc in sorted(zip(scores, results), key=lambda x: x[0], reverse=True)]
    return {"results": results}

async def _index_memory(params: TaskParameters):
    if not params.id or not params.content:
        raise HTTPException(status_code=422, detail="'id' and 'content' are required.")
    vector = await _embed(params.content)
    payload = params.metadata or {}
    payload["content"] = params.content
    qdrant.upsert(collection_name=COLLECTION, points=[models.PointStruct(id=params.id, vector=vector, payload=payload)])
    with driver.session() as session:
        session.run("MERGE (m:Memory {id:$id}) SET m.content=$content, m.metadata=$meta", id=params.id, content=params.content, meta=json.dumps(payload))
        if params.related_ids:
            for rid in params.related_ids:
                session.run("MATCH (a:Memory {id:$a_id}) MERGE (b:Memory {id:$b_id}) MERGE (a)-[:RELATED_TO]->(b)", a_id=params.id, b_id=rid)
    return {"indexed": params.id}

async def _get_related_memories(params: TaskParameters) -> Dict[str, Any]:
    if not params.id:
        raise HTTPException(status_code=422, detail="'id' is required.")
    with driver.session() as session:
        query = f"MATCH (m:Memory {{id:$id}})-[:RELATED_TO*1..{params.depth}]-(n:Memory) RETURN DISTINCT n.id AS id LIMIT $limit"
        result = session.run(query, id=params.id, limit=params.top_k)
        ids = [record["id"] for record in result]
        return {"related_ids": ids}

# --- API Endpoints ---

@app.on_event("startup")
async def startup_event():
    try:
        qdrant.get_collection(COLLECTION)
    except Exception:
        qdrant.recreate_collection(COLLECTION, vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE))

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
        if task.task_type == "retrieve_memories":
            result_data = await _retrieve_memories(task.parameters)
        elif task.task_type == "index_memory":
            result_data = await _index_memory(task.parameters)
        elif task.task_type == "get_related_memories":
            result_data = await _get_related_memories(task.parameters)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported task type: {task.task_type}")
        processing_time_ms = (time.time() - start_time) * 1000
        return TaskResult(task_id=task.task_id, result=result_data, metrics=TaskResultMetrics(processing_time_ms=processing_time_ms))
    except Exception as e:
        logger.error(f"Task {task.task_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8006))
    uvicorn.run(app, host="0.0.0.0", port=port)