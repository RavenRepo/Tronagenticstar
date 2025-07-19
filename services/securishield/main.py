from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response
from typing import List

app = FastAPI()

SCAN_COUNT = Counter("securishield_scans_total", "Total security scans")
SCAN_LATENCY = Histogram("securishield_scan_seconds", "Scan latency seconds")

class SecurityScanRequest(BaseModel):
    target: str

class Vulnerability(BaseModel):
    id: str
    severity: str
    description: str

class SecurityScanResponse(BaseModel):
    target: str
    vulnerabilities: List[Vulnerability]

@app.post("/scan", response_model=SecurityScanResponse)
async def security_scan(req: SecurityScanRequest):
    SCAN_COUNT.inc()
    with SCAN_LATENCY.time():
        # placeholder CVE scan
        vulns = [
            Vulnerability(
                id="CVE-2024-0001",
                severity="LOW",
                description="Mock vulnerability for testing"
            )
        ]
        return SecurityScanResponse(
            target=req.target,
            vulnerabilities=vulns
        )

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/metrics")
async def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST) 