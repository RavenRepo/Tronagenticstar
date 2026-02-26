# ============================================================================
# SECURISHIELD AGENT - PRODUCTION DOCKERFILE
# ============================================================================
# Build context must be the project root (.) so we can copy the shared
# llm-provider package. Set in docker-compose.prod.yml:
#   build:
#     context: .
#     dockerfile: services/securishield/Dockerfile
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Builder — install dependencies
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

# Install system deps needed for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies into a prefix for clean copy
COPY services/securishield/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Also install shared llm-provider requirements if present
COPY packages/llm-provider/requirements.txt /tmp/llm-provider-requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r /tmp/llm-provider-requirements.txt 2>/dev/null || true

# ---------------------------------------------------------------------------
# Stage 2: Production — lean runtime image
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS production

WORKDIR /app

# Install only runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy shared llm-provider package (referenced via sys.path in main.py)
COPY packages/llm-provider /app/packages/llm-provider

# Copy application code
COPY services/securishield/ /app/

# Create non-root user for security
RUN useradd -m -u 1000 -s /bin/bash securishield \
    && chown -R securishield:securishield /app

USER securishield

# Health check on the correct port
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:8011/health || exit 1

# Expose the correct port for SecuriShield (ADR-012)
EXPOSE 8011

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8011", "--log-level", "warning"]
