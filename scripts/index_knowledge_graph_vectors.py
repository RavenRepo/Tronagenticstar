#!/usr/bin/env python3
"""
Constella Knowledge Graph → Qdrant Vector Indexer
=================================================
Reads every node and relationship from the Neo4j knowledge graph we just built
and indexes rich, semantically searchable documents into a Qdrant collection.

This gives you natural-language semantic search over the entire project architecture:
  "Which agent handles security scanning?"
  "How does the RAG pipeline work?"
  "What infrastructure does the memory guardian manage?"

Requirements:
  pip install qdrant-client sentence-transformers neo4j

Usage:
  python scripts/index_knowledge_graph_vectors.py

Environment variables (all optional, sane defaults for local dev):
  QDRANT_URL          default http://localhost:6333
  NEO4J_URL           default bolt://localhost:7687
  NEO4J_USER          default neo4j
  NEO4J_PASSWORD      default (empty)
  EMBEDDING_MODEL     default all-MiniLM-L6-v2
  COLLECTION_NAME     default constella_architecture
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Config & Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("kg-indexer")

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
NEO4J_URL = os.getenv("NEO4J_URL", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "constella_architecture")
VECTOR_DIM = 384  # all-MiniLM-L6-v2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _stable_id(text: str) -> str:
    """Deterministic UUID from a string so re-runs are idempotent."""
    return str(uuid.UUID(hashlib.md5(text.encode()).hexdigest()))


def _props_to_str(props: Dict[str, Any], skip: Optional[set] = None) -> str:
    """Flatten a property dict into readable bullet points."""
    skip = skip or set()
    lines: list[str] = []
    for k, v in sorted(props.items()):
        if k in skip or v is None:
            continue
        if isinstance(v, list):
            v = ", ".join(str(x) for x in v)
        lines.append(f"  • {k}: {v}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Document builder – turns graph data into rich text documents
# ---------------------------------------------------------------------------
@dataclass
class ArchDocument:
    """A single searchable document about the Constella architecture."""

    doc_id: str
    title: str
    body: str  # rich natural-language text for embedding
    category: str  # e.g. 'agent', 'infra', 'pattern', ...
    node_id: str  # original Neo4j id property
    labels: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def search_text(self) -> str:
        return f"{self.title}\n{self.body}"


def build_node_documents(records: list[dict]) -> list[ArchDocument]:
    """Convert raw Neo4j node records into rich ArchDocuments."""
    docs: list[ArchDocument] = []

    for rec in records:
        labels: list[str] = rec["labels"]
        props: dict = rec["props"]
        node_id: str = props.get("id", props.get("name", "unknown"))
        name: str = props.get("name", node_id)

        # Determine category from labels
        category = "other"
        for lbl in labels:
            cat_map = {
                "ConstellaProject": "project",
                "AIAgent": "agent",
                "Microservice": "service",
                "CorePackage": "package",
                "InfraComponent": "infrastructure",
                "DataStore": "infrastructure",
                "MonitoringTool": "monitoring",
                "MessageBus": "infrastructure",
                "LLMProvider": "llm_provider",
                "Framework": "framework",
                "DesignPattern": "design_pattern",
                "VSCodeExtension": "interface",
                "CLITool": "tool",
                "DocsSite": "documentation",
                "LandingSite": "frontend",
            }
            if lbl in cat_map:
                category = cat_map[lbl]
                break

        # ── Build a rich natural-language body ──────────────────────
        desc = props.get("description", "")
        body_parts: list[str] = []

        if desc:
            body_parts.append(desc)

        # Agent-specific enrichments
        if "AIAgent" in labels:
            body_parts.append(f"This is an AI agent microservice named {name}.")
            if props.get("language"):
                body_parts.append(
                    f"It is written in {props['language']} using the {props.get('framework', 'unknown')} framework."
                )
            if props.get("port"):
                body_parts.append(f"It runs on port {props['port']}.")
            if props.get("capabilities"):
                caps = props["capabilities"]
                if isinstance(caps, list):
                    caps = ", ".join(caps)
                body_parts.append(f"Capabilities: {caps}.")
            if props.get("task_type"):
                body_parts.append(f"Primary task type: {props['task_type']}.")
            if props.get("agent_type"):
                body_parts.append(f"Agent role: {props['agent_type']}.")
            if props.get("llm_provider"):
                body_parts.append(f"Uses LLM provider: {props['llm_provider']}.")
            if props.get("llm_models"):
                models = props["llm_models"]
                if isinstance(models, list):
                    models = ", ".join(models)
                body_parts.append(f"LLM models used: {models}.")
            if props.get("embedding_model"):
                body_parts.append(f"Embedding model: {props['embedding_model']}.")
            if props.get("reranker_model"):
                body_parts.append(f"Reranker model: {props['reranker_model']}.")
            if props.get("qdrant_collection"):
                body_parts.append(f"Qdrant collection: {props['qdrant_collection']}.")
            if props.get("subsystems"):
                subs = props["subsystems"]
                if isinstance(subs, list):
                    subs = ", ".join(subs)
                body_parts.append(f"Subsystems: {subs}.")
            if props.get("managed_layers"):
                layers = props["managed_layers"]
                if isinstance(layers, list):
                    layers = ", ".join(layers)
                body_parts.append(f"Manages memory layers: {layers}.")
            if props.get("supported_databases"):
                dbs = props["supported_databases"]
                if isinstance(dbs, list):
                    dbs = ", ".join(dbs)
                body_parts.append(f"Supported databases: {dbs}.")
            if props.get("supported_orms"):
                orms = props["supported_orms"]
                if isinstance(orms, list):
                    orms = ", ".join(orms)
                body_parts.append(f"Supported ORM frameworks: {orms}.")
            if props.get("mobile_frameworks"):
                mf = props["mobile_frameworks"]
                if isinstance(mf, list):
                    mf = ", ".join(mf)
                body_parts.append(f"Mobile frameworks: {mf}.")
            if props.get("state_management"):
                sm = props["state_management"]
                if isinstance(sm, list):
                    sm = ", ".join(sm)
                body_parts.append(f"State management libraries: {sm}.")
            if props.get("nats_subject"):
                body_parts.append(f"NATS subject: {props['nats_subject']}.")
            if props.get("trust_categories"):
                tc = props["trust_categories"]
                if isinstance(tc, list):
                    tc = ", ".join(tc)
                body_parts.append(f"SOC-2 trust service categories: {tc}.")
            if props.get("auth_method"):
                body_parts.append(f"Authentication: {props['auth_method']}.")
            if props.get("has_websocket"):
                body_parts.append("Supports WebSocket real-time connections.")
            if props.get("path"):
                body_parts.append(f"Source code path: {props['path']}.")

        # Microservice (gateway) enrichments
        elif "Microservice" in labels:
            body_parts.append(f"This is a microservice named {name}.")
            if props.get("language"):
                body_parts.append(
                    f"Written in {props['language']} with {props.get('framework', 'unknown')}."
                )
            if props.get("features"):
                feats = props["features"]
                if isinstance(feats, list):
                    feats = ", ".join(feats)
                body_parts.append(f"Features: {feats}.")
            if props.get("middleware"):
                mw = props["middleware"]
                if isinstance(mw, list):
                    mw = ", ".join(mw)
                body_parts.append(f"Middleware stack: {mw}.")
            if props.get("port"):
                body_parts.append(f"Runs on port {props['port']}.")
            if props.get("path"):
                body_parts.append(f"Source code path: {props['path']}.")

        # Package enrichments
        elif "CorePackage" in labels:
            body_parts.append(
                f"This is a core TypeScript/Node.js package named {name}."
            )
            if props.get("providers"):
                prov = props["providers"]
                if isinstance(prov, list):
                    prov = ", ".join(prov)
                body_parts.append(f"Supported LLM providers: {prov}.")
            if props.get("key_classes"):
                kc = props["key_classes"]
                if isinstance(kc, list):
                    kc = ", ".join(kc)
                body_parts.append(f"Key classes: {kc}.")
            if props.get("features"):
                feats = props["features"]
                if isinstance(feats, list):
                    feats = ", ".join(feats)
                body_parts.append(f"Features: {feats}.")
            if props.get("fallback_strategies"):
                fs = props["fallback_strategies"]
                if isinstance(fs, list):
                    fs = ", ".join(fs)
                body_parts.append(f"Fallback strategies: {fs}.")
            if props.get("task_types"):
                tt = props["task_types"]
                if isinstance(tt, list):
                    tt = ", ".join(tt)
                body_parts.append(f"Task types: {tt}.")
            if props.get("path"):
                body_parts.append(f"Source code path: {props['path']}.")

        # Infrastructure enrichments
        elif any(
            l in labels
            for l in ["InfraComponent", "DataStore", "MonitoringTool", "MessageBus"]
        ):
            body_parts.append(f"This is an infrastructure component: {name}.")
            if props.get("type"):
                body_parts.append(f"Type: {props['type']}.")
            if props.get("role"):
                body_parts.append(f"Role: {props['role']}.")
            if props.get("image"):
                body_parts.append(f"Docker image: {props['image']}.")
            if props.get("port"):
                body_parts.append(f"Port: {props['port']}.")
            if props.get("ports"):
                ports = props["ports"]
                if isinstance(ports, list):
                    ports = ", ".join(str(p) for p in ports)
                body_parts.append(f"Ports: {ports}.")
            if props.get("collections"):
                cols = props["collections"]
                if isinstance(cols, list):
                    cols = ", ".join(cols)
                body_parts.append(f"Collections: {cols}.")
            if props.get("plugins"):
                plugins = props["plugins"]
                if isinstance(plugins, list):
                    plugins = ", ".join(plugins)
                body_parts.append(f"Plugins: {plugins}.")
            if props.get("datasources"):
                ds = props["datasources"]
                if isinstance(ds, list):
                    ds = ", ".join(ds)
                body_parts.append(f"Data sources: {ds}.")
            if props.get("scrape_targets"):
                st = props["scrape_targets"]
                if isinstance(st, list):
                    st = ", ".join(st)
                body_parts.append(f"Scrape targets: {st}.")
            if props.get("subjects"):
                subj = props["subjects"]
                if isinstance(subj, list):
                    subj = ", ".join(subj)
                body_parts.append(f"Message subjects: {subj}.")
            if props.get("retention"):
                body_parts.append(f"Retention: {props['retention']}.")
            if props.get("used_by"):
                ub = props["used_by"]
                if isinstance(ub, list):
                    ub = ", ".join(ub)
                body_parts.append(f"Used by services: {ub}.")

        # LLM Provider enrichments
        elif "LLMProvider" in labels:
            body_parts.append(f"This is an LLM provider: {name}.")
            if props.get("models"):
                models = props["models"]
                if isinstance(models, list):
                    models = ", ".join(models)
                body_parts.append(f"Models: {models}.")
            if props.get("provider_type"):
                body_parts.append(f"Provider type: {props['provider_type']}.")
            if props.get("priority"):
                body_parts.append(f"Priority in routing: {props['priority']}.")
            if props.get("primary_for"):
                body_parts.append(f"Primary use cases: {props['primary_for']}.")
            if props.get("used_by"):
                ub = props["used_by"]
                if isinstance(ub, list):
                    ub = ", ".join(ub)
                body_parts.append(f"Used by: {ub}.")

        # Framework enrichments
        elif "Framework" in labels:
            body_parts.append(f"This is a framework: {name}.")
            if props.get("core_classes"):
                cc = props["core_classes"]
                if isinstance(cc, list):
                    cc = ", ".join(cc)
                body_parts.append(f"Core classes: {cc}.")
            if props.get("type_systems"):
                ts = props["type_systems"]
                if isinstance(ts, list):
                    ts = ", ".join(ts)
                body_parts.append(f"Type systems: {ts}.")
            if props.get("dependencies"):
                deps = props["dependencies"]
                if isinstance(deps, list):
                    deps = ", ".join(deps)
                body_parts.append(f"Key dependencies: {deps}.")
            if props.get("rule_files"):
                rf = props["rule_files"]
                if isinstance(rf, list):
                    rf = ", ".join(rf)
                body_parts.append(f"Rule files: {rf}.")
            if props.get("path"):
                body_parts.append(f"Source code path: {props['path']}.")

        # Design Pattern enrichments
        elif "DesignPattern" in labels:
            body_parts.append(
                f"This is a design pattern used in the architecture: {name}."
            )
            if props.get("endpoints"):
                ep = props["endpoints"]
                if isinstance(ep, list):
                    ep = ", ".join(ep)
                body_parts.append(f"API endpoints: {ep}.")
            if props.get("states"):
                states = props["states"]
                if isinstance(states, list):
                    states = ", ".join(states)
                body_parts.append(f"States: {states}.")
            if props.get("components"):
                comp = props["components"]
                if isinstance(comp, list):
                    comp = ", ".join(comp)
                body_parts.append(f"Components involved: {comp}.")
            if props.get("flow"):
                fl = props["flow"]
                if isinstance(fl, list):
                    fl = " → ".join(fl)
                body_parts.append(f"Flow: {fl}.")
            if props.get("layers"):
                layers = props["layers"]
                if isinstance(layers, list):
                    layers = ", ".join(layers)
                body_parts.append(f"Memory layers: {layers}.")
            if props.get("consistency_checks"):
                cc = props["consistency_checks"]
                if isinstance(cc, list):
                    cc = ", ".join(cc)
                body_parts.append(f"Consistency checks: {cc}.")
            if props.get("technologies"):
                tech = props["technologies"]
                if isinstance(tech, list):
                    tech = ", ".join(tech)
                body_parts.append(f"Technologies: {tech}.")
            if props.get("event_types"):
                et = props["event_types"]
                if isinstance(et, list):
                    et = ", ".join(et)
                body_parts.append(f"Event types: {et}.")
            if props.get("compliant_agents"):
                ca = props["compliant_agents"]
                if isinstance(ca, list):
                    ca = ", ".join(ca)
                body_parts.append(f"Compliant agents: {ca}.")

        # VSCode Extension
        elif "VSCodeExtension" in labels:
            body_parts.append(f"This is a VS Code extension: {name}.")
            if props.get("panels"):
                panels = props["panels"]
                if isinstance(panels, list):
                    panels = ", ".join(panels)
                body_parts.append(f"UI Panels: {panels}.")
            if props.get("commands"):
                cmds = props["commands"]
                if isinstance(cmds, list):
                    cmds = ", ".join(cmds)
                body_parts.append(f"Commands: {cmds}.")
            if props.get("services"):
                svcs = props["services"]
                if isinstance(svcs, list):
                    svcs = ", ".join(svcs)
                body_parts.append(f"Services: {svcs}.")
            if props.get("path"):
                body_parts.append(f"Source code path: {props['path']}.")

        # CLI Tool
        elif "CLITool" in labels:
            body_parts.append(f"This is a CLI tool: {name}.")
            if props.get("commands"):
                cmds = props["commands"]
                if isinstance(cmds, list):
                    cmds = ", ".join(cmds)
                body_parts.append(f"Available commands: {cmds}.")
            if props.get("path"):
                body_parts.append(f"Source code path: {props['path']}.")

        # Documentation / Landing
        elif "DocsSite" in labels or "LandingSite" in labels:
            body_parts.append(f"This is a web property: {name}.")
            if props.get("framework"):
                body_parts.append(f"Built with {props['framework']}.")
            if props.get("production_url"):
                body_parts.append(f"Production URL: {props['production_url']}.")
            if props.get("path"):
                body_parts.append(f"Source code path: {props['path']}.")

        # Project-level enrichments
        elif "ConstellaProject" in labels:
            body_parts.append(f"This is the root project: {name}.")
            if props.get("architecture"):
                body_parts.append(f"Architecture style: {props['architecture']}.")
            if props.get("languages"):
                langs = props["languages"]
                if isinstance(langs, list):
                    langs = ", ".join(langs)
                body_parts.append(f"Languages: {langs}.")
            if props.get("adr_compliance"):
                body_parts.append(f"ADR compliance: {props['adr_compliance']}.")
            body_parts.append(
                f"Audit scores — Architecture: {props.get('audit_score_architecture')}, Security: {props.get('audit_score_security')}, Technology: {props.get('audit_score_technology')}, DevOps: {props.get('audit_score_devops')}."
            )

        body = " ".join(body_parts)

        # Build filterable metadata
        meta = {
            "node_id": node_id,
            "name": name,
            "category": category,
            "labels": labels,
        }
        for key in (
            "language",
            "framework",
            "port",
            "path",
            "version",
            "agent_type",
            "task_type",
            "main_file",
            "package_name",
        ):
            if key in props and props[key] is not None:
                meta[key] = props[key]

        doc = ArchDocument(
            doc_id=_stable_id(f"node:{node_id}"),
            title=name,
            body=body,
            category=category,
            node_id=node_id,
            labels=labels,
            metadata=meta,
        )
        docs.append(doc)

    return docs


def build_relationship_documents(records: list[dict]) -> list[ArchDocument]:
    """Build documents from relationships for queries like 'what does X connect to?'"""
    docs: list[ArchDocument] = []

    for rec in records:
        src_name = rec["src_name"]
        src_id = rec["src_id"]
        rel_type = rec["rel_type"]
        rel_props = rec["rel_props"] or {}
        tgt_name = rec["tgt_name"]
        tgt_id = rec["tgt_id"]

        # Build human-readable relationship text
        rel_readable = rel_type.replace("_", " ").lower()
        body_parts = [
            f"{src_name} {rel_readable} {tgt_name}.",
        ]

        # Add relationship-specific context
        if rel_props:
            for k, v in rel_props.items():
                body_parts.append(f"  {k}: {v}.")

        # Add semantic expansions based on relationship type
        expansions = {
            "ORCHESTRATES": f"The {src_name} coordinates and delegates tasks to {tgt_name} via HTTP REST API calls to the /execute_task endpoint.",
            "ROUTES_TO": f"The {src_name} routes incoming API requests to {tgt_name} for processing.",
            "CONNECTS_TO": f"{src_name} establishes connections to {tgt_name} for real-time communication and data exchange.",
            "SUBSCRIBES_TO": f"{src_name} subscribes to event streams on {tgt_name} to consume asynchronous messages.",
            "PUBLISHES_TO": f"{src_name} publishes events and messages to {tgt_name} for asynchronous processing by downstream consumers.",
            "PUSHES_LOGS_TO": f"{src_name} pushes structured log data to {tgt_name} for centralized log aggregation and analysis.",
            "QUERIES": f"{src_name} queries {tgt_name} for data retrieval operations.",
            "MANAGES": f"{src_name} manages the lifecycle, health, backups, and consistency of {tgt_name}.",
            "DELEGATES_EMBEDDING_TO": f"{src_name} delegates text embedding generation to {tgt_name} for vector representation.",
            "CALLS_LLM": f"{src_name} makes LLM inference calls to {tgt_name} for AI-powered text generation.",
            "USES_MODEL": f"{src_name} loads and uses machine learning models from {tgt_name}.",
            "USES_FOR": f"{src_name} uses {tgt_name} for specific data storage and retrieval purposes.",
            "INTEGRATES_PROVIDER": f"{src_name} integrates {tgt_name} as an available LLM provider with routing and fallback support.",
            "INTEGRATES_WITH": f"{src_name} integrates with {tgt_name} for data persistence and retrieval.",
            "DEPENDS_ON": f"{src_name} has a code dependency on {tgt_name} and imports its modules.",
            "SCRAPES_METRICS_FROM": f"{src_name} scrapes performance metrics from {tgt_name} at regular intervals for monitoring.",
            "VISUALIZES_DATA_FROM": f"{src_name} creates dashboards and visualizations from data collected by {tgt_name}.",
            "COMPLIES_WITH": f"{src_name} follows the {tgt_name} standard for its API contract and communication protocol.",
            "IMPLEMENTS": f"{src_name} implements the {tgt_name} for resilience and fault tolerance.",
            "PART_OF_PATTERN": f"{src_name} is a component of the {tgt_name} architectural pattern.",
            "HAS_SERVICE": f"The platform includes {tgt_name} as a deployed microservice.",
            "HAS_PACKAGE": f"The platform includes {tgt_name} as a shared code package.",
            "HAS_INFRASTRUCTURE": f"The platform uses {tgt_name} as infrastructure.",
            "HAS_FRAMEWORK": f"The platform uses {tgt_name} as an architectural framework.",
            "HAS_COMPONENT": f"The platform includes {tgt_name} as a component.",
            "USES_LLM_PROVIDER": f"The platform integrates with {tgt_name} for LLM capabilities.",
            "FOLLOWS_PATTERN": f"The platform follows the {tgt_name} architectural pattern.",
        }

        if rel_type in expansions:
            body_parts.append(expansions[rel_type])

        body = " ".join(body_parts)
        title = f"{src_name} → [{rel_type}] → {tgt_name}"

        doc = ArchDocument(
            doc_id=_stable_id(f"rel:{src_id}:{rel_type}:{tgt_id}"),
            title=title,
            body=body,
            category="relationship",
            node_id=f"{src_id}->{tgt_id}",
            labels=[rel_type],
            metadata={
                "source_id": src_id,
                "source_name": src_name,
                "target_id": tgt_id,
                "target_name": tgt_name,
                "relationship_type": rel_type,
                "category": "relationship",
            },
        )
        docs.append(doc)

    return docs


def build_synthetic_overview_documents() -> list[ArchDocument]:
    """
    Hand-crafted overview documents that capture high-level architectural knowledge
    not easily captured by individual nodes or edges.
    """
    overviews = [
        {
            "id": "overview-platform",
            "title": "Constella Platform Overview",
            "body": (
                "Constella is an enterprise AI operating platform built as a self-hosted multi-agent "
                "ecosystem for software development lifecycle management. It uses a microservices architecture "
                "with 15+ specialized AI agents coordinated by a Chief Architect orchestrator. "
                "The platform supports multiple LLM providers (OpenAI, Anthropic Claude, Google Gemini, OpenRouter) "
                "through an intelligent routing and fallback system. All agents follow the ADR-012 protocol "
                "with standardized health, capabilities, and task execution endpoints. "
                "The technology stack includes Python (FastAPI) for agents, TypeScript (Express) for the API gateway, "
                "and a three-layer memory system (Redis for caching, Qdrant for vector search, Neo4j for knowledge graphs). "
                "Observability is provided by Prometheus metrics, Grafana dashboards, and Loki log aggregation. "
                "NATS JetStream handles async event streaming for error tracking via the ErrorGold system."
            ),
            "category": "overview",
        },
        {
            "id": "overview-agent-system",
            "title": "Multi-Agent Orchestration System",
            "body": (
                "The agent orchestration system is the heart of Constella. The Chief Architect orchestrator "
                "receives high-level tasks and decomposes them into subtasks routed to specialized agents. "
                "Agent types include: CodeCraft (code generation via OpenAI GPT-4o-mini), SecuriShield (security scanning), "
                "DesignForge (C4 diagrams), PerfPulse (performance analysis), Evaluator (code quality and tech debt), "
                "Embedding (sentence-transformers), Retriever (RAG with cross-encoder reranking), "
                "SOC2 Compliance (trust service categories), Database Agent (schema design, migrations, query optimization), "
                "ExpressOps (Express.js scaffolding), MobileFirstOps (React Native and Flutter), "
                "and Python Expert (with semantic knowledge base). "
                "The FrameworkRouter selects optimal agents based on load-scoring metrics. "
                "The AgentRegistry supports auto-discovery via /capabilities endpoints. "
                "Circuit breakers protect against cascading failures."
            ),
            "category": "overview",
        },
        {
            "id": "overview-rag-pipeline",
            "title": "RAG Pipeline and Memory System Architecture",
            "body": (
                "The RAG (Retrieval-Augmented Generation) pipeline combines the Embedding agent "
                "(all-MiniLM-L6-v2, 384-dim vectors, CUDA support) with the Retriever agent "
                "(Qdrant vector search + Neo4j graph traversal + cross-encoder reranking). "
                "The flow is: query text → embed → Qdrant cosine similarity search → cross-encoder ms-marco-MiniLM "
                "reranking → context injection into LLM prompts. "
                "Memory is stored in three layers managed by the Memory Guardian service: "
                "1) Redis for fast TTL-based caching and active workflow state, "
                "2) Qdrant for semantic vector search across agent memories, "
                "3) Neo4j for relational knowledge graph with RELATED_TO traversals. "
                "The Memory Guardian handles TTL refresh (prevents context loss), backup/recovery, "
                "health monitoring, and cross-layer consistency validation."
            ),
            "category": "overview",
        },
        {
            "id": "overview-llm-providers",
            "title": "LLM Provider Routing and Cost Management",
            "body": (
                "The @constella/llm-core package provides unified LLM provider abstraction. "
                "Supported providers: OpenAI (GPT-4o, GPT-4o-mini, text-embedding-3), "
                "Anthropic (Claude Sonnet, Claude Haiku), Google Gemini (2.0-flash, 1.5-pro), "
                "and OpenRouter (multi-model gateway). "
                "The LLMManager class handles intelligent routing with fallback strategies: "
                "fastest, cheapest, best_quality, round_robin. It includes cost budgeting with "
                "daily limits and warning thresholds, response caching with configurable TTL, "
                "provider health checking, and per-provider metrics tracking. "
                "Agent-specific configurations define quality levels and cost priorities: "
                "ARCHITECTURE (high quality, medium cost), SECURITY (high quality, high cost priority), "
                "CODE_GENERATION (high quality, 3000 max tokens), DESIGN (high quality, high temperature for creativity)."
            ),
            "category": "overview",
        },
        {
            "id": "overview-api-gateway",
            "title": "API Gateway Architecture",
            "body": (
                "The Constella API Gateway is a TypeScript Express.js service providing a unified "
                "entry point for all platform services. Features include: JWT and API key authentication, "
                "Helmet security headers with strict CSP, CORS with configurable origins, "
                "express-rate-limit for request throttling, a ServiceRegistry with circuit breaker pattern "
                "(3 failure threshold, 30s reset timeout), Prometheus metrics via prom-client, "
                "Winston structured logging, and health check endpoints. "
                "Routes: /v1/agents (agent management), /health (public), /metrics (optionally protected). "
                "The gateway discovers and health-checks downstream services via the ServiceRegistry, "
                "which supports round-robin and random load balancing strategies."
            ),
            "category": "overview",
        },
        {
            "id": "overview-devops",
            "title": "DevOps and Deployment Infrastructure",
            "body": (
                "The platform uses Docker Compose for development orchestration on the constella-network. "
                "Infrastructure services: Redis 7 Alpine (port 6379), Neo4j 5.12 with Graph Data Science (ports 7474/7687), "
                "Qdrant (ports 6333/6334), NATS 2.10 Alpine with JetStream (ports 4222/6222/8222). "
                "Monitoring stack: Prometheus (port 9090, 15s scrape interval, 12 scrape targets), "
                "Grafana (port 3001, Prometheus + Loki datasources), Loki (port 3100, 168h retention). "
                "The deploy.sh script handles comprehensive deployment with health check retries. "
                "Named volumes for persistence: redis_data, neo4j_data, qdrant_data, nats_data, prometheus_data, grafana_data, loki_data. "
                "Production targets Kubernetes deployment (Helm charts, HPA, PodDisruptionBudgets) as a future milestone."
            ),
            "category": "overview",
        },
        {
            "id": "overview-errorgold",
            "title": "ErrorGold Error Tracking System",
            "body": (
                "ErrorGold is Constella's cross-language error tracking system. "
                "The Python orchestrator publishes errors to NATS JetStream subject 'errorgold.events' "
                "using an async publisher module. The Node.js SDK (@constella/errorgold-node) provides "
                "a capture() method for structured error reporting with stack traces and context. "
                "The ErrorGold Listener service subscribes to NATS, counts errors via Prometheus counter "
                "(errorgold_events_total), and pushes structured JSON to Loki for centralized logging. "
                "The TypeScript ErrorGoldCollector class adds circuit breaker protection, error statistics, "
                "severity classification (low/medium/high/critical), and batch flushing to external services."
            ),
            "category": "overview",
        },
        {
            "id": "overview-vscode-extension",
            "title": "AgentForge VS Code Extension",
            "body": (
                "The AgentForge VS Code extension provides IDE integration for the Constella platform. "
                "It features: an Agent Activity panel for real-time monitoring, a Chat panel for interacting "
                "with agents, a Dashboard panel for system overview, and a Settings panel for configuration. "
                "Tree data providers show agent lists and activity feeds in the VS Code sidebar. "
                "WebSocket connections to the orchestrator enable real-time event streaming. "
                "Commands include: architecture analysis (via DesignForge), security scanning (via SecuriShield), "
                "quality checks (via CodeCraft), and agent generation. "
                "The OrchestratorAPI service handles HTTP communication with the backend."
            ),
            "category": "overview",
        },
        {
            "id": "overview-beeai-framework",
            "title": "Constella BeeAI Framework",
            "body": (
                "The Constella BeeAI Framework in constella-os/framework provides a TypeScript "
                "framework for building AI agent systems. Core abstractions: Tool (base class for agent tools), "
                "Requirement (constraints on agent behavior), ChatModel (LLM backend abstraction). "
                "Special tools: ThinkTool (chain-of-thought reasoning), HandoffTool (agent-to-agent delegation). "
                "Requirement types: ConditionalRequirement, SequenceRequirement, RateLimitRequirement. "
                "The framework defines comprehensive type systems for Agents, Workflows, Memory, Events, and Metrics. "
                "It includes a rich error hierarchy: FrameworkError, AgentError, ToolError, LLMProviderError, "
                "MemoryError, WorkflowError, AuthenticationError, etc. "
                "Dependencies include OpenAI, Neo4j driver, Qdrant JS client, ioredis, and zod for validation."
            ),
            "category": "overview",
        },
        {
            "id": "overview-security-audit",
            "title": "Security Audit Findings and Compliance",
            "body": (
                "The external security audit (CON-AUDIT-20250820) scored the platform: "
                "Architecture 4/5, Technology 3/5, Security 2/5, DevOps 3/5. "
                "Critical findings: hardcoded secrets in configs, inconsistent auth across services, "
                "NEO4J_AUTH disabled in dev, unauthenticated metrics endpoints, Grafana default credentials. "
                "High priority: no service-to-service mTLS, insufficient input validation, insecure CORS. "
                "The SOC-2 Compliance agent monitors five trust service categories: Security, Availability, "
                "Processing Integrity, Confidentiality, Privacy. "
                "Recommended mitigations: secret management via Vault, mTLS for service mesh, "
                "Kubernetes deployment with RBAC, OpenTelemetry distributed tracing, and formal SLOs."
            ),
            "category": "overview",
        },
    ]

    docs: list[ArchDocument] = []
    for ov in overviews:
        docs.append(
            ArchDocument(
                doc_id=_stable_id(f"overview:{ov['id']}"),
                title=ov["title"],
                body=ov["body"],
                category=ov["category"],
                node_id=ov["id"],
                labels=["Overview"],
                metadata={
                    "node_id": ov["id"],
                    "name": ov["title"],
                    "category": ov["category"],
                    "labels": ["Overview"],
                },
            )
        )
    return docs


# ---------------------------------------------------------------------------
# Neo4j data extraction
# ---------------------------------------------------------------------------
def fetch_nodes_from_neo4j(driver) -> list[dict]:
    """Fetch all Constella knowledge-graph nodes."""
    query = """
    MATCH (n)
    WHERE n:ConstellaProject OR n:AIAgent OR n:Microservice OR n:CorePackage
       OR n:InfraComponent OR n:DataStore OR n:MonitoringTool OR n:MessageBus
       OR n:LLMProvider OR n:Framework OR n:DesignPattern
       OR n:VSCodeExtension OR n:CLITool OR n:DocsSite OR n:LandingSite
    RETURN labels(n) AS labels, properties(n) AS props
    """
    with driver.session() as session:
        result = session.run(query)
        return [{"labels": r["labels"], "props": dict(r["props"])} for r in result]


def fetch_relationships_from_neo4j(driver) -> list[dict]:
    """Fetch all relationships between Constella KG nodes."""
    query = """
    MATCH (a)-[r]->(b)
    WHERE (a:ConstellaProject OR a:AIAgent OR a:Microservice OR a:CorePackage
           OR a:InfraComponent OR a:LLMProvider OR a:Framework OR a:DesignPattern
           OR a:VSCodeExtension OR a:CLITool OR a:DocsSite OR a:LandingSite)
      AND (b:ConstellaProject OR b:AIAgent OR b:Microservice OR b:CorePackage
           OR b:InfraComponent OR b:LLMProvider OR b:Framework OR b:DesignPattern
           OR b:VSCodeExtension OR b:CLITool OR b:DocsSite OR b:LandingSite)
    RETURN
      coalesce(a.name, a.id) AS src_name,
      coalesce(a.id, a.name) AS src_id,
      type(r) AS rel_type,
      properties(r) AS rel_props,
      coalesce(b.name, b.id) AS tgt_name,
      coalesce(b.id, b.name) AS tgt_id
    """
    with driver.session() as session:
        result = session.run(query)
        return [
            {
                "src_name": r["src_name"],
                "src_id": r["src_id"],
                "rel_type": r["rel_type"],
                "rel_props": dict(r["rel_props"]) if r["rel_props"] else {},
                "tgt_name": r["tgt_name"],
                "tgt_id": r["tgt_id"],
            }
            for r in result
        ]


# ---------------------------------------------------------------------------
# Qdrant indexing
# ---------------------------------------------------------------------------
def ensure_collection(client, collection_name: str, vector_size: int):
    """Create or recreate the Qdrant collection."""
    from qdrant_client.models import Distance, VectorParams

    try:
        info = client.get_collection(collection_name)
        log.info(
            f"Collection '{collection_name}' exists with {info.points_count} points. Recreating..."
        )
        client.delete_collection(collection_name)
    except Exception:
        pass

    client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
    )
    log.info(f"Created collection '{collection_name}' (dim={vector_size}, COSINE)")


def index_documents(client, model, collection_name: str, docs: list[ArchDocument]):
    """Embed and upsert all documents into Qdrant."""
    from qdrant_client.models import PointStruct

    if not docs:
        log.warning("No documents to index.")
        return

    log.info(f"Embedding {len(docs)} documents...")
    texts = [d.search_text for d in docs]

    # Batch embed
    batch_size = 64
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        embeddings = model.encode(batch, show_progress_bar=False).tolist()
        all_embeddings.extend(embeddings)
        log.info(
            f"  Embedded batch {i // batch_size + 1}/{(len(texts) + batch_size - 1) // batch_size}"
        )

    # Build points
    points = []
    for doc, embedding in zip(docs, all_embeddings):
        payload = {
            "title": doc.title,
            "body": doc.body,
            "category": doc.category,
            "node_id": doc.node_id,
            "labels": doc.labels,
            **doc.metadata,
        }
        points.append(
            PointStruct(
                id=doc.doc_id,
                vector=embedding,
                payload=payload,
            )
        )

    # Upsert in batches
    upsert_batch = 100
    for i in range(0, len(points), upsert_batch):
        batch = points[i : i + upsert_batch]
        client.upsert(collection_name=collection_name, points=batch)
        log.info(
            f"  Upserted {min(i + upsert_batch, len(points))}/{len(points)} points"
        )

    log.info(f"✅ Indexed {len(points)} documents into '{collection_name}'")


# ---------------------------------------------------------------------------
# Interactive search (bonus)
# ---------------------------------------------------------------------------
def search_architecture(
    client, model, collection_name: str, query: str, top_k: int = 5
):
    """Search the architecture knowledge base."""
    vector = model.encode(query).tolist()
    results = client.search(
        collection_name=collection_name,
        query_vector=vector,
        limit=top_k,
    )
    print(f'\n🔍 Search: "{query}"')
    print("=" * 80)
    for i, hit in enumerate(results):
        print(
            f"\n  [{i + 1}] Score: {hit.score:.4f}  |  {hit.payload.get('title', 'N/A')}"
        )
        print(f"      Category: {hit.payload.get('category', 'N/A')}")
        body = hit.payload.get("body", "")
        if len(body) > 200:
            body = body[:200] + "..."
        print(f"      {body}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    t0 = time.time()

    # ── 1. Connect to Neo4j ─────────────────────────────────────
    log.info("Connecting to Neo4j...")
    from neo4j import GraphDatabase

    auth = (NEO4J_USER, NEO4J_PASSWORD) if NEO4J_PASSWORD else None
    driver = GraphDatabase.driver(NEO4J_URL, auth=auth)
    driver.verify_connectivity()
    log.info(f"✅ Neo4j connected at {NEO4J_URL}")

    # ── 2. Connect to Qdrant ────────────────────────────────────
    log.info("Connecting to Qdrant...")
    from qdrant_client import QdrantClient

    qdrant = QdrantClient(url=QDRANT_URL)
    log.info(f"✅ Qdrant connected at {QDRANT_URL}")

    # ── 3. Load embedding model ─────────────────────────────────
    log.info(f"Loading embedding model: {EMBEDDING_MODEL}...")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(EMBEDDING_MODEL)
    log.info(f"✅ Model loaded ({EMBEDDING_MODEL})")

    # ── 4. Extract data from Neo4j ──────────────────────────────
    log.info("Fetching nodes from Neo4j knowledge graph...")
    node_records = fetch_nodes_from_neo4j(driver)
    log.info(f"  Found {len(node_records)} nodes")

    log.info("Fetching relationships from Neo4j knowledge graph...")
    rel_records = fetch_relationships_from_neo4j(driver)
    log.info(f"  Found {len(rel_records)} relationships")

    # ── 5. Build documents ──────────────────────────────────────
    log.info("Building node documents...")
    node_docs = build_node_documents(node_records)
    log.info(f"  Built {len(node_docs)} node documents")

    log.info("Building relationship documents...")
    rel_docs = build_relationship_documents(rel_records)
    log.info(f"  Built {len(rel_docs)} relationship documents")

    log.info("Building synthetic overview documents...")
    overview_docs = build_synthetic_overview_documents()
    log.info(f"  Built {len(overview_docs)} overview documents")

    all_docs = node_docs + rel_docs + overview_docs
    log.info(f"📄 Total documents: {len(all_docs)}")

    # ── 6. Index into Qdrant ────────────────────────────────────
    ensure_collection(qdrant, COLLECTION_NAME, VECTOR_DIM)
    index_documents(qdrant, model, COLLECTION_NAME, all_docs)

    # ── 7. Verify ───────────────────────────────────────────────
    info = qdrant.get_collection(COLLECTION_NAME)
    log.info(f"✅ Collection '{COLLECTION_NAME}' now has {info.points_count} points")

    elapsed = time.time() - t0
    log.info(f"⏱️  Total time: {elapsed:.1f}s")

    # ── 8. Demo searches ────────────────────────────────────────
    demo_queries = [
        "Which agent handles security scanning?",
        "How does the RAG pipeline work?",
        "What databases does the platform use?",
        "How are errors tracked across services?",
        "What LLM providers are supported?",
    ]

    print("\n" + "=" * 80)
    print("  🧠 DEMO: Semantic Search over Constella Architecture")
    print("=" * 80)

    for q in demo_queries:
        search_architecture(qdrant, model, COLLECTION_NAME, q, top_k=3)

    # ── 9. Interactive mode ─────────────────────────────────────
    print("\n" + "-" * 80)
    print("  💬 Interactive mode: type a question or 'quit' to exit")
    print("-" * 80)

    while True:
        try:
            query = input("\n🔎 > ").strip()
            if not query or query.lower() in ("quit", "exit", "q"):
                break
            search_architecture(qdrant, model, COLLECTION_NAME, query, top_k=5)
        except (KeyboardInterrupt, EOFError):
            break

    # Cleanup
    driver.close()
    log.info("Done. Knowledge graph vectors indexed successfully.")


if __name__ == "__main__":
    main()
