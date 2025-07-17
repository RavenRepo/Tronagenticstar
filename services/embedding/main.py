from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import torch
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
from typing import List

app = FastAPI()

# Check for CUDA availability
device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Embedding service using device: {device}")

# Load the model onto the specified device
model = SentenceTransformer('all-MiniLM-L6-v2', device=device)

REQUEST_COUNTER = Counter(
    "embedding_requests_total",
    "Total number of embedding requests handled"
)
REQUEST_DURATION = Histogram(
    "embedding_request_duration_seconds",
    "Time taken to handle embedding requests"
)
BATCH_REQUEST_COUNTER = Counter(
    "embedding_batch_requests_total",
    "Total number of batch embedding requests handled"
)
BATCH_SIZE_HIST = Histogram(
    "embedding_batch_size",
    "Number of texts per batch request"
)

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    embedding: list[float]

class BatchEmbedRequest(BaseModel):
    texts: List[str]

class BatchEmbedResponse(BaseModel):
    embeddings: List[List[float]]

@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest):
    REQUEST_COUNTER.inc()
    with REQUEST_DURATION.time():
        try:
            embedding = model.encode(request.text).tolist()
            return EmbedResponse(embedding=embedding)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/embed/batch", response_model=BatchEmbedResponse)
def embed_batch(request: BatchEmbedRequest):
    if not request.texts:
        raise HTTPException(status_code=400, detail="`texts` must contain at least one item")
    BATCH_REQUEST_COUNTER.inc()
    BATCH_SIZE_HIST.observe(len(request.texts))
    with REQUEST_DURATION.time():
        try:
            vectors = model.encode(request.texts).tolist()
            return BatchEmbedResponse(embeddings=vectors)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok", "device": device}

@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST) 