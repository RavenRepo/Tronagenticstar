# ADR-006: Built-in SOC 2 Compliance Layer

Status: Proposed  
Date: 2025-06-14

## Context
Enterprise adopters require evidence that all generated code and runtime behaviours meet SOC 2 Trust Service Criteria (Security, Availability, Processing Integrity, Confidentiality, Privacy). `Docs2/soc2compliance.md` and `egsoc2complinace.md` define validator and policy-enforcer classes to embed in the agent pipeline.

## Decision
1. **SOC2ComplianceValidator** library is included in `packages/compliance/` and imported by every agent before emitting code.  
2. **SOC2PolicyEnforcer** runs as a LangGraph node that post-processes agent output and blocks merge if violations exist.  
3. Continuous evidence collection: audit logs, agent action traces and infrastructure scan results streamed to a `compliance_events` topic and exported for auditors.
4. Default project template ships with ready-made controls: rate-limiting, input validation, encryption helpers, audit tables, immutable logging.

## Consequences
• Slight latency increase (~100 ms) for validator pass per task.  
• Requires dependency on `zod`, `celebrate`, security-header libs.  
• Generates SOC 2 evidence artifacts automatically (ZIP export).  
• Developers can override severity levels via `soc2.config.json`, but cannot disable validator in production build.

## Alternatives Considered
*External manual audit* – low eng effort but non-blocking defects slip through.  
*Vendor SaaS scanner* – faster but may send proprietary code off-prem (breaks privacy promise). 