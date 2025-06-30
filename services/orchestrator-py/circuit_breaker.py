"""Simple async-friendly circuit breaker implementation."""
from __future__ import annotations

import asyncio
import time
from enum import Enum, auto
from typing import Callable, Awaitable, TypeVar

T = TypeVar("T")


class CircuitState(Enum):
    CLOSED = auto()
    OPEN = auto()
    HALF_OPEN = auto()


class CircuitBreaker:
    def __init__(self, *, failure_threshold: int = 3, recovery_timeout: int = 30):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_ts: float | None = None

    def _should_attempt_reset(self) -> bool:
        return (
            self._last_failure_ts is not None
            and time.time() - self._last_failure_ts > self.recovery_timeout
        )

    async def call(self, func: Callable[..., Awaitable[T]], *args, **kwargs) -> T:
        if self._state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self._state = CircuitState.HALF_OPEN
            else:
                raise RuntimeError("Circuit breaker is open")

        try:
            result = await func(*args, **kwargs)
        except Exception:
            self._record_failure()
            raise
        else:
            self._record_success()
            return result

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _record_failure(self):
        self._failure_count += 1
        self._last_failure_ts = time.time()
        if self._failure_count >= self.failure_threshold:
            self._state = CircuitState.OPEN

    def _record_success(self):
        self._failure_count = 0
        self._state = CircuitState.CLOSED 