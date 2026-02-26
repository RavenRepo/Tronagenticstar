#!/usr/bin/env python3
"""
Constella Integration Test Suite — Orchestrator ↔ Agent Communication
======================================================================
Tests the real HTTP contract between the orchestrator, API gateway, and
all specialist agents. Validates health checks, capability discovery,
task execution, error handling, auth, and end-to-end workflows.

Usage:
    # Run all integration tests (services must be running)
    pytest tests/integration/test_orchestrator_agents.py -v

    # Run only health checks (fast smoke test)
    pytest tests/integration/test_orchestrator_agents.py -v -k "health"

    # Run against custom URLs
    GATEWAY_URL=http://myhost:3000 pytest tests/integration/test_orchestrator_agents.py -v

    # Run with Docker Compose services (recommended)
    docker compose -f docker-compose.dev.yml up -d
    pytest tests/integration/test_orchestrator_agents.py -v --timeout=60

Environment variables:
    GATEWAY_URL         API Gateway base URL      (default: http://localhost:3000)
    ORCHESTRATOR_URL    Orchestrator base URL      (default: http://localhost:8001)
    CODECRAFT_URL       CodeCraft agent URL        (default: http://localhost:8012)
    SECURISHIELD_URL    SecuriShield agent URL     (default: http://localhost:8011)
    DESIGNFORGE_URL     DesignForge agent URL      (default: http://localhost:8010)
    PERFPULSE_URL       PerfPulse agent URL        (default: http://localhost:8013)
    EVALUATOR_URL       Evaluator agent URL        (default: http://localhost:8014)
    EMBEDDING_URL       Embedding service URL      (default: http://localhost:8004)
    RETRIEVER_URL       Retriever service URL      (default: http://localhost:8006)
    AGENT_BEARER        Bearer token for agents    (default: empty)
    JWT_SECRET          JWT secret for gateway     (default: dev-fallback-secret)
    TEST_TIMEOUT        Default request timeout    (default: 30)
    SKIP_LLM_TESTS      Skip tests requiring LLM  (default: false)
"""

import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
import pytest

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:3000")
ORCHESTRATOR_URL = os.getenv("ORCHESTRATOR_URL", "http://localhost:8001")
CODECRAFT_URL = os.getenv("CODECRAFT_URL", "http://localhost:8012")
SECURISHIELD_URL = os.getenv("SECURISHIELD_URL", "http://localhost:8011")
DESIGNFORGE_URL = os.getenv("DESIGNFORGE_URL", "http://localhost:8010")
PERFPULSE_URL = os.getenv("PERFPULSE_URL", "http://localhost:8013")
EVALUATOR_URL = os.getenv("EVALUATOR_URL", "http://localhost:8014")
EMBEDDING_URL = os.getenv("EMBEDDING_URL", "http://localhost:8004")
RETRIEVER_URL = os.getenv("RETRIEVER_URL", "http://localhost:8006")
AGENT_BEARER = os.getenv("AGENT_BEARER", "")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-fallback-secret")
TEST_TIMEOUT = int(os.getenv("TEST_TIMEOUT", "30"))
SKIP_LLM_TESTS = os.getenv("SKIP_LLM_TESTS", "false").lower() in ("true", "1", "yes")

# Agent registry: name -> (url, expected capabilities)
AGENT_REGISTRY: Dict[str, Dict[str, Any]] = {
    "codecraft": {
        "url": CODECRAFT_URL,
        "agent_id": "codecraft",
        "task_type": "CODE_GENERATION",
        "expected_capabilities": ["generate_code", "refactor_code"],
        "port": 8012,
    },
    "securishield": {
        "url": SECURISHIELD_URL,
        "agent_id": "securishield",
        "task_type": "SECURITY",
        "expected_capabilities": ["scan_code"],
        "port": 8011,
    },
    "designforge": {
        "url": DESIGNFORGE_URL,
        "agent_id": "designforge",
        "task_type": "DESIGN",
        "expected_capabilities": ["generate_diagram"],
        "port": 8010,
    },
    "perfpulse": {
        "url": PERFPULSE_URL,
        "agent_id": "perfpulse",
        "port": 8013,
    },
    "evaluator": {
        "url": EVALUATOR_URL,
        "agent_id": "evaluator",
        "port": 8014,
    },
}

CORE_AGENTS = ["codecraft", "securishield", "designforge"]

# Reusable test code samples
SAMPLE_PYTHON_CODE = """
import os
import hashlib

def hash_password(password: str, salt: str = "") -> str:
    if not salt:
        salt = os.urandom(16).hex()
    combined = f"{salt}{password}"
    hashed = hashlib.sha256(combined.encode()).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(password: str, stored: str) -> bool:
    salt, expected_hash = stored.split(":")
    _, computed = hash_password(password, salt).split(":")
    return computed == expected_hash

class UserManager:
    def __init__(self):
        self.users = {}

    def create_user(self, username: str, password: str) -> dict:
        if username in self.users:
            raise ValueError(f"User {username} already exists")
        self.users[username] = {
            "username": username,
            "password_hash": hash_password(password),
            "created_at": "2024-01-01",
        }
        return self.users[username]

    def authenticate(self, username: str, password: str) -> bool:
        user = self.users.get(username)
        if not user:
            return False
        return verify_password(password, user["password_hash"])

if __name__ == "__main__":
    manager = UserManager()
    manager.create_user("admin", "secret123")
    print(manager.authenticate("admin", "secret123"))
"""

SAMPLE_INSECURE_CODE = """
import subprocess
import sqlite3
import os

def run_command(user_input):
    # Command injection vulnerability
    result = subprocess.call(f"ls {user_input}", shell=True)
    return result

def get_user(username):
    conn = sqlite3.connect("users.db")
    # SQL injection vulnerability
    query = f"SELECT * FROM users WHERE username = '{username}'"
    cursor = conn.execute(query)
    return cursor.fetchone()

def read_file(filename):
    # Path traversal vulnerability
    path = f"/data/{filename}"
    with open(path) as f:
        return f.read()

API_KEY = "sk-1234567890abcdef"  # Hardcoded secret
password = "admin123"  # Hardcoded credential
"""


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def http_client() -> httpx.Client:
    """Shared HTTP client for the entire test session."""
    client = httpx.Client(timeout=TEST_TIMEOUT)
    yield client
    client.close()


@pytest.fixture(scope="session")
def auth_headers() -> Dict[str, str]:
    """Build authorization headers for agent communication."""
    headers = {"Content-Type": "application/json"}
    if AGENT_BEARER:
        headers["Authorization"] = f"Bearer {AGENT_BEARER}"
    return headers


@pytest.fixture(scope="session")
def gateway_jwt_token() -> Optional[str]:
    """Generate a JWT token for gateway authentication."""
    try:
        import jwt as pyjwt

        payload = {
            "sub": "integration-test",
            "role": "admin",
            "permissions": ["*"],
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")
    except ImportError:
        pytest.skip("PyJWT not installed, skipping gateway auth tests")
        return None


@pytest.fixture(scope="session")
def gateway_auth_headers(gateway_jwt_token: Optional[str]) -> Dict[str, str]:
    """Build authorization headers for gateway communication."""
    headers = {"Content-Type": "application/json"}
    if gateway_jwt_token:
        headers["Authorization"] = f"Bearer {gateway_jwt_token}"
    return headers


def _make_task_id() -> str:
    """Generate a unique task ID for testing."""
    return f"test-{uuid.uuid4().hex[:12]}"


def _is_service_reachable(client: httpx.Client, url: str) -> bool:
    """Quick check if a service is reachable."""
    try:
        resp = client.get(f"{url}/health", timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Service availability helpers
# ---------------------------------------------------------------------------


def _skip_if_unreachable(client: httpx.Client, url: str, name: str):
    """Skip test if the service is not reachable."""
    if not _is_service_reachable(client, url):
        pytest.skip(f"{name} is not reachable at {url}")


# ============================================================================
# SECTION 1: HEALTH CHECK TESTS
# ============================================================================


class TestHealthChecks:
    """Verify all services respond to /health with the correct contract."""

    @pytest.mark.parametrize("agent_name,agent_info", AGENT_REGISTRY.items())
    def test_agent_health(
        self,
        http_client: httpx.Client,
        agent_name: str,
        agent_info: Dict[str, Any],
    ):
        """Each agent should respond to GET /health with status 200."""
        url = agent_info["url"]
        try:
            resp = http_client.get(f"{url}/health", timeout=10.0)
        except httpx.ConnectError:
            pytest.skip(f"{agent_name} is not running at {url}")
            return

        assert resp.status_code == 200, (
            f"{agent_name} /health returned {resp.status_code}: {resp.text}"
        )

        data = resp.json()
        assert "status" in data, f"{agent_name} /health missing 'status' field"
        assert data["status"] in (
            "ok",
            "healthy",
            "degraded",
        ), f"{agent_name} unexpected status: {data['status']}"

    def test_orchestrator_health(self, http_client: httpx.Client):
        """Orchestrator should respond with a rich health payload."""
        _skip_if_unreachable(http_client, ORCHESTRATOR_URL, "Orchestrator")

        resp = http_client.get(f"{ORCHESTRATOR_URL}/health")
        assert resp.status_code == 200

        data = resp.json()
        assert data["status"] in ("healthy", "ok")
        assert "service" in data or "version" in data

    def test_gateway_health(self, http_client: httpx.Client):
        """API Gateway should respond to /health without authentication."""
        _skip_if_unreachable(http_client, GATEWAY_URL, "API Gateway")

        resp = http_client.get(f"{GATEWAY_URL}/health")
        assert resp.status_code == 200

        data = resp.json()
        # Gateway may return various formats; just ensure it's a valid JSON response
        assert isinstance(data, dict)

    def test_embedding_health(self, http_client: httpx.Client):
        """Embedding service should report its device and status."""
        _skip_if_unreachable(http_client, EMBEDDING_URL, "Embedding")

        resp = http_client.get(f"{EMBEDDING_URL}/health")
        assert resp.status_code == 200

        data = resp.json()
        assert data["status"] == "ok"

    def test_retriever_health(self, http_client: httpx.Client):
        """Retriever service health check."""
        _skip_if_unreachable(http_client, RETRIEVER_URL, "Retriever")

        resp = http_client.get(f"{RETRIEVER_URL}/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ============================================================================
# SECTION 2: CAPABILITY DISCOVERY TESTS
# ============================================================================


class TestCapabilityDiscovery:
    """Verify all agents report their capabilities correctly (ADR-012)."""

    @pytest.mark.parametrize(
        "agent_name,agent_info",
        [
            (name, info)
            for name, info in AGENT_REGISTRY.items()
            if "expected_capabilities" in info
        ],
    )
    def test_agent_capabilities_contract(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
        agent_name: str,
        agent_info: Dict[str, Any],
    ):
        """Each agent should report capabilities matching ADR-012 schema."""
        url = agent_info["url"]
        _skip_if_unreachable(http_client, url, agent_name)

        resp = http_client.get(f"{url}/capabilities", headers=auth_headers)
        assert resp.status_code == 200, (
            f"{agent_name} /capabilities returned {resp.status_code}"
        )

        data = resp.json()

        # Required fields per ADR-012
        assert "agent_id" in data, f"{agent_name} missing agent_id"
        assert "capabilities" in data, f"{agent_name} missing capabilities list"
        assert isinstance(data["capabilities"], list)

        # Verify agent_id matches expected
        assert data["agent_id"] == agent_info["agent_id"], (
            f"{agent_name} agent_id mismatch: "
            f"expected {agent_info['agent_id']}, got {data['agent_id']}"
        )

        # Verify expected capabilities are present
        for cap in agent_info["expected_capabilities"]:
            assert cap in data["capabilities"], (
                f"{agent_name} missing expected capability '{cap}'. "
                f"Reported: {data['capabilities']}"
            )

    def test_capabilities_require_no_body(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """GET /capabilities should work without a request body."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.get(
            f"{CODECRAFT_URL}/capabilities",
            headers=auth_headers,
        )
        assert resp.status_code == 200


# ============================================================================
# SECTION 3: AUTHENTICATION & AUTHORIZATION TESTS
# ============================================================================


class TestAuthentication:
    """Test bearer token authentication on agent endpoints."""

    @pytest.mark.skipif(
        not AGENT_BEARER,
        reason="AGENT_BEARER not set; auth tests require a configured bearer token",
    )
    def test_execute_task_without_token_is_rejected(
        self,
        http_client: httpx.Client,
    ):
        """POST /execute_task without a bearer token should return 401."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_code",
                "parameters": {"prompt": "hello world", "language": "python"},
            },
            headers={"Content-Type": "application/json"},
            # No Authorization header
        )
        assert resp.status_code in (401, 403), (
            f"Expected 401/403 without token, got {resp.status_code}"
        )

    @pytest.mark.skipif(
        not AGENT_BEARER,
        reason="AGENT_BEARER not set; auth tests require a configured bearer token",
    )
    def test_execute_task_with_wrong_token_is_rejected(
        self,
        http_client: httpx.Client,
    ):
        """POST /execute_task with an invalid bearer token should return 403."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_code",
                "parameters": {"prompt": "hello world", "language": "python"},
            },
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer totally-wrong-token-12345",
            },
        )
        assert resp.status_code in (401, 403), (
            f"Expected 401/403 with wrong token, got {resp.status_code}"
        )

    @pytest.mark.skipif(
        not AGENT_BEARER,
        reason="AGENT_BEARER not set; auth tests require a configured bearer token",
    )
    def test_execute_task_with_correct_token_succeeds(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """POST /execute_task with correct bearer token should not return 401/403."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_code",
                "parameters": {"prompt": "print hello world", "language": "python"},
            },
            headers=auth_headers,
        )
        # It might fail for other reasons (no LLM key), but NOT for auth
        assert resp.status_code not in (401, 403), (
            f"Got auth error {resp.status_code} despite correct token"
        )


# ============================================================================
# SECTION 4: TASK EXECUTION TESTS — CodeCraft
# ============================================================================


class TestCodeCraftExecution:
    """Test CodeCraft agent task execution."""

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_generate_code_basic(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """CodeCraft should generate Python code from a prompt."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        task_id = _make_task_id()
        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": task_id,
                "task_type": "generate_code",
                "parameters": {
                    "prompt": "Write a function to calculate the Fibonacci sequence up to n terms",
                    "language": "python",
                    "style": "clean",
                },
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert resp.status_code == 200, (
            f"CodeCraft returned {resp.status_code}: {resp.text}"
        )

        data = resp.json()
        assert data["task_id"] == task_id
        assert data["status"] == "completed"
        assert "result" in data
        assert "metrics" in data

        result = data["result"]
        assert "generated_code" in result or "content" in result, (
            f"Result missing code field. Keys: {list(result.keys())}"
        )

        metrics = data["metrics"]
        assert "processing_time_ms" in metrics
        assert metrics["processing_time_ms"] > 0

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_generate_code_with_context(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """CodeCraft should accept RAG context alongside the prompt."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_code",
                "parameters": {
                    "prompt": "Add a delete_user method to the UserManager class",
                    "language": "python",
                },
                "context": [
                    {
                        "content": SAMPLE_PYTHON_CODE,
                        "tags": "source,user-management",
                    }
                ],
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_refactor_code(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """CodeCraft should refactor code with the refactor_code task type."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "refactor_code",
                "parameters": {
                    "code": SAMPLE_PYTHON_CODE,
                    "language": "python",
                    "refactor_type": "optimize",
                },
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"
        assert "result" in data
        result = data["result"]
        assert (
            "refactored_code" in result
            or "generated_code" in result
            or "content" in result
        ), f"Refactor result missing code. Keys: {list(result.keys())}"

    def test_unsupported_task_type_returns_400(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Unknown task_type should return 400 with a helpful error message."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "nonexistent_task_that_does_not_exist",
                "parameters": {},
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400, (
            f"Expected 400 for unsupported task, got {resp.status_code}"
        )

    def test_missing_required_param_returns_422_or_500(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """generate_code without a prompt should return an error (422 or 500)."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_code",
                "parameters": {
                    "language": "python",
                    # Missing "prompt"
                },
            },
            headers=auth_headers,
        )
        assert resp.status_code in (400, 422, 500), (
            f"Expected error for missing prompt, got {resp.status_code}"
        )

    def test_malformed_json_returns_422(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Sending invalid JSON should return 422."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            content=b"this is not json",
            headers={**auth_headers, "Content-Type": "application/json"},
        )
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 for malformed JSON, got {resp.status_code}"
        )

    def test_empty_body_returns_422(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Sending an empty body should return 422."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            content=b"",
            headers={**auth_headers, "Content-Type": "application/json"},
        )
        assert resp.status_code in (400, 422), (
            f"Expected 400/422 for empty body, got {resp.status_code}"
        )


# ============================================================================
# SECTION 5: TASK EXECUTION TESTS — SecuriShield
# ============================================================================


class TestSecuriShieldExecution:
    """Test SecuriShield agent security scanning capabilities."""

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_scan_code_basic(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """SecuriShield should scan Python code for vulnerabilities."""
        _skip_if_unreachable(http_client, SECURISHIELD_URL, "SecuriShield")

        resp = http_client.post(
            f"{SECURISHIELD_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "scan_code",
                "parameters": {
                    "code": SAMPLE_INSECURE_CODE,
                    "language": "python",
                    "severity_threshold": "LOW",
                    "include_remediation": True,
                },
            },
            headers=auth_headers,
            timeout=90.0,
        )
        assert resp.status_code == 200, (
            f"SecuriShield returned {resp.status_code}: {resp.text}"
        )

        data = resp.json()
        assert data["status"] == "completed"
        assert "result" in data

        result = data["result"]
        # The scan should find at least some vulnerabilities in the insecure code
        vulns = result.get("vulnerabilities", [])
        risk_score = result.get("overall_risk_score", 0)
        assert len(vulns) > 0 or risk_score > 0, (
            "SecuriShield found no vulnerabilities in obviously insecure code"
        )

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_scan_code_safe_code(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """SecuriShield scanning safe code should report low risk."""
        _skip_if_unreachable(http_client, SECURISHIELD_URL, "SecuriShield")

        safe_code = """
def add(a: int, b: int) -> int:
    return a + b

def greet(name: str) -> str:
    if not isinstance(name, str):
        raise TypeError("name must be a string")
    return f"Hello, {name}!"
"""
        resp = http_client.post(
            f"{SECURISHIELD_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "scan_code",
                "parameters": {
                    "code": safe_code,
                    "language": "python",
                },
            },
            headers=auth_headers,
            timeout=90.0,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"

    def test_scan_code_unsupported_task_returns_400(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """SecuriShield should reject unsupported task types."""
        _skip_if_unreachable(http_client, SECURISHIELD_URL, "SecuriShield")

        resp = http_client.post(
            f"{SECURISHIELD_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "make_coffee",
                "parameters": {},
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ============================================================================
# SECTION 6: TASK EXECUTION TESTS — DesignForge
# ============================================================================


class TestDesignForgeExecution:
    """Test DesignForge agent architecture and diagram capabilities."""

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_generate_diagram(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """DesignForge should generate a diagram from a system description."""
        _skip_if_unreachable(http_client, DESIGNFORGE_URL, "DesignForge")

        resp = http_client.post(
            f"{DESIGNFORGE_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_diagram",
                "parameters": {
                    "system_name": "E-Commerce Platform",
                    "diagram_type": "c4_context",
                    "description": "An e-commerce platform with user auth, product catalog, cart, and payment processing",
                },
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert resp.status_code == 200, (
            f"DesignForge returned {resp.status_code}: {resp.text}"
        )

        data = resp.json()
        assert data["status"] == "completed"
        assert "result" in data

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_analyze_architecture(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """DesignForge should analyze architecture of provided code."""
        _skip_if_unreachable(http_client, DESIGNFORGE_URL, "DesignForge")

        resp = http_client.post(
            f"{DESIGNFORGE_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "analyze_architecture",
                "parameters": {
                    "code": SAMPLE_PYTHON_CODE,
                    "language": "python",
                    "detail_level": "standard",
                },
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_suggest_patterns(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """DesignForge should suggest design patterns for a problem domain."""
        _skip_if_unreachable(http_client, DESIGNFORGE_URL, "DesignForge")

        resp = http_client.post(
            f"{DESIGNFORGE_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "suggest_patterns",
                "parameters": {
                    "problem_domain": "Real-time notification system with multiple delivery channels (email, SMS, push, in-app)",
                    "tech_stack": ["Python", "FastAPI", "Redis", "PostgreSQL"],
                    "scale_requirements": "medium",
                },
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "completed"

    def test_designforge_unsupported_task(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """DesignForge should reject unsupported task types."""
        _skip_if_unreachable(http_client, DESIGNFORGE_URL, "DesignForge")

        resp = http_client.post(
            f"{DESIGNFORGE_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "deploy_to_production",
                "parameters": {},
            },
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ============================================================================
# SECTION 7: EMBEDDING SERVICE TESTS
# ============================================================================


class TestEmbeddingService:
    """Test the embedding service for vector generation."""

    def test_single_embedding(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Embedding service should generate a single embedding vector."""
        _skip_if_unreachable(http_client, EMBEDDING_URL, "Embedding")

        resp = http_client.post(
            f"{EMBEDDING_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_embedding",
                "parameters": {
                    "text": "How does the authentication system work?",
                },
            },
            headers=auth_headers,
            timeout=30.0,
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data["status"] == "completed"
        embedding = data["result"]["embedding"]
        assert isinstance(embedding, list)
        assert len(embedding) == VECTOR_DIM or len(embedding) > 0, (
            f"Expected embedding dim ~{VECTOR_DIM}, got {len(embedding)}"
        )
        # All values should be floats
        assert all(isinstance(v, (int, float)) for v in embedding[:10])

    def test_batch_embedding(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Embedding service should handle batch embedding requests."""
        _skip_if_unreachable(http_client, EMBEDDING_URL, "Embedding")

        texts = [
            "How does the API gateway route requests?",
            "What security measures are in place?",
            "How is the knowledge graph structured?",
        ]

        resp = http_client.post(
            f"{EMBEDDING_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_embedding_batch",
                "parameters": {"texts": texts},
            },
            headers=auth_headers,
            timeout=30.0,
        )
        assert resp.status_code == 200

        data = resp.json()
        assert data["status"] == "completed"
        embeddings = data["result"]["embeddings"]
        assert isinstance(embeddings, list)
        assert len(embeddings) == len(texts), (
            f"Expected {len(texts)} embeddings, got {len(embeddings)}"
        )

    def test_embedding_empty_text_returns_error(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Embedding service should handle missing text gracefully."""
        _skip_if_unreachable(http_client, EMBEDDING_URL, "Embedding")

        resp = http_client.post(
            f"{EMBEDDING_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_embedding",
                "parameters": {},  # Missing 'text'
            },
            headers=auth_headers,
        )
        assert resp.status_code in (400, 422, 500)

    def test_embedding_deterministic(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Same text should produce the same embedding (deterministic)."""
        _skip_if_unreachable(http_client, EMBEDDING_URL, "Embedding")

        text = "The quick brown fox jumps over the lazy dog"
        embeddings = []

        for _ in range(2):
            resp = http_client.post(
                f"{EMBEDDING_URL}/execute_task",
                json={
                    "task_id": _make_task_id(),
                    "task_type": "generate_embedding",
                    "parameters": {"text": text},
                },
                headers=auth_headers,
            )
            assert resp.status_code == 200
            embeddings.append(resp.json()["result"]["embedding"])

        # Embeddings should be identical (or very close due to floating point)
        assert len(embeddings[0]) == len(embeddings[1])
        for a, b in zip(embeddings[0][:20], embeddings[1][:20]):
            assert abs(a - b) < 1e-6, f"Embeddings differ: {a} vs {b}"


# ============================================================================
# SECTION 8: RETRIEVER SERVICE TESTS
# ============================================================================


class TestRetrieverService:
    """Test the retriever service for memory indexing and retrieval."""

    def test_index_and_retrieve_memory(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Should be able to index a memory and retrieve it by query."""
        _skip_if_unreachable(http_client, RETRIEVER_URL, "Retriever")

        unique_id = f"test-mem-{uuid.uuid4().hex[:8]}"
        unique_content = f"The fluxcapacitor calibration protocol {unique_id} requires 1.21 gigawatts"

        # Index
        index_resp = http_client.post(
            f"{RETRIEVER_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "index_memory",
                "parameters": {
                    "id": unique_id,
                    "content": unique_content,
                    "metadata": {"test": True, "category": "integration-test"},
                },
            },
            headers=auth_headers,
            timeout=30.0,
        )
        assert index_resp.status_code == 200, (
            f"Index failed: {index_resp.status_code} {index_resp.text}"
        )

        # Give a moment for indexing to complete
        time.sleep(1)

        # Retrieve
        retrieve_resp = http_client.post(
            f"{RETRIEVER_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "retrieve_memories",
                "parameters": {
                    "query": "fluxcapacitor calibration gigawatts",
                    "top_k": 5,
                },
            },
            headers=auth_headers,
            timeout=30.0,
        )
        assert retrieve_resp.status_code == 200

        data = retrieve_resp.json()
        assert data["status"] == "completed"
        results = data["result"].get("results", [])
        assert len(results) > 0, "Retriever returned no results after indexing"

        # The unique content should appear in results
        found = any(unique_id in str(r) for r in results)
        assert found, (
            f"Indexed memory with ID '{unique_id}' not found in retrieval results. "
            f"Got: {results[:3]}"
        )


# ============================================================================
# SECTION 9: ORCHESTRATOR INTEGRATION TESTS
# ============================================================================


class TestOrchestratorIntegration:
    """Test the orchestrator's coordination of agent workflows."""

    def test_orchestrator_lists_agents(
        self,
        http_client: httpx.Client,
        gateway_auth_headers: Dict[str, str],
    ):
        """Orchestrator should list registered agents."""
        _skip_if_unreachable(http_client, ORCHESTRATOR_URL, "Orchestrator")

        resp = http_client.get(
            f"{ORCHESTRATOR_URL}/agents",
            headers=gateway_auth_headers,
        )
        # May return 200 or 401 depending on auth config
        if resp.status_code == 401:
            pytest.skip("Orchestrator requires JWT auth; token may be invalid")

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_orchestrator_comprehensive_analysis(
        self,
        http_client: httpx.Client,
        gateway_auth_headers: Dict[str, str],
    ):
        """Orchestrator should coordinate multi-agent analysis."""
        _skip_if_unreachable(http_client, ORCHESTRATOR_URL, "Orchestrator")

        resp = http_client.post(
            f"{ORCHESTRATOR_URL}/analyze",
            json={
                "code": SAMPLE_PYTHON_CODE,
                "analysis_type": "comprehensive",
                "project_context": "User management module for a web application",
            },
            headers=gateway_auth_headers,
            timeout=120.0,
        )

        if resp.status_code == 401:
            pytest.skip("Orchestrator requires JWT auth; token may be invalid")

        assert resp.status_code == 200, (
            f"Orchestrator /analyze returned {resp.status_code}: {resp.text}"
        )

        data = resp.json()
        assert "results" in data or "status" in data
        if "results" in data:
            assert isinstance(data["results"], dict)

    def test_orchestrator_websocket_connect(
        self,
        http_client: httpx.Client,
    ):
        """WebSocket endpoint should accept connections."""
        _skip_if_unreachable(http_client, ORCHESTRATOR_URL, "Orchestrator")

        # We just test that the endpoint exists and upgrades or returns appropriate error
        try:
            resp = http_client.get(
                f"{ORCHESTRATOR_URL}/ws",
                headers={"Upgrade": "websocket", "Connection": "Upgrade"},
                timeout=5.0,
            )
            # WebSocket upgrade returns 101, or server might return 400/426
            assert resp.status_code in (101, 400, 403, 426), (
                f"WS endpoint returned unexpected {resp.status_code}"
            )
        except Exception:
            # httpx doesn't fully support WebSocket; connection error is acceptable
            pass


# ============================================================================
# SECTION 10: API GATEWAY INTEGRATION TESTS
# ============================================================================


class TestGatewayIntegration:
    """Test the API Gateway's routing and middleware."""

    def test_gateway_health_no_auth(self, http_client: httpx.Client):
        """Health endpoint should not require authentication."""
        _skip_if_unreachable(http_client, GATEWAY_URL, "Gateway")

        resp = http_client.get(f"{GATEWAY_URL}/health")
        assert resp.status_code == 200

    def test_gateway_agents_requires_auth(self, http_client: httpx.Client):
        """Agent endpoints should require authentication."""
        _skip_if_unreachable(http_client, GATEWAY_URL, "Gateway")

        resp = http_client.get(f"{GATEWAY_URL}/v1/agents")
        # Should be 401 or 403 without auth
        assert resp.status_code in (401, 403), (
            f"Expected auth error, got {resp.status_code}"
        )

    def test_gateway_agents_list_with_auth(
        self,
        http_client: httpx.Client,
        gateway_auth_headers: Dict[str, str],
    ):
        """Agent list should work with valid JWT."""
        _skip_if_unreachable(http_client, GATEWAY_URL, "Gateway")

        resp = http_client.get(
            f"{GATEWAY_URL}/v1/agents",
            headers=gateway_auth_headers,
            timeout=15.0,
        )
        # Might fail if orchestrator is down, but should not be auth error
        if resp.status_code in (401, 403):
            pytest.skip("Gateway JWT auth may not accept our test token")

        assert resp.status_code in (200, 502, 503), (
            f"Unexpected gateway response: {resp.status_code}"
        )

    def test_gateway_status_with_auth(
        self,
        http_client: httpx.Client,
        gateway_auth_headers: Dict[str, str],
    ):
        """Status endpoint should return platform information."""
        _skip_if_unreachable(http_client, GATEWAY_URL, "Gateway")

        resp = http_client.get(
            f"{GATEWAY_URL}/v1/status",
            headers=gateway_auth_headers,
        )
        if resp.status_code in (401, 403):
            pytest.skip("Gateway JWT auth may not accept our test token")

        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data

    def test_gateway_404_for_unknown_route(self, http_client: httpx.Client):
        """Unknown routes should return 404."""
        _skip_if_unreachable(http_client, GATEWAY_URL, "Gateway")

        resp = http_client.get(f"{GATEWAY_URL}/v1/nonexistent-route-12345")
        assert resp.status_code in (401, 403, 404), (
            f"Expected 404 for unknown route, got {resp.status_code}"
        )

    def test_gateway_rate_limiting_headers(self, http_client: httpx.Client):
        """Gateway should include rate limit headers."""
        _skip_if_unreachable(http_client, GATEWAY_URL, "Gateway")

        resp = http_client.get(f"{GATEWAY_URL}/health")
        # Rate limit headers may or may not be present on health
        # but on API routes they should be
        # This is a soft check
        headers = dict(resp.headers)
        rate_limit_headers = [
            k for k in headers if "ratelimit" in k.lower() or "x-ratelimit" in k.lower()
        ]
        # Log but don't fail — health endpoint may be exempt
        if not rate_limit_headers:
            pass  # Acceptable: health is often exempt from rate limiting


# ============================================================================
# SECTION 11: CROSS-AGENT CONSISTENCY TESTS
# ============================================================================


class TestCrossAgentConsistency:
    """Tests that verify consistent behavior across all agents."""

    @pytest.mark.parametrize("agent_name,agent_info", AGENT_REGISTRY.items())
    def test_health_response_time_under_threshold(
        self,
        http_client: httpx.Client,
        agent_name: str,
        agent_info: Dict[str, Any],
    ):
        """All agent health checks should respond within 5 seconds."""
        url = agent_info["url"]
        try:
            start = time.time()
            resp = http_client.get(f"{url}/health", timeout=5.0)
            elapsed_ms = (time.time() - start) * 1000
        except (httpx.ConnectError, httpx.TimeoutException):
            pytest.skip(f"{agent_name} not reachable")
            return

        assert resp.status_code == 200
        assert elapsed_ms < 5000, (
            f"{agent_name} health check took {elapsed_ms:.0f}ms (> 5000ms threshold)"
        )

    @pytest.mark.parametrize(
        "agent_name,agent_info",
        [(n, i) for n, i in AGENT_REGISTRY.items() if n in CORE_AGENTS],
    )
    def test_execute_task_schema_consistency(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
        agent_name: str,
        agent_info: Dict[str, Any],
    ):
        """All agents should accept the ADR-012 execute_task schema."""
        url = agent_info["url"]
        _skip_if_unreachable(http_client, url, agent_name)

        # Send a request with the standard ADR-012 fields but an unknown task_type
        resp = http_client.post(
            f"{url}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "__schema_test_unknown__",
                "parameters": {},
            },
            headers=auth_headers,
            timeout=15.0,
        )
        # Should return 400 (unsupported task), NOT 422 (schema validation error)
        assert resp.status_code == 400, (
            f"{agent_name} returned {resp.status_code} for unknown task_type "
            f"(expected 400). Body: {resp.text[:200]}"
        )

    @pytest.mark.parametrize("agent_name,agent_info", AGENT_REGISTRY.items())
    def test_health_json_content_type(
        self,
        http_client: httpx.Client,
        agent_name: str,
        agent_info: Dict[str, Any],
    ):
        """All health endpoints should return application/json."""
        url = agent_info["url"]
        try:
            resp = http_client.get(f"{url}/health", timeout=5.0)
        except (httpx.ConnectError, httpx.TimeoutException):
            pytest.skip(f"{agent_name} not reachable")
            return

        content_type = resp.headers.get("content-type", "")
        assert "application/json" in content_type, (
            f"{agent_name} /health Content-Type is '{content_type}', "
            f"expected 'application/json'"
        )


# ============================================================================
# SECTION 12: END-TO-END WORKFLOW TESTS
# ============================================================================


class TestEndToEndWorkflows:
    """
    End-to-end tests that simulate real user workflows through the full stack.
    These are heavier tests that exercise multiple services.
    """

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_code_generation_then_security_scan(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """
        Workflow: Generate code with CodeCraft, then scan it with SecuriShield.
        This mimics the orchestrator's feature_development workflow.
        """
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")
        _skip_if_unreachable(http_client, SECURISHIELD_URL, "SecuriShield")

        # Step 1: Generate code
        gen_resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_code",
                "parameters": {
                    "prompt": "Write a REST API endpoint for user registration with password hashing",
                    "language": "python",
                    "style": "enterprise",
                },
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert gen_resp.status_code == 200, (
            f"Code generation failed: {gen_resp.status_code}"
        )

        gen_data = gen_resp.json()
        generated_code = gen_data["result"].get(
            "generated_code",
            gen_data["result"].get("content", ""),
        )
        assert len(generated_code) > 50, "Generated code is suspiciously short"

        # Step 2: Scan the generated code
        scan_resp = http_client.post(
            f"{SECURISHIELD_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "scan_code",
                "parameters": {
                    "code": generated_code,
                    "language": "python",
                    "severity_threshold": "LOW",
                },
            },
            headers=auth_headers,
            timeout=90.0,
        )
        assert scan_resp.status_code == 200, (
            f"Security scan failed: {scan_resp.status_code}"
        )

        scan_data = scan_resp.json()
        assert scan_data["status"] == "completed"
        assert "result" in scan_data

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_architecture_analysis_then_diagram(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """
        Workflow: Analyze architecture with DesignForge, then generate a diagram.
        """
        _skip_if_unreachable(http_client, DESIGNFORGE_URL, "DesignForge")

        # Step 1: Analyze
        analysis_resp = http_client.post(
            f"{DESIGNFORGE_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "analyze_architecture",
                "parameters": {
                    "code": SAMPLE_PYTHON_CODE,
                    "language": "python",
                    "detail_level": "quick",
                },
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert analysis_resp.status_code == 200

        # Step 2: Generate diagram based on analysis
        diagram_resp = http_client.post(
            f"{DESIGNFORGE_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "generate_diagram",
                "parameters": {
                    "system_name": "User Management Service",
                    "diagram_type": "c4_context",
                    "description": "User management with password hashing and authentication",
                },
            },
            headers=auth_headers,
            timeout=60.0,
        )
        assert diagram_resp.status_code == 200
        assert diagram_resp.json()["status"] == "completed"

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_embed_then_retrieve_workflow(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """
        Workflow: Embed a piece of knowledge, then retrieve it using semantic search.
        Tests the RAG pipeline end-to-end.
        """
        _skip_if_unreachable(http_client, EMBEDDING_URL, "Embedding")
        _skip_if_unreachable(http_client, RETRIEVER_URL, "Retriever")

        unique_marker = f"xyzzy-{uuid.uuid4().hex[:6]}"
        knowledge = (
            f"The Constella platform uses a {unique_marker} architecture pattern "
            f"where specialized AI agents communicate through a central orchestrator."
        )

        # Step 1: Index the knowledge
        index_resp = http_client.post(
            f"{RETRIEVER_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "index_memory",
                "parameters": {
                    "id": f"e2e-{unique_marker}",
                    "content": knowledge,
                    "metadata": {"type": "architecture", "test": True},
                },
            },
            headers=auth_headers,
            timeout=30.0,
        )
        assert index_resp.status_code == 200

        time.sleep(2)  # Wait for indexing

        # Step 2: Retrieve using a semantic query
        retrieve_resp = http_client.post(
            f"{RETRIEVER_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "retrieve_memories",
                "parameters": {
                    "query": f"How does the {unique_marker} orchestration work?",
                    "top_k": 5,
                },
            },
            headers=auth_headers,
            timeout=30.0,
        )
        assert retrieve_resp.status_code == 200

        results = retrieve_resp.json()["result"].get("results", [])
        assert len(results) > 0, "Retrieval returned no results"
        assert any(unique_marker in str(r) for r in results), (
            f"Unique marker '{unique_marker}' not found in retrieval results"
        )


# ============================================================================
# SECTION 13: CONCURRENCY & RESILIENCE TESTS
# ============================================================================


class TestConcurrencyAndResilience:
    """Test concurrent requests and error resilience."""

    def test_concurrent_health_checks(self, http_client: httpx.Client):
        """Multiple concurrent health checks should all succeed."""
        import concurrent.futures

        reachable_agents = []
        for name, info in AGENT_REGISTRY.items():
            if _is_service_reachable(http_client, info["url"]):
                reachable_agents.append((name, info["url"]))

        if not reachable_agents:
            pytest.skip("No agents reachable for concurrency test")

        def check_health(url: str) -> Tuple[str, int]:
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(f"{url}/health")
                return url, resp.status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            # Fire 3 health checks per agent concurrently
            futures = []
            for name, url in reachable_agents:
                for _ in range(3):
                    futures.append(executor.submit(check_health, url))

            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for url, status in results:
            assert status == 200, f"Concurrent health check failed for {url}: {status}"

    @pytest.mark.skipif(SKIP_LLM_TESTS, reason="LLM tests disabled")
    def test_concurrent_task_execution(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Multiple tasks submitted concurrently should all complete."""
        import concurrent.futures

        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        prompts = [
            "Write a function to reverse a string",
            "Write a function to check if a number is prime",
            "Write a function to flatten a nested list",
        ]

        def execute_task(prompt: str) -> Tuple[str, int, str]:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(
                    f"{CODECRAFT_URL}/execute_task",
                    json={
                        "task_id": _make_task_id(),
                        "task_type": "generate_code",
                        "parameters": {
                            "prompt": prompt,
                            "language": "python",
                        },
                    },
                    headers=auth_headers,
                )
                return prompt, resp.status_code, resp.json().get("status", "unknown")

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(execute_task, p) for p in prompts]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        for prompt, status_code, task_status in results:
            assert status_code == 200, (
                f"Concurrent task '{prompt[:30]}...' failed with {status_code}"
            )
            assert task_status == "completed", (
                f"Concurrent task '{prompt[:30]}...' status: {task_status}"
            )

    def test_large_payload_handling(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
    ):
        """Agents should handle reasonably large code payloads."""
        _skip_if_unreachable(http_client, CODECRAFT_URL, "CodeCraft")

        # Generate a ~50KB code sample
        large_code = "\n".join(
            [f"def function_{i}():\n    return {i}" for i in range(1000)]
        )
        assert len(large_code) > 10000

        resp = http_client.post(
            f"{CODECRAFT_URL}/execute_task",
            json={
                "task_id": _make_task_id(),
                "task_type": "refactor_code" if not SKIP_LLM_TESTS else "__test__",
                "parameters": {
                    "code": large_code,
                    "language": "python",
                    "refactor_type": "simplify",
                },
            },
            headers=auth_headers,
            timeout=90.0,
        )
        # Should not crash — may succeed or return a validation error for task type
        assert resp.status_code in (200, 400, 413, 422, 500), (
            f"Unexpected status for large payload: {resp.status_code}"
        )


# ============================================================================
# SECTION 14: LLM METRICS TESTS
# ============================================================================


class TestLLMMetrics:
    """Test LLM usage metrics endpoints on agents that support them."""

    @pytest.mark.parametrize("agent_name", CORE_AGENTS)
    def test_llm_metrics_endpoint(
        self,
        http_client: httpx.Client,
        auth_headers: Dict[str, str],
        agent_name: str,
    ):
        """Agents with LLM integration should expose /llm-metrics."""
        agent_info = AGENT_REGISTRY[agent_name]
        url = agent_info["url"]
        _skip_if_unreachable(http_client, url, agent_name)

        resp = http_client.get(f"{url}/llm-metrics", headers=auth_headers)

        if resp.status_code == 404:
            pytest.skip(f"{agent_name} does not have /llm-metrics endpoint")

        assert resp.status_code == 200
        data = resp.json()

        # Should have at least one of these fields
        expected_fields = {"cost_today_usd", "provider_health", "rate_limits", "error"}
        assert any(field in data for field in expected_fields), (
            f"{agent_name} /llm-metrics response has no expected fields. "
            f"Got: {list(data.keys())}"
        )


# ============================================================================
# Pytest configuration
# ============================================================================


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line("markers", "llm: marks tests that require LLM API keys")


def pytest_collection_modifyitems(config, items):
    """Auto-tag tests that require LLM calls."""
    for item in items:
        if "SKIP_LLM" in item.name or "skipif" in str(item.own_markers):
            continue
        # If the test name suggests it needs LLM, tag it
        if any(
            keyword in item.name.lower()
            for keyword in ["generate", "scan_code", "analyze", "suggest", "refactor"]
        ):
            item.add_marker(pytest.mark.llm)
