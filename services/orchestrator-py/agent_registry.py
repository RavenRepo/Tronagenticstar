"""In-memory agent registry (MVP).
Will migrate to Redis in a later sprint.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

HEARTBEAT_TTL = 30  # seconds


@dataclass
class AgentRecord:
    agent_id: str
    capabilities: List[str]
    endpoint: str  # Base URL of the agent's HTTP/gRPC endpoint
    last_heartbeat: float = field(default_factory=lambda: time.time())
    avg_response_time: float = 0.0
    current_load: int = 0

    def is_alive(self) -> bool:
        return time.time() - self.last_heartbeat < HEARTBEAT_TTL


class AgentRegistry:
    """Runtime registry responsible for dynamic agent discovery and health tracking."""

    def __init__(self) -> None:
        self._agents: Dict[str, AgentRecord] = {}

    # ---------------------------------------------------------------------
    # CRUD operations
    # ---------------------------------------------------------------------
    def register(self, record: AgentRecord) -> None:
        self._agents[record.agent_id] = record

    def deregister(self, agent_id: str) -> None:
        self._agents.pop(agent_id, None)

    def heartbeat(self, agent_id: str, *, avg_rt: float | None = None, load: int | None = None) -> None:
        if agent_id not in self._agents:
            return
        rec = self._agents[agent_id]
        rec.last_heartbeat = time.time()
        if avg_rt is not None:
            rec.avg_response_time = avg_rt
        if load is not None:
            rec.current_load = load

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------
    def list_alive(self) -> List[AgentRecord]:
        return [r for r in self._agents.values() if r.is_alive()]

    def get_by_capability(self, capability: str) -> List[AgentRecord]:
        return [r for r in self.list_alive() if capability in r.capabilities]

    def select_lowest_latency(self, capability: str) -> Optional[AgentRecord]:
        candidates = self.get_by_capability(capability)
        if not candidates:
            return None
        # Weighted response-time * load factor
        return min(candidates, key=lambda r: r.avg_response_time * (1 + r.current_load)) 