"""Weighted Response-Time Load Balancer.
Selects an agent by minimising avg_response_time * (1 + current_load).
"""
from __future__ import annotations

from typing import List, Optional

from agent_registry import AgentRecord


class WeightedResponseTimeLB:
    """Deterministic selection based on response time & load."""

    @staticmethod
    def select(agents: List[AgentRecord]) -> Optional[AgentRecord]:
        if not agents:
            return None
        return min(agents, key=lambda r: r.avg_response_time * (1 + r.current_load)) 