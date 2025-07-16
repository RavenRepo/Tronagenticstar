# ADR-001: Framework Selection – LangGraph Primary, LangChain Secondary

Status: Proposed  
Date: 2025-06-14

## Context
Multiple framework options (LangGraph, LangChain, custom FSM) exist for orchestrating multi-agent workflows. LangGraph offers built-in state management, cyclical DAG support and first-class LangChain compatibility.

## Decision
Adopt **LangGraph** as the primary orchestration framework and use **LangChain** only inside individual agent implementations where its tool integrations or prompt helpers add value.

## Consequences
1. Orchestrator prototypes will depend on LangGraph >=0.5.0.  
2. Agent code may import LangChain tool wrappers but must not implement new orchestration outside LangGraph.  
3. Build scripts will bundle both libraries; size impact acceptable (~1 MB).  
4. If LangGraph project stalls, fallback is to re-implement orchestration on top of plain async DAG engine; risk accepted.

## Alternatives Considered
*LangChain only* – lacks robust cyclical state support.  
*Apache Airflow / Temporal* – heavyweight, not optimized for LLM latency patterns. 