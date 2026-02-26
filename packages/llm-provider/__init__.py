"""
Constella LLM Provider Package
===============================
Unified LLM abstraction layer with multi-provider support,
automatic failover, rate limiting, cost tracking, and caching.
"""

from .llm_provider import (
    DEFAULT_MODEL_ROUTING,
    PRICING,
    SYSTEM_PROMPTS,
    AnthropicBackend,
    BaseLLMBackend,
    CostTracker,
    LLMProvider,
    LLMRequest,
    LLMResponse,
    OllamaBackend,
    OpenAIBackend,
    ProviderHealth,
    ProviderName,
    RateLimitState,
    ResponseCache,
    estimate_cost,
    get_llm_provider,
    get_system_prompt,
)

__all__ = [
    # Core provider
    "LLMProvider",
    "get_llm_provider",
    # Request / Response
    "LLMRequest",
    "LLMResponse",
    # Enums
    "ProviderName",
    # Backends
    "BaseLLMBackend",
    "OpenAIBackend",
    "AnthropicBackend",
    "OllamaBackend",
    # Infrastructure
    "ProviderHealth",
    "RateLimitState",
    "CostTracker",
    "ResponseCache",
    # Prompts & Config
    "get_system_prompt",
    "estimate_cost",
    "SYSTEM_PROMPTS",
    "PRICING",
    "DEFAULT_MODEL_ROUTING",
]

__version__ = "1.0.0"
