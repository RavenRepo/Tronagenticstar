FROM python:3.12-slim

# Install OS packages faster and safer
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Environment
ENV PYTHONUNBUFFERED=1

# Expose FastAPI port
EXPOSE 8000

# Healthcheck (FastAPI already has /healthz)
HEALTHCHECK CMD curl --fail http://localhost:8000/healthz || exit 1

# Run the service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"] 