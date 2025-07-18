from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
import httpx

import os

from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

from qdrant_client import QdrantClient, models
from neo4j import GraphDatabase
import json
from sentence_transformers import SentenceTransformer, CrossEncoder
import torch

REQUEST_COUNTER = Counter(
    "retriever_requests_total",
    "Total number of retrieval requests received"
)
REQUEST_DURATION = Histogram(
    "retriever_request_duration_seconds",
    "Time taken to process retrieval requests"
)

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
NEO4J_URL = os.getenv("NEO4J_URL", "bolt://neo4j:7687")
COLLECTION = os.getenv("QDRANT_COLLECTION", "memories")

# Optional remote embedding service
EMBEDDING_SERVICE_URL = os.getenv("EMBEDDING_SERVICE_URL")

EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")

# Local fallback model (lazy loaded) if remote not set or fails
_embedder: SentenceTransformer | None = None

# Determine vector size for Qdrant collection
VECTOR_SIZE_ENV = os.getenv("EMBEDDING_DIM")
if VECTOR_SIZE_ENV:
    VECTOR_SIZE = int(VECTOR_SIZE_ENV)
else:
    _temp_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    VECTOR_SIZE = _temp_model.get_sentence_embedding_dimension()


def _local_embed(text: str) -> list[float]:
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer(EMBEDDING_MODEL_NAME)
    assert _embedder is not None
    return _embedder.encode(text, convert_to_numpy=True).tolist()


def _embed(text: str) -> list[float]:
    """Generate vector via remote service or local model."""
    if EMBEDDING_SERVICE_URL:
        try:
            # Note the change in the JSON payload from "texts" to "text"
            resp = httpx.post(f"{EMBEDDING_SERVICE_URL}/embed", json={"text": text}, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            # Note the change in the response key from "embeddings" to "embedding"
            return data["embedding"]
        except Exception as e:
            print(f"Embedding service call failed: {e}. Falling back to local model.")
            # Fallback to local embedding on any failure
            pass
    return _local_embed(text)

RERANKER_MODEL_NAME = os.getenv("RERANKER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-12-v2")

_reranker: CrossEncoder | None = None

def _get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _reranker = CrossEncoder(RERANKER_MODEL_NAME, device=device)
    return _reranker

RERANK_DURATION = Histogram(
    "retriever_rerank_seconds",
    "Time taken to rerank search results"
)

# Initialise external clients
qdrant = QdrantClient(url=QDRANT_URL)
try:
    qdrant.get_collection(COLLECTION)
except Exception:
    qdrant.recreate_collection(
        COLLECTION,
        vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE),
    )

driver = GraphDatabase.driver(NEO4J_URL, auth=())

app = FastAPI(title="Retriever Service", version="0.1.0")

class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 5
    sources: Optional[List[str]] = None  # e.g. ["vector", "graph", "cache"]

class RetrieveResponse(BaseModel):
    results: List[str]

class IndexRequest(BaseModel):
    id: str
    content: str
    metadata: dict[str, Any] | None = None
    related_ids: Optional[List[str]] = None  # establish RELATED_TO edges


@app.get("/healthz")
async def health_check():
    """Simple health probe for Docker/Kubernetes liveness checks."""
    return {"status": "ok"}


@app.get("/metrics")
async def metrics():
    """Prometheus scrape endpoint"""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/retrieve", response_model=RetrieveResponse)
async def retrieve(req: RetrieveRequest):
    REQUEST_COUNTER.inc()
    with REQUEST_DURATION.time():
        vector = _embed(req.query)
        res = qdrant.search(collection_name=COLLECTION, query_vector=vector, limit=req.top_k)
        results = [point.payload.get("content", "") for point in res]
        # Rerank results using cross-encoder for better relevance
        if len(results) > 1:
            with RERANK_DURATION.time():
                reranker = _get_reranker()
                pairs = [(req.query, doc) for doc in results]
                scores = reranker.predict(pairs)
                # sort by score desc
                results = [doc for _, doc in sorted(zip(scores, results), key=lambda x: x[0], reverse=True)]
        return {"results": results}


@app.post("/index")
async def index_memory(req: IndexRequest):
    vector = _embed(req.content)
    payload = req.metadata or {}
    payload["content"] = req.content

    # Upsert into Qdrant
    qdrant.upsert(
        collection_name=COLLECTION,
        points=[
            models.PointStruct(id=req.id, vector=vector, payload=payload)
        ],
    )

    # Upsert into Neo4j (node + optional relationships)
    try:
        with driver.session() as session:
            # Merge node
            session.run(
                "MERGE (m:Memory {id:$id}) SET m.content=$content, m.metadata=$meta",
                id=req.id,
                content=req.content,
                meta=json.dumps(payload),
            )

            # Create relationships
            if req.related_ids:
                for rid in req.related_ids:
                    session.run(
                        "MATCH (a:Memory {id:$a_id}) MERGE (b:Memory {id:$b_id}) MERGE (a)-[:RELATED_TO]->(b)",
                        a_id=req.id,
                        b_id=rid,
                    )
    except Exception:  # non-blocking
        pass

    return {"indexed": req.id}

# ---------------- Graph Retrieval -----------------

class RelatedRequest(BaseModel):
    id: str
    depth: int = 1
    limit: int = 10


class RelatedResponse(BaseModel):
    related_ids: List[str]


@app.post("/related", response_model=RelatedResponse)
async def related(req: RelatedRequest):
    """Return IDs of memories related to given node within specified depth."""
    depth = max(1, req.depth)
    try:
        with driver.session() as session:
            query = (
                f"MATCH (m:Memory {{id:$id}})-[:RELATED_TO*1..{depth}]-(n:Memory) "
                "RETURN DISTINCT n.id AS id LIMIT $limit"
            )
            result = session.run(query, id=req.id, limit=req.limit)
            ids = [record["id"] for record in result]
            return {"related_ids": ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 