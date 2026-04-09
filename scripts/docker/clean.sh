#!/bin/bash
# Clean up Docker resources (containers, volumes, images)
# Usage: ./scripts/docker/clean.sh [--volumes] [--images] [--all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

CLEAN_VOLUMES=false
CLEAN_IMAGES=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --volumes|-v)
            CLEAN_VOLUMES=true
            ;;
        --images|-i)
            CLEAN_IMAGES=true
            ;;
        --all|-a)
            CLEAN_VOLUMES=true
            CLEAN_IMAGES=true
            ;;
        --help|-h)
            echo "Usage: ./scripts/docker/clean.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --volumes, -v   Remove volumes (persistent data)"
            echo "  --images, -i    Remove project images"
            echo "  --all, -a       Remove everything (volumes + images)"
            echo "  --help, -h      Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./scripts/docker/clean.sh           # Stop containers only"
            echo "  ./scripts/docker/clean.sh -v        # Also remove volumes"
            echo "  ./scripts/docker/clean.sh --all     # Full cleanup"
            exit 0
            ;;
    esac
done

echo "🧹 Cleaning Docker resources..."
echo ""

# Stop and remove containers
echo "📦 Stopping and removing containers..."
if [[ -f "docker-compose.dev.yml" ]]; then
    docker compose -f docker-compose.dev.yml down --remove-orphans
fi
if [[ -f "docker-compose.prod.yml" ]]; then
    docker compose -f docker-compose.prod.yml down --remove-orphans
fi

# Remove volumes if requested
if [[ "$CLEAN_VOLUMES" == true ]]; then
    echo ""
    echo "🗄️  Removing volumes..."
    
    # Remove named volumes from compose
    if [[ -f "docker-compose.dev.yml" ]]; then
        docker compose -f docker-compose.dev.yml down -v 2>/dev/null || true
    fi
    if [[ -f "docker-compose.prod.yml" ]]; then
        docker compose -f docker-compose.prod.yml down -v 2>/dev/null || true
    fi
    
    # Remove any dangling volumes
    DANGLING=$(docker volume ls -qf dangling=true 2>/dev/null | wc -l)
    if [[ "$DANGLING" -gt 0 ]]; then
        echo "   Removing $DANGLING dangling volume(s)..."
        docker volume prune -f
    fi
    
    echo "   ✅ Volumes removed"
fi

# Remove images if requested
if [[ "$CLEAN_IMAGES" == true ]]; then
    echo ""
    echo "🖼️  Removing project images..."
    
    # Remove constella/sandbox images
    IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "^constella|^sandbox" || true)
    if [[ -n "$IMAGES" ]]; then
        echo "$IMAGES" | while read -r img; do
            echo "   Removing $img..."
            docker rmi "$img" 2>/dev/null || true
        done
    fi
    
    # Remove dangling images
    DANGLING=$(docker images -qf dangling=true 2>/dev/null | wc -l)
    if [[ "$DANGLING" -gt 0 ]]; then
        echo "   Removing $DANGLING dangling image(s)..."
        docker image prune -f
    fi
    
    echo "   ✅ Images removed"
fi

echo ""
echo "✅ Cleanup complete!"

# Show summary
echo ""
echo "📊 Current Docker status:"
echo "   Containers: $(docker ps -q 2>/dev/null | wc -l) running"
echo "   Images:     $(docker images -q 2>/dev/null | wc -l) total"
echo "   Volumes:    $(docker volume ls -q 2>/dev/null | wc -l) total"
