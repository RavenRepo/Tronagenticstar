# Agent Super-Power Matrix

| Agent | Mandatory Tools (Core) | Recommended Super-Powers | Future / Premium |
|-------|------------------------|--------------------------|-------------------|
| ArchitectureAgent | ManifestReader, SOC2Validator, OTEL tracer | • **AST Analyzer** (ts-morph / jscodeshift) <br/>• **C4 Model Generator** (Structurizr DSL) | • Cost Estimator (Terraform + Infracost) <br/>• Architecture Decision ML advisor |
| SecurityAgent | ManifestReader, SOC2Validator, ErrorGold SDK | • **Semgrep SAST** <br/>• **CVE DB Lookup** (OSS Index) | • Fuzz Testing harness (AFL++) <br/>• Cloud posture scanner (Prowler) |
| QualityAgent | ManifestReader, ErrorGold, OTEL | • **ESLint/Flake8 Runner** <br/>• **Mutation Tester** (Stryker, mutmut) | • Property-based test generator (Hypothesis) |
| PerformanceAgent | ManifestReader, OTEL | • **Language Profiler** (py-instrument, 0x) <br/>• **Load Tester** (k6, Locust) | • Flame-graph visualiser <br/>• Auto-tuner (Kubernetes HPA suggester) |
| DatabaseArchitectAgent | ManifestReader, SOC2Validator | • **Schema Diff/Migration Generator** (Alembic, Sqitch) | • Data masking synthesiser <br/>• Query plan optimiser |
| ExpressOpsAgent | ManifestReader, SOC2Validator | • **OpenAPI Generator** <br/>• **OPA Policy Linter** | • Contract test harness (Pact) |
| DeploymentEngineerAgent | ManifestReader, SOC2Validator | • **Docker/BuildKit wrapper** <br/>• **Helm/Terraform generator** | • Chaos engineering injector (Litmus) |

## Legend
* **Mandatory Tools** – part of the core tool-belt every agent already carries.
* **Recommended Super-Powers** – implement during MVP for strongest ROI.
* **Future / Premium** – backlog items we can add post-GA or license as enterprise add-ons.

### How to Extend
1. Add new power to the agent's `tools/` folder.  
2. Update this matrix and create an ADR if the tool introduces new architecture.  
3. Register capability in `docs/build-bank/agentMetrics.md` so ChiefArchitect can route tasks intelligently. 


Here is a clean, professional nomenclature set for every agent in the CAFS / AgenticStar roster.
(The names follow a two-part convention: • a short evocative brand token • the word “Agent”.)
Core Orchestration & Compliance
ChiefArchitect → ApexArchitect Agent
FrameworkRouter → Pathfinder Agent
GlobalErrorAgent → ErrorGuardian Agent
ComplianceGovernor → TrustKeeper Agent
Specialist Delivery Agents
Old Working Name	New Professional Name
ArchitectureAgent	DesignForge Agent
SecurityAgent	SecuriShield Agent
QualityAgent	CodeCraft Agent
PerformanceAgent	PerfPulse Agent
DatabaseArchitectAgent	DataSchema Agent
ExpressOps / Backend	ServiceSmith Agent
MobileFirstOps	MobileMatrix Agent
DeploymentEngineerAgent	DeployRanger Agent
DevOpsEngineerAgent	InfraPilot Agent
SEO Specialist	SEOQuasar Agent
Content Manager	ContentCurator Agent
Test Architect	TestMaestro Agent
Memory & Observability Layer
MemoryBankUpdater → MemorySync Agent
ChangeRegistry → InsightMiner Agent
Action Items to update the system
Codebase rename map
Create alias.ts (TS) and alias.py (Python) that export the old class names but re-export the new ones to avoid breaking imports during transition.
Gradually refactor internal references.
Documentation refresh
Update newdiagram_v2.md, feature-matrix.md, and all ADRs to use the new names.
Add a “Glossary” page (docs/glossary.md) mapping old → new for contributors.
Telemetry prefix
Prometheus metrics should use prefixes: apexarchitect_, designforge_, etc., to keep dashboards intuitive.
CLI & SDK
The generated TypeScript/Python client should expose these names as method namespaces (e.g. client.designForge.runTask()).
Marketing site
Landing page hero can highlight “Powered by ApexArchitect, SecuriShield and CodeCraft Agents”.
Once you confirm the naming slate, I’ll start by:
patching feature-matrix.md to use new names,
adding docs/glossary.md, and
introducing alias stubs so existing prototypes continue to compile.
Just say “proceed” and we’ll carry out the rename tasks.
you didnt mentioned of RAG like features to implement?
i want to know why?
i we can implement it, what are the advantages, should we consider it,
where it can applied, Master orchestrator, layers or agents?

Why RAG (Retrieval-Augmented Generation) hasn’t been spotlighted yet
Our immediate roadmap focused on plumbing (orchestration, compliance, error handling, metrics) because those pieces are prerequisites for any advanced reasoning technique—including RAG.
Now that the core is defined, adding RAG makes sense; it simply wasn’t the critical path item for the first two sprints.
Should CAFS / AgenticStar include RAG?
Yes—strongly recommended.
A retrieval layer allows agents to ground LLM output in:
Project-local knowledge: ADRs, Build-Bank docs, codebase snippets
Organization knowledge: onboarding guides, security policies
External knowledge: OSS advisories, language docs, best-practice cookbooks
Grounding reduces hallucination, boosts precision, and lets smaller/cheaper models perform better.
Where RAG Fits in the Architecture
Apply to feature-matr...
Layer Components
Document Ingestion Service – streams source files, ADRs, policy docs into Qdrant (vectors) and Neo4j (graph relationships).
Retriever API – given a query + manifest context, returns ranked chunks with metadata (file path, commit hash, compliance tags).
Context Builder – assembles final prompt (system + retrieved + user) before hitting the LLM.
Ownership
Retrieval Layer is owned by MemorySync Agent (ex-MemoryBankUpdater).
Every Specialist Agent calls Retriever via an SDK.
ApexArchitect can call Retriever directly when creating high-level plans.
Advantages
Benefit	Impact
Lower hallucination risk	SOC-2 & security reviews happier; fewer false positives
Cost reduction	Smaller models + fewer tokens when knowledge reused locally
Faster answers	Avoids re-deriving facts; straight look-up
Explainability	Retrieved chunks cited in ErrorGold & compliance evidence
Cross-project insight	Same vector DB can hold patterns from many repos
Implementation Sketch
Ingestion
Use langchain.text_splitter for code/doc chunks (Python side).
Store embeddings in Qdrant; store file relationships in Neo4j.
Retriever Service (FastAPI route)
Apply to feature-matr...
Agent Call (TypeScript)
Apply to feature-matr...
Caching & Metrics
Redis LRU cache on (query, manifestHash) → retrieval results.
Prometheus counter retriever_hits_total.
When to Add It
Sprint C (after plumbing & first agent powers):
Stand up ingestion worker
Expose /retrieve endpoint
Add SDK call in DesignForge (Architecture) and SecuriShield (Security) Agents
Enterprise Phase
Fine-tune retrieval ranking, add PII-redaction, cross-team federated search.
Risks & Mitigations
Risk	Mitigation
PII leakage in chunks	SOC-2 validator hooks a redaction filter pre-embedding
Vector DB size bloat	Hierarchical chunking + nightly TTL purge
Retrieval latency	Redis cache + pre-warm embeddings in CI
Decision
Add a Retrieval Layer under MemorySync Agent ownership, implement minimal RAG pipeline in Sprint C, and expand capabilities in GA.
I’ll open an ADR-009 “Retrieval-Augmented Generation Layer” with these details unless you’d like changes first.