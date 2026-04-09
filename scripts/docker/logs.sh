#!/bin/bash
# View logs from all services or a specific service
# Usage: ./scripts/docker/logs.sh [service-name] [--follow]
# Examples:
#   ./scripts/docker/logs.sh              # All logs (last 100 lines)
#   ./scripts/docker/logs.sh redis        # Redis logs only
#   ./scripts/docker/logs.sh --follow     # All logs, streaming
#   ./scripts/docker/logs.sh redis -f     # Redis logs, streaming

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

SERVICE=""
FOLLOW_FLAG=""
TAIL_LINES="100"

# Parse arguments
for arg in "$@"; do
    case $arg in
        --follow|-f)
            FOLLOW_FLAG="-f"
            ;;
        --tail=*)
            TAIL_LINES="${arg#*=}"
            ;;
        *)
            if [[ -z "$SERVICE" ]] && [[ "$arg" != -* ]]; then
                SERVICE="$arg"
            fi
            ;;
    esac
done

echo "📜 Viewing logs..."

if [[ -n "$SERVICE" ]]; then
    echo "   Service: $SERVICE"
fi

if [[ -n "$FOLLOW_FLAG" ]]; then
    echo "   Mode: Streaming (Ctrl+C to stop)"
else
    echo "   Showing last $TAIL_LINES lines"
fi

echo ""

docker compose -f docker-compose.dev.yml logs --tail="$TAIL_LINES" $FOLLOW_FLAG $SERVICE
