# ============================================================================
# CODECRAFT AGENT - PRODUCTION DOCKERFILE
# ============================================================================
# Multi-stage build for minimal production image with shared llm-provider
# ============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Dependencies
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

# Install system dependencies needed for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 2: Production
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS production

WORKDIR /app

# Install only runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Copy shared llm-provider package
COPY packages/llm-provider /app/packages/llm-provider

# Copy application code
COPY services/codecraft/main.py /app/main.py
COPY services/codecraft/requirements.txt /app/requirements.txt

# Create non-root user for security
RUN useradd -m -u 1000 -s /bin/bash codecraft \
    && chown -R codecraft:codecraft /app

USER codecraft

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:8012/health || exit 1

# Expose the correct port (matches docker-compose.prod.yml)
EXPOSE 8012

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8012", "--log-level", "warning"]
