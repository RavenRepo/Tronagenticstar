"""ErrorGold publisher for orchestrator

Usage::
    await publish_error(exc, context)
"""
import asyncio
import json
import os
from typing import Any

from nats.aio.client import Client as NATS  # type: ignore

_NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")
_SUBJECT = os.getenv("ERRORGOLD_SUBJECT", "errorgold.events")

_nc: NATS | None = None
_lock = asyncio.Lock()


async def _get_nc() -> NATS:
    global _nc
    async with _lock:  # one connect at a time
        if _nc is None or _nc.is_closed:
            _nc = NATS()
            await _nc.connect(servers=[_NATS_URL])
    return _nc


async def publish_error(error: Exception, context: dict[str, Any] | None = None) -> None:
    """Publish an error event to NATS JetStream."""
    payload = {
        "message": str(error),
        "stack": getattr(error, "__traceback__", None),
        "context": context or {},
    }
    nc = await _get_nc()
    await nc.publish(_SUBJECT, json.dumps(payload).encode()) 