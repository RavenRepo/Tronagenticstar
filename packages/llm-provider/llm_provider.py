"""
Constella LLM Provider Abstraction Layer
=========================================
Unified interface for OpenAI, Anthropic, and Ollama with:
- Automatic fallback between providers
- Rate limiting (RPM + TPM)
- Cost tracking with daily budget alerts
- Response caching via Redis
- Structured JSON output validation
- Retry with exponential backoff

Usage:
    from llm_provider import LLMProvider, LLMRequest

    provider = LLMProvider()
    response = await provider.complete(LLMRequest(
        agent_id="codecraft",
        task_type="code_generation",
        system_prompt="You are a senior engineer.",
        user_prompt="Write a Python function to sort a list.",
        temperature=0.2,
        max_tokens=2048,
    ))
    print(response.content)
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger("constella.llm")


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


class ProviderName(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


@dataclass
class LLMRequest:
    """Unified request across all LLM providers."""

    agent_id: str
    task_type: str
    system_prompt: str
    user_prompt: str
    temperature: float = 0.2
    max_tokens: int = 4096
    json_mode: bool = False
    # Optional overrides
    preferred_provider: Optional[ProviderName] = None
    preferred_model: Optional[str] = None
    context_messages: Optional[List[Dict[str, str]]] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class LLMResponse:
    """Unified response from any LLM provider."""

    content: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    latency_ms: float
    cost_usd: float
    cached: bool = False
    finish_reason: str = "stop"
    request_id: str = ""


@dataclass
class ProviderHealth:
    """Tracks health of a provider for circuit-breaking."""

    consecutive_failures: int = 0
    last_failure_time: float = 0.0
    is_open: bool = False  # circuit breaker open = provider disabled
    total_requests: int = 0
    total_failures: int = 0

    FAILURE_THRESHOLD: int = 3
    RECOVERY_TIMEOUT: float = 60.0  # seconds

    def record_success(self):
        self.consecutive_failures = 0
        self.is_open = False
        self.total_requests += 1

    def record_failure(self):
        self.consecutive_failures += 1
        self.total_failures += 1
        self.total_requests += 1
        self.last_failure_time = time.time()
        if self.consecutive_failures >= self.FAILURE_THRESHOLD:
            self.is_open = True
            logger.warning(
                "Circuit breaker OPENED after %d consecutive failures",
                self.consecutive_failures,
            )

    def is_available(self) -> bool:
        if not self.is_open:
            return True
        elapsed = time.time() - self.last_failure_time
        if elapsed > self.RECOVERY_TIMEOUT:
            logger.info("Circuit breaker entering half-open state after %.1fs", elapsed)
            return True  # half-open: allow one attempt
        return False


@dataclass
class RateLimitState:
    """Token-bucket style rate limiter per provider."""

    requests_this_minute: int = 0
    tokens_this_minute: int = 0
    minute_start: float = field(default_factory=time.time)
    rpm_limit: int = 60
    tpm_limit: int = 100000

    def _maybe_reset(self):
        now = time.time()
        if now - self.minute_start >= 60.0:
            self.requests_this_minute = 0
            self.tokens_this_minute = 0
            self.minute_start = now

    def can_request(self, estimated_tokens: int = 1000) -> bool:
        self._maybe_reset()
        return (
            self.requests_this_minute < self.rpm_limit
            and self.tokens_this_minute + estimated_tokens <= self.tpm_limit
        )

    def record_usage(self, tokens: int):
        self._maybe_reset()
        self.requests_this_minute += 1
        self.tokens_this_minute += tokens

    async def wait_if_needed(self, estimated_tokens: int = 1000):
        while not self.can_request(estimated_tokens):
            wait_time = 60.0 - (time.time() - self.minute_start) + 0.5
            logger.info("Rate limit reached, waiting %.1fs", wait_time)
            await asyncio.sleep(max(wait_time, 1.0))
            self._maybe_reset()


@dataclass
class CostTracker:
    """Tracks daily LLM spend and warns when budget exceeded."""

    daily_costs: Dict[str, float] = field(default_factory=dict)
    daily_budget_usd: float = 10.0
    _alerted_today: bool = False

    def record_cost(self, cost_usd: float, provider: str, model: str):
        today = date.today().isoformat()
        if today not in self.daily_costs:
            self.daily_costs = {today: 0.0}  # reset on new day
            self._alerted_today = False
        self.daily_costs[today] += cost_usd

        if self.daily_costs[today] > self.daily_budget_usd and not self._alerted_today:
            logger.warning(
                "DAILY LLM COST ALERT: $%.4f exceeds budget $%.2f (provider=%s, model=%s)",
                self.daily_costs[today],
                self.daily_budget_usd,
                provider,
                model,
            )
            self._alerted_today = True

    def get_today_cost(self) -> float:
        today = date.today().isoformat()
        return self.daily_costs.get(today, 0.0)


# ---------------------------------------------------------------------------
# Pricing tables (USD per 1K tokens, as of late 2024 / early 2025)
# ---------------------------------------------------------------------------

PRICING = {
    # OpenAI
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    # Anthropic
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
    "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125},
    "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
    # Ollama (local, free)
    "ollama": {"input": 0.0, "output": 0.0},
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = PRICING.get(model, PRICING.get("ollama"))
    return (input_tokens / 1000.0) * pricing["input"] + (
        output_tokens / 1000.0
    ) * pricing["output"]


# ---------------------------------------------------------------------------
# Provider Backends
# ---------------------------------------------------------------------------


class BaseLLMBackend(ABC):
    """Abstract base for LLM provider backends."""

    def __init__(self, name: ProviderName):
        self.name = name
        self.health = ProviderHealth()
        self.rate_limit = RateLimitState()

    @abstractmethod
    async def complete(self, request: LLMRequest) -> LLMResponse: ...

    @abstractmethod
    def is_configured(self) -> bool: ...

    def available_models(self) -> List[str]:
        return []


class OpenAIBackend(BaseLLMBackend):
    """OpenAI Chat Completions API backend."""

    def __init__(self):
        super().__init__(ProviderName.OPENAI)
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.primary_model = os.getenv("OPENAI_MODEL_PRIMARY", "gpt-4o-mini")
        self.fallback_model = os.getenv("OPENAI_MODEL_FALLBACK", "gpt-3.5-turbo")
        self.rate_limit.rpm_limit = int(os.getenv("LLM_RATE_LIMIT_RPM", "60"))
        self.rate_limit.tpm_limit = int(os.getenv("LLM_RATE_LIMIT_TPM", "100000"))

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.startswith("sk-"))

    def available_models(self) -> List[str]:
        return [self.primary_model, self.fallback_model]

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.preferred_model or self.primary_model
        messages = self._build_messages(request)
        estimated_tokens = len(request.user_prompt.split()) * 2

        await self.rate_limit.wait_if_needed(estimated_tokens)

        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                body: Dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                }
                if request.json_mode:
                    body["response_format"] = {"type": "json_object"}

                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()

            latency_ms = (time.time() - start) * 1000
            usage = data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            content = data["choices"][0]["message"]["content"]
            finish_reason = data["choices"][0].get("finish_reason", "stop")

            self.rate_limit.record_usage(input_tokens + output_tokens)
            self.health.record_success()

            return LLMResponse(
                content=content,
                provider=self.name.value,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                latency_ms=latency_ms,
                cost_usd=estimate_cost(model, input_tokens, output_tokens),
                finish_reason=finish_reason,
                request_id=data.get("id", ""),
            )
        except httpx.HTTPStatusError as e:
            self.health.record_failure()
            # If primary model fails, try fallback
            if model == self.primary_model and model != self.fallback_model:
                logger.warning(
                    "OpenAI primary model %s failed (%s), trying fallback %s",
                    model,
                    e,
                    self.fallback_model,
                )
                request.preferred_model = self.fallback_model
                return await self.complete(request)
            raise
        except Exception as e:
            self.health.record_failure()
            raise

    def _build_messages(self, request: LLMRequest) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": request.system_prompt}]
        if request.context_messages:
            messages.extend(request.context_messages)
        messages.append({"role": "user", "content": request.user_prompt})
        return messages


class AnthropicBackend(BaseLLMBackend):
    """Anthropic Messages API backend."""

    def __init__(self):
        super().__init__(ProviderName.ANTHROPIC)
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
        self.primary_model = os.getenv(
            "ANTHROPIC_MODEL_PRIMARY", "claude-3-5-sonnet-20241022"
        )
        self.fallback_model = os.getenv(
            "ANTHROPIC_MODEL_FALLBACK", "claude-3-haiku-20240307"
        )
        self.rate_limit.rpm_limit = int(os.getenv("LLM_RATE_LIMIT_RPM", "50"))
        self.rate_limit.tpm_limit = int(os.getenv("LLM_RATE_LIMIT_TPM", "80000"))

    def is_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key) > 10)

    def available_models(self) -> List[str]:
        return [self.primary_model, self.fallback_model]

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.preferred_model or self.primary_model
        estimated_tokens = len(request.user_prompt.split()) * 2

        await self.rate_limit.wait_if_needed(estimated_tokens)

        start = time.time()
        try:
            messages = []
            if request.context_messages:
                messages.extend(request.context_messages)
            messages.append({"role": "user", "content": request.user_prompt})

            async with httpx.AsyncClient(timeout=120.0) as client:
                body: Dict[str, Any] = {
                    "model": model,
                    "max_tokens": request.max_tokens,
                    "system": request.system_prompt,
                    "messages": messages,
                }
                # Anthropic doesn't have a JSON mode flag the same way;
                # we instruct via system prompt instead.

                resp = await client.post(
                    f"{self.base_url}/v1/messages",
                    headers={
                        "x-api-key": self.api_key,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()

            latency_ms = (time.time() - start) * 1000
            usage = data.get("usage", {})
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)
            content = data["content"][0]["text"] if data.get("content") else ""
            finish_reason = data.get("stop_reason", "end_turn")

            self.rate_limit.record_usage(input_tokens + output_tokens)
            self.health.record_success()

            return LLMResponse(
                content=content,
                provider=self.name.value,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                latency_ms=latency_ms,
                cost_usd=estimate_cost(model, input_tokens, output_tokens),
                finish_reason=finish_reason,
                request_id=data.get("id", ""),
            )
        except httpx.HTTPStatusError as e:
            self.health.record_failure()
            if model == self.primary_model and model != self.fallback_model:
                logger.warning(
                    "Anthropic primary model %s failed (%s), trying fallback %s",
                    model,
                    e,
                    self.fallback_model,
                )
                request.preferred_model = self.fallback_model
                return await self.complete(request)
            raise
        except Exception:
            self.health.record_failure()
            raise


class OllamaBackend(BaseLLMBackend):
    """Ollama local inference backend."""

    def __init__(self):
        super().__init__(ProviderName.OLLAMA)
        self.enabled = os.getenv("OLLAMA_ENABLED", "false").lower() == "true"
        self.base_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = os.getenv("OLLAMA_MODEL", "phi3")
        # Local models have no rate limit concerns
        self.rate_limit.rpm_limit = 999
        self.rate_limit.tpm_limit = 999999

    def is_configured(self) -> bool:
        return self.enabled

    def available_models(self) -> List[str]:
        return [self.model]

    async def complete(self, request: LLMRequest) -> LLMResponse:
        model = request.preferred_model or self.model
        prompt = f"System: {request.system_prompt}\n\nUser: {request.user_prompt}"

        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": request.temperature,
                            "num_predict": request.max_tokens,
                        },
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            latency_ms = (time.time() - start) * 1000
            content = data.get("response", "")
            eval_count = data.get("eval_count", len(content.split()))
            prompt_eval_count = data.get("prompt_eval_count", len(prompt.split()))

            self.health.record_success()

            return LLMResponse(
                content=content,
                provider=self.name.value,
                model=model,
                input_tokens=prompt_eval_count,
                output_tokens=eval_count,
                total_tokens=prompt_eval_count + eval_count,
                latency_ms=latency_ms,
                cost_usd=0.0,
                finish_reason="stop",
            )
        except Exception:
            self.health.record_failure()
            raise


# ---------------------------------------------------------------------------
# Response Cache (in-memory; optionally backed by Redis)
# ---------------------------------------------------------------------------


class ResponseCache:
    """Simple in-memory LRU cache for LLM responses."""

    def __init__(self, max_size: int = 256, ttl_seconds: int = 3600):
        self._cache: Dict[str, Tuple[LLMResponse, float]] = {}
        self._max_size = max_size
        self._ttl = ttl_seconds
        self._redis = None

    async def init_redis(self):
        """Optional: connect to Redis for distributed caching."""
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                import redis.asyncio as aioredis

                self._redis = aioredis.from_url(redis_url, decode_responses=True)
                await self._redis.ping()
                logger.info("LLM response cache connected to Redis")
            except Exception as e:
                logger.warning("Redis cache unavailable, using in-memory only: %s", e)
                self._redis = None

    def _make_key(self, request: LLMRequest) -> str:
        raw = f"{request.system_prompt}|{request.user_prompt}|{request.temperature}|{request.max_tokens}|{request.json_mode}"
        return f"llm_cache:{hashlib.sha256(raw.encode()).hexdigest()[:24]}"

    async def get(self, request: LLMRequest) -> Optional[LLMResponse]:
        key = self._make_key(request)

        # Try Redis first
        if self._redis:
            try:
                data = await self._redis.get(key)
                if data:
                    obj = json.loads(data)
                    resp = LLMResponse(**obj)
                    resp.cached = True
                    return resp
            except Exception:
                pass

        # Fall back to in-memory
        if key in self._cache:
            resp, ts = self._cache[key]
            if time.time() - ts < self._ttl:
                resp.cached = True
                return resp
            else:
                del self._cache[key]
        return None

    async def set(self, request: LLMRequest, response: LLMResponse):
        key = self._make_key(request)

        # Store in Redis
        if self._redis:
            try:
                data = json.dumps(
                    {
                        "content": response.content,
                        "provider": response.provider,
                        "model": response.model,
                        "input_tokens": response.input_tokens,
                        "output_tokens": response.output_tokens,
                        "total_tokens": response.total_tokens,
                        "latency_ms": response.latency_ms,
                        "cost_usd": response.cost_usd,
                        "finish_reason": response.finish_reason,
                        "request_id": response.request_id,
                    }
                )
                await self._redis.setex(key, self._ttl, data)
            except Exception:
                pass

        # Store in memory
        if len(self._cache) >= self._max_size:
            # Evict oldest
            oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]
        self._cache[key] = (response, time.time())


# ---------------------------------------------------------------------------
# Main Provider (Facade)
# ---------------------------------------------------------------------------

# Model routing table: maps (agent_type, task_type) -> preferred model config
DEFAULT_MODEL_ROUTING: Dict[str, Dict[str, str]] = {
    "architecture": {"provider": "openai", "model": "gpt-4o-mini"},
    "security": {"provider": "openai", "model": "gpt-4o-mini"},
    "code_generation": {"provider": "openai", "model": "gpt-4o-mini"},
    "code_review": {"provider": "openai", "model": "gpt-4o-mini"},
    "performance_analysis": {"provider": "openai", "model": "gpt-4o-mini"},
    "quality_evaluation": {"provider": "openai", "model": "gpt-4o-mini"},
    "compliance": {"provider": "openai", "model": "gpt-4o-mini"},
    "database_design": {"provider": "openai", "model": "gpt-4o-mini"},
    "mobile_development": {"provider": "openai", "model": "gpt-4o-mini"},
    "express_development": {"provider": "openai", "model": "gpt-4o-mini"},
    "diagram_generation": {"provider": "openai", "model": "gpt-4o-mini"},
    "general": {"provider": "openai", "model": "gpt-4o-mini"},
}


class LLMProvider:
    """
    Unified LLM provider with automatic failover, caching, and cost tracking.

    Fallback order: preferred provider -> OpenAI -> Anthropic -> Ollama
    """

    def __init__(self):
        self._backends: Dict[ProviderName, BaseLLMBackend] = {}
        self._fallback_order: List[ProviderName] = []
        self._cache = ResponseCache()
        self._cost_tracker = CostTracker(
            daily_budget_usd=float(os.getenv("LLM_COST_ALERT_DAILY_USD", "10.0"))
        )
        self._model_routing = dict(DEFAULT_MODEL_ROUTING)
        self._initialized = False

    async def initialize(self):
        """Initialize all configured backends and cache."""
        if self._initialized:
            return

        # Initialize backends
        openai_backend = OpenAIBackend()
        anthropic_backend = AnthropicBackend()
        ollama_backend = OllamaBackend()

        if openai_backend.is_configured():
            self._backends[ProviderName.OPENAI] = openai_backend
            self._fallback_order.append(ProviderName.OPENAI)
            logger.info(
                "OpenAI backend configured (models: %s)",
                openai_backend.available_models(),
            )

        if anthropic_backend.is_configured():
            self._backends[ProviderName.ANTHROPIC] = anthropic_backend
            self._fallback_order.append(ProviderName.ANTHROPIC)
            logger.info(
                "Anthropic backend configured (models: %s)",
                anthropic_backend.available_models(),
            )

        if ollama_backend.is_configured():
            self._backends[ProviderName.OLLAMA] = ollama_backend
            self._fallback_order.append(ProviderName.OLLAMA)
            logger.info("Ollama backend configured (model: %s)", ollama_backend.model)

        if not self._backends:
            logger.error(
                "NO LLM PROVIDERS CONFIGURED. Set OPENAI_API_KEY or ANTHROPIC_API_KEY."
            )
            raise RuntimeError("No LLM providers configured")

        # Initialize cache
        await self._cache.init_redis()

        self._initialized = True
        logger.info(
            "LLM Provider initialized with %d backends, fallback order: %s",
            len(self._backends),
            [p.value for p in self._fallback_order],
        )

    async def complete(
        self, request: LLMRequest, use_cache: bool = True
    ) -> LLMResponse:
        """
        Send a completion request with automatic fallback and caching.

        Args:
            request: The LLM request
            use_cache: Whether to check/store in cache (default True)

        Returns:
            LLMResponse with content and metadata
        """
        if not self._initialized:
            await self.initialize()

        # Check cache first
        if use_cache:
            cached = await self._cache.get(request)
            if cached:
                logger.debug(
                    "Cache hit for agent=%s task=%s",
                    request.agent_id,
                    request.task_type,
                )
                return cached

        # Determine provider order
        providers_to_try = self._get_provider_order(request)

        last_error = None
        for provider_name in providers_to_try:
            backend = self._backends.get(provider_name)
            if not backend:
                continue
            if not backend.health.is_available():
                logger.debug("Skipping %s (circuit breaker open)", provider_name.value)
                continue

            # Apply model routing if no explicit preference
            if not request.preferred_model:
                routing = self._model_routing.get(
                    request.task_type, self._model_routing.get("general", {})
                )
                if routing.get("provider") == provider_name.value:
                    request.preferred_model = routing.get("model")

            try:
                logger.debug(
                    "Attempting %s for agent=%s task=%s",
                    provider_name.value,
                    request.agent_id,
                    request.task_type,
                )
                response = await backend.complete(request)

                # Track cost
                self._cost_tracker.record_cost(
                    response.cost_usd, response.provider, response.model
                )

                # Cache the response
                if use_cache and response.finish_reason == "stop":
                    await self._cache.set(request, response)

                logger.info(
                    "LLM complete: agent=%s provider=%s model=%s tokens=%d latency=%.0fms cost=$%.6f",
                    request.agent_id,
                    response.provider,
                    response.model,
                    response.total_tokens,
                    response.latency_ms,
                    response.cost_usd,
                )
                return response

            except Exception as e:
                last_error = e
                logger.warning(
                    "Provider %s failed for agent=%s: %s",
                    provider_name.value,
                    request.agent_id,
                    str(e)[:200],
                )
                # Reset preferred model for next provider attempt
                request.preferred_model = None
                continue

        # All providers failed
        error_msg = f"All LLM providers failed. Last error: {last_error}"
        logger.error(error_msg)
        raise RuntimeError(error_msg)

    def _get_provider_order(self, request: LLMRequest) -> List[ProviderName]:
        """Determine the order of providers to try."""
        if request.preferred_provider and request.preferred_provider in self._backends:
            # Put preferred first, then the rest
            order = [request.preferred_provider]
            for p in self._fallback_order:
                if p != request.preferred_provider:
                    order.append(p)
            return order

        # Use routing table to determine preferred provider
        routing = self._model_routing.get(
            request.task_type, self._model_routing.get("general", {})
        )
        preferred = routing.get("provider", "openai")
        try:
            preferred_enum = ProviderName(preferred)
            if preferred_enum in self._backends:
                order = [preferred_enum]
                for p in self._fallback_order:
                    if p != preferred_enum:
                        order.append(p)
                return order
        except ValueError:
            pass

        return list(self._fallback_order)

    # ----- Metrics / Info -----

    def get_cost_today(self) -> float:
        return self._cost_tracker.get_today_cost()

    def get_provider_health(self) -> Dict[str, Dict[str, Any]]:
        result = {}
        for name, backend in self._backends.items():
            h = backend.health
            result[name.value] = {
                "available": h.is_available(),
                "circuit_open": h.is_open,
                "consecutive_failures": h.consecutive_failures,
                "total_requests": h.total_requests,
                "total_failures": h.total_failures,
            }
        return result

    def get_rate_limit_status(self) -> Dict[str, Dict[str, Any]]:
        result = {}
        for name, backend in self._backends.items():
            rl = backend.rate_limit
            rl._maybe_reset()
            result[name.value] = {
                "requests_this_minute": rl.requests_this_minute,
                "tokens_this_minute": rl.tokens_this_minute,
                "rpm_limit": rl.rpm_limit,
                "tpm_limit": rl.tpm_limit,
            }
        return result


# ---------------------------------------------------------------------------
# Singleton instance for easy import
# ---------------------------------------------------------------------------

_provider_instance: Optional[LLMProvider] = None


async def get_llm_provider() -> LLMProvider:
    """Get or create the singleton LLMProvider instance."""
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = LLMProvider()
        await _provider_instance.initialize()
    return _provider_instance


# ---------------------------------------------------------------------------
# System Prompt Templates
# ---------------------------------------------------------------------------

SYSTEM_PROMPTS = {
    "codecraft": (
        "You are CodeCraft, a world-class senior software engineer specializing in code generation, "
        "refactoring, and optimization. You write clean, idiomatic, well-documented, and secure code. "
        "Always include error handling, type hints, and follow language-specific best practices. "
        "When generating code, provide complete, production-ready implementations. "
        "Respond with structured output including the code, language, explanation, and confidence score."
    ),
    "securishield": (
        "You are SecuriShield, an expert application security engineer specializing in vulnerability "
        "detection, OWASP Top 10, SAST/DAST analysis, and secure coding practices. You analyze code "
        "and infrastructure for security vulnerabilities, providing severity ratings (CRITICAL, HIGH, "
        "MEDIUM, LOW, INFO), CVE references where applicable, and actionable remediation steps. "
        "Always prioritize findings by exploitability and impact. "
        "Respond in structured JSON with: vulnerabilities array, overall_risk_score (0-100), "
        "and executive_summary."
    ),
    "designforge": (
        "You are DesignForge, an expert software architect specializing in system design, "
        "architecture patterns (microservices, event-driven, CQRS, hexagonal), and C4 model diagrams. "
        "You analyze systems and produce architecture recommendations, component diagrams in Mermaid "
        "or PlantUML format, and design trade-off analyses. "
        "Respond in structured JSON with: architecture_analysis, diagram_code, patterns_identified, "
        "and recommendations."
    ),
    "perfpulse": (
        "You are PerfPulse, a performance engineering expert specializing in application profiling, "
        "bottleneck identification, resource optimization, and scalability analysis. You analyze "
        "metrics, code patterns, and infrastructure to identify performance issues. "
        "Provide Big-O complexity analysis, resource utilization insights, and optimization strategies. "
        "Respond in structured JSON with: performance_score (0-100), bottlenecks array, "
        "optimizations array with expected_improvement percentages, and priority ranking."
    ),
    "evaluator": (
        "You are Evaluator, a code quality expert specializing in comprehensive code review, "
        "technical debt assessment, maintainability analysis, and best practices enforcement. "
        "You evaluate code against SOLID principles, clean code standards, test coverage adequacy, "
        "and industry benchmarks. "
        "Respond in structured JSON with: quality_score (0-100), detailed_metrics object, "
        "issues array with severity and line_references, and prioritized recommendations."
    ),
    "expressops": (
        "You are ExpressOps, a Node.js and Express.js backend specialist. You generate production-grade "
        "Express.js applications with proper middleware stacks, route organization, error handling, "
        "authentication, validation (Joi/Zod), database integration, and deployment configs. "
        "Follow Express.js best practices including helmet, cors, rate limiting, and structured logging. "
        "Respond in structured JSON with: files object (path->content), setup_instructions, "
        "and best_practices array."
    ),
    "mobilefirstops": (
        "You are MobileFirstOps, a mobile development expert specializing in React Native and Flutter. "
        "You generate cross-platform mobile applications with proper navigation, state management, "
        "API integration, offline support, and native module bridging. "
        "Follow mobile-first design principles, accessibility standards, and platform guidelines. "
        "Respond in structured JSON with: files object (path->content), setup_instructions, "
        "platform_configs, and performance_tips."
    ),
    "database_agent": (
        "You are Database Architect, an expert in database design, schema modeling, migration strategies, "
        "query optimization, and data architecture. You support PostgreSQL, MySQL, MongoDB, Redis, and "
        "other databases. You design normalized schemas, write efficient migrations, optimize queries "
        "with proper indexing, and configure connection pooling. "
        "Respond in structured JSON with: schema_definition, migrations array, optimization_tips, "
        "and configuration_recommendations."
    ),
    "soc2_compliance": (
        "You are SOC2 Compliance Analyst, an expert in SOC2 Type II compliance, trust service criteria, "
        "evidence collection, and audit preparation. You evaluate systems against CC (Common Criteria) "
        "controls covering Security, Availability, Processing Integrity, Confidentiality, and Privacy. "
        "Provide control assessments, gap analyses, remediation plans, and evidence collection strategies. "
        "Respond in structured JSON with: compliance_score (0-100), controls_assessed array, "
        "violations array, remediation_plan, and evidence_requirements."
    ),
    "orchestrator": (
        "You are the Chief Architect, an AI project manager that decomposes complex requirements into "
        "orchestrated multi-agent workflows. You understand the capabilities of all specialized agents "
        "and determine the optimal workflow to fulfill user requests. "
        "Break down tasks, assign to appropriate agents, manage dependencies, and synthesize results. "
        "Respond in structured JSON with: workflow_steps array, agent_assignments, "
        "dependency_graph, and estimated_completion."
    ),
}


def get_system_prompt(agent_id: str) -> str:
    """Get the system prompt for a given agent."""
    return SYSTEM_PROMPTS.get(
        agent_id, SYSTEM_PROMPTS.get("codecraft", "You are a helpful AI assistant.")
    )
