# ============================================================================
# DESIGNFORGE AGENT - PRODUCTION DOCKERFILE
# ============================================================================
# Multi-stage build for minimal image size and security.
# Copies the shared llm-provider package from the monorepo.
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

# Install Python dependencies into a virtual env for clean copy
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install service requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install shared llm-provider package requirements (if any)
COPY packages/llm-provider/requirements.txt /tmp/llm-provider-requirements.txt
RUN pip install --no-cache-dir -r /tmp/llm-provider-requirements.txt 2>/dev/null || true

# ---------------------------------------------------------------------------
# Stage 2: Production — lean runtime image
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS production

WORKDIR /app

# Install only runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual env from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy shared llm-provider package
COPY packages/llm-provider /app/packages/llm-provider

# Copy application code
COPY services/designforge/ /app/

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash designforge && \
    chown -R designforge:designforge /app
USER designforge

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8010/health || exit 1

# Expose the correct port for DesignForge (ADR-012)
EXPOSE 8010

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8010", "--log-level", "warning"]
