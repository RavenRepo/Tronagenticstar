# Build stage
FROM python:3.11-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY services/perfpulse/requirements.txt .

# Install Python dependencies into a virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# Copy and install shared LLM provider package
COPY packages/llm-provider /packages/llm-provider
RUN pip install --no-cache-dir /packages/llm-provider

# Production stage
FROM python:3.11-slim

WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user
RUN groupadd -g 1001 constella && \
    useradd -u 1001 -g constella -s /bin/bash -m constella

# Copy application code
COPY services/perfpulse .

# Set ownership
RUN chown -R constella:constella /app

# Switch to non-root user
USER constella

# Expose port
EXPOSE 8005

# Run the application
CMD ["python", "main.py"]
