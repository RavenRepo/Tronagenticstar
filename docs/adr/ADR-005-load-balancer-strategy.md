# ADR-005: Agent Load-Balancing Strategy

Status: Proposed  
Date: 2025-06-14

## Context
Diagram1 specifies a `FrameworkRouter` with `LoadBalancer`. We need a first-cut strategy for MVP.

## Decision
Implement **Weighted Response-Time + Capacity** algorithm:
```
score = (avg_response_time_ms * current_load_factor)
route_to_agent = min(score)
```
Weights stored in Redis and updated every 30 s by Health-Monitor agent.

## Consequences
• Better than naïve round-robin under uneven workloads.  
• Requires each agent to report `avg_response_time` and `current_load`.  
• Adds minor network chatter (update heartbeat).

## Alternatives Considered
*Round-robin* – trivial but ignores slow agents.  
*ML-based prediction* – future work once telemetry dataset grows. 