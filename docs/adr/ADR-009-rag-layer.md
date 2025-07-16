# ADR-009: Retrieval-Augmented Generation (RAG) Layer

Status: Proposed  
Date: 2025-06-14

## Context
While existing agents reason over tasks, they currently rely on prompt context only. Grounding LLMs in project-specific knowledge (code, ADRs, security policies) reduces hallucination, improves compliance traceability, and lowers token cost. Docs and discussion indicate Qdrant+Neo4j hybrid store is already planned (ADR-003), but no explicit RAG contract exists.

## Decision
1. **Ingestion Worker** – MemorySync Agent runs a background job that chunk-splits files & docs, creates embeddings via `OpenAI ada-002` (configurable), stores in **Qdrant**; file-relationship metadata stored in **Neo4j**.
2. **Retriever Service** – FastAPI route `/retrieve` accepting `{text, manifestHash, filters}` returns ranked chunks (vector score + graph boost).
3. **Context Builder SDK** – common helper for agents to inject retrieved snippets into LLM prompt with citations.
4. **Caching** – Redis LRU cache keyed by SHA256(query+manifestHash) with 15-min TTL.
5. **Metrics** – Prometheus counters: `rag_requests_total`, `rag_latency_seconds`.

## Consequences
• Adds ~60 MB embedding storage per 10k chunks; weekly clean-up job needed.  
• Slight latency (10–40 ms) per retrieval, mitigated by cache.  
• Requires redaction filter to strip PII before embedding for SOC-2 alignment.

## Alternatives Considered
*Prompt-stuffing only* – fast but prone to hallucination & high token cost.  
*External SaaS search* – leaks proprietary code. 