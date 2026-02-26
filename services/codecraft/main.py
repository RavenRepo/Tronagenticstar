#!/usr/bin/env python3
"""
CodeCraft Agent Micro-service (ADR-012 Compliant)
==================================================
Specialized agent for code generation, refactoring, optimization, and
code explanation tasks.

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
            "service": "codecraft",
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


logger = logging.getLogger("codecraft")
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
    agent_id: str = "codecraft"
    agent_type: str = "specialist"
    task_type: str = "CODE_GENERATION"
    capabilities: List[str] = [
        "generate_code",
        "refactor_code",
        "explain_code",
        "optimize_code",
        "write_tests",
        "fix_bug",
    ]
    version: str = "3.0.0"


class TaskParameters(BaseModel):
    # For code generation
    prompt: Optional[str] = None
    language: Optional[str] = "python"
    style: Optional[str] = "clean"
    max_lines: Optional[int] = None
    framework: Optional[str] = None

    # For refactoring / optimization / explanation / bug fix
    code: Optional[str] = None
    refactor_type: Optional[str] = (
        "optimize"  # optimize, simplify, modernize, dry, solid
    )
    optimization_target: Optional[str] = (
        None  # performance, readability, memory, security
    )
    bug_description: Optional[str] = None

    # For test generation
    test_framework: Optional[str] = None  # pytest, jest, unittest, mocha
    coverage_target: Optional[str] = "unit"  # unit, integration, e2e

    # General
    detail_level: Optional[str] = "standard"  # quick, standard, deep
    include_comments: bool = True
    include_docstrings: bool = True
    include_type_hints: bool = True

    # Legacy compatibility
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

AGENT_BEARER = os.getenv("AGENT_BEARER") or os.getenv("CODECRAFT_TOKEN")


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
    title="CodeCraft Agent",
    description="LLM-powered code generation, refactoring, optimization, and explanation",
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


def _format_context_for_prompt(context: Optional[List[Dict[str, Any]]]) -> str:
    """Format RAG context items into a string for LLM prompt enrichment."""
    if not context:
        return ""
    lines: List[str] = ["\n--- Relevant Project Context ---"]
    for i, item in enumerate(context[:5]):
        snippet = str(item.get("content", ""))
        if len(snippet) > 800:
            snippet = snippet[:800] + "..."
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

        # Return the raw content as the generated code
        return {
            "generated_code": cleaned,
            "language": "unknown",
            "explanation": "",
            "confidence_score": 0.5,
            "parse_error": True,
        }


def _extract_code_block(content: str) -> str:
    """Extract code from a markdown code block if present, otherwise return as-is."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        return "\n".join(lines)
    return cleaned


# ---------------------------------------------------------------------------
# Core Code Functions (LLM-Powered)
# ---------------------------------------------------------------------------


async def _generate_code(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Generate code using LLM with full prompt engineering."""
    if not params.prompt:
        raise HTTPException(
            status_code=422, detail="'prompt' is required for code generation."
        )

    language = params.language or "python"
    context_str = _format_context_for_prompt(context)

    style_instructions = {
        "clean": "Write clean, readable code following language best practices.",
        "minimal": "Write minimal, concise code with no unnecessary abstractions.",
        "enterprise": "Write enterprise-grade code with full error handling, logging, input validation, and documentation.",
        "functional": "Prefer functional programming patterns where appropriate.",
        "defensive": "Write defensively with thorough input validation, error handling, and edge case coverage.",
    }

    style_note = style_instructions.get(
        params.style or "clean", style_instructions["clean"]
    )

    user_prompt = f"""Generate production-ready {language} code for the following task:

Task: {params.prompt}

Requirements:
- Language: {language}
- {style_note}
{"- Framework: " + params.framework if params.framework else ""}
{"- Maximum approximately " + str(params.max_lines) + " lines" if params.max_lines else ""}
{"- Include type hints / type annotations" if params.include_type_hints else ""}
{"- Include docstrings / JSDoc" if params.include_docstrings else ""}
{"- Include inline comments for complex logic" if params.include_comments else ""}
{context_str}

Respond in JSON format:
{{
    "generated_code": "<complete, runnable code>",
    "language": "{language}",
    "explanation": "Brief explanation of the approach and key design decisions",
    "dependencies": ["list of external packages/libraries needed"],
    "usage_example": "Brief example showing how to use the generated code",
    "confidence_score": <0.0-1.0 based on how well you think this solves the task>,
    "notes": ["any important caveats or considerations"]
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="codecraft",
            task_type="code_generation",
            system_prompt=get_system_prompt("codecraft"),
            user_prompt=user_prompt,
            temperature=float(os.getenv("OPENAI_TEMPERATURE", "0.2")),
            max_tokens=int(os.getenv("OPENAI_MAX_TOKENS", "4096")),
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    # Ensure required fields exist
    if "generated_code" not in result:
        result["generated_code"] = response.content
    if "language" not in result:
        result["language"] = language
    if "confidence_score" not in result:
        result["confidence_score"] = 0.85

    return result


async def _refactor_code(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Refactor existing code using LLM analysis."""
    if not params.code:
        raise HTTPException(
            status_code=422, detail="'code' is required for refactoring."
        )

    language = params.language or "python"
    refactor_type = params.refactor_type or "optimize"
    context_str = _format_context_for_prompt(context)

    refactor_instructions = {
        "optimize": "Optimize the code for better performance while maintaining readability.",
        "simplify": "Simplify the code, removing unnecessary complexity and abstractions.",
        "modernize": "Modernize the code to use current language features and idioms.",
        "dry": "Apply DRY (Don't Repeat Yourself) principles, extracting common patterns.",
        "solid": "Refactor to better follow SOLID principles with proper abstraction boundaries.",
        "security": "Refactor to fix security issues, add input validation, and follow secure coding practices.",
        "testable": "Refactor to improve testability — inject dependencies, extract interfaces, reduce coupling.",
    }

    instruction = refactor_instructions.get(
        refactor_type, refactor_instructions["optimize"]
    )

    user_prompt = f"""Refactor the following {language} code.

Refactoring goal: {instruction}

Original code:
```{language}
{params.code[:8000]}
```

{"Additional context: " + params.prompt if params.prompt else ""}
{context_str}

Respond in JSON format:
{{
    "refactored_code": "<the complete refactored code>",
    "language": "{language}",
    "changes_made": [
        {{
            "description": "what was changed",
            "reason": "why it was changed",
            "impact": "HIGH|MEDIUM|LOW"
        }}
    ],
    "before_after_summary": "Brief summary of key differences",
    "improvement_metrics": {{
        "readability": "+/- assessment",
        "performance": "+/- assessment",
        "maintainability": "+/- assessment",
        "security": "+/- assessment"
    }},
    "confidence_score": <0.0-1.0>,
    "warnings": ["any potential issues with the refactoring"]
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="codecraft",
            task_type="refactor_code",
            system_prompt=get_system_prompt("codecraft"),
            user_prompt=user_prompt,
            temperature=0.15,
            max_tokens=int(os.getenv("OPENAI_MAX_TOKENS", "4096")),
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["refactor_type"] = refactor_type
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    if "refactored_code" not in result:
        result["refactored_code"] = response.content
    if "language" not in result:
        result["language"] = language
    if "confidence_score" not in result:
        result["confidence_score"] = 0.80

    return result


async def _explain_code(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Explain what existing code does using LLM analysis."""
    code = params.code or params.prompt
    if not code:
        raise HTTPException(
            status_code=422,
            detail="'code' or 'prompt' is required for code explanation.",
        )

    language = params.language or "auto-detect"
    detail = params.detail_level or "standard"
    context_str = _format_context_for_prompt(context)

    detail_instructions = {
        "quick": "Provide a brief, high-level explanation in 2-3 sentences.",
        "standard": "Provide a thorough explanation covering purpose, logic flow, and key patterns.",
        "deep": "Provide an exhaustive line-by-line analysis with algorithm complexity, design patterns used, and potential improvements.",
    }

    user_prompt = f"""Explain the following code:

```{language}
{code[:8000]}
```

Detail level: {detail_instructions.get(detail, detail_instructions["standard"])}
{context_str}

Respond in JSON format:
{{
    "summary": "One-paragraph summary of what the code does",
    "language_detected": "detected programming language",
    "purpose": "the primary purpose of this code",
    "logic_flow": [
        "Step-by-step description of the logic flow"
    ],
    "key_concepts": ["important concepts/patterns used"],
    "complexity": {{
        "time": "Big-O time complexity if applicable",
        "space": "Big-O space complexity if applicable",
        "cognitive": "LOW|MEDIUM|HIGH — how hard is this to understand"
    }},
    "potential_issues": ["any bugs, edge cases, or concerns spotted"],
    "suggestions": ["improvement suggestions if any"]
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="codecraft",
            task_type="explain_code",
            system_prompt=get_system_prompt("codecraft"),
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=2048,
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    return result


async def _optimize_code(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Optimize code for a specific target (performance, memory, readability, security)."""
    if not params.code:
        raise HTTPException(
            status_code=422, detail="'code' is required for optimization."
        )

    language = params.language or "python"
    target = params.optimization_target or "performance"
    context_str = _format_context_for_prompt(context)

    user_prompt = f"""Optimize the following {language} code for **{target}**.

Original code:
```{language}
{params.code[:8000]}
```

{"Additional notes: " + params.prompt if params.prompt else ""}
{context_str}

Optimization target: {target}

Respond in JSON format:
{{
    "optimized_code": "<the complete optimized code>",
    "language": "{language}",
    "optimization_target": "{target}",
    "optimizations_applied": [
        {{
            "description": "what was optimized",
            "technique": "optimization technique used",
            "expected_improvement": "estimated improvement (e.g., '~2x faster', '50% less memory')",
            "trade_off": "any trade-off introduced"
        }}
    ],
    "complexity_comparison": {{
        "original": {{"time": "O(?)", "space": "O(?)"}},
        "optimized": {{"time": "O(?)", "space": "O(?)"}}
    }},
    "benchmark_suggestion": "How to benchmark the improvement",
    "confidence_score": <0.0-1.0>,
    "warnings": ["any risks or caveats"]
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="codecraft",
            task_type="optimize_code",
            system_prompt=get_system_prompt("codecraft"),
            user_prompt=user_prompt,
            temperature=0.15,
            max_tokens=int(os.getenv("OPENAI_MAX_TOKENS", "4096")),
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    if "optimized_code" not in result:
        result["optimized_code"] = response.content
    if "language" not in result:
        result["language"] = language

    return result


async def _write_tests(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Generate test code for existing source code."""
    if not params.code:
        raise HTTPException(
            status_code=422, detail="'code' is required for test generation."
        )

    language = params.language or "python"
    test_framework = params.test_framework
    coverage_target = params.coverage_target or "unit"
    context_str = _format_context_for_prompt(context)

    # Auto-detect test framework based on language if not specified
    if not test_framework:
        framework_defaults = {
            "python": "pytest",
            "javascript": "jest",
            "typescript": "jest",
            "java": "junit5",
            "go": "testing",
            "rust": "built-in",
            "ruby": "rspec",
            "csharp": "xunit",
            "c#": "xunit",
        }
        test_framework = framework_defaults.get(language.lower(), "pytest")

    user_prompt = f"""Generate comprehensive {coverage_target} tests for the following {language} code using {test_framework}.

Source code to test:
```{language}
{params.code[:8000]}
```

{"Additional test requirements: " + params.prompt if params.prompt else ""}
{context_str}

Requirements:
- Test framework: {test_framework}
- Coverage target: {coverage_target} tests
- Cover happy paths, edge cases, and error conditions
- Use descriptive test names that explain the scenario
- Include setup/teardown where appropriate
- Mock external dependencies where needed

Respond in JSON format:
{{
    "test_code": "<complete, runnable test code>",
    "test_framework": "{test_framework}",
    "language": "{language}",
    "test_cases": [
        {{
            "name": "test function name",
            "description": "what it tests",
            "category": "happy_path|edge_case|error_handling|boundary"
        }}
    ],
    "total_test_count": <number>,
    "coverage_estimate": "estimated code coverage percentage",
    "setup_instructions": "How to install dependencies and run these tests",
    "mocking_notes": ["any mocking strategy notes"],
    "confidence_score": <0.0-1.0>
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="codecraft",
            task_type="write_tests",
            system_prompt=get_system_prompt("codecraft"),
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=int(os.getenv("OPENAI_MAX_TOKENS", "4096")),
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    if "test_code" not in result:
        result["test_code"] = response.content
    if "language" not in result:
        result["language"] = language

    return result


async def _fix_bug(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Analyze and fix a bug in existing code."""
    if not params.code:
        raise HTTPException(
            status_code=422, detail="'code' is required for bug fixing."
        )

    language = params.language or "python"
    bug_desc = (
        params.bug_description
        or params.prompt
        or "Unknown bug — please analyze and identify issues."
    )
    context_str = _format_context_for_prompt(context)

    user_prompt = f"""Analyze and fix the bug in the following {language} code.

Bug description: {bug_desc}

Buggy code:
```{language}
{params.code[:8000]}
```

{context_str}

Respond in JSON format:
{{
    "fixed_code": "<the complete fixed code>",
    "language": "{language}",
    "bug_analysis": {{
        "root_cause": "description of the root cause",
        "bug_type": "logic|runtime|concurrency|memory|type|syntax|security|off-by-one|null-reference|other",
        "severity": "CRITICAL|HIGH|MEDIUM|LOW",
        "affected_lines": "line numbers or ranges affected"
    }},
    "fix_description": "Detailed description of what was fixed and why",
    "changes_made": [
        {{
            "location": "where the change was made",
            "before": "original code snippet",
            "after": "fixed code snippet",
            "reason": "why this change fixes the bug"
        }}
    ],
    "prevention_tips": ["how to prevent this type of bug in the future"],
    "test_suggestion": "A test case that would catch this bug",
    "confidence_score": <0.0-1.0>
}}"""

    llm = await get_llm()
    response = await llm.complete(
        LLMRequest(
            agent_id="codecraft",
            task_type="fix_bug",
            system_prompt=get_system_prompt("codecraft"),
            user_prompt=user_prompt,
            temperature=0.1,
            max_tokens=int(os.getenv("OPENAI_MAX_TOKENS", "4096")),
            response_format="json",
        )
    )

    result = _parse_llm_json(response.content)
    result["llm_provider"] = response.provider
    result["llm_model"] = response.model
    result["tokens_used"] = response.tokens_used
    result["cost_usd"] = response.cost_usd

    if "fixed_code" not in result:
        result["fixed_code"] = response.content
    if "language" not in result:
        result["language"] = language

    return result


# ---------------------------------------------------------------------------
# Task type router
# ---------------------------------------------------------------------------

TASK_HANDLERS = {
    "generate_code": _generate_code,
    "refactor_code": _refactor_code,
    "explain_code": _explain_code,
    "optimize_code": _optimize_code,
    "write_tests": _write_tests,
    "fix_bug": _fix_bug,
    # Legacy / alias mappings
    "generate": _generate_code,
    "refactor": _refactor_code,
    "explain": _explain_code,
    "optimize": _optimize_code,
    "test": _write_tests,
    "fix": _fix_bug,
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
        "Executing task %s (type=%s, language=%s)",
        task.task_id,
        task.task_type,
        task.parameters.language,
    )

    handler = TASK_HANDLERS.get(task.task_type)
    if handler is None:
        supported = sorted(set(TASK_HANDLERS.keys()))
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
    port = int(os.getenv("PORT", 8012))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
