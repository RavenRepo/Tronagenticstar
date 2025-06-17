# 🌐 Universal ErrorGold Framework (UEF)

> A technology-agnostic, SOC-2–aligned error-detection, diagnostics & self-healing standard that any runtime, language or CI/CD pipeline can adopt.

---

## 1  Mission & Scope
* Provide **one gold standard** for capturing, classifying, remediating and reporting errors across front-end, back-end, data, mobile and infra stacks.
* Seamlessly integrate with CAFS / AgenticStar multi-agent ecosystem – exposing a consistent **ErrorGold API** every specialised agent can call.
* Ship with adapters for the "big five" ecosystems out-of-box (TypeScript/Node, Python, JVM, PHP/Laravel, Go) yet remain pluggable.

---

## 2  Core Principles
1. **Language-neutral contracts** – JSON-schema based payloads, gRPC / HTTP transport.
2. **Immutable evidence** – every error wrapped with trace-ID, build hash, manifest metadata, SOC-2 log stamp.
3. **Automated triage** – rule engine classifies severity, maps to remediation playbook.
4. **Self-healing first** – where rules allow, framework applies safe fix or auto-rollback.
5. **Observability native** – Prometheus counters + OpenTelemetry span emitted for every lifecycle stage.

---

## 3  High-Level Architecture
```mermaid
flowchart TD
    subgraph Runtime
        APP[Application / Service] --> COLLECT(Error Collector SDK)
    end
    COLLECT --> BUS(Event Bus \nNATS/Kafka)
    BUS --> ER[Error Router]
    ER --> CL[Classifier Engine]
    CL -->|metadata| REG[Remediation Registry]
    REG --> RP[Remediation Provider]
    RP -->|actions| AG[Global Error Agent (LangGraph)]
    AG --> OBS[Prometheus / OTLP]
    AG --> LOG[Loki / Elastic]
```

---

## 4  Component Details
### 4.1  Error Collector SDK
* Tiny library (≈5 KB) per language.
* Captures: stack trace, request context, user session (PII hash), build metadata, manifest tags (`@role`, `@auth`).
* Transports to Event Bus with back-pressure & local disk fallback.

### 4.2  Error Router
* Stateless service (Go/NATS) that shards events by service-id.
* Enforces rate-limits to avoid log storms.

### 4.3  Classifier Engine
* Rules: Regex on stack, static-analysis fingerprints, ML embedding similarity.
* Labels: `CONFIG_ERROR`, `SECURITY`, `PERF_REGRESSION`, `DB_DEADLOCK`, `UNKNOWN`.

### 4.4  Remediation Registry
* YAML playbooks indexed by label + language.
* Example entry:
```yaml
label: CONFIG_ERROR
language: python
playbook:
  - title: "Validate .env keys"
    command: "python scripts/validate_env.py"
  - title: "Suggest default values"
    agent_task: "ARCHITECTURE:ENV_REMEDIATION"
```

### 4.5  Remediation Provider
* Executes safe commands (ShellGuard sandbox) **or** forwards task to CAFS agent mesh.
* Emits `remediation_attempt`, `remediation_success` or `manual_intervention_required` events.

### 4.6  Global Error Agent
* LangGraph node subscribed to `error_events` & `remediation_events`.
* Generates human-readable incident report and posts to Slack / PagerDuty.
* Updates Build-Bank `troubleshooting.md` with new learnings.

---

## 5  Language Adapter Matrix (v1)
| Runtime | Package Name | Transport | Status |
|---------|--------------|-----------|--------|
| Node/TS | `@errorgold/node` | NATS JetStream | Alpha |
| Python  | `errorgold-py`   | NATS | Alpha |
| JVM (Java/Kotlin) | `io.errorgold:java` | Kafka | Planned |
| PHP (Laravel) | `laravel-errorgold` | Redis Streams | Planned |
| Go | `github.com/errorgold/go` | NATS | Planned |

---

## 6  Integrating with CAFS
1. **ChiefArchitect** registers `GlobalErrorAgent` on startup.
2. Manifest tag `@errorPolicy: ignore|warn|auto-fix|required` influences remediation stage.
3. Prometheus counters (`errorgold_errors_total`, `errorgold_autohealed_total`) feed into CAFS observability dashboard.

---

## 7  Security & Compliance
* All payloads signed with service token (JWT) to prevent spoofing.
* Sensitive fields hashed (SHA-256 + salt) before transport.
* Logs retained 30 days by default; configurable for GDPR.
* Auditor API exports JSON evidence bundle.

---

## 8  Operational Run-Book
1. Deploy Event Bus & Router (Helm chart).  
2. Install SDK in each service (`npm i @errorgold/node`).  
3. Define playbooks in `/ops/errorgold/registry/*.yaml`.  
4. Expose Grafana dashboard `errorgold-overview.json`.  
5. Test with `ERRORGOLD_TEST=true node app.js`.

---

## 9  Roadmap
* ML-based root-cause analysis (embedding clustering).  
* VS-Code extension to surface ErrorGold insights inline.  
* Terraform provider for one-command cloud deploy.  
* Community playbook marketplace.

---

## 10  License & Governance
* Core spec under MIT.  
* Enterprise Remediation Registry under commercial license.

---

**Contact:** <security@agenticstar.io> / Slack #errorgold 