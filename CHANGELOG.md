# Changelog

All notable changes to this project will be documented in this file following [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

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