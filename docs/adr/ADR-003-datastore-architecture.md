# ADR-003: Hybrid Datastore – Qdrant + Neo4j + Redis JSON

Status: Proposed  
Date: 2025-06-14

## Context
Agents require fast semantic recall (vector search), graph traversal for relationships, and millisecond latency for live state. techstack1.md outlines Qdrant, Neo4j, and Redis Stack as top choices.

## Decision
1. **Qdrant** – primary vector store for embeddings & similarity queries.  
2. **Neo4j AuraDS** – cloud graph DB for agent relations & pattern analytics.  
3. **Redis (JSON + Search)** – volatile session/state cache powering LangGraph nodes.

Data flow: actions logged → Redis queue → nightly ETL → Qdrant + Neo4j. Critical session data replicated every 5 s for durability.

## Consequences
• Ops overhead of three services, mitigated by managed offerings (Qdrant Cloud, AuraDS, Redis Cloud).  
• Complex ETL layer needed (to implement in MVP).  
• Provides optimal query times (<20 ms vector, <10 ms graph hop).

## Alternatives Considered
• Use Weaviate (vector+graph) alone – simpler but slower graph algorithms.  
• Milvus + TigerGraph – higher perf but heavier ops burden. 