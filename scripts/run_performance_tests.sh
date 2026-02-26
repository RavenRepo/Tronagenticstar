#!/bin/bash
set -e

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "🚀 Starting Constella AI Platform Performance Tests..."

# Setup virtual environment if it doesn't exist
VENV_DIR="tests/performance/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment for performance tests..."
    python3 -m venv "$VENV_DIR"
fi

# Activate venv and install requirements
source "$VENV_DIR/bin/activate"
echo "📦 Installing requirements..."
pip install -r tests/performance/requirements.txt -q

# Default parameters
HOST=${1:-"http://localhost:8000"}
USERS=${2:-50}
SPAWN_RATE=${3:-10}
RUN_TIME=${4:-"1m"}

echo "========================================================"
echo "🎯 Target Host: $HOST"
echo "👥 Users: $USERS"
echo "📈 Spawn Rate: $SPAWN_RATE users/sec"
echo "⏱️  Run Time: $RUN_TIME"
echo "========================================================"

# Run Locust in headless mode
echo "🏃 Running Locust..."
locust -f tests/performance/locustfile.py \
    --headless \
    --users "$USERS" \
    --spawn-rate "$SPAWN_RATE" \
    --run-time "$RUN_TIME" \
    --host "$HOST" \
    --html tests/performance/report.html \
    --csv tests/performance/results

echo "✅ Performance tests completed!"
echo "📊 HTML Report generated at: tests/performance/report.html"
echo "📊 CSV Results generated at: tests/performance/results_*.csv"
