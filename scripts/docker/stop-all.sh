#!/bin/bash
# Stop all Docker containers
# Usage: ./scripts/docker/stop-all.sh [--remove]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "🛑 Stopping all containers..."

REMOVE_FLAG=""
if [[ "$1" == "--remove" ]] || [[ "$1" == "-r" ]]; then
    REMOVE_FLAG="--remove-orphans"
    echo "   Also removing orphaned containers"
fi

# Stop development containers
if [[ -f "docker-compose.dev.yml" ]]; then
    echo ""
    echo "📦 Stopping development containers..."
    docker compose -f docker-compose.dev.yml down $REMOVE_FLAG
fi

# Stop production containers
if [[ -f "docker-compose.prod.yml" ]]; then
    echo ""
    echo "📦 Stopping production containers..."
    docker compose -f docker-compose.prod.yml down $REMOVE_FLAG
fi

echo ""
echo "✅ All containers stopped!"

# Show any remaining containers
REMAINING=$(docker ps -q --filter "network=constella-network" 2>/dev/null | wc -l)
if [[ "$REMAINING" -gt 0 ]]; then
    echo ""
    echo "⚠️  $REMAINING container(s) still running on constella-network:"
    docker ps --filter "network=constella-network" --format "table {{.Names}}\t{{.Status}}"
fi
