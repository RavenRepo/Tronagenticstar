#!/usr/bin/env python3
"""
DesignForge Agent Micro-service (ADR-012 Compliant)
====================================================
Specialized agent for architecture analysis, system design, diagram generation,
and design pattern recommendations.

Uses the shared Constella LLM Provider for multi-provider support with
automatic failover, rate limiting, and cost tracking.
"""

import json
import logging
import os
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Add shared packages to path
# ---------------------------------------------------------------------------
PACKAGES_DIR = str(
    Path(__file__).resolve().parent.parent.parent / "packages" / "llm-provider"
)
if PACKAGES_DIR not in sys.path:
    sys.path.insert(0, PACKAGES_DIR)

from llm_provider import (
    LLMProvider,
    LLMRequest,
    LLMResponse,
    get_llm_provider,
    get_system_prompt,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "service": "designforge",
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


logger = logging.getLogger("designforge")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)
    logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

logging.getLogger("uvicorn.access").handlers = []
logging.getLogger("httpx").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Pydantic Models (ADR-012 Compliant)
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str = "ok"
    details: Optional[str] = None
    version: str = "3.0.0"
    llm_configured: bool = False


class CapabilitiesResponse(BaseModel):
    agent_id: str = "designforge"
    agent_type: str = "specialist"
    task_type: str = "DESIGN"
    capabilities: List[str] = [
        "generate_diagram",
        "analyze_architecture",
        "suggest_patterns",
        "evaluate_design",
        "generate_c4_model",
        "design_review",
    ]
    version: str = "3.0.0"


class TaskParameters(BaseModel):
    # For diagram generation
    system_name: Optional[str] = None
    diagram_type: Optional[str] = (
        "c4_context"  # c4_context, c4_container, sequence, erd, flowchart, class
    )
    diagram_format: Optional[str] = "mermaid"  # mermaid, plantuml, ascii

    # For architecture analysis
    code: Optional[str] = None
    language: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[List[str]] = None
    constraints: Optional[List[str]] = None

    # For pattern suggestion
    problem_domain: Optional[str] = None
    tech_stack: Optional[List[str]] = None
    scale_requirements: Optional[str] = None  # small, medium, large, enterprise

    # For design review
    architecture_description: Optional[str] = None
    current_patterns: Optional[List[str]] = None

    # General
    detail_level: Optional[str] = "standard"  # quick, standard, deep
    include_tradeoffs: bool = True

    # Legacy compatibility
    prompt: Optional[str] = None
    target: Optional[str] = None


class Task(BaseModel):
    task_id: str
    task_type: str
    parameters: TaskParameters
    context: Optional[List[Dict[str, Any]]] = None


class TaskResultMetrics(BaseModel):
    processing_time_ms: float
    tokens_used: Optional[int] = None
    llm_cost_usd: Optional[float] = None


class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    metrics: TaskResultMetrics


# ---------------------------------------------------------------------------
# Auth / Security
# ---------------------------------------------------------------------------

AGENT_BEARER = os.getenv("AGENT_BEARER")


async def verify_orchestrator(request: Request):
    """Optional bearer check. If AGENT_BEARER is set, require matching Authorization header."""
    if not AGENT_BEARER:
        return True
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    if token != AGENT_BEARER:
        raise HTTPException(status_code=403, detail="Invalid token")
    return True


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DesignForge Agent",
    description="LLM-powered architecture analysis, diagram generation, and design pattern recommendations",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGINS", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Global LLM provider instance
_llm: Optional[LLMProvider] = None


async def get_llm() -> LLMProvider:
    global _llm
    if _llm is None:
        _llm = await get_llm_provider()
    return _llm


# ---------------------------------------------------------------------------
# Helper: Build context string for LLM prompt enrichment
# ---------------------------------------------------------------------------


async def _build_context_string(context: Optional[List[Dict[str, Any]]]) -> str:
    """Format context items into a string for LLM prompt enrichment."""
    if not context:
        return ""
    lines = ["\n--- Relevant Project Context ---"]
    for i, item in enumerate(context[:5]):
        snippet = str(item.get("content", ""))
        if len(snippet) > 600:
            snippet = snippet[:600] + "..."
        tags = item.get("tags", "")
        lines.append(f"[Context {i + 1}] tags={tags}\n{snippet}")
    return "\n".join(lines)


def _parse_llm_json(content: str) -> Dict[str, Any]:
    """Robustly parse JSON from LLM output, handling markdown code fences."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        brace_start = cleaned.find("{")
        brace_end = cleaned.rfind("}")
        if brace_start != -1 and brace_end != -1:
            try:
                return json.loads(cleaned[brace_start : brace_end + 1])
            except json.JSONDecodeError:
                pass

        return {
            "analysis": cleaned[:2000],
            "diagram_code": "",
            "patterns_identified": [],
            "recommendations": [],
            "parse_error": True,
        }


# ---------------------------------------------------------------------------
# Core Design Functions (LLM-Powered)
# ---------------------------------------------------------------------------


async def _generate_diagram(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Generate architecture diagrams using LLM."""
    system_name = params.system_name
    if not system_name:
        system_name = params.prompt or params.description or "System"

    diagram_type = params.diagram_type or "c4_context"
    diagram_format = params.diagram_format or "mermaid"
    context_str = await _build_context_string(context)

    diagram_type_descriptions = {
        "c4_context": "C4 Context diagram showing the system boundary and external actors/systems",
        "c4_container": "C4 Container diagram showing major containers/services within the system boundary",
        "sequence": "Sequence diagram showing the interaction flow between components",
        "erd": "Entity-Relationship diagram showing data models and their relationships",
        "flowchart": "Flowchart showing the process/workflow logic",
        "class": "Class diagram showing object-oriented structure with relationships",
    }

    type_desc = diagram_type_descriptions.get(diagram_type, diagram_type)

    user_prompt = f"""Generate a {type_desc} for the system: "{system_name}"

Diagram format: {diagram_format}

Requirements:
- Create a detailed, accurate diagram in {diagram_format} syntax
- Include all major components, actors, and data flows
- Use clear, descriptive labels
- Follow {diagram_format} best practices for readability

{"Additional description: " + params.description if params.description else ""}
{"Requirements: " + ", ".join(params.requirements) if params.requirements else ""}
{"Constraints: " + ", ".join(params.constraints) if params.constraints else ""}
{"Tech stack: " + ", ".join(params.tech_stack) if params.tech_stack else ""}
{context_str}

Respond in JSON format:
{{
    "diagram_code": "<valid {diagram_format} diagram code>",
    "diagram_type": "{diagram_type}",
    "diagram_format": "{diagram_format}",
    "components_identified": ["list of key components shown"],
    "description": "Brief description of what the diagram shows",
    "design_notes": ["Important design decisions reflected in the diagram"]
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="designforge",
            task_type="generate_diagram",
            system_prompt=get_system_prompt("designforge"),
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=4096,
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["system_name"] = system_name
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    return result


async def _analyze_architecture(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Perform deep architecture analysis on code or system description."""
    target = (
        params.code
        or params.architecture_description
        or params.description
        or params.prompt
    )
    if not target:
        raise HTTPException(
            status_code=422,
            detail="One of 'code', 'architecture_description', 'description', or 'prompt' is required for architecture analysis.",
        )

    context_str = await _build_context_string(context)
    detail_level = params.detail_level or "standard"

    depth_instructions = {
        "quick": "Provide a brief, high-level architecture assessment focusing on the most critical aspects.",
        "standard": "Provide a thorough architecture analysis covering all major aspects with actionable recommendations.",
        "deep": "Provide an exhaustive architecture analysis with detailed reasoning, alternatives considered, migration paths, and long-term implications.",
    }

    user_prompt = f"""Analyze the architecture of the following system:

```
{target[:8000]}
```

{"Language: " + params.language if params.language else ""}
{"Tech stack: " + ", ".join(params.tech_stack) if params.tech_stack else ""}
{"Current patterns: " + ", ".join(params.current_patterns) if params.current_patterns else ""}
{"Scale requirements: " + params.scale_requirements if params.scale_requirements else ""}
{context_str}

Analysis depth: {depth_instructions.get(detail_level, depth_instructions["standard"])}

Respond in JSON format:
{{
    "architecture_score": <0-100>,
    "architecture_style": "identified primary architecture style",
    "patterns_identified": [
        {{
            "name": "pattern name",
            "usage": "how it is used",
            "appropriateness": "HIGH|MEDIUM|LOW",
            "notes": "observations"
        }}
    ],
    "strengths": ["list of architectural strengths"],
    "weaknesses": ["list of architectural weaknesses"],
    "coupling_assessment": {{
        "level": "TIGHT|MODERATE|LOOSE",
        "details": "explanation"
    }},
    "cohesion_assessment": {{
        "level": "HIGH|MODERATE|LOW",
        "details": "explanation"
    }},
    "scalability_assessment": {{
        "score": <0-100>,
        "bottlenecks": ["identified bottlenecks"],
        "recommendations": ["scalability recommendations"]
    }},
    "maintainability_assessment": {{
        "score": <0-100>,
        "technical_debt_indicators": ["list of tech debt indicators"],
        "improvement_suggestions": ["suggestions"]
    }},
    "recommendations": [
        {{
            "priority": "HIGH|MEDIUM|LOW",
            "category": "category",
            "title": "short title",
            "description": "detailed recommendation",
            "effort": "LOW|MEDIUM|HIGH",
            "impact": "LOW|MEDIUM|HIGH"
        }}
    ],
    "executive_summary": "2-3 sentence summary of findings"
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="designforge",
            task_type="analyze_architecture",
            system_prompt=get_system_prompt("designforge"),
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=4096,
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    return result


async def _suggest_patterns(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Suggest design patterns appropriate for the given problem domain."""
    problem = params.problem_domain or params.description or params.prompt
    if not problem:
        raise HTTPException(
            status_code=422,
            detail="One of 'problem_domain', 'description', or 'prompt' is required for pattern suggestion.",
        )

    context_str = await _build_context_string(context)

    user_prompt = f"""Recommend appropriate software architecture and design patterns for the following problem:

Problem domain: {problem}

{"Tech stack: " + ", ".join(params.tech_stack) if params.tech_stack else ""}
{"Scale requirements: " + params.scale_requirements if params.scale_requirements else ""}
{"Requirements: " + ", ".join(params.requirements) if params.requirements else ""}
{"Constraints: " + ", ".join(params.constraints) if params.constraints else ""}
{context_str}

{"Include trade-off analysis for each pattern." if params.include_tradeoffs else ""}

Respond in JSON format:
{{
    "recommended_patterns": [
        {{
            "name": "pattern name",
            "category": "architectural|creational|structural|behavioral|integration|data",
            "relevance_score": <0-100>,
            "description": "why this pattern fits",
            "benefits": ["list of benefits for this use case"],
            "drawbacks": ["list of drawbacks to consider"],
            "implementation_notes": "brief implementation guidance",
            "alternatives": ["alternative patterns considered"],
            "example_usage": "brief code or pseudocode sketch"
        }}
    ],
    "architecture_recommendation": {{
        "primary_style": "recommended primary architecture style",
        "complementary_patterns": ["supporting patterns"],
        "rationale": "explanation of overall recommendation"
    }},
    "anti_patterns_to_avoid": [
        {{
            "name": "anti-pattern name",
            "risk": "why it is risky here",
            "mitigation": "how to avoid it"
        }}
    ],
    "implementation_roadmap": [
        {{
            "phase": 1,
            "focus": "what to implement first",
            "patterns": ["patterns to apply"],
            "effort": "LOW|MEDIUM|HIGH"
        }}
    ],
    "executive_summary": "2-3 sentence recommendation summary"
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="designforge",
            task_type="suggest_patterns",
            system_prompt=get_system_prompt("designforge"),
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=4096,
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    return result


async def _evaluate_design(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Evaluate an existing design / architecture for quality and improvement opportunities."""
    target = (
        params.architecture_description
        or params.code
        or params.description
        or params.prompt
    )
    if not target:
        raise HTTPException(
            status_code=422,
            detail="One of 'architecture_description', 'code', 'description', or 'prompt' is required for design evaluation.",
        )

    context_str = await _build_context_string(context)

    user_prompt = f"""Evaluate the following software design for quality, correctness, and improvement opportunities:

```
{target[:8000]}
```

{"Language: " + params.language if params.language else ""}
{"Current patterns: " + ", ".join(params.current_patterns) if params.current_patterns else ""}
{"Requirements: " + ", ".join(params.requirements) if params.requirements else ""}
{"Constraints: " + ", ".join(params.constraints) if params.constraints else ""}
{context_str}

Perform a comprehensive design review covering:
1. SOLID principles adherence
2. Separation of concerns
3. Appropriate abstraction levels
4. Error handling strategy
5. Testability
6. Extensibility
7. Security considerations in the design

Respond in JSON format:
{{
    "design_score": <0-100>,
    "solid_compliance": {{
        "single_responsibility": {{"score": <0-100>, "notes": "..."}},
        "open_closed": {{"score": <0-100>, "notes": "..."}},
        "liskov_substitution": {{"score": <0-100>, "notes": "..."}},
        "interface_segregation": {{"score": <0-100>, "notes": "..."}},
        "dependency_inversion": {{"score": <0-100>, "notes": "..."}}
    }},
    "separation_of_concerns": {{
        "score": <0-100>,
        "violations": ["list of violations found"],
        "suggestions": ["improvement suggestions"]
    }},
    "error_handling": {{
        "score": <0-100>,
        "issues": ["issues found"],
        "recommendations": ["recommendations"]
    }},
    "testability": {{
        "score": <0-100>,
        "blockers": ["things that make testing hard"],
        "improvements": ["suggestions to improve testability"]
    }},
    "security_design": {{
        "score": <0-100>,
        "concerns": ["security concerns in the design"],
        "recommendations": ["security design recommendations"]
    }},
    "overall_recommendations": [
        {{
            "priority": "HIGH|MEDIUM|LOW",
            "title": "recommendation title",
            "description": "detailed description",
            "effort": "LOW|MEDIUM|HIGH",
            "impact": "LOW|MEDIUM|HIGH"
        }}
    ],
    "executive_summary": "2-3 sentence summary of the design evaluation"
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="designforge",
            task_type="evaluate_design",
            system_prompt=get_system_prompt("designforge"),
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=4096,
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    return result


async def _generate_c4_model(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Generate a complete C4 model (Context + Container + Component) for a system."""
    system_name = params.system_name or params.prompt or "System"
    description = params.description or params.architecture_description or ""
    context_str = await _build_context_string(context)

    user_prompt = f"""Generate a complete C4 architecture model for: "{system_name}"

{"System description: " + description if description else ""}
{"Tech stack: " + ", ".join(params.tech_stack) if params.tech_stack else ""}
{"Requirements: " + ", ".join(params.requirements) if params.requirements else ""}
{"Constraints: " + ", ".join(params.constraints) if params.constraints else ""}
{"Scale requirements: " + params.scale_requirements if params.scale_requirements else ""}
{context_str}

Generate all three levels of the C4 model in Mermaid syntax:
1. Context diagram (system + external actors)
2. Container diagram (major services/databases within the system)
3. Component diagram (internal components of the most critical container)

Respond in JSON format:
{{
    "system_name": "{system_name}",
    "c4_context": {{
        "mermaid_code": "<valid mermaid C4Context diagram>",
        "actors": ["external actors/users"],
        "external_systems": ["external system dependencies"],
        "description": "what the context diagram shows"
    }},
    "c4_container": {{
        "mermaid_code": "<valid mermaid C4Container diagram>",
        "containers": [
            {{
                "name": "container name",
                "technology": "tech used",
                "purpose": "what it does"
            }}
        ],
        "description": "what the container diagram shows"
    }},
    "c4_component": {{
        "focus_container": "which container is detailed",
        "mermaid_code": "<valid mermaid C4Component diagram>",
        "components": [
            {{
                "name": "component name",
                "responsibility": "what it does",
                "technology": "tech used"
            }}
        ],
        "description": "what the component diagram shows"
    }},
    "architecture_decisions": [
        {{
            "decision": "key decision made",
            "rationale": "why",
            "alternatives_considered": ["alternatives"],
            "trade_offs": "trade-offs accepted"
        }}
    ],
    "executive_summary": "overview of the proposed architecture"
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="designforge",
            task_type="generate_c4_model",
            system_prompt=get_system_prompt("designforge"),
            user_prompt=user_prompt,
            temperature=0.3,
            max_tokens=6000,
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    return result


async def _design_review(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Perform a comprehensive design review combining analysis, patterns, and evaluation."""
    target = (
        params.code
        or params.architecture_description
        or params.description
        or params.prompt
    )
    if not target:
        raise HTTPException(
            status_code=422,
            detail="A description of the system is required for design review.",
        )

    context_str = await _build_context_string(context)

    user_prompt = f"""Perform a comprehensive design review for the following:

```
{target[:8000]}
```

{"Language: " + params.language if params.language else ""}
{"Tech stack: " + ", ".join(params.tech_stack) if params.tech_stack else ""}
{"Current patterns: " + ", ".join(params.current_patterns) if params.current_patterns else ""}
{"Scale: " + params.scale_requirements if params.scale_requirements else ""}
{context_str}

Provide a holistic design review covering:
1. Architecture fitness (is the architecture appropriate for the requirements?)
2. Pattern usage (are the right patterns applied correctly?)
3. Quality attributes (performance, security, maintainability, reliability)
4. Technical debt assessment
5. Improvement roadmap

Respond in JSON format:
{{
    "overall_score": <0-100>,
    "fitness_assessment": {{
        "score": <0-100>,
        "verdict": "EXCELLENT|GOOD|ADEQUATE|NEEDS_IMPROVEMENT|POOR",
        "explanation": "explanation of fitness"
    }},
    "quality_attributes": {{
        "performance": {{"score": <0-100>, "notes": "..."}},
        "security": {{"score": <0-100>, "notes": "..."}},
        "maintainability": {{"score": <0-100>, "notes": "..."}},
        "reliability": {{"score": <0-100>, "notes": "..."}},
        "scalability": {{"score": <0-100>, "notes": "..."}},
        "testability": {{"score": <0-100>, "notes": "..."}}
    }},
    "patterns_review": [
        {{
            "pattern": "pattern name",
            "applied_correctly": true,
            "notes": "observations"
        }}
    ],
    "technical_debt": {{
        "level": "LOW|MEDIUM|HIGH|CRITICAL",
        "items": [
            {{
                "description": "debt item",
                "severity": "HIGH|MEDIUM|LOW",
                "remediation_effort": "LOW|MEDIUM|HIGH"
            }}
        ]
    }},
    "improvement_roadmap": [
        {{
            "phase": 1,
            "title": "phase title",
            "actions": ["action items"],
            "expected_benefit": "what improves",
            "effort": "LOW|MEDIUM|HIGH"
        }}
    ],
    "executive_summary": "comprehensive summary of the design review"
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="designforge",
            task_type="design_review",
            system_prompt=get_system_prompt("designforge"),
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=4096,
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    return result


# ---------------------------------------------------------------------------
# Task type router
# ---------------------------------------------------------------------------

TASK_HANDLERS = {
    "generate_diagram": _generate_diagram,
    "analyze_architecture": _analyze_architecture,
    "suggest_patterns": _suggest_patterns,
    "evaluate_design": _evaluate_design,
    "generate_c4_model": _generate_c4_model,
    "design_review": _design_review,
    # Legacy aliases
    "analyze": _analyze_architecture,
    "suggest": _suggest_patterns,
    "evaluate": _evaluate_design,
}


# ---------------------------------------------------------------------------
# API Endpoints (ADR-012 Compliant)
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
async def health_check():
    llm_ok = False
    try:
        llm = await get_llm()
        llm_ok = llm is not None and llm._initialized
    except Exception:
        pass

    return HealthResponse(
        status="ok" if llm_ok else "degraded",
        details="LLM provider active"
        if llm_ok
        else "LLM provider not initialized; will init on first request",
        llm_configured=llm_ok,
    )


@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities(_: bool = Depends(verify_orchestrator)):
    return CapabilitiesResponse()


@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task, _: bool = Depends(verify_orchestrator)):
    start_time = time.time()
    logger.info(
        "Executing task %s (type=%s)",
        task.task_id,
        task.task_type,
    )

    handler = TASK_HANDLERS.get(task.task_type)
    if handler is None:
        supported = list(TASK_HANDLERS.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported task type: {task.task_type}. Supported: {supported}",
        )

    try:
        result_data = await handler(task.parameters, task.context)
        processing_time_ms = (time.time() - start_time) * 1000

        logger.info(
            "Task %s completed in %.0fms (provider=%s model=%s tokens=%s)",
            task.task_id,
            processing_time_ms,
            result_data.get("llm_provider", "unknown"),
            result_data.get("llm_model", "unknown"),
            result_data.get("tokens_used", "N/A"),
        )

        return TaskResult(
            task_id=task.task_id,
            status="completed",
            result=result_data,
            metrics=TaskResultMetrics(
                processing_time_ms=processing_time_ms,
                tokens_used=result_data.get("tokens_used"),
                llm_cost_usd=result_data.get("cost_usd"),
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        processing_time_ms = (time.time() - start_time) * 1000
        logger.error(
            "Task %s failed after %.0fms: %s",
            task.task_id,
            processing_time_ms,
            str(e),
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Task execution failed: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Direct endpoint for architecture analysis (convenience)
# ---------------------------------------------------------------------------


@app.post("/analyze")
async def analyze_direct(
    request: Dict[str, Any], _: bool = Depends(verify_orchestrator)
):
    """Direct architecture analysis endpoint (convenience for orchestrator)."""
    params = TaskParameters(
        code=request.get("code"),
        description=request.get("context") or request.get("description"),
        language=request.get("language"),
    )
    result = await _analyze_architecture(params)
    return result


# ---------------------------------------------------------------------------
# LLM metrics endpoint
# ---------------------------------------------------------------------------


@app.get("/llm-metrics")
async def llm_metrics(_: bool = Depends(verify_orchestrator)):
    """Return LLM usage metrics for monitoring."""
    try:
        llm = await get_llm()
        return {
            "cost_today_usd": llm.get_cost_today(),
            "provider_health": {
                name.value: {
                    "success_count": health.success_count,
                    "failure_count": health.failure_count,
                    "is_available": health.is_available(),
                    "last_error": health.last_error,
                }
                for name, health in llm.get_provider_health().items()
            },
            "rate_limits": llm.get_rate_limit_status(),
        }
    except Exception as e:
        return {"error": str(e), "status": "llm_not_initialized"}


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8010))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
