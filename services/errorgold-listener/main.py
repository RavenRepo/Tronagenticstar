"""ErrorGold Listener – consumes error events from NATS and pushes to Loki; exposes Prometheus metrics.
"""
import asyncio
import json
import os
import time
from typing import Any

import requests
from nats.aio.client import Client as NATS  # type: ignore
from prometheus_client import Counter, start_http_server

NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")
SUBJECT = os.getenv("ERRORGOLD_SUBJECT", "errorgold.events")
LOKI_URL = os.getenv("LOKI_URL", "http://loki:3100/loki/api/v1/push")
PROM_PORT = int(os.getenv("METRICS_PORT", "8002"))

error_counter = Counter("errorgold_events_total", "Total ErrorGold events consumed")


def push_to_loki(event: dict[str, Any]):
    ts_nano = str(int(time.time() * 1e9))
    payload = {
        "streams": [
            {
                "labels": "{source=\"errorgold\"}",
                "entries": [
                    {"ts": ts_nano, "line": json.dumps(event)}
                ],
            }
        ]
    }
    try:
        requests.post(LOKI_URL, json=payload, timeout=3)
    except Exception:
        # best-effort; avoid crash
        pass


async def main() -> None:
    start_http_server(PROM_PORT)
    nc = NATS()
    await nc.connect(servers=[NATS_URL])

    async def handler(msg):
        data = msg.data.decode()
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            event = {"raw": data}
        error_counter.inc()
        push_to_loki(event)

    await nc.subscribe(SUBJECT, cb=handler)
    print("ErrorGold listener running – subscribed to", SUBJECT)
    # Keep process alive
    while True:
        await asyncio.sleep(3600)


if __name__ == "__main__":
    asyncio.run(main()) 