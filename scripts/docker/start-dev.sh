#!/bin/bash
# Start development environment
# Usage: ./scripts/docker/start-dev.sh [--detach]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "🚀 Starting development environment..."

DETACH_FLAG=""
if [[ "$1" == "--detach" ]] || [[ "$1" == "-d" ]]; then
    DETACH_FLAG="-d"
    echo "   Running in detached mode"
fi

# Start all services
docker compose -f docker-compose.dev.yml up $DETACH_FLAG

if [[ -n "$DETACH_FLAG" ]]; then
    echo ""
    echo "✅ Development environment started in background!"
    echo ""
    echo "📊 Service Status:"
    docker compose -f docker-compose.dev.yml ps
    echo ""
    echo "🔗 Service URLs:"
    echo "   Redis:      localhost:6379"
    echo "   Neo4j:      http://localhost:7474 (browser)"
    echo "   Qdrant:     http://localhost:6333"
    echo "   NATS:       localhost:4222"
    echo "   Prometheus: http://localhost:9090"
    echo "   Grafana:    http://localhost:3001"
    echo "   Loki:       http://localhost:3100"
    echo "   Python Expert: http://localhost:8018"
    echo ""
    echo "💡 Use './scripts/docker/logs.sh' to view logs"
    echo "💡 Use './scripts/docker/stop-all.sh' to stop services"
fi
