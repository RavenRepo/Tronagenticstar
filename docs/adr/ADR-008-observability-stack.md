# ADR-008: Observability & Telemetry Stack

Status: Proposed  
Date: 2025-06-14

## Context
Agents must be monitored for latency, error rate, and quality metrics. techstack1.md recommends Prometheus/Grafana, ELK, and Jaeger; Diagram1 outlines metrics reportage via `MemoryBankUpdater`.

## Decision
• **Metrics** – Prometheus scraper + custom `/metrics` endpoint per agent; dashboards in Grafana.  
• **Logging** – Loki (Grafana) preferred over Logstash for lighter ops; structured JSON logs with trace IDs.  
• **Tracing** – OpenTelemetry SDK in all TypeScript & Python packages; exporter to Jaeger.  
• **Agent KPIs** – additional Prometheus counters: `agent_messages_processed`, `agent_latency_seconds`, `soc2_violations_total`, `quality_score`.

Default helm chart deploys all three services; local dev runs via Docker Compose.

## Consequences
• Adds ~50 MB container footprint to local stack.  
• Enables data-driven load-balancer tuning (ADR-005).  
• Provides SOC-2 auditors with immutable logs.

## Alternatives Considered
• Datadog SaaS – simpler but violates on-prem privacy promise.  
• ELK full-stack – heavier storage, no native metrics. 