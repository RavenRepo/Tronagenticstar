#!/usr/bin/env python3
"""
SecuriShield Agent Micro-service (ADR-012 Compliant)
=====================================================
Specialized agent for LLM-powered security scanning, vulnerability detection,
OWASP Top 10 analysis, and secure coding recommendations.

Uses the shared Constella LLM Provider for multi-provider support with
automatic failover, rate limiting, and cost tracking.
"""

import hashlib
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
            "service": "securishield",
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)


logger = logging.getLogger("securishield")
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
    agent_id: str = "securishield"
    agent_type: str = "guardian"
    task_type: str = "SECURITY"
    capabilities: List[str] = [
        "scan_code",
        "scan_dependencies",
        "scan_infrastructure",
        "owasp_analysis",
        "compliance_check",
        "threat_model",
    ]
    version: str = "3.0.0"


class TaskParameters(BaseModel):
    # For code scanning
    code: Optional[str] = None
    language: Optional[str] = None
    filename: Optional[str] = None

    # For dependency scanning
    dependencies: Optional[Dict[str, str]] = None
    lockfile_content: Optional[str] = None
    package_manager: Optional[str] = None

    # For infrastructure scanning
    config: Optional[str] = None
    config_type: Optional[str] = None  # dockerfile, k8s, terraform, nginx, etc.

    # For OWASP analysis
    target_description: Optional[str] = None
    application_type: Optional[str] = None  # web, api, mobile

    # For compliance checks
    compliance_framework: Optional[str] = (
        "owasp-top-10"  # owasp-top-10, cwe-top-25, sans-top-25
    )

    # For threat modeling
    system_description: Optional[str] = None
    architecture_diagram: Optional[str] = None  # Mermaid or text description

    # General
    severity_threshold: Optional[str] = "LOW"  # LOW, MEDIUM, HIGH, CRITICAL
    include_remediation: bool = True
    scan_depth: Optional[str] = "standard"  # quick, standard, deep

    # Legacy compatibility
    target: Optional[str] = None


class Task(BaseModel):
    task_id: str
    task_type: str
    parameters: TaskParameters
    context: Optional[List[Dict[str, Any]]] = None


class Vulnerability(BaseModel):
    id: str
    title: str
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW, INFO
    category: str  # e.g., "injection", "auth", "xss", "config", "crypto"
    description: str
    location: Optional[str] = None
    line_number: Optional[int] = None
    cwe_id: Optional[str] = None
    owasp_category: Optional[str] = None
    cvss_score: Optional[float] = None
    remediation: Optional[str] = None
    code_example: Optional[str] = None
    confidence: str = "MEDIUM"  # HIGH, MEDIUM, LOW


class ScanResult(BaseModel):
    scan_id: str
    scan_type: str
    target_summary: str
    overall_risk_score: float  # 0-100 (100 = most risky)
    overall_risk_level: str  # CRITICAL, HIGH, MEDIUM, LOW, NONE
    vulnerabilities: List[Vulnerability] = []
    executive_summary: str
    statistics: Dict[str, int] = {}
    recommendations: List[str] = []
    scan_duration_ms: float
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None


class TaskResultMetrics(BaseModel):
    processing_time_ms: float
    tokens_used: Optional[int] = None
    llm_cost_usd: Optional[float] = None
    vulnerabilities_found: int = 0


class TaskResult(BaseModel):
    task_id: str
    status: str = "completed"
    result: Dict[str, Any]
    metrics: TaskResultMetrics


# ---------------------------------------------------------------------------
# Static Analysis Patterns (pre-LLM fast checks)
# ---------------------------------------------------------------------------

VULN_PATTERNS = {
    "python": [
        {
            "pattern": r"eval\s*\(",
            "title": "Use of eval()",
            "severity": "HIGH",
            "category": "injection",
            "cwe": "CWE-95",
            "owasp": "A03:2021-Injection",
            "remediation": "Replace eval() with ast.literal_eval() for data parsing, or use a proper parser.",
        },
        {
            "pattern": r"exec\s*\(",
            "title": "Use of exec()",
            "severity": "HIGH",
            "category": "injection",
            "cwe": "CWE-95",
            "owasp": "A03:2021-Injection",
            "remediation": "Avoid exec(). Use structured alternatives like importlib or AST-based approaches.",
        },
        {
            "pattern": r"subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True",
            "title": "Shell injection via subprocess with shell=True",
            "severity": "CRITICAL",
            "category": "injection",
            "cwe": "CWE-78",
            "owasp": "A03:2021-Injection",
            "remediation": "Use subprocess with shell=False and pass arguments as a list.",
        },
        {
            "pattern": r"os\.system\s*\(",
            "title": "Use of os.system()",
            "severity": "HIGH",
            "category": "injection",
            "cwe": "CWE-78",
            "owasp": "A03:2021-Injection",
            "remediation": "Replace os.system() with subprocess.run() with shell=False.",
        },
        {
            "pattern": r"pickle\.loads?\s*\(",
            "title": "Insecure deserialization with pickle",
            "severity": "HIGH",
            "category": "deserialization",
            "cwe": "CWE-502",
            "owasp": "A08:2021-Software and Data Integrity Failures",
            "remediation": "Use JSON or a safe serialization format. If pickle is required, validate the source.",
        },
        {
            "pattern": r"(?:password|secret|api_key|token)\s*=\s*['\"][^'\"]+['\"]",
            "title": "Hardcoded secret or credential",
            "severity": "HIGH",
            "category": "secrets",
            "cwe": "CWE-798",
            "owasp": "A07:2021-Identification and Authentication Failures",
            "remediation": "Use environment variables or a secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager).",
        },
        {
            "pattern": r"hashlib\.md5\s*\(",
            "title": "Use of weak hash algorithm MD5",
            "severity": "MEDIUM",
            "category": "crypto",
            "cwe": "CWE-328",
            "owasp": "A02:2021-Cryptographic Failures",
            "remediation": "Use SHA-256 or better: hashlib.sha256().",
        },
        {
            "pattern": r"hashlib\.sha1\s*\(",
            "title": "Use of weak hash algorithm SHA-1",
            "severity": "MEDIUM",
            "category": "crypto",
            "cwe": "CWE-328",
            "owasp": "A02:2021-Cryptographic Failures",
            "remediation": "Use SHA-256 or better: hashlib.sha256().",
        },
        {
            "pattern": r"verify\s*=\s*False",
            "title": "SSL certificate verification disabled",
            "severity": "HIGH",
            "category": "crypto",
            "cwe": "CWE-295",
            "owasp": "A02:2021-Cryptographic Failures",
            "remediation": "Always verify SSL certificates. Remove verify=False.",
        },
        {
            "pattern": r"flask\.make_response.*\bset_cookie\b(?!.*\bsecure\s*=\s*True\b)",
            "title": "Cookie set without Secure flag",
            "severity": "MEDIUM",
            "category": "config",
            "cwe": "CWE-614",
            "owasp": "A05:2021-Security Misconfiguration",
            "remediation": "Set secure=True and httponly=True on all cookies.",
        },
    ],
    "javascript": [
        {
            "pattern": r"eval\s*\(",
            "title": "Use of eval()",
            "severity": "HIGH",
            "category": "injection",
            "cwe": "CWE-95",
            "owasp": "A03:2021-Injection",
            "remediation": "Replace eval() with JSON.parse() for data or Function() for dynamic code.",
        },
        {
            "pattern": r"innerHTML\s*=",
            "title": "Direct innerHTML assignment (XSS risk)",
            "severity": "HIGH",
            "category": "xss",
            "cwe": "CWE-79",
            "owasp": "A03:2021-Injection",
            "remediation": "Use textContent or a sanitization library like DOMPurify.",
        },
        {
            "pattern": r"document\.write\s*\(",
            "title": "Use of document.write() (XSS risk)",
            "severity": "MEDIUM",
            "category": "xss",
            "cwe": "CWE-79",
            "owasp": "A03:2021-Injection",
            "remediation": "Use DOM manipulation methods instead of document.write().",
        },
        {
            "pattern": r"(?:password|secret|api_key|apiKey|token)\s*[:=]\s*['\"][^'\"]+['\"]",
            "title": "Hardcoded secret or credential",
            "severity": "HIGH",
            "category": "secrets",
            "cwe": "CWE-798",
            "owasp": "A07:2021-Identification and Authentication Failures",
            "remediation": "Use environment variables: process.env.SECRET_NAME.",
        },
        {
            "pattern": r"new\s+Function\s*\(",
            "title": "Dynamic Function constructor (code injection risk)",
            "severity": "HIGH",
            "category": "injection",
            "cwe": "CWE-95",
            "owasp": "A03:2021-Injection",
            "remediation": "Avoid dynamic Function construction. Use static alternatives.",
        },
        {
            "pattern": r"(?:http|ftp)://",
            "title": "Insecure HTTP URL in code",
            "severity": "LOW",
            "category": "crypto",
            "cwe": "CWE-319",
            "owasp": "A02:2021-Cryptographic Failures",
            "remediation": "Use HTTPS for all external communications.",
        },
    ],
    "typescript": [],  # Inherits JavaScript patterns
    "dockerfile": [
        {
            "pattern": r"FROM\s+\S+:latest",
            "title": "Using :latest tag in Dockerfile",
            "severity": "MEDIUM",
            "category": "config",
            "cwe": "CWE-1104",
            "owasp": "A06:2021-Vulnerable and Outdated Components",
            "remediation": "Pin to specific image versions for reproducibility and security.",
        },
        {
            "pattern": r"USER\s+root",
            "title": "Running as root in Docker container",
            "severity": "HIGH",
            "category": "config",
            "cwe": "CWE-250",
            "owasp": "A05:2021-Security Misconfiguration",
            "remediation": "Create and switch to a non-root user with USER directive.",
        },
        {
            "pattern": r"COPY\s+\.\s+\.",
            "title": "Copying entire build context (may include secrets)",
            "severity": "MEDIUM",
            "category": "config",
            "cwe": "CWE-200",
            "owasp": "A01:2021-Broken Access Control",
            "remediation": "Use .dockerignore and copy only required files.",
        },
    ],
}

# TypeScript inherits JavaScript patterns
VULN_PATTERNS["typescript"] = VULN_PATTERNS["javascript"]


def run_static_patterns(code: str, language: str) -> List[Dict[str, Any]]:
    """Run regex-based static pattern matching as a fast first pass."""
    findings = []
    patterns = VULN_PATTERNS.get(language.lower(), [])
    lines = code.split("\n")

    for pattern_def in patterns:
        for i, line in enumerate(lines, 1):
            if re.search(pattern_def["pattern"], line, re.IGNORECASE):
                findings.append(
                    {
                        "title": pattern_def["title"],
                        "severity": pattern_def["severity"],
                        "category": pattern_def["category"],
                        "cwe_id": pattern_def.get("cwe"),
                        "owasp_category": pattern_def.get("owasp"),
                        "line_number": i,
                        "location": line.strip()[:200],
                        "remediation": pattern_def.get("remediation", ""),
                        "confidence": "HIGH",  # Pattern matches are deterministic
                        "source": "static_analysis",
                    }
                )

    return findings


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
            ".yaml": "yaml",
            ".yml": "yaml",
            ".json": "json",
            ".xml": "xml",
            ".sql": "sql",
            ".tf": "terraform",
            ".hcl": "terraform",
        }
        name = filename.lower()
        if "dockerfile" in name:
            return "dockerfile"
        for ext, lang in ext_map.items():
            if name.endswith(ext):
                return lang

    # Heuristic detection
    if "def " in code and "import " in code:
        return "python"
    if "function " in code or "const " in code or "=>" in code:
        return "javascript"
    if "interface " in code and ": " in code:
        return "typescript"
    if "FROM " in code and ("RUN " in code or "CMD " in code):
        return "dockerfile"

    return "unknown"


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
    title="SecuriShield Agent",
    description="LLM-powered security scanning, vulnerability detection, and compliance analysis",
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
# Core Scan Functions
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
    # Strip markdown code fences if present
    cleaned = content.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's ```)
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        brace_start = cleaned.find("{")
        brace_end = cleaned.rfind("}")
        if brace_start != -1 and brace_end != -1:
            try:
                return json.loads(cleaned[brace_start : brace_end + 1])
            except json.JSONDecodeError:
                pass

        # Return a structured fallback with the raw content
        return {
            "executive_summary": cleaned[:500],
            "vulnerabilities": [],
            "overall_risk_score": 0,
            "parse_error": True,
        }


async def _scan_code(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Full security scan: static patterns + LLM deep analysis."""
    code = params.code
    if not code:
        raise HTTPException(
            status_code=422, detail="'code' is required for code scanning."
        )

    scan_id = f"scan_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    language = params.language or detect_language(code, params.filename)

    # Phase 1: Fast static pattern matching
    static_findings = run_static_patterns(code, language)

    # Phase 2: LLM deep analysis
    llm_findings = []
    llm_provider_name = None
    llm_model_name = None
    tokens_used = 0
    cost_usd = 0.0

    try:
        llm = await get_llm()
        context_str = await _build_context_string(context)

        scan_depth_instruction = ""
        if params.scan_depth == "quick":
            scan_depth_instruction = "Perform a quick scan focusing only on CRITICAL and HIGH severity issues."
        elif params.scan_depth == "deep":
            scan_depth_instruction = (
                "Perform an exhaustive deep scan. Check for subtle vulnerabilities including: "
                "business logic flaws, race conditions, TOCTOU, integer overflows, "
                "timing attacks, and information leakage."
            )
        else:
            scan_depth_instruction = "Perform a standard security scan covering common vulnerability categories."

        user_prompt = f"""Analyze the following {language} code for security vulnerabilities.

{scan_depth_instruction}

Code to scan:
```{language}
{code[:8000]}
```
{context_str}

Static analysis already found these issues (do NOT duplicate them, find NEW issues):
{json.dumps([{"title": f["title"], "line": f["line_number"]} for f in static_findings[:10]], indent=2) if static_findings else "No static findings."}

Respond with ONLY a valid JSON object (no markdown, no explanation outside JSON):
{{
    "vulnerabilities": [
        {{
            "title": "string - concise vulnerability title",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
            "category": "string - e.g. injection, xss, auth, crypto, config, logic, race_condition",
            "description": "string - detailed description of the vulnerability",
            "location": "string - affected code snippet or function name",
            "line_number": null or integer,
            "cwe_id": "CWE-XXX or null",
            "owasp_category": "e.g. A03:2021-Injection or null",
            "remediation": "string - specific fix instructions with code example if applicable",
            "confidence": "HIGH|MEDIUM|LOW"
        }}
    ],
    "overall_risk_score": 0-100,
    "executive_summary": "string - 2-3 sentence summary of security posture",
    "recommendations": ["string - general security improvement recommendations"]
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="securishield",
                task_type="security",
                system_prompt=get_system_prompt("securishield"),
                user_prompt=user_prompt,
                temperature=0.1,
                max_tokens=4096,
                json_mode=True,
            )
        )

        llm_provider_name = response.provider
        llm_model_name = response.model
        tokens_used = response.total_tokens
        cost_usd = response.cost_usd

        parsed = _parse_llm_json(response.content)
        llm_vulns = parsed.get("vulnerabilities", [])

        for v in llm_vulns:
            llm_findings.append(
                {
                    "title": v.get("title", "Unknown"),
                    "severity": v.get("severity", "MEDIUM"),
                    "category": v.get("category", "unknown"),
                    "description": v.get("description", ""),
                    "location": v.get("location", ""),
                    "line_number": v.get("line_number"),
                    "cwe_id": v.get("cwe_id"),
                    "owasp_category": v.get("owasp_category"),
                    "remediation": v.get("remediation", ""),
                    "confidence": v.get("confidence", "MEDIUM"),
                    "source": "llm_analysis",
                }
            )

        llm_summary = parsed.get("executive_summary", "")
        llm_risk_score = parsed.get("overall_risk_score", 0)
        llm_recommendations = parsed.get("recommendations", [])

    except Exception as e:
        logger.warning(
            "LLM analysis failed, using static results only: %s", str(e)[:300]
        )
        llm_summary = (
            "LLM analysis unavailable. Results based on static pattern matching only."
        )
        llm_risk_score = 0
        llm_recommendations = []

    # Combine findings
    all_findings = static_findings + llm_findings

    # Deduplicate by title similarity
    seen_titles = set()
    unique_findings = []
    for f in all_findings:
        normalized = f["title"].lower().strip()
        if normalized not in seen_titles:
            seen_titles.add(normalized)
            unique_findings.append(f)

    # Filter by severity threshold
    severity_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "INFO": 0}
    threshold = severity_order.get(params.severity_threshold or "LOW", 0)
    filtered = [
        f for f in unique_findings if severity_order.get(f["severity"], 0) >= threshold
    ]

    # Sort by severity
    filtered.sort(key=lambda x: severity_order.get(x["severity"], 0), reverse=True)

    # Calculate overall risk score
    if filtered:
        severity_weights = {
            "CRITICAL": 25,
            "HIGH": 15,
            "MEDIUM": 8,
            "LOW": 3,
            "INFO": 1,
        }
        weighted_sum = sum(severity_weights.get(f["severity"], 0) for f in filtered)
        risk_score = min(100, max(llm_risk_score, weighted_sum))
    else:
        risk_score = max(0, llm_risk_score)

    risk_level = "NONE"
    if risk_score >= 80:
        risk_level = "CRITICAL"
    elif risk_score >= 60:
        risk_level = "HIGH"
    elif risk_score >= 40:
        risk_level = "MEDIUM"
    elif risk_score >= 15:
        risk_level = "LOW"

    # Statistics
    stats = {"total": len(filtered)}
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]:
        stats[sev.lower()] = len([f for f in filtered if f["severity"] == sev])

    # Build vulnerabilities list
    vulnerabilities = []
    for i, f in enumerate(filtered[:50]):  # Cap at 50
        vulnerabilities.append(
            Vulnerability(
                id=f"VULN-{scan_id[-8:]}-{i + 1:03d}",
                title=f["title"],
                severity=f["severity"],
                category=f["category"],
                description=f.get("description", f["title"]),
                location=f.get("location"),
                line_number=f.get("line_number"),
                cwe_id=f.get("cwe_id"),
                owasp_category=f.get("owasp_category"),
                remediation=f.get("remediation")
                if params.include_remediation
                else None,
                confidence=f.get("confidence", "MEDIUM"),
            )
        )

    # Executive summary
    if not llm_summary:
        llm_summary = (
            f"Security scan of {language} code identified {len(filtered)} vulnerabilities "
            f"({stats.get('critical', 0)} critical, {stats.get('high', 0)} high, "
            f"{stats.get('medium', 0)} medium, {stats.get('low', 0)} low). "
            f"Overall risk score: {risk_score}/100 ({risk_level})."
        )

    scan_duration_ms = (time.time() - start_time) * 1000

    scan_result = ScanResult(
        scan_id=scan_id,
        scan_type="code_scan",
        target_summary=f"{language} code ({len(code)} chars, {len(code.splitlines())} lines)",
        overall_risk_score=risk_score,
        overall_risk_level=risk_level,
        vulnerabilities=vulnerabilities,
        executive_summary=llm_summary,
        statistics=stats,
        recommendations=llm_recommendations
        or [
            "Implement automated SAST in your CI/CD pipeline",
            "Review and remediate all HIGH and CRITICAL findings",
            "Add security-focused code review to your development process",
        ],
        scan_duration_ms=scan_duration_ms,
        llm_provider=llm_provider_name,
        llm_model=llm_model_name,
    )

    return {
        "scan": scan_result.dict(),
        "tokens_used": tokens_used,
        "cost_usd": cost_usd,
    }


async def _scan_dependencies(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Scan dependency files for known vulnerable packages."""
    deps = params.dependencies or {}
    lockfile = params.lockfile_content or ""
    pkg_manager = params.package_manager or "unknown"

    if not deps and not lockfile:
        raise HTTPException(
            status_code=422, detail="'dependencies' or 'lockfile_content' is required."
        )

    scan_id = f"dep_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    dep_text = ""
    if deps:
        dep_text = "\n".join(f"  {name}: {version}" for name, version in deps.items())
    if lockfile:
        dep_text += f"\n\nLockfile content (truncated):\n{lockfile[:4000]}"

    try:
        llm = await get_llm()

        user_prompt = f"""Analyze these {pkg_manager} dependencies for security vulnerabilities.

Dependencies:
{dep_text}

For each vulnerable dependency found, provide:
1. The package name and version
2. Known CVEs or security advisories
3. Severity rating
4. Recommended safe version to upgrade to

Respond with ONLY a valid JSON object:
{{
    "vulnerabilities": [
        {{
            "title": "Vulnerable package: <name>@<version>",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW",
            "category": "dependency",
            "description": "Description of the vulnerability and CVE if known",
            "cwe_id": "CWE-XXX or null",
            "remediation": "Upgrade to <name>@<safe_version>"
        }}
    ],
    "overall_risk_score": 0-100,
    "executive_summary": "Summary of dependency security posture",
    "recommendations": ["general recommendations"]
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="securishield",
                task_type="security",
                system_prompt=get_system_prompt("securishield"),
                user_prompt=user_prompt,
                temperature=0.1,
                max_tokens=4096,
                json_mode=True,
            )
        )

        parsed = _parse_llm_json(response.content)
        scan_duration_ms = (time.time() - start_time) * 1000

        vulns = []
        for i, v in enumerate(parsed.get("vulnerabilities", [])[:30]):
            vulns.append(
                Vulnerability(
                    id=f"DEP-{scan_id[-8:]}-{i + 1:03d}",
                    title=v.get("title", "Unknown"),
                    severity=v.get("severity", "MEDIUM"),
                    category="dependency",
                    description=v.get("description", ""),
                    cwe_id=v.get("cwe_id"),
                    remediation=v.get("remediation", ""),
                    confidence="MEDIUM",
                )
            )

        risk_score = parsed.get("overall_risk_score", 0)
        risk_level = "NONE"
        if risk_score >= 80:
            risk_level = "CRITICAL"
        elif risk_score >= 60:
            risk_level = "HIGH"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
        elif risk_score >= 15:
            risk_level = "LOW"

        scan_result = ScanResult(
            scan_id=scan_id,
            scan_type="dependency_scan",
            target_summary=f"{len(deps)} {pkg_manager} dependencies",
            overall_risk_score=risk_score,
            overall_risk_level=risk_level,
            vulnerabilities=vulns,
            executive_summary=parsed.get(
                "executive_summary", "Dependency scan complete."
            ),
            statistics={"total": len(vulns)},
            recommendations=parsed.get("recommendations", []),
            scan_duration_ms=scan_duration_ms,
            llm_provider=response.provider,
            llm_model=response.model,
        )

        return {
            "scan": scan_result.dict(),
            "tokens_used": response.total_tokens,
            "cost_usd": response.cost_usd,
        }

    except Exception as e:
        logger.error("Dependency scan failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Dependency scan failed: {str(e)}")


async def _scan_infrastructure(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Scan infrastructure configuration (Dockerfile, K8s, Terraform, Nginx, etc.)."""
    config_content = params.config
    if not config_content:
        raise HTTPException(
            status_code=422, detail="'config' is required for infrastructure scanning."
        )

    config_type = params.config_type or "unknown"
    scan_id = f"infra_{uuid.uuid4().hex[:12]}"
    start_time = time.time()

    # Run static patterns for Dockerfiles
    static_findings = []
    if config_type.lower() in ("dockerfile", "docker"):
        static_findings = run_static_patterns(config_content, "dockerfile")

    try:
        llm = await get_llm()

        user_prompt = f"""Analyze this {config_type} infrastructure configuration for security issues.

Configuration:
```
{config_content[:6000]}
```

Check for:
- Privilege escalation risks
- Exposed ports and services
- Missing security headers/policies
- Insecure defaults
- Network security issues
- Secret exposure
- Resource limits
- Logging and monitoring gaps

Respond with ONLY a valid JSON object:
{{
    "vulnerabilities": [
        {{
            "title": "Concise issue title",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
            "category": "config|network|secrets|privileges|logging",
            "description": "Detailed description",
            "location": "Specific configuration line or section",
            "remediation": "How to fix"
        }}
    ],
    "overall_risk_score": 0-100,
    "executive_summary": "Summary of infrastructure security posture",
    "recommendations": ["Improvement recommendations"]
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="securishield",
                task_type="security",
                system_prompt=get_system_prompt("securishield"),
                user_prompt=user_prompt,
                temperature=0.1,
                max_tokens=4096,
                json_mode=True,
            )
        )

        parsed = _parse_llm_json(response.content)
        scan_duration_ms = (time.time() - start_time) * 1000

        # Merge static + LLM findings
        all_vulns_raw = static_findings + parsed.get("vulnerabilities", [])
        seen = set()
        vulns = []
        for i, v in enumerate(all_vulns_raw[:30]):
            title = v.get("title", "Unknown")
            if title.lower() in seen:
                continue
            seen.add(title.lower())
            vulns.append(
                Vulnerability(
                    id=f"INFRA-{scan_id[-8:]}-{i + 1:03d}",
                    title=title,
                    severity=v.get("severity", "MEDIUM"),
                    category=v.get("category", "config"),
                    description=v.get("description", title),
                    location=v.get("location"),
                    line_number=v.get("line_number"),
                    cwe_id=v.get("cwe_id"),
                    remediation=v.get("remediation", ""),
                    confidence=v.get("confidence", "MEDIUM"),
                )
            )

        risk_score = parsed.get("overall_risk_score", 0)
        risk_level = "NONE"
        if risk_score >= 80:
            risk_level = "CRITICAL"
        elif risk_score >= 60:
            risk_level = "HIGH"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
        elif risk_score >= 15:
            risk_level = "LOW"

        scan_result = ScanResult(
            scan_id=scan_id,
            scan_type="infrastructure_scan",
            target_summary=f"{config_type} configuration ({len(config_content)} chars)",
            overall_risk_score=risk_score,
            overall_risk_level=risk_level,
            vulnerabilities=vulns,
            executive_summary=parsed.get(
                "executive_summary", "Infrastructure scan complete."
            ),
            statistics={"total": len(vulns)},
            recommendations=parsed.get("recommendations", []),
            scan_duration_ms=scan_duration_ms,
            llm_provider=response.provider,
            llm_model=response.model,
        )

        return {
            "scan": scan_result.dict(),
            "tokens_used": response.total_tokens,
            "cost_usd": response.cost_usd,
        }

    except Exception as e:
        logger.error("Infrastructure scan failed: %s", str(e))
        raise HTTPException(
            status_code=500, detail=f"Infrastructure scan failed: {str(e)}"
        )


async def _threat_model(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Generate a threat model using STRIDE methodology."""
    description = (
        params.system_description or params.target_description or params.target
    )
    if not description:
        raise HTTPException(
            status_code=422,
            detail="'system_description' or 'target_description' is required for threat modeling.",
        )

    scan_id = f"threat_{uuid.uuid4().hex[:12]}"
    start_time = time.time()
    context_str = await _build_context_string(context)

    try:
        llm = await get_llm()

        arch_info = ""
        if params.architecture_diagram:
            arch_info = f"\nArchitecture diagram/description:\n{params.architecture_diagram[:3000]}"

        user_prompt = f"""Perform a STRIDE threat model analysis for the following system:

System Description:
{description[:4000]}
{arch_info}
{context_str}

Apply STRIDE methodology:
- Spoofing: Identity threats
- Tampering: Data integrity threats
- Repudiation: Audit/logging threats
- Information Disclosure: Confidentiality threats
- Denial of Service: Availability threats
- Elevation of Privilege: Authorization threats

Respond with ONLY a valid JSON object:
{{
    "vulnerabilities": [
        {{
            "title": "Threat title",
            "severity": "CRITICAL|HIGH|MEDIUM|LOW",
            "category": "spoofing|tampering|repudiation|information_disclosure|denial_of_service|elevation_of_privilege",
            "description": "Detailed threat description with attack scenario",
            "remediation": "Specific mitigation strategy",
            "confidence": "HIGH|MEDIUM|LOW"
        }}
    ],
    "overall_risk_score": 0-100,
    "executive_summary": "Overall threat landscape summary",
    "recommendations": ["Prioritized security recommendations"],
    "threat_matrix": {{
        "spoofing": {{"count": 0, "max_severity": "NONE"}},
        "tampering": {{"count": 0, "max_severity": "NONE"}},
        "repudiation": {{"count": 0, "max_severity": "NONE"}},
        "information_disclosure": {{"count": 0, "max_severity": "NONE"}},
        "denial_of_service": {{"count": 0, "max_severity": "NONE"}},
        "elevation_of_privilege": {{"count": 0, "max_severity": "NONE"}}
    }}
}}"""

        response = await llm.complete(
            LLMRequest(
                agent_id="securishield",
                task_type="security",
                system_prompt=get_system_prompt("securishield"),
                user_prompt=user_prompt,
                temperature=0.2,
                max_tokens=4096,
                json_mode=True,
            )
        )

        parsed = _parse_llm_json(response.content)
        scan_duration_ms = (time.time() - start_time) * 1000

        vulns = []
        for i, v in enumerate(parsed.get("vulnerabilities", [])[:30]):
            vulns.append(
                Vulnerability(
                    id=f"THREAT-{scan_id[-8:]}-{i + 1:03d}",
                    title=v.get("title", "Unknown Threat"),
                    severity=v.get("severity", "MEDIUM"),
                    category=v.get("category", "unknown"),
                    description=v.get("description", ""),
                    remediation=v.get("remediation", ""),
                    confidence=v.get("confidence", "MEDIUM"),
                )
            )

        risk_score = parsed.get("overall_risk_score", 0)
        risk_level = "NONE"
        if risk_score >= 80:
            risk_level = "CRITICAL"
        elif risk_score >= 60:
            risk_level = "HIGH"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
        elif risk_score >= 15:
            risk_level = "LOW"

        result = ScanResult(
            scan_id=scan_id,
            scan_type="threat_model",
            target_summary=f"Threat model for: {description[:100]}",
            overall_risk_score=risk_score,
            overall_risk_level=risk_level,
            vulnerabilities=vulns,
            executive_summary=parsed.get(
                "executive_summary", "Threat model analysis complete."
            ),
            statistics={"total": len(vulns)},
            recommendations=parsed.get("recommendations", []),
            scan_duration_ms=scan_duration_ms,
            llm_provider=response.provider,
            llm_model=response.model,
        )

        return {
            "scan": result.dict(),
            "threat_matrix": parsed.get("threat_matrix", {}),
            "tokens_used": response.total_tokens,
            "cost_usd": response.cost_usd,
        }

    except Exception as e:
        logger.error("Threat model failed: %s", str(e))
        raise HTTPException(status_code=500, detail=f"Threat model failed: {str(e)}")


async def _legacy_scan_target(
    params: TaskParameters, context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Legacy compatibility: scan a target string (could be code, URL, or description)."""
    target = params.target or ""
    if not target:
        raise HTTPException(status_code=422, detail="'target' is required.")

    # If it looks like code, delegate to code scan
    code_indicators = [
        "def ",
        "function ",
        "class ",
        "import ",
        "const ",
        "var ",
        "let ",
        "FROM ",
        "RUN ",
    ]
    if any(ind in target for ind in code_indicators):
        params.code = target
        params.language = detect_language(target)
        return await _scan_code(params, context)

    # Otherwise, treat as a system description for threat modeling
    params.system_description = target
    return await _threat_model(params, context)


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
        details=f"SecuriShield v3.0.0 | LLM: {'ready' if llm_configured else 'unavailable'}",
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
            "scan_code": _scan_code,
            "scan_dependencies": _scan_dependencies,
            "scan_infrastructure": _scan_infrastructure,
            "owasp_analysis": _scan_code,  # Code scan with OWASP focus
            "compliance_check": _scan_code,  # Code scan with compliance focus
            "threat_model": _threat_model,
            # Legacy compatibility
            "scan_target": _legacy_scan_target,
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

        vuln_count = 0
        if "scan" in result_data:
            vuln_count = len(result_data["scan"].get("vulnerabilities", []))

        logger.info(
            "Task completed: id=%s type=%s vulns=%d time=%.0fms",
            task.task_id,
            task.task_type,
            vuln_count,
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
                vulnerabilities_found=vuln_count,
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
# Convenience endpoints (direct access without task wrapping)
# ---------------------------------------------------------------------------


@app.post("/scan/code")
async def scan_code_direct(
    code: str,
    language: Optional[str] = None,
    filename: Optional[str] = None,
    scan_depth: str = "standard",
    _: bool = Depends(verify_orchestrator),
):
    """Direct code scan endpoint for quick access."""
    params = TaskParameters(
        code=code, language=language, filename=filename, scan_depth=scan_depth
    )
    return await _scan_code(params)


@app.get("/metrics")
async def llm_metrics():
    """Get LLM usage metrics for this agent."""
    try:
        llm = await get_llm()
        return {
            "agent": "securishield",
            "cost_today_usd": llm.get_cost_today(),
            "provider_health": llm.get_provider_health(),
            "rate_limits": llm.get_rate_limit_status(),
        }
    except Exception as e:
        return {"agent": "securishield", "error": str(e)}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("SECURISHIELD_PORT", "8011")))
    workers = int(os.getenv("WORKERS", "1"))
    logger.info("Starting SecuriShield on port %d with %d worker(s)", port, workers)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        workers=workers,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
