#!/bin/bash
# Build all Docker images for the Constella platform
# Usage: ./scripts/docker/build-all.sh [--no-cache]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "🔨 Building all Docker images..."

NO_CACHE=""
if [[ "$1" == "--no-cache" ]]; then
    NO_CACHE="--no-cache"
    echo "   Building with --no-cache"
fi

# Build development images
echo ""
echo "📦 Building development images..."
docker compose -f docker-compose.dev.yml build $NO_CACHE

# Build sandbox executor images (build-only profile)
echo ""
echo "📦 Building sandbox executor images..."
docker compose -f docker-compose.dev.yml --profile build-only build $NO_CACHE

# Build production images if prod compose exists
if [[ -f "docker-compose.prod.yml" ]]; then
    echo ""
    echo "📦 Building production images..."
    docker compose -f docker-compose.prod.yml build $NO_CACHE
fi

echo ""
echo "✅ All Docker images built successfully!"
echo ""
echo "📋 Available images:"
docker images | grep -E "constella|sandbox" | head -20 || echo "   (no constella images found)"
