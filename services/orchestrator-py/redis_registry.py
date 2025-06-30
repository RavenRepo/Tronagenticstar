"""Redis-backed Agent Registry.
Keys:
  agent:{id} -> hash{capabilities,json endpoint, avg_rt, load, last_heartbeat}
  agents:set -> set of agent ids
"""
from __future__ import annotations

import json
import time
from typing import List, Optional

import redis

from agent_registry import AgentRecord, HEARTBEAT_TTL


class RedisAgentRegistry:
    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        self._r = redis.Redis.from_url(redis_url, decode_responses=True)

    # ------------------------------------------------------------------
    def _key(self, agent_id: str) -> str:
        return f"agent:{agent_id}"

    def register(self, record: AgentRecord) -> None:
        self._r.sadd("agents:set", record.agent_id)
        self._r.hset(
            self._key(record.agent_id),
            mapping={
                "capabilities": json.dumps(record.capabilities),
                "endpoint": record.endpoint,
                "avg_response_time": record.avg_response_time,
                "current_load": record.current_load,
                "last_heartbeat": record.last_heartbeat,
            },
        )

    def deregister(self, agent_id: str) -> None:
        self._r.srem("agents:set", agent_id)
        self._r.delete(self._key(agent_id))

    # Heartbeat update
    def heartbeat(self, agent_id: str, *, avg_rt: float | None = None, load: int | None = None):
        if not self._r.sismember("agents:set", agent_id):
            return
        mapping = {"last_heartbeat": time.time()}
        if avg_rt is not None:
            mapping["avg_response_time"] = avg_rt
        if load is not None:
            mapping["current_load"] = load
        self._r.hset(self._key(agent_id), mapping=mapping)

    # ----------------------------- helpers -----------------------------
    def _hydrate(self, agent_id: str) -> Optional[AgentRecord]:
        data = self._r.hgetall(self._key(agent_id))
        if not data:
            return None
        rec = AgentRecord(
            agent_id=agent_id,
            capabilities=json.loads(data.get("capabilities", "[]")),
            endpoint=data["endpoint"],
            avg_response_time=float(data.get("avg_response_time", 0)),
            current_load=int(data.get("current_load", 0)),
            last_heartbeat=float(data.get("last_heartbeat", time.time())),
        )
        return rec

    def list_alive(self) -> List[AgentRecord]:
        now = time.time()
        alive = []
        for agent_id in self._r.smembers("agents:set"):
            rec = self._hydrate(agent_id)
            if rec and now - rec.last_heartbeat < HEARTBEAT_TTL:
                alive.append(rec)
        return alive

    def get_by_capability(self, capability: str) -> List[AgentRecord]:
        return [r for r in self.list_alive() if capability in r.capabilities] 