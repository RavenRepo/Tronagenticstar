# ─── Constella Sandbox Executor ──────────────────────────────────────────────
# Minimal, security-hardened image for ephemeral agent code execution.
# Spawned on-demand by the orchestrator via dockerode — NOT a long-running service.
#
# Security constraints (enforced at container creation time by systemTools.ts):
#   --network none          No network access
#   --memory 256m           Memory cap
#   --cpus 0.5              CPU cap
#   --read-only             Read-only root filesystem (except /sandbox)
#   --pids-limit 64         Fork bomb protection
#   Timeout: 30s            Killed by orchestrator after deadline
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine

LABEL maintainer="Constella Development Team"
LABEL description="Ephemeral sandbox for secure agent code execution"
LABEL org.opencontainers.image.source="https://github.com/constella/tronagenticstar"

# Install runtime dependencies
# - python3 + pip: for Python script execution
# - bash: for shell script execution
# - git: for agents that need to clone/inspect repos
# - curl: for basic HTTP probing (e.g. health checks)
# - jq: for JSON processing in shell scripts
RUN apk add --no-cache \
    python3 \
    py3-pip \
    bash \
    git \
    curl \
    jq \
    && python3 -m ensurepip --upgrade 2>/dev/null || true \
    && rm -rf /var/cache/apk/* /tmp/*

# Create non-root sandbox user
RUN addgroup -S sandboxgroup \
    && adduser -S -G sandboxgroup -h /sandbox -s /bin/bash sandboxuser

# Create working directories with correct permissions
RUN mkdir -p /sandbox/output /sandbox/tmp \
    && chown -R sandboxuser:sandboxgroup /sandbox

# Set resource-friendly Python defaults
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set Node.js memory limit inside container
ENV NODE_OPTIONS="--max-old-space-size=192"

WORKDIR /sandbox

USER sandboxuser

# Default entrypoint: execute a shell command passed as an argument
# Usage: docker run --rm constella/sandbox-executor:dev "echo hello"
ENTRYPOINT ["bash", "-c"]

# Default command (no-op, overridden at runtime)
CMD ["echo 'Constella Sandbox Ready'"]
