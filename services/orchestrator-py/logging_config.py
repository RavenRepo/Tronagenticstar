"""
Structured JSON Logging Configuration
Implements observability best practices with request context tracking
"""

import os
import json
import logging
import time
from datetime import datetime
from typing import Optional
from contextvars import ContextVar
from functools import wraps

# Context variables for request-scoped data
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
user_id_var: ContextVar[Optional[str]] = ContextVar("user_id", default=None)


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter that includes structured fields for observability.
    Includes: timestamp, level, message, request_id, user_id, and additional context.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "request_id": request_id_var.get(),
            "user_id": user_id_var.get(),
        }

        # Add duration_ms if present in the record
        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms

        # Add extra fields if present
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add source location for errors
        if record.levelno >= logging.ERROR:
            log_data["source"] = {
                "file": record.filename,
                "line": record.lineno,
                "function": record.funcName,
            }

        return json.dumps(log_data, default=str)


def setup_logging(name: str = __name__) -> logging.Logger:
    """
    Configure and return a logger with JSON formatting.
    Log level is configurable via LOG_LEVEL environment variable.
    
    Args:
        name: Logger name (typically __name__)
    
    Returns:
        Configured logger instance
    """
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    
    if log_level not in valid_levels:
        log_level = "INFO"

    logger = logging.getLogger(name)
    
    # Avoid adding duplicate handlers
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)
    
    logger.setLevel(getattr(logging, log_level))
    
    # Prevent propagation to root logger to avoid duplicate logs
    logger.propagate = False

    return logger


def set_request_context(request_id: Optional[str] = None, user_id: Optional[str] = None):
    """Set request-scoped context variables for logging."""
    if request_id is not None:
        request_id_var.set(request_id)
    if user_id is not None:
        user_id_var.set(user_id)


def clear_request_context():
    """Clear request-scoped context variables."""
    request_id_var.set(None)
    user_id_var.set(None)


def log_with_duration(logger: logging.Logger, level: int, message: str, duration_ms: float, **extra):
    """
    Log a message with duration information.
    
    Args:
        logger: Logger instance
        level: Logging level (e.g., logging.INFO)
        message: Log message
        duration_ms: Duration in milliseconds
        **extra: Additional fields to include in the log
    """
    record = logger.makeRecord(
        logger.name,
        level,
        "",
        0,
        message,
        (),
        None,
    )
    record.duration_ms = duration_ms
    if extra:
        record.extra_fields = extra
    logger.handle(record)


class LogContext:
    """
    Context manager for timing operations and logging with duration.
    
    Usage:
        with LogContext(logger, "Processing request") as ctx:
            # do work
            ctx.add_field("items_processed", 10)
    """

    def __init__(self, logger: logging.Logger, operation: str, level: int = logging.INFO):
        self.logger = logger
        self.operation = operation
        self.level = level
        self.start_time = None
        self.extra_fields = {}

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration_ms = (time.perf_counter() - self.start_time) * 1000
        
        if exc_type is not None:
            log_with_duration(
                self.logger,
                logging.ERROR,
                f"{self.operation} failed: {exc_val}",
                duration_ms,
                **self.extra_fields
            )
        else:
            log_with_duration(
                self.logger,
                self.level,
                f"{self.operation} completed",
                duration_ms,
                **self.extra_fields
            )
        
        return False  # Don't suppress exceptions

    def add_field(self, key: str, value):
        """Add an extra field to be included in the final log."""
        self.extra_fields[key] = value


def timed_operation(logger: logging.Logger, operation: str, level: int = logging.INFO):
    """
    Decorator for timing function execution and logging with duration.
    
    Usage:
        @timed_operation(logger, "Database query")
        async def fetch_data():
            ...
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start_time) * 1000
                log_with_duration(logger, level, f"{operation} completed", duration_ms)
                return result
            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000
                log_with_duration(logger, logging.ERROR, f"{operation} failed: {e}", duration_ms)
                raise

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.perf_counter() - start_time) * 1000
                log_with_duration(logger, level, f"{operation} completed", duration_ms)
                return result
            except Exception as e:
                duration_ms = (time.perf_counter() - start_time) * 1000
                log_with_duration(logger, logging.ERROR, f"{operation} failed: {e}", duration_ms)
                raise

        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# Configure uvicorn and other library loggers to use JSON format
def configure_uvicorn_logging():
    """Configure uvicorn loggers to use JSON formatting."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    
    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
        uv_logger = logging.getLogger(logger_name)
        uv_logger.handlers = []
        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())
        uv_logger.addHandler(handler)
        uv_logger.setLevel(getattr(logging, log_level, logging.INFO))
