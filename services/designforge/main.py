from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
import random

app = FastAPI()

REQUEST_COUNT = Counter("designforge_requests_total", "Total requests to DesignForge")
LATENCY_HIST = Histogram("designforge_request_seconds", "Request latency seconds")

class DiagramRequest(BaseModel):
    system_name: str

class DiagramResponse(BaseModel):
    diagram: str

@app.post("/diagram", response_model=DiagramResponse)
async def generate_diagram(req: DiagramRequest):
    REQUEST_COUNT.inc()
    with LATENCY_HIST.time():
        # placeholder diagram generation
        boxes = [f"[{req.system_name} Component {i}]" for i in range(1,4)]
        diag = " --> ".join(boxes)
        return {"diagram": f"C4_Context: {diag}"}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST) 