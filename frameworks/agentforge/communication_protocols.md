# Communication Protocols

This document standardises **inter-agent messaging** and external API contracts.

## Message Format (JSONSchema)
```jsonc
{
  "$id": "https://agentforge.io/schemas/agent_message.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": [
    "id", "sender_id", "recipient_id", "task_type", "payload", "timestamp"
  ],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "sender_id": { "type": "string" },
    "recipient_id": { "type": "string" },
    "task_type": { "type": "string" },
    "payload": { "type": "object", "additionalProperties": true },
    "priority": { "type": "integer", "minimum": 1, "maximum": 10, "default": 5 },
    "timestamp": { "type": "string", "format": "date-time" },
    "correlation_id": { "type": "string" },
    "reply_to": { "type": "string" },
    "ttl": { "type": "integer", "description": "seconds" }
  }
}
```

## Transport Layers
| Layer | Use-Case | Technology |
|-------|----------|------------|
| gRPC | Command + control, low-latency | HTTP/2, protobuf-generated stubs |
| NATS JetStream | Pub/Sub events, workflow triggers | NATS transport |
| WebSockets | Real-time UI updates | NestJS gateway |

## Protocol Patterns
1. **Request–Response** – blocking RPC over gRPC with 30s default timeout.
2. **Publish–Subscribe** – fire-and-forget events with JetStream persistence (max 7-day retention).
3. **Workflow Orchestration** – multi-step correlation using `workflow_id` & `step_id` in headers.

## Security
* All transports enforce **mTLS** (service mesh) and **JWT** claims validation.
* Sensitive payloads may be symmetrically encrypted with agent-specific Fernet keys.

## Versioning Strategy
* `major.minor.patch` in message header `x-protocol-version`.
* Backwards compatibility must be maintained within a major line.

---
*Owner*: Engineering Lead – update when protocol or broker changes. 