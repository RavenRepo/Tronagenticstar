from __future__ import annotations

"""CodeCraft – minimal specialist agent for code linting demo.
This MVP just returns the number of lines in the provided code snippet.
Registers itself with ChiefArchitect on startup.
"""

import asyncio
import logging
import os
from typing import Any, Dict

import httpx
from fastapi import FastAPI, status
from pydantic import BaseModel, Field

logger = logging.getLogger("codecraft")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="CodeCraft Agent", version="0.1.0")

# --------------------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------------------
AGENT_ID = os.getenv("AGENT_ID", "codecraft-01")
CAPABILITIES = ["lint"]
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://orchestrator:8000")

# --------------------------------------------------------------------------------------
# Pydantic models
# --------------------------------------------------------------------------------------
class LintTask(BaseModel):
    code: str = Field(..., description="Source code snippet to lint")


# --------------------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------------------
@app.get("/healthz", status_code=status.HTTP_200_OK)
async def health_check():
    return {"status": "healthy"}


@app.post("/task")
async def handle_task(payload: Dict[str, Any]):
    """Handle incoming task request from ChiefArchitect.
    Expects {"code": "..."}. Returns diagnostics.
    """
    try:
        task = LintTask.model_validate(payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Invalid task payload: %s", exc)
        return {"error": "invalid_payload", "detail": str(exc)}

    # Very naive linting: count lines and empty lines
    lines = task.code.split("\n")
    non_empty = [l for l in lines if l.strip()]
    diagnostics = {
        "total_lines": len(lines),
        "non_empty_lines": len(non_empty),
        "empty_lines": len(lines) - len(non_empty),
    }

    return {"agent_id": AGENT_ID, "diagnostics": diagnostics}


# --------------------------------------------------------------------------------------
# Registration with ChiefArchitect
# --------------------------------------------------------------------------------------
async def _register_with_orchestrator():
    payload = {
        "agent_id": AGENT_ID,
        "capabilities": CAPABILITIES,
        "endpoint": os.getenv("PUBLIC_ENDPOINT", f"http://{AGENT_ID}:8000"),
        "avg_response_time": 0.05,
        "current_load": 0,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(f"{ORCHESTRATOR_URL}/register", json=payload)
            resp.raise_for_status()
            logger.info("Registered with orchestrator as %s", AGENT_ID)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to register with orchestrator: %s", exc)


@app.on_event("startup")
async def startup_event():
    # fire and forget registration after slight delay to let network settle
    asyncio.create_task(_register_with_orchestrator()) 