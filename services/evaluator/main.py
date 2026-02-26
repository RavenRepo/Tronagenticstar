#!/usr/bin/env python3
"""
Evaluator Agent Micro-service (ADR-012 Compliant)
==================================================
Specialized agent for LLM-powered code quality assessment, performance
evaluation, technical debt analysis, and best-practices enforcement.

Uses the shared Constella LLM Provider for multi-provider support with
automatic failover, rate limiting, and cost tracking.
"""

import json
import logging
import os
import re
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
            "service": "evaluator",
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


logger = logging.getLogger("evaluator")
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
    agent_id: str = "evaluator"
    agent_type: str = "guardian"
    task_type: str = "EVALUATION"
    capabilities: List[str] = [
        "evaluate_quality",
        "evaluate_performance",
        "evaluate_technical_debt",
        "evaluate_best_practices",
        "evaluate_test_coverage",
        "code_review",
    ]
    version: str = "3.0.0"


class TaskParameters(BaseModel):
    # Primary inputs
    code: Optional[str] = None
    language: Optional[str] = None
    filename: Optional[str] = None

    # Quality evaluation
    metrics: Optional[List[str]] = None
    quality_standards: Optional[str] = None  # e.g. "SOLID", "clean-code", "PEP8"

    # Performance evaluation
    performance_criteria: Optional[List[str]] = None

    # Technical debt
    code_snippets: Optional[List[str]] = None
    debt_types: Optional[List[str]] = None  # duplication, complexity, outdated, etc.

    # Code review
    diff: Optional[str] = None  # Git diff for review
    review_focus: Optional[str] = None  # security, performance, readability, etc.
    pull_request_description: Optional[str] = None

    # Best practices
    framework: Optional[str] = None  # react, express, django, fastapi, etc.
    project_type: Optional[str] = None  # api, webapp, library, cli, etc.

    # Test coverage
    test_code: Optional[str] = None
    source_code: Optional[str] = None
    coverage_report: Optional[str] = None

    # General options
    severity_threshold: Optional[str] = "LOW"  # LOW, MEDIUM, HIGH, CRITICAL
    include_examples: bool = True
    evaluation_depth: Optional[str] = "standard"  # quick, standard, deep


class Task(BaseModel):
    task_id: str
    task_type: str
    parameters: TaskParameters
    context: Optional[List[Dict[str, Any]]] = None


class QualityIssue(BaseModel):
    id: str
    title: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW, INFO
    category: str  # complexity, naming, duplication, structure, documentation, etc.
    description: str
    location: Optional[str] = None
    line_number: Optional[int] = None
    suggestion: Optional[str] = None
    code_example: Optional[str] = None
    effort_estimate: Optional[str] = None  # trivial, small, medium, large


class QualityReport(BaseModel):
    report_id: str
    evaluation_type: str
    target_summary: str
    overall_score: float  # 0-100
    grade: str  # A, B, C, D, F
    issues: List[QualityIssue] = []
    metrics: Dict[str, Any] = {}
    strengths: List[str] = []
    recommendations: List[str] = []
    executive_summary: str
    evaluation_duration_ms: float
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None


class TaskResultMetrics(BaseModel):
    processing_time_ms: float
    tokens_used: Optional[int] = None
    llm_cost_usd: Optional[float] = None
    issues_found: int = 0


class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    metrics: TaskResultMetrics


# ---------------------------------------------------------------------------
# Static Analysis Metrics (pre-LLM fast checks)
# ---------------------------------------------------------------------------


def calculate_cyclomatic_complexity(code: str) -> int:
    """Approximate cyclomatic complexity by counting decision points."""
    decision_keywords = [
        r"\bif\b",
        r"\belif\b",
        r"\belse\b",
        r"\bfor\b",
        r"\bwhile\b",
        r"\bexcept\b",
        r"\bcatch\b",
        r"\bcase\b",
        r"\b\?\b",
        r"&&",
        r"\|\|",
        r"\band\b",
        r"\bor\b",
        r"\?\?",
        r"\bswitch\b",
    ]
    count = 1  # Base complexity
    for pattern in decision_keywords:
        count += len(re.findall(pattern, code))
    return count


def calculate_code_metrics(code: str, language: Optional[str] = None) -> Dict[str, Any]:
    """Calculate basic code metrics without LLM (fast, deterministic)."""
    lines = code.split("\n")
    total_lines = len(lines)
    blank_lines = sum(1 for line in lines if not line.strip())
    comment_lines = 0

    # Language-specific comment detection
    for line in lines:
        stripped = line.strip()
        if language in ("python", "ruby", "bash", "shell"):
            if stripped.startswith("#"):
                comment_lines += 1
        elif language in (
            "javascript",
            "typescript",
            "java",
            "go",
            "rust",
            "c",
            "cpp",
            "csharp",
        ):
            if (
                stripped.startswith("//")
                or stripped.startswith("/*")
                or stripped.startswith("*")
            ):
                comment_lines += 1
        else:
            if (
                stripped.startswith("#")
                or stripped.startswith("//")
                or stripped.startswith("/*")
            ):
                comment_lines += 1

    code_lines = total_lines - blank_lines - comment_lines

    # Function/method count
    function_patterns = [
        r"\bdef\s+\w+",  # Python
        r"\bfunction\s+\w+",  # JavaScript
        r"\basync\s+function\s+\w+",
        r"\bconst\s+\w+\s*=\s*(?:async\s*)?\(",  # Arrow functions
        r"\bfunc\s+\w+",  # Go
        r"\bfn\s+\w+",  # Rust
        r"(?:public|private|protected)\s+\w+\s+\w+\s*\(",  # Java/C#
    ]
    function_count = 0
    for pattern in function_patterns:
        function_count += len(re.findall(pattern, code))

    # Class count
    class_count = len(re.findall(r"\bclass\s+\w+", code))

    # Import count
    import_patterns = [
        r"^\s*import\s+",
        r"^\s*from\s+\w+\s+import\s+",
        r"\brequire\s*\(",
        r"^\s*use\s+",
    ]
    import_count = 0
    for pattern in import_patterns:
        import_count += len(re.findall(pattern, code, re.MULTILINE))

    # Average line length
    non_blank_lines = [line for line in lines if line.strip()]
    avg_line_length = sum(len(line) for line in non_blank_lines) / max(
        len(non_blank_lines), 1
    )

    # Max line length
    max_line_length = max((len(line) for line in lines), default=0)

    # Long lines (> 120 chars)
    long_lines = sum(1 for line in lines if len(line) > 120)

    # TODO/FIXME/HACK count
    todo_count = len(re.findall(r"\b(TODO|FIXME|HACK|XXX|TEMP)\b", code, re.IGNORECASE))

    # Nesting depth approximation
    max_indent = 0
    for line in lines:
        if line.strip():
            indent = len(line) - len(line.lstrip())
            spaces_per_indent = 4 if language == "python" else 2
            depth = indent // max(spaces_per_indent, 1)
            max_indent = max(max_indent, depth)

    # Duplication detection (simple: repeated lines)
    non_trivial_lines = [
        line.strip()
        for line in lines
        if line.strip()
        and len(line.strip()) > 10
        and not line.strip().startswith(("#", "//", "/*", "*", "import", "from"))
    ]
    seen = {}
    duplicated_lines = 0
    for line in non_trivial_lines:
        seen[line] = seen.get(line, 0) + 1
    for count in seen.values():
        if count > 1:
            duplicated_lines += count - 1

    complexity = calculate_cyclomatic_complexity(code)

    comment_ratio = comment_lines / max(code_lines, 1) * 100

    return {
        "total_lines": total_lines,
        "code_lines": code_lines,
        "blank_lines": blank_lines,
        "comment_lines": comment_lines,
        "comment_ratio_percent": round(comment_ratio, 1),
        "function_count": function_count,
        "class_count": class_count,
        "import_count": import_count,
        "cyclomatic_complexity": complexity,
        "avg_line_length": round(avg_line_length, 1),
        "max_line_length": max_line_length,
        "long_lines_over_120": long_lines,
        "max_nesting_depth": max_indent,
        "todo_fixme_count": todo_count,
        "duplicated_lines": duplicated_lines,
        "duplication_ratio_percent": round(
            duplicated_lines / max(len(non_trivial_lines), 1) * 100, 1
        ),
    }


def score_from_metrics(metrics: Dict[str, Any]) -> float:
    """Calculate a preliminary quality score from static metrics."""
    score = 100.0

    # Complexity penalty
    complexity = metrics.get("cyclomatic_complexity", 1)
    if complexity > 50:
        score -= 25
    elif complexity > 30:
        score -= 15
    elif complexity > 20:
        score -= 8
    elif complexity > 10:
        score -= 3

    # Comment ratio bonus/penalty
    comment_ratio = metrics.get("comment_ratio_percent", 0)
    if comment_ratio < 3:
        score -= 10  # No documentation
    elif comment_ratio < 10:
        score -= 3
    elif comment_ratio > 50:
        score -= 5  # Over-commented

    # Long lines penalty
    long_lines = metrics.get("long_lines_over_120", 0)
    total_lines = max(metrics.get("code_lines", 1), 1)
    if long_lines / total_lines > 0.2:
        score -= 10
    elif long_lines > 5:
        score -= 3

    # Deep nesting penalty
    max_depth = metrics.get("max_nesting_depth", 0)
    if max_depth > 6:
        score -= 15
    elif max_depth > 4:
        score -= 7
    elif max_depth > 3:
        score -= 3

    # Duplication penalty
    dup_ratio = metrics.get("duplication_ratio_percent", 0)
    if dup_ratio > 15:
        score -= 15
    elif dup_ratio > 8:
        score -= 8
    elif dup_ratio > 3:
        score -= 3

    # TODO/FIXME penalty
    todos = metrics.get("todo_fixme_count", 0)
    if todos > 10:
        score -= 10
    elif todos > 5:
        score -= 5
    elif todos > 0:
        score -= 2

    return max(0.0, min(100.0, score))


def detect_language(code: str, filename: Optional[str] = None) -> str:
    """Detect programming language from filename or code heuristics."""
    if filename:
        ext_map = {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".jsx": "javascript",
            ".java": "java",
            ".go": "go",
            ".rs": "rust",
            ".rb": "ruby",
            ".php": "php",
            ".cs": "csharp",
            ".cpp": "cpp",
            ".c": "c",
            ".sh": "bash",
            ".sql": "sql",
        }
        for ext, lang in ext_map.items():
            if filename.lower().endswith(ext):
                return lang

    if "def " in code and "import " in code:
        return "python"
    if "function " in code or "const " in code or "=>" in code:
        return "javascript"
    if "interface " in code and ": " in code:
        return "typescript"
    if "func " in code and "package " in code:
        return "go"
    if "fn " in code and "let " in code and "::" in code:
        return "rust"

    return "unknown"


def score_to_grade(score: float) -> str:
    """Convert a numeric score (0-100) to a letter grade."""
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 70:
        return "C"
    elif score >= 60:
        return "D"
    return "F"


# ---------------------------------------------------------------------------
# Auth Middleware
# ---------------------------------------------------------------------------

AGENT_BEARER = os.getenv("AGENT_BEARER")


async def verify_orchestrator(request: Request):
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
    title="Evaluator Agent",
    description="LLM-powered code quality assessment, performance evaluation, and technical debt analysis",
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
# Helper functions
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
            "executive_summary": cleaned[:500],
            "issues": [],
            "overall_score": 50,
            "parse_error": True,
        }


# ---------------------------------------------------------------------------
# Core Evaluation Functions
# ---------------------------------------------------------------------------


async def _evaluate_quality(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Comprehensive LLM-powered code quality evaluation."""
    code = params.code
    if not code:
        raise HTTPException(
            status_code=422, detail="'code' is required for quality evaluation."
        )

    report_id = f"qual_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    language = params.language or detect_language(code, params.filename)

    # Phase 1: Static metric calculation (fast, deterministic)
    static_metrics = calculate_code_metrics(code, language)
    static_score = score_from_metrics(static_metrics)

    # Phase 2: LLM deep quality analysis
    llm_provider_name = None
    llm_model_name = None
    tokens_used = 0
    cost_usd = 0.0
    llm_issues = []
    llm_strengths = []
    llm_recommendations = []
    llm_summary = ""
    llm_score = static_score

    try:
        llm = await get_llm()
        context_str = await _build_context_string(context)

        depth_instruction = ""
        if params.evaluation_depth == "quick":
            depth_instruction = "Perform a quick review focusing only on major issues (CRITICAL and HIGH severity)."
        elif params.evaluation_depth == "deep":
            depth_instruction = (
                "Perform an exhaustive deep review. Check for: SOLID violations, "
                "design pattern misuse, hidden complexity, naming conventions, error handling "
                "completeness, edge cases, thread safety, memory management, and API design quality."
            )
        else:
            depth_instruction = "Perform a standard code quality review covering common quality dimensions."

        standards_instruction = ""
        if params.quality_standards:
            standards_instruction = f"\nEvaluate specifically against: {params.quality_standards} standards."

        user_prompt = f"""Evaluate the quality of this {language} code.

{depth_instruction}
{standards_instruction}

Code to evaluate ({static_metrics["total_lines"]} lines, {static_metrics["function_count"]} functions, {static_metrics["class_count"]} classes):
```{language}
{code[:8000]}
```

Static analysis metrics (already calculated, DO NOT recalculate these):
{json.dumps(static_metrics, indent=2)}

Preliminary static score: {static_score}/100
{context_str}

Provide your evaluation as ONLY a valid JSON object (no markdown, no text outside JSON):
{{
    "overall_score": <float 0-100, your LLM-assessed quality score>,
    "issues": [
        {{
            "title": "Concise issue title",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
            "category": "complexity|naming|duplication|structure|documentation|error_handling|testing|design|performance|security|maintainability",
            "description": "Detailed description of the issue",
            "location": "Function name or code area",
            "line_number": <int or null>,
            "suggestion": "Specific actionable suggestion to fix",
            "code_example": "Brief corrected code example if applicable, or null",
            "effort_estimate": "trivial|small|medium|large"
        }}
    ],
    "strengths": ["List of things the code does well"],
    "recommendations": ["Prioritized improvement recommendations"],
    "executive_summary": "2-3 sentence summary of code quality assessment",
    "detailed_metrics": {{
        "readability_score": <0-100>,
        "maintainability_score": <0-100>,
        "reliability_score": <0-100>,
        "reusability_score": <0-100>,
        "testability_score": <0-100>
    }}
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="evaluator",
                task_type="quality_evaluation",
                system_prompt=get_system_prompt("evaluator"),
                user_prompt=user_prompt,
                temperature=0.15,
                max_tokens=4096,
                json_mode=True,
            )
        )

        llm_provider_name = response.provider
        llm_model_name = response.model
        tokens_used = response.total_tokens
        cost_usd = response.cost_usd

        parsed = _parse_llm_json(response.content)

        llm_score = parsed.get("overall_score", static_score)
        llm_summary = parsed.get("executive_summary", "")
        llm_strengths = parsed.get("strengths", [])
        llm_recommendations = parsed.get("recommendations", [])

        for v in parsed.get("issues", []):
            llm_issues.append(v)

        # Merge LLM detailed metrics with static metrics
        detailed = parsed.get("detailed_metrics", {})
        if detailed:
            static_metrics["readability_score"] = detailed.get("readability_score", 0)
            static_metrics["maintainability_score"] = detailed.get(
                "maintainability_score", 0
            )
            static_metrics["reliability_score"] = detailed.get("reliability_score", 0)
            static_metrics["reusability_score"] = detailed.get("reusability_score", 0)
            static_metrics["testability_score"] = detailed.get("testability_score", 0)

    except Exception as e:
        logger.warning(
            "LLM quality analysis failed, using static results only: %s", str(e)[:300]
        )
        llm_summary = "LLM analysis unavailable. Results based on static analysis only."

    # Combine scores: weighted average (LLM 70%, static 30%)
    combined_score = round(llm_score * 0.7 + static_score * 0.3, 1)
    grade = score_to_grade(combined_score)

    # Filter by severity threshold
    severity_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "INFO": 0}
    threshold = severity_order.get(params.severity_threshold or "LOW", 0)
    filtered_issues = [
        i
        for i in llm_issues
        if severity_order.get(i.get("severity", "LOW"), 0) >= threshold
    ]

    # Sort by severity
    filtered_issues.sort(
        key=lambda x: severity_order.get(x.get("severity", "LOW"), 0), reverse=True
    )

    # Build issue objects
    issues = []
    for idx, raw in enumerate(filtered_issues[:50]):
        issues.append(
            QualityIssue(
                id=f"QI-{report_id[-8:]}-{idx + 1:03d}",
                title=raw.get("title", "Unknown issue"),
                severity=raw.get("severity", "MEDIUM"),
                category=raw.get("category", "general"),
                description=raw.get("description", raw.get("title", "")),
                location=raw.get("location"),
                line_number=raw.get("line_number"),
                suggestion=raw.get("suggestion") if params.include_examples else None,
                code_example=raw.get("code_example")
                if params.include_examples
                else None,
                effort_estimate=raw.get("effort_estimate"),
            )
        )

    # Statistics
    stats = {"total": len(issues)}
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]:
        stats[sev.lower()] = len([i for i in issues if i.severity == sev])

    if not llm_summary:
        llm_summary = (
            f"Code quality evaluation of {language} code ({static_metrics['total_lines']} lines) "
            f"resulted in a score of {combined_score}/100 (grade {grade}). "
            f"Found {len(issues)} issues ({stats.get('critical', 0)} critical, "
            f"{stats.get('high', 0)} high, {stats.get('medium', 0)} medium)."
        )

    evaluation_duration_ms = (time.time() - start_time) * 1000

    report = QualityReport(
        report_id=report_id,
        evaluation_type="code_quality",
        target_summary=f"{language} code ({static_metrics['total_lines']} lines, {static_metrics['function_count']} functions)",
        overall_score=combined_score,
        grade=grade,
        issues=issues,
        metrics=static_metrics,
        strengths=llm_strengths or ["Code was submitted for quality evaluation"],
        recommendations=llm_recommendations
        or [
            "Consider adding more inline documentation",
            "Run a static analysis tool as part of CI/CD",
            "Add unit tests for critical functions",
        ],
        executive_summary=llm_summary,
        evaluation_duration_ms=evaluation_duration_ms,
        llm_provider=llm_provider_name,
        llm_model=llm_model_name,
    )

    return {
        "report": report.dict(),
        "statistics": stats,
        "tokens_used": tokens_used,
        "cost_usd": cost_usd,
    }


async def _evaluate_performance(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """LLM-powered performance evaluation of code."""
    code = params.code
    if not code:
        raise HTTPException(
            status_code=422, detail="'code' is required for performance evaluation."
        )

    report_id = f"perf_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    language = params.language or detect_language(code, params.filename)
    static_metrics = calculate_code_metrics(code, language)
    context_str = await _build_context_string(context)

    criteria_text = ""
    if params.performance_criteria:
        criteria_text = f"\nFocus on these performance criteria: {', '.join(params.performance_criteria)}"

    tokens_used = 0
    cost_usd = 0.0
    llm_provider_name = None
    llm_model_name = None

    try:
        llm = await get_llm()

        user_prompt = f"""Analyze the performance characteristics of this {language} code.
{criteria_text}

Code to analyze:
```{language}
{code[:8000]}
```

Static metrics:
- Lines: {static_metrics["total_lines"]}, Functions: {static_metrics["function_count"]}
- Cyclomatic complexity: {static_metrics["cyclomatic_complexity"]}
- Max nesting depth: {static_metrics["max_nesting_depth"]}
{context_str}

Analyze for:
1. Time complexity (Big-O) of key functions/algorithms
2. Space complexity
3. I/O bottlenecks (file, network, database)
4. Memory usage patterns (leaks, excessive allocation)
5. Concurrency issues (blocking, race conditions)
6. Caching opportunities
7. Algorithmic inefficiencies

Respond with ONLY a valid JSON object:
{{
    "overall_score": <float 0-100, performance quality score>,
    "issues": [
        {{
            "title": "Performance issue title",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
            "category": "time_complexity|space_complexity|io_bottleneck|memory|concurrency|algorithm|caching",
            "description": "Detailed description including complexity analysis",
            "location": "Function or code area",
            "line_number": <int or null>,
            "suggestion": "Specific optimization recommendation with expected improvement",
            "effort_estimate": "trivial|small|medium|large"
        }}
    ],
    "complexity_analysis": {{
        "overall_time_complexity": "O(n), O(n^2), etc.",
        "overall_space_complexity": "O(1), O(n), etc.",
        "hotspot_functions": ["function names that dominate performance"]
    }},
    "optimization_opportunities": [
        {{
            "description": "What to optimize",
            "expected_improvement": "e.g. 2x faster, 50% less memory",
            "effort": "trivial|small|medium|large",
            "priority": "high|medium|low"
        }}
    ],
    "strengths": ["Performance-related strengths"],
    "executive_summary": "2-3 sentence performance assessment"
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="evaluator",
                task_type="quality_evaluation",
                system_prompt=get_system_prompt("evaluator"),
                user_prompt=user_prompt,
                temperature=0.15,
                max_tokens=4096,
                json_mode=True,
            )
        )

        llm_provider_name = response.provider
        llm_model_name = response.model
        tokens_used = response.total_tokens
        cost_usd = response.cost_usd

        parsed = _parse_llm_json(response.content)
        evaluation_duration_ms = (time.time() - start_time) * 1000

        score = parsed.get("overall_score", 70)
        grade = score_to_grade(score)

        issues = []
        for idx, raw in enumerate(parsed.get("issues", [])[:30]):
            issues.append(
                QualityIssue(
                    id=f"PI-{report_id[-8:]}-{idx + 1:03d}",
                    title=raw.get("title", "Unknown"),
                    severity=raw.get("severity", "MEDIUM"),
                    category=raw.get("category", "performance"),
                    description=raw.get("description", ""),
                    location=raw.get("location"),
                    line_number=raw.get("line_number"),
                    suggestion=raw.get("suggestion"),
                    effort_estimate=raw.get("effort_estimate"),
                )
            )

        report = QualityReport(
            report_id=report_id,
            evaluation_type="performance",
            target_summary=f"{language} code ({static_metrics['total_lines']} lines)",
            overall_score=score,
            grade=grade,
            issues=issues,
            metrics={
                **static_metrics,
                "complexity_analysis": parsed.get("complexity_analysis", {}),
                "optimization_opportunities": parsed.get(
                    "optimization_opportunities", []
                ),
            },
            strengths=parsed.get("strengths", []),
            recommendations=[
                opt.get("description", "")
                for opt in parsed.get("optimization_opportunities", [])[:5]
            ],
            executive_summary=parsed.get(
                "executive_summary",
                f"Performance analysis completed with score {score}/100.",
            ),
            evaluation_duration_ms=evaluation_duration_ms,
            llm_provider=llm_provider_name,
            llm_model=llm_model_name,
        )

        return {
            "report": report.dict(),
            "tokens_used": tokens_used,
            "cost_usd": cost_usd,
        }

    except Exception as e:
        logger.error("Performance evaluation failed: %s", str(e))
        raise HTTPException(
            status_code=500, detail=f"Performance evaluation failed: {str(e)}"
        )


async def _evaluate_technical_debt(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """LLM-powered technical debt assessment."""
    code = params.code
    code_snippets = params.code_snippets or []
    if not code and not code_snippets:
        raise HTTPException(
            status_code=422,
            detail="'code' or 'code_snippets' is required for technical debt evaluation.",
        )

    combined_code = code or "\n\n---\n\n".join(code_snippets)
    report_id = f"debt_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    language = params.language or detect_language(combined_code, params.filename)
    static_metrics = calculate_code_metrics(combined_code, language)
    context_str = await _build_context_string(context)

    debt_focus = ""
    if params.debt_types:
        debt_focus = f"\nFocus on these debt types: {', '.join(params.debt_types)}"

    tokens_used = 0
    cost_usd = 0.0

    try:
        llm = await get_llm()

        user_prompt = f"""Assess the technical debt in this {language} code.
{debt_focus}

Code to assess:
```{language}
{combined_code[:8000]}
```

Static metrics:
- Cyclomatic complexity: {static_metrics["cyclomatic_complexity"]}
- Duplication ratio: {static_metrics["duplication_ratio_percent"]}%
- TODO/FIXME count: {static_metrics["todo_fixme_count"]}
- Max nesting depth: {static_metrics["max_nesting_depth"]}
{context_str}

Categorize technical debt into:
- **Design Debt**: Architecture/pattern issues that slow future development
- **Code Debt**: Code smells, duplication, poor naming, magic numbers
- **Test Debt**: Missing tests, poor test quality, low coverage
- **Documentation Debt**: Missing or outdated docs, unclear APIs
- **Dependency Debt**: Outdated libraries, unnecessary dependencies
- **Infrastructure Debt**: Build/deploy issues, config problems

Respond with ONLY a valid JSON object:
{{
    "overall_score": <float 0-100, lower means more debt>,
    "total_debt_hours": <estimated hours to resolve all debt>,
    "debt_breakdown": {{
        "design_debt": {{"score": 0-100, "hours": 0, "items": ["item1"]}},
        "code_debt": {{"score": 0-100, "hours": 0, "items": ["item1"]}},
        "test_debt": {{"score": 0-100, "hours": 0, "items": ["item1"]}},
        "documentation_debt": {{"score": 0-100, "hours": 0, "items": ["item1"]}},
        "dependency_debt": {{"score": 0-100, "hours": 0, "items": ["item1"]}},
        "infrastructure_debt": {{"score": 0-100, "hours": 0, "items": ["item1"]}}
    }},
    "issues": [
        {{
            "title": "Debt item title",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW",
            "category": "design|code|test|documentation|dependency|infrastructure",
            "description": "What the debt is and why it matters",
            "suggestion": "How to pay down this debt",
            "effort_estimate": "trivial|small|medium|large"
        }}
    ],
    "prioritized_payoff_plan": [
        {{
            "step": 1,
            "action": "What to do first",
            "effort_hours": 2,
            "impact": "high|medium|low",
            "reason": "Why this should be done first"
        }}
    ],
    "executive_summary": "2-3 sentence debt assessment"
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="evaluator",
                task_type="quality_evaluation",
                system_prompt=get_system_prompt("evaluator"),
                user_prompt=user_prompt,
                temperature=0.15,
                max_tokens=4096,
                json_mode=True,
            )
        )

        tokens_used = response.total_tokens
        cost_usd = response.cost_usd

        parsed = _parse_llm_json(response.content)
        evaluation_duration_ms = (time.time() - start_time) * 1000

        score = parsed.get("overall_score", 50)
        grade = score_to_grade(score)

        issues = []
        for idx, raw in enumerate(parsed.get("issues", [])[:30]):
            issues.append(
                QualityIssue(
                    id=f"TD-{report_id[-8:]}-{idx + 1:03d}",
                    title=raw.get("title", "Unknown"),
                    severity=raw.get("severity", "MEDIUM"),
                    category=raw.get("category", "code"),
                    description=raw.get("description", ""),
                    suggestion=raw.get("suggestion"),
                    effort_estimate=raw.get("effort_estimate"),
                )
            )

        report = QualityReport(
            report_id=report_id,
            evaluation_type="technical_debt",
            target_summary=f"{language} code ({static_metrics['total_lines']} lines)",
            overall_score=score,
            grade=grade,
            issues=issues,
            metrics={
                **static_metrics,
                "total_debt_hours": parsed.get("total_debt_hours", 0),
                "debt_breakdown": parsed.get("debt_breakdown", {}),
            },
            strengths=[],
            recommendations=[
                step.get("action", "")
                for step in parsed.get("prioritized_payoff_plan", [])[:5]
            ],
            executive_summary=parsed.get(
                "executive_summary",
                f"Technical debt assessment completed with score {score}/100.",
            ),
            evaluation_duration_ms=evaluation_duration_ms,
            llm_provider=response.provider,
            llm_model=response.model,
        )

        return {
            "report": report.dict(),
            "payoff_plan": parsed.get("prioritized_payoff_plan", []),
            "tokens_used": tokens_used,
            "cost_usd": cost_usd,
        }

    except Exception as e:
        logger.error("Technical debt evaluation failed: %s", str(e))
        raise HTTPException(
            status_code=500, detail=f"Technical debt evaluation failed: {str(e)}"
        )


async def _code_review(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """LLM-powered code review (simulating a senior engineer review)."""
    code = params.code or params.diff
    if not code:
        raise HTTPException(
            status_code=422, detail="'code' or 'diff' is required for code review."
        )

    report_id = f"rev_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    language = params.language or detect_language(code, params.filename)
    is_diff = bool(params.diff)
    context_str = await _build_context_string(context)

    focus_instruction = ""
    if params.review_focus:
        focus_instruction = f"\nFocus your review on: {params.review_focus}"

    pr_description = ""
    if params.pull_request_description:
        pr_description = (
            f"\nPull Request Description:\n{params.pull_request_description[:2000]}"
        )

    tokens_used = 0
    cost_usd = 0.0

    try:
        llm = await get_llm()

        code_label = "diff" if is_diff else "code"

        user_prompt = f"""You are performing a thorough code review as a senior engineer.
{focus_instruction}
{pr_description}

{code_label.capitalize()} to review ({language}):
```{language}
{code[:8000]}
```
{context_str}

Provide a comprehensive review covering:
1. **Correctness**: Logic errors, edge cases, off-by-one errors
2. **Readability**: Naming, structure, comments, clarity
3. **Performance**: Unnecessary computation, N+1 queries, memory leaks
4. **Security**: Input validation, injection risks, auth issues
5. **Maintainability**: SOLID principles, coupling, cohesion
6. **Error handling**: Missing try/catch, unhelpful error messages
7. **Testing**: Testability, missing test scenarios

Respond with ONLY a valid JSON object:
{{
    "overall_score": <float 0-100>,
    "verdict": "APPROVE|REQUEST_CHANGES|COMMENT",
    "issues": [
        {{
            "title": "Issue title",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
            "category": "correctness|readability|performance|security|maintainability|error_handling|testing|style",
            "description": "What the issue is",
            "location": "Function or line reference",
            "line_number": <int or null>,
            "suggestion": "Specific suggestion with code example if applicable",
            "effort_estimate": "trivial|small|medium|large"
        }}
    ],
    "strengths": ["Things done well that should be maintained"],
    "blocking_issues": ["Issues that MUST be fixed before merge"],
    "nit_picks": ["Minor style/preference suggestions"],
    "executive_summary": "2-3 sentence review summary suitable for a PR comment"
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="evaluator",
                task_type="code_review",
                system_prompt=get_system_prompt("evaluator"),
                user_prompt=user_prompt,
                temperature=0.15,
                max_tokens=4096,
                json_mode=True,
            )
        )

        tokens_used = response.total_tokens
        cost_usd = response.cost_usd

        parsed = _parse_llm_json(response.content)
        evaluation_duration_ms = (time.time() - start_time) * 1000

        score = parsed.get("overall_score", 70)
        grade = score_to_grade(score)
        verdict = parsed.get("verdict", "COMMENT")

        issues = []
        for idx, raw in enumerate(parsed.get("issues", [])[:50]):
            issues.append(
                QualityIssue(
                    id=f"CR-{report_id[-8:]}-{idx + 1:03d}",
                    title=raw.get("title", "Unknown"),
                    severity=raw.get("severity", "MEDIUM"),
                    category=raw.get("category", "general"),
                    description=raw.get("description", ""),
                    location=raw.get("location"),
                    line_number=raw.get("line_number"),
                    suggestion=raw.get("suggestion"),
                    effort_estimate=raw.get("effort_estimate"),
                )
            )

        report = QualityReport(
            report_id=report_id,
            evaluation_type="code_review",
            target_summary=f"{language} {'diff' if is_diff else 'code'} ({len(code.splitlines())} lines)",
            overall_score=score,
            grade=grade,
            issues=issues,
            metrics={
                "verdict": verdict,
                "blocking_issues": parsed.get("blocking_issues", []),
                "nit_picks": parsed.get("nit_picks", []),
            },
            strengths=parsed.get("strengths", []),
            recommendations=parsed.get("blocking_issues", [])
            + [f"[nit] {n}" for n in parsed.get("nit_picks", [])[:3]],
            executive_summary=parsed.get(
                "executive_summary",
                f"Code review completed: {verdict}. Score: {score}/100.",
            ),
            evaluation_duration_ms=evaluation_duration_ms,
            llm_provider=response.provider,
            llm_model=response.model,
        )

        return {
            "report": report.dict(),
            "verdict": verdict,
            "tokens_used": tokens_used,
            "cost_usd": cost_usd,
        }

    except Exception as e:
        logger.error("Code review failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Code review failed: {str(e)}")


async def _evaluate_best_practices(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Evaluate code against framework and language best practices."""
    code = params.code
    if not code:
        raise HTTPException(
            status_code=422, detail="'code' is required for best practices evaluation."
        )

    report_id = f"bp_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    language = params.language or detect_language(code, params.filename)
    framework = params.framework or "general"
    project_type = params.project_type or "general"
    context_str = await _build_context_string(context)

    tokens_used = 0
    cost_usd = 0.0

    try:
        llm = await get_llm()

        user_prompt = f"""Evaluate this {language} code against best practices for {framework} {project_type} projects.

Code:
```{language}
{code[:8000]}
```
{context_str}

Check against these best practice categories:
1. **Language idioms**: Is the code idiomatic for {language}?
2. **Framework conventions**: Does it follow {framework} conventions?
3. **Project structure**: Is the code well-organized?
4. **Error handling**: Comprehensive and appropriate?
5. **Configuration**: Environment-aware, no hardcoded values?
6. **Logging**: Appropriate log levels and structured logging?
7. **Type safety**: Proper type annotations/checks?
8. **Dependency injection**: Loose coupling?
9. **Input validation**: All inputs validated?
10. **API design**: Clean, consistent API contracts?

Respond with ONLY a valid JSON object:
{{
    "overall_score": <float 0-100>,
    "issues": [
        {{
            "title": "Best practice violation",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
            "category": "idiom|convention|structure|error_handling|config|logging|type_safety|dependency_injection|validation|api_design",
            "description": "What best practice is violated",
            "suggestion": "How to align with best practices",
            "code_example": "Corrected code example or null",
            "effort_estimate": "trivial|small|medium|large"
        }}
    ],
    "best_practices_followed": ["List of best practices the code already follows well"],
    "recommendations": ["Top improvement recommendations"],
    "executive_summary": "2-3 sentence assessment"
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="evaluator",
                task_type="quality_evaluation",
                system_prompt=get_system_prompt("evaluator"),
                user_prompt=user_prompt,
                temperature=0.15,
                max_tokens=4096,
                json_mode=True,
            )
        )

        tokens_used = response.total_tokens
        cost_usd = response.cost_usd

        parsed = _parse_llm_json(response.content)
        evaluation_duration_ms = (time.time() - start_time) * 1000

        score = parsed.get("overall_score", 70)
        grade = score_to_grade(score)

        issues = []
        for idx, raw in enumerate(parsed.get("issues", [])[:30]):
            issues.append(
                QualityIssue(
                    id=f"BP-{report_id[-8:]}-{idx + 1:03d}",
                    title=raw.get("title", "Unknown"),
                    severity=raw.get("severity", "MEDIUM"),
                    category=raw.get("category", "convention"),
                    description=raw.get("description", ""),
                    suggestion=raw.get("suggestion"),
                    code_example=raw.get("code_example")
                    if params.include_examples
                    else None,
                    effort_estimate=raw.get("effort_estimate"),
                )
            )

        report = QualityReport(
            report_id=report_id,
            evaluation_type="best_practices",
            target_summary=f"{language}/{framework} {project_type} code",
            overall_score=score,
            grade=grade,
            issues=issues,
            metrics={"framework": framework, "project_type": project_type},
            strengths=parsed.get("best_practices_followed", []),
            recommendations=parsed.get("recommendations", []),
            executive_summary=parsed.get(
                "executive_summary",
                f"Best practices evaluation for {framework}: {score}/100.",
            ),
            evaluation_duration_ms=evaluation_duration_ms,
            llm_provider=response.provider,
            llm_model=response.model,
        )

        return {
            "report": report.dict(),
            "tokens_used": tokens_used,
            "cost_usd": cost_usd,
        }

    except Exception as e:
        logger.error("Best practices evaluation failed: %s", str(e))
        raise HTTPException(
            status_code=500, detail=f"Best practices evaluation failed: {str(e)}"
        )


async def _evaluate_test_coverage(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Evaluate test quality and coverage gaps."""
    source_code = params.source_code or params.code
    test_code = params.test_code

    if not source_code and not test_code:
        raise HTTPException(
            status_code=422,
            detail="'source_code'/'code' and/or 'test_code' is required for test coverage evaluation.",
        )

    report_id = f"test_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    language = params.language or detect_language(
        source_code or test_code or "", params.filename
    )
    context_str = await _build_context_string(context)

    tokens_used = 0
    cost_usd = 0.0

    try:
        llm = await get_llm()

        source_section = ""
        if source_code:
            source_section = f"""Source code to evaluate test coverage for:
```{language}
{source_code[:5000]}
```"""

        test_section = ""
        if test_code:
            test_section = f"""Existing test code:
```{language}
{test_code[:5000]}
```"""

        coverage_section = ""
        if params.coverage_report:
            coverage_section = f"""Coverage report:
{params.coverage_report[:2000]}"""

        user_prompt = f"""Evaluate the test quality and coverage for this {language} code.

{source_section}

{test_section}

{coverage_section}
{context_str}

Analyze:
1. Which functions/methods/branches are NOT covered by tests?
2. Quality of existing tests (meaningful assertions vs trivial tests)
3. Edge cases that are not tested
4. Error path testing
5. Integration test gaps
6. Test maintainability and readability
7. Mock/stub usage appropriateness
8. Missing test categories (unit, integration, e2e)

Respond with ONLY a valid JSON object:
{{
    "overall_score": <float 0-100>,
    "estimated_coverage_percent": <float 0-100>,
    "issues": [
        {{
            "title": "Coverage gap or test quality issue",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
            "category": "missing_test|weak_assertion|missing_edge_case|error_path|integration_gap|test_quality|mock_issue",
            "description": "What is not tested or poorly tested",
            "suggestion": "Specific test to add with description",
            "code_example": "Example test code or null"
        }}
    ],
    "untested_functions": ["list of function/method names without tests"],
    "missing_edge_cases": ["edge cases that should be tested"],
    "test_quality_metrics": {{
        "assertion_density": "low|medium|high",
        "test_isolation": "poor|fair|good|excellent",
        "mock_appropriateness": "over_mocked|appropriate|under_mocked",
        "test_readability": "poor|fair|good|excellent"
    }},
    "suggested_tests": [
        {{
            "name": "test_function_name",
            "type": "unit|integration|e2e",
            "description": "What this test should verify",
            "priority": "high|medium|low"
        }}
    ],
    "executive_summary": "2-3 sentence test coverage assessment"
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="evaluator",
                task_type="quality_evaluation",
                system_prompt=get_system_prompt("evaluator"),
                user_prompt=user_prompt,
                temperature=0.15,
                max_tokens=4096,
                json_mode=True,
            )
        )

        tokens_used = response.total_tokens
        cost_usd = response.cost_usd

        parsed = _parse_llm_json(response.content)
        evaluation_duration_ms = (time.time() - start_time) * 1000

        score = parsed.get("overall_score", 50)
        grade = score_to_grade(score)

        issues = []
        for idx, raw in enumerate(parsed.get("issues", [])[:30]):
            issues.append(
                QualityIssue(
                    id=f"TC-{report_id[-8:]}-{idx + 1:03d}",
                    title=raw.get("title", "Unknown"),
                    severity=raw.get("severity", "MEDIUM"),
                    category=raw.get("category", "missing_test"),
                    description=raw.get("description", ""),
                    suggestion=raw.get("suggestion"),
                    code_example=raw.get("code_example")
                    if params.include_examples
                    else None,
                )
            )

        report = QualityReport(
            report_id=report_id,
            evaluation_type="test_coverage",
            target_summary=f"{language} code (source: {'yes' if source_code else 'no'}, tests: {'yes' if test_code else 'no'})",
            overall_score=score,
            grade=grade,
            issues=issues,
            metrics={
                "estimated_coverage_percent": parsed.get(
                    "estimated_coverage_percent", 0
                ),
                "untested_functions": parsed.get("untested_functions", []),
                "test_quality_metrics": parsed.get("test_quality_metrics", {}),
            },
            strengths=[],
            recommendations=[
                f"[{t.get('priority', 'medium')}] {t.get('name', 'unknown')}: {t.get('description', '')}"
                for t in parsed.get("suggested_tests", [])[:5]
            ],
            executive_summary=parsed.get(
                "executive_summary",
                f"Test coverage evaluation completed with score {score}/100.",
            ),
            evaluation_duration_ms=evaluation_duration_ms,
            llm_provider=response.provider,
            llm_model=response.model,
        )

        return {
            "report": report.dict(),
            "suggested_tests": parsed.get("suggested_tests", []),
            "missing_edge_cases": parsed.get("missing_edge_cases", []),
            "tokens_used": tokens_used,
            "cost_usd": cost_usd,
        }

    except Exception as e:
        logger.error("Test coverage evaluation failed: %s", str(e))
        raise HTTPException(
            status_code=500, detail=f"Test coverage evaluation failed: {str(e)}"
        )


# ---------------------------------------------------------------------------
# API Endpoints (ADR-012 Compliant)
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse)
async def health_check():
    llm_configured = False
    try:
        llm = await get_llm()
        llm_configured = True
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        details=f"Evaluator v3.0.0 | LLM: {'ready' if llm_configured else 'unavailable'}",
        llm_configured=llm_configured,
    )


@app.get("/capabilities", response_model=CapabilitiesResponse)
async def get_capabilities(_: bool = Depends(verify_orchestrator)):
    return CapabilitiesResponse()


@app.post("/execute_task", response_model=TaskResult)
async def execute_task(task: Task, _: bool = Depends(verify_orchestrator)):
    start_time = time.time()
    logger.info("Executing task: id=%s type=%s", task.task_id, task.task_type)

    try:
        task_handlers = {
            "evaluate_quality": _evaluate_quality,
            "evaluate_performance": _evaluate_performance,
            "evaluate_technical_debt": _evaluate_technical_debt,
            "evaluate_best_practices": _evaluate_best_practices,
            "evaluate_test_coverage": _evaluate_test_coverage,
            "code_review": _code_review,
        }

        handler = task_handlers.get(task.task_type)
        if not handler:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported task type: {task.task_type}. "
                f"Supported: {list(task_handlers.keys())}",
            )

        result_data = await handler(task.parameters, task.context)
        processing_time_ms = (time.time() - start_time) * 1000

        issue_count = 0
        if "report" in result_data:
            issue_count = len(result_data["report"].get("issues", []))

        logger.info(
            "Task completed: id=%s type=%s issues=%d time=%.0fms",
            task.task_id,
            task.task_type,
            issue_count,
            processing_time_ms,
        )

        return TaskResult(
            task_id=task.task_id,
            status="completed",
            result=result_data,
            metrics=TaskResultMetrics(
                processing_time_ms=processing_time_ms,
                tokens_used=result_data.get("tokens_used"),
                llm_cost_usd=result_data.get("cost_usd"),
                issues_found=issue_count,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Task %s failed: %s", task.task_id, str(e), exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"An unexpected error occurred: {str(e)}"
        )


# ---------------------------------------------------------------------------
# Convenience endpoints
# ---------------------------------------------------------------------------


@app.post("/review")
async def review_code_direct(
    code: str,
    language: Optional[str] = None,
    filename: Optional[str] = None,
    review_focus: Optional[str] = None,
    _: bool = Depends(verify_orchestrator),
):
    """Direct code review endpoint for quick access."""
    params = TaskParameters(
        code=code,
        language=language,
        filename=filename,
        review_focus=review_focus,
    )
    return await _code_review(params)


@app.post("/quality")
async def quality_check_direct(
    code: str,
    language: Optional[str] = None,
    filename: Optional[str] = None,
    evaluation_depth: str = "standard",
    _: bool = Depends(verify_orchestrator),
):
    """Direct quality check endpoint for quick access."""
    params = TaskParameters(
        code=code,
        language=language,
        filename=filename,
        evaluation_depth=evaluation_depth,
    )
    return await _evaluate_quality(params)


@app.get("/metrics")
async def llm_metrics():
    """Get LLM usage metrics for this agent."""
    try:
        llm = await get_llm()
        return {
            "agent": "evaluator",
            "cost_today_usd": llm.get_cost_today(),
            "provider_health": llm.get_provider_health(),
            "rate_limits": llm.get_rate_limit_status(),
        }
    except Exception as e:
        return {"agent": "evaluator", "error": str(e)}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("EVALUATOR_PORT", "8014")))
    workers = int(os.getenv("WORKERS", "1"))
    logger.info("Starting Evaluator on port %d with %d worker(s)", port, workers)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        workers=workers,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
