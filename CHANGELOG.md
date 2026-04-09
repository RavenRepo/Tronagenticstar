# Changelog

All notable changes to this project will be documented in this file following [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Bento Grid Dashboard** with swarm topology visualization, live execution stream, and enhanced UI animations.
- **Security Dashboard Section** with findings, agents, overview, and compliance tabs.
- **New Dashboard Pages** with detailed test reporting capabilities.
- **Shared LLM Provider Package** (`@agentforge/llm-provider`) for unified AI model access.
- **Performance Testing Framework** for benchmarking and load testing.
- **Modern Documentation Website** built with Docusaurus.
- **Agent Panel UI (G5)** and Code Generation Commands Plan (G6).
- **@agentforge/eslint-plugin** for enforcing agent development best practices.
- **Specialist Micro-services**: CodeCraft, DesignForge, SecuriShield, and PerfPulse with Docker support and health metrics.
- **Embedding Client** and rerank functionality to RetrieverClient.

### Changed
- Comprehensive theme system refactor for improved UI consistency.
- Enhanced agent communication and routing capabilities.
- Updated API gateway and retriever tests.
- Project cleanup: removed node_modules, cache files, added cleanup script.

### Fixed
- Removed deprecated ChatPanel_new.ts component.

### Security
- **Bearer Authentication** added to orchestrator and agents.
- **Context-aware Routing** with multi-agent discovery.
- API thin endpoints for secure agent communication.
- **Hardened Gateway Config**: Removed hardcoded JWT fallback and dev API keys (now mandatory env vars).
- **Strengthened .gitignore**: Added defense-in-depth patterns for secrets, certs, backups, audit reports.
- **Sanitized Audit Report**: Redacted local system paths from security audit.
- **Updated .env.example**: Documented mandatory API_KEYS configuration.

---

## [0.2.1] – 2025-07-16
### Added
- Prometheus counters / histograms and `/metrics` endpoint in GPU Embedding Service.
### Changed
- `docker-compose.dev.yml`: embedding service now published on host port 8002 (container 8000).
### Fixed
- Health check confusion due to port collision with orchestrator.

---

## [0.2.0] – 2025-07-13
### Added
- **GPU Embedding Service** (`services/embedding`) with CUDA, Prometheus metrics, `/embed` endpoint.
- **Hybrid Relationship Retrieval**: Neo4j relationship indexing and `/related` endpoint in Retriever.
- **TypeScript SDK** `retrieveRelated` helper and test suites (Vitest).
- **Python Tests** `pytest/test_relationship.py` using stubs.
- **Grafana Dashboards** for Retriever, Embedding, Neo4j, and Error overview.

### Changed
- Retriever now calls remote embedding service with local fallback.
- Docker images rebuilt; added `numpy` dependency and fixed `convert_to_numpy` helper.

### Fixed
- Resolved build failures in docker-compose due to missing dependencies.

### Security
- Prometheus scrape configs updated to cover new services.

---

## [0.1.0] – 2025-06-29
Initial public repository import with orchestrator service, ErrorGold SDK, fundamental framework docs. 
