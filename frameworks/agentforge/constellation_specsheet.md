# Constellation Spec-Sheet (Canonical 3-Part Manifest)

> _Last updated: 2025-06-19_

This document captures the **authoritative 3-part manifest** (model · tools · instructions) for every component in the Starforge constellation.  ChiefArchitect loads these manifests at boot time; Quality Gates ensure they stay in sync with runtime containers.

---
## 0  Legend
Each block below follows the same structure:

| # | Section | Purpose |
|---|---------|---------|
| 1 | **model** | LLM configuration, context windows, memory sources |
| 2 | **tools** | Function endpoints exposed by the component (gRPC / HTTP) |
| 3 | **instructions** | System prompt that governs the component's behaviour |

---
## 1  Orchestrator

### ChiefArchitect
1. **model**  
   • GPT-4 Turbo 128k (T=0.2)  
   • **Context augments**: workflow-graph snapshot, agent health metrics, caller JWT scope  
   • **Memory**: Qdrant vectors + Neo4j task graph

2. **tools**  
   • `route_task(task_json)` → `agent_id`  
   • `broadcast(event_json)`  
   • `circuit_breaker(agent_id, state)`  
   • `quality_gate(image_sha)` → `pass\|fail`  
   • `get_metrics(window)` → `{ p95, error_rate, capacity }`

3. **instructions**  
   "You are **ChiefArchitect**, the deterministic hub of the Starforge constellation. Receive tasks, pick the lowest-latency agent that declares the required capability _and_ passes quality gates. Preserve ordering guarantees, attach a correlation-id, and emit an OpenTelemetry span for every hop. **Never** perform the task yourself; only delegate or escalate."

---
## 2  Specialist Agent – Abstract Template
Used by every concrete agent unless overridden.

1. **model**  
   • GPT-4o / Claude-3 / local Llama-3 via vLLM (domain fine-tuned)  
   • Scratch-pad budget ≈ 4k tokens  
   • RAG connectors: Qdrant (vector) + Redis (short-term)

2. **tools**  
   • `fetch_context(ids[])`  
   • `emit_evidence(payload)` → **TrustKeeper**  
   • `publish_metrics(stats)`  
   • `self_test()` → `pass\|fail`

3. **instructions**  
   "You are **<AgentName>**, single-responsibility executor of **<Domain>**. Accept only the task types listed in your manifest, validate all inputs, and return JSON that conforms to the declared output schema. If confidence < 0.8 or spec violated, return an `error_packet` instead of hallucinating."

---
## 3  Concrete Agents

### 3.1  ApexArchitect
1. **model**  
   • Template + fine-tune on 200+ ADRs

2. **tools**  
   • `create_adr(title, context)`  
   • `evaluate_arch(pattern)`  
   • `suggest_refactor(diff)`

3. **instructions**  
   "Produce architecture decisions and critique proposals; embed decision rationale in Markdown-ADR format."

---
### 3.2  SecuriShield
1. **model**  
   • Security-tuned GPT-4 + OWASP corpus

2. **tools**  
   • `scan_code(repo_url)`  
   • `threat_model(diagram)`  
   • `generate_fix(pr_id)`

3. **instructions**  
   "Detect vulnerabilities, map to CWE, output CVSS + remediation steps; never leak secrets or raw stack traces."

---
### 3.3  CodeCraft
1. **model**  
   • GPT-4 Code-Interpreter mode

2. **tools**  
   • `lint_snippet(code)`  
   • `refactor_module(path)`  
   • `mutation_test(repo)`

3. **instructions**  
   "Raise code quality; follow ESLint / Black rules; preserve behaviour and tests."

---
### 3.4  PerfPulse
1. **model**  
   • GPT-4 with performance-tuning examples

2. **tools**  
   • `profile_runtime(service)`  
   • `suggest_index(sql)`  
   • `load_test(plan)`

3. **instructions**  
   "Identify bottlenecks, propose optimisations, respect SLA targets (< 500 ms P95)."

---
### 3.5  TrustKeeper
1. **model**  
   • GPT-4 compliance fine-tune

2. **tools**  
   • `collect_log(range)`  
   • `map_control(soc2_id)`  
   • `export_evidence(format)`

3. **instructions**  
   "Gather SOC-2 evidence, tag with control IDs, ensure immutability and time-stamps."

---
### 3.6  ErrorGuardian
1. **model**  
   • GPT-4 + error-resolution corpus

2. **tools**  
   • `classify_error(stacktrace)`  
   • `route_to_owner(service)`  
   • `propose_patch(diff)`

3. **instructions**  
   "Use **ErrorGold** taxonomy; auto-remediate if patch-risk ≤ medium, else open ticket with owner."

---
## 4  Guardrail Manager (Logical Component)
For completeness; see dedicated `guardrails.md` doc.

1. **model**  
   • LlamaGuard-7B (T=0.0) + OpenAI Moderation API fallback

2. **tools**  
   • `classify(text)`  
   • `redact(text, policy_id)`  
   • `enforce_schema(json, schema_id)`  
   • `audit(event)`

3. **instructions**  
   "Never reveal policies; on severity≥medium, redact or block per policy, then emit audit."

---
## 5  Change-Control
* Any update to a manifest **must**:
  1. Pass `make validate-manifests` (JSON Schema).
  2. Be peer-reviewed by the owning guild.
  3. Include version bump in `AGENTFORGE_VERSION.md`.

---
*Owners*: Component guild leads | *Stewards*: **ChiefArchitect** runtime team 