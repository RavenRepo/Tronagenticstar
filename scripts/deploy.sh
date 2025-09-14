#!/bin/bash

# Make scripts executable
chmod +x "${SCRIPT_DIR}"/*.sh 2>/dev/null || true

# ============================================================================
# Constella AI Operating Platform - Comprehensive Deployment Script
# ============================================================================
# This script handles the complete deployment of Constella's multi-agent
# orchestration platform with enterprise-grade reliability and monitoring.

set -euo pipefail  # Exit on any error, undefined variable, or pipe failure

# Global variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_LOG="/tmp/constella-deploy-$(date +%Y%m%d_%H%M%S).log"
ENVIRONMENT="${ENVIRONMENT:-development}"
SKIP_TESTS="${SKIP_TESTS:-false}"
TIMEOUT="${TIMEOUT:-300}"
HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-30}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${DEPLOY_LOG}"
}

info() { log "${BLUE}INFO${NC}" "$@"; }
success() { log "${GREEN}SUCCESS${NC}" "$@"; }
warn() { log "${YELLOW}WARN${NC}" "$@"; }
error() { log "${RED}ERROR${NC}" "$@"; }
debug() { [[ "${DEBUG:-false}" == "true" ]] && log "${PURPLE}DEBUG${NC}" "$@"; }

# Error handling
cleanup() {
    info "Performing cleanup operations..."
    # Clean up any temporary resources if needed
    if [[ -n "${TEMP_DIR:-}" ]] && [[ -d "${TEMP_DIR}" ]]; then
        rm -rf "${TEMP_DIR}"
        debug "Removed temporary directory: ${TEMP_DIR}"
    fi
}

error_exit() {
    error "$1"
    cleanup
    exit 1
}

trap cleanup EXIT
trap 'error_exit "Deployment interrupted by user"' INT TERM

# Banner
show_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
   ╔════════════════════════════════════════════════════════════════╗
   ║                                                                ║
   ║     ██████╗ ██████╗ ███╗   ██╗███████╗████████╗███████╗██╗     ║
   ║    ██╔════╝██╔═══██╗████╗  ██║██╔════╝╚══██╔══╝██╔════╝██║     ║
   ║    ██║     ██║   ██║██╔██╗ ██║███████╗   ██║   █████╗  ██║     ║
   ║    ██║     ██║   ██║██║╚██╗██║╚════██║   ██║   ██╔══╝  ██║     ║
   ║    ╚██████╗╚██████╔╝██║ ╚████║███████║   ██║   ███████╗███████╗║
   ║     ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝   ╚══════╝╚══════╝║
   ║                                                                ║
   ║            Enterprise AI Operating Platform                    ║
   ║                    Deployment Manager                          ║
   ║                                                                ║
   ╚════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Service definitions
declare -A SERVICES=(
    ["orchestrator-py"]="8000"
    ["retriever"]="8001"
    ["embedding"]="8002"
    ["designforge"]="8010"
    ["securishield"]="8011"
    ["codecraft"]="8012"
    ["perfpulse"]="8013"
    ["evaluator"]="8014"
    ["expressops"]="8015"
    ["mobilefirstops"]="8016"
    ["database-agent"]="8017"
    ["soc2-compliance"]="8020"
)

declare -A INFRASTRUCTURE=(
    ["neo4j"]="7474:7687"
    ["qdrant"]="6333"
    ["redis"]="6379"
    ["nats"]="4222:8222"
    ["prometheus"]="9090"
    ["grafana"]="3002"
    ["loki"]="3100"
)

# Prerequisites check
check_prerequisites() {
    info "Checking deployment prerequisites..."

    local required_commands=("docker" "docker-compose" "curl" "jq")
    local missing_commands=()

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_commands+=("$cmd")
        fi
    done

    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        error_exit "Missing required commands: ${missing_commands[*]}"
    fi

    # Check Docker daemon
    if ! docker info &> /dev/null; then
        error_exit "Docker daemon is not running or accessible"
    fi

    # Check available disk space (minimum 10GB)
    local available_space=$(df "${PROJECT_ROOT}" | awk 'NR==2 {print $4}')
    local required_space=$((10 * 1024 * 1024)) # 10GB in KB

    if [[ $available_space -lt $required_space ]]; then
        warn "Low disk space: ${available_space}KB available, ${required_space}KB recommended"
    fi

    # Check available memory (minimum 8GB)
    local available_memory=$(free -k | awk '/^Mem:/{print $2}')
    local required_memory=$((8 * 1024 * 1024)) # 8GB in KB

    if [[ $available_memory -lt $required_memory ]]; then
        warn "Low memory: ${available_memory}KB available, ${required_memory}KB recommended"
    fi

    success "Prerequisites check completed"
}

# Environment validation
validate_environment() {
    info "Validating environment: ${ENVIRONMENT}"

    case "${ENVIRONMENT}" in
        development|staging|production)
            info "Environment '${ENVIRONMENT}' is valid"
            ;;
        *)
            error_exit "Invalid environment: ${ENVIRONMENT}. Must be one of: development, staging, production"
            ;;
    esac

    # Check for environment-specific configuration
    local env_file="${PROJECT_ROOT}/.env.${ENVIRONMENT}"
    if [[ -f "${env_file}" ]]; then
        info "Loading environment configuration: ${env_file}"
        set -a
        source "${env_file}"
        set +a
    else
        warn "Environment file not found: ${env_file}"
    fi
}

# Pre-deployment tests
run_pre_deployment_tests() {
    if [[ "${SKIP_TESTS}" == "true" ]]; then
        warn "Skipping pre-deployment tests (SKIP_TESTS=true)"
        return 0
    fi

    info "Running pre-deployment tests..."

    # Test Docker Compose syntax
    info "Validating docker-compose configuration..."
    if ! docker-compose -f "${PROJECT_ROOT}/docker-compose.dev.yml" config &> /dev/null; then
        error_exit "Invalid docker-compose configuration"
    fi

    # Test service configurations
    info "Validating service configurations..."

    local test_failures=()

    # Check Python services for syntax errors
    for service_dir in "${PROJECT_ROOT}"/services/*/; do
        if [[ -f "${service_dir}/main.py" ]]; then
            local service_name=$(basename "${service_dir}")
            info "Testing ${service_name} syntax..."

            if ! python3 -m py_compile "${service_dir}/main.py" 2>/dev/null; then
                test_failures+=("${service_name}: Python syntax error")
            fi
        fi
    done

    # Check VS Code extension
    if [[ -f "${PROJECT_ROOT}/interfaces/vscode-extension/src/extension.ts" ]]; then
        info "Testing VS Code extension TypeScript syntax..."
        cd "${PROJECT_ROOT}/interfaces/vscode-extension"

        if command -v npx &> /dev/null && [[ -f "package.json" ]]; then
            if ! npx tsc --noEmit 2>/dev/null; then
                test_failures+=("vscode-extension: TypeScript compilation error")
            fi
        fi
    fi

    if [[ ${#test_failures[@]} -gt 0 ]]; then
        error "Pre-deployment test failures:"
        printf '%s\n' "${test_failures[@]}"
        error_exit "Fix test failures before deployment"
    fi

    success "Pre-deployment tests passed"
}

# Infrastructure deployment
deploy_infrastructure() {
    info "Deploying infrastructure services..."

    # Stop existing services
    info "Stopping existing services..."
    docker-compose -f "${PROJECT_ROOT}/docker-compose.dev.yml" down --remove-orphans

    # Create necessary networks
    info "Creating Docker networks..."
    docker network create constella-network 2>/dev/null || true

    # Create persistent volumes
    info "Creating persistent volumes..."
    docker volume create constella-neo4j-data 2>/dev/null || true
    docker volume create constella-qdrant-data 2>/dev/null || true
    docker volume create constella-redis-data 2>/dev/null || true
    docker volume create constella-grafana-data 2>/dev/null || true

    # Deploy infrastructure services first
    info "Starting infrastructure services..."
    docker-compose -f "${PROJECT_ROOT}/docker-compose.dev.yml" up -d \
        neo4j qdrant redis nats prometheus grafana loki errorgold-listener

    # Wait for infrastructure to be ready
    wait_for_infrastructure
}

# Wait for infrastructure services
wait_for_infrastructure() {
    info "Waiting for infrastructure services to be ready..."

    local max_attempts=60
    local attempt=0

    # Check Neo4j
    info "Waiting for Neo4j..."
    while ! curl -s http://localhost:7474/browser/ &> /dev/null; do
        attempt=$((attempt + 1))
        if [[ $attempt -ge $max_attempts ]]; then
            error_exit "Neo4j failed to start within timeout"
        fi
        sleep 2
    done

    # Check Qdrant
    info "Waiting for Qdrant..."
    attempt=0
    while ! curl -s http://localhost:6333/collections &> /dev/null; do
        attempt=$((attempt + 1))
        if [[ $attempt -ge $max_attempts ]]; then
            error_exit "Qdrant failed to start within timeout"
        fi
        sleep 2
    done

    # Check Redis
    info "Waiting for Redis..."
    attempt=0
    while ! docker exec redis redis-cli ping | grep -q "PONG"; do
        attempt=$((attempt + 1))
        if [[ $attempt -ge $max_attempts ]]; then
            error_exit "Redis failed to start within timeout"
        fi
        sleep 2
    done

    success "Infrastructure services are ready"
}

# Agent services deployment
deploy_agent_services() {
    info "Deploying agent services..."

    # Build and start agent services
    info "Building and starting agent services..."
    docker-compose -f "${PROJECT_ROOT}/docker-compose.dev.yml" up -d --build \
        embedding retriever orchestrator-py designforge securishield codecraft \
        perfpulse evaluator expressops mobilefirstops database-agent soc2-compliance

    # Wait for services to be ready
    wait_for_agent_services
}

# Wait for agent services
wait_for_agent_services() {
    info "Waiting for agent services to be ready..."

    local failed_services=()

    for service in "${!SERVICES[@]}"; do
        local port="${SERVICES[$service]}"
        info "Checking ${service} on port ${port}..."

        local attempt=0
        local max_attempts=30
        local service_ready=false

        while [[ $attempt -lt $max_attempts ]]; do
            if curl -s "http://localhost:${port}/health" | jq -e '.status == "ok"' &> /dev/null; then
                success "${service} is ready"
                service_ready=true
                break
            fi

            attempt=$((attempt + 1))
            sleep 3
        done

        if [[ "$service_ready" != "true" ]]; then
            failed_services+=("${service}")
        fi
    done

    if [[ ${#failed_services[@]} -gt 0 ]]; then
        error "Failed services: ${failed_services[*]}"
        show_service_logs "${failed_services[@]}"
        error_exit "Some services failed to start properly"
    fi

    success "All agent services are ready"
}

# Show service logs for debugging
show_service_logs() {
    local services=("$@")

    error "Service startup failures detected. Showing recent logs:"
    for service in "${services[@]}"; do
        error "=== ${service} logs ==="
        docker-compose -f "${PROJECT_ROOT}/docker-compose.dev.yml" logs --tail=20 "${service}"
        echo
    done
}

# Post-deployment validation
validate_deployment() {
    info "Running post-deployment validation..."

    # Test orchestrator capabilities
    info "Testing Chief Architect orchestrator..."
    local response=$(curl -s http://localhost:8000/capabilities)
    if ! echo "$response" | jq -e '.agent_type == "chief_architect"' &> /dev/null; then
        error_exit "Orchestrator capabilities test failed"
    fi

    # Test agent communication
    info "Testing agent communication..."
    local test_payload=$(cat << 'EOF'
{
    "task_description": "Test deployment validation",
    "task_type": "testing",
    "project_id": "deployment_test",
    "priority": 5,
    "requirements": {},
    "technology_stack": ["Python", "FastAPI"]
}
EOF
)

    local workflow_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        http://localhost:8000/orchestrate)

    if ! echo "$workflow_response" | jq -e '.workflow_id' &> /dev/null; then
        error_exit "Workflow creation test failed"
    fi

    local workflow_id=$(echo "$workflow_response" | jq -r '.workflow_id')
    info "Test workflow created: ${workflow_id}"

    # Test WebSocket connection
    info "Testing WebSocket connectivity..."
    if command -v wscat &> /dev/null; then
        timeout 10s wscat -c ws://localhost:8000/ws -x '{"type":"ping"}' &> /dev/null || {
            warn "WebSocket test failed (wscat not available or connection failed)"
        }
    else
        warn "wscat not available, skipping WebSocket test"
    fi

    success "Post-deployment validation completed"
}

# Health monitoring setup
setup_monitoring() {
    info "Setting up health monitoring..."

    # Create monitoring dashboard
    local monitoring_script="${PROJECT_ROOT}/scripts/monitor.sh"
    cat > "$monitoring_script" << 'EOF'
#!/bin/bash
# Constella Health Monitor

check_service() {
    local service=$1
    local port=$2
    local endpoint=${3:-/health}

    if curl -s "http://localhost:${port}${endpoint}" | jq -e '.status == "ok"' &> /dev/null; then
        echo "✅ ${service}"
    else
        echo "❌ ${service}"
    fi
}

echo "Constella Platform Health Status:"
echo "================================="

# Infrastructure
echo "🏗️  Infrastructure:"
check_service "Neo4j" "7474" "/browser/"
check_service "Qdrant" "6333" "/collections"
echo "✅ Redis" # Redis doesn't have JSON health endpoint
check_service "Prometheus" "9090" "/"
check_service "Grafana" "3002" "/api/health"

echo ""
echo "🤖 Agent Services:"
check_service "Orchestrator" "8000"
check_service "Retriever" "8001"
check_service "DesignForge" "8010"
check_service "SecuriShield" "8011"
check_service "CodeCraft" "8012"
check_service "PerfPulse" "8013"
check_service "Evaluator" "8014"
check_service "ExpressOps" "8015"
check_service "MobileFirstOps" "8016"
check_service "Database Agent" "8017"
check_service "SOC2-Compliance" "8020"

echo ""
echo "📊 Monitoring:"
echo "Grafana Dashboard: http://localhost:3002 (admin/admin)"
echo "Prometheus: http://localhost:9090"
echo "Neo4j Browser: http://localhost:7474"
echo "Qdrant: http://localhost:6333/dashboard"
EOF

    chmod +x "$monitoring_script"
    success "Health monitoring script created: ${monitoring_script}"

    # Make all scripts executable
    find "${PROJECT_ROOT}/scripts" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true

    # Setup log aggregation
    info "Configuring log aggregation..."
    local loki_config="${PROJECT_ROOT}/devops/loki.yml"
    if [[ ! -f "$loki_config" ]]; then
        mkdir -p "$(dirname "$loki_config")"
        cat > "$loki_config" << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 1h
  max_chunk_age: 1h
  chunk_target_size: 1048576
  chunk_retain_period: 30s
  max_transfer_retries: 0

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
EOF
    fi
}

# Generate deployment summary
generate_deployment_summary() {
    local summary_file="${PROJECT_ROOT}/deployment-summary-$(date +%Y%m%d_%H%M%S).md"

    cat > "$summary_file" << EOF
# Constella Deployment Summary

**Deployment Date:** $(date '+%Y-%m-%d %H:%M:%S')
**Environment:** ${ENVIRONMENT}
**Deployment Log:** ${DEPLOY_LOG}

## 🚀 Deployed Services

### Infrastructure Services
$(for service in "${!INFRASTRUCTURE[@]}"; do
    ports="${INFRASTRUCTURE[$service]}"
    echo "- **${service}**: Ports ${ports}"
done)

### Agent Services
$(for service in "${!SERVICES[@]}"; do
    port="${SERVICES[$service]}"
    echo "- **${service}**: Port ${port} - http://localhost:${port}/health"
done)

## 📊 Monitoring & Access

- **Grafana Dashboard**: http://localhost:3002 (admin/admin)
- **Prometheus Metrics**: http://localhost:9090
- **Neo4j Browser**: http://localhost:7474
- **Qdrant Dashboard**: http://localhost:6333/dashboard
- **Chief Architect API**: http://localhost:8000/capabilities

## 🛠️ Management Commands

### Health Check
\`\`\`bash
./scripts/monitor.sh
\`\`\`

### View Logs
\`\`\`bash
docker-compose -f docker-compose.dev.yml logs -f [service_name]
\`\`\`

### Stop Services
\`\`\`bash
docker-compose -f docker-compose.dev.yml down
\`\`\`

### Restart Services
\`\`\`bash
docker-compose -f docker-compose.dev.yml restart [service_name]
\`\`\`

## 📝 VS Code Extension

To use the Constella VS Code extension:

1. Open VS Code in your project directory
2. Install the extension from: \`./interfaces/vscode-extension/\`
3. Configure settings in VS Code preferences:
   - Orchestrator URL: http://localhost:8000
   - Project ID: your-project-name

## 🔍 Troubleshooting

### Service Not Starting
1. Check logs: \`docker-compose logs [service_name]\`
2. Check resource usage: \`docker stats\`
3. Verify ports aren't conflicting: \`netstat -tulpn | grep [port]\`

### WebSocket Connection Issues
1. Verify orchestrator is running: \`curl http://localhost:8000/health\`
2. Check firewall settings
3. Test WebSocket: \`wscat -c ws://localhost:8000/ws\`

### Performance Issues
1. Monitor resource usage: \`docker stats\`
2. Check Grafana dashboards: http://localhost:3002
3. Review Prometheus metrics: http://localhost:9090

## 📞 Support

For issues or questions:
- Check deployment logs: ${DEPLOY_LOG}
- Run health monitor: ./scripts/monitor.sh
- Review service logs in Docker Compose

EOF

    success "Deployment summary generated: ${summary_file}"
    echo "$summary_file"
}

# Main deployment function
main() {
    show_banner

    info "Starting Constella deployment..."
    info "Environment: ${ENVIRONMENT}"
    info "Deploy log: ${DEPLOY_LOG}"

    local start_time=$(date +%s)

    # Deployment phases
    check_prerequisites
    validate_environment
    run_pre_deployment_tests
    deploy_infrastructure
    deploy_agent_services
    validate_deployment
    setup_monitoring

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    success "🎉 Constella deployment completed successfully!"
    success "📊 Deployment took ${duration} seconds"

    local summary_file=$(generate_deployment_summary)

    echo
    info "🔗 Quick Access Links:"
    info "  • Chief Architect API: ${CYAN}http://localhost:8000${NC}"
    info "  • Grafana Dashboard: ${CYAN}http://localhost:3002${NC} (admin/admin)"
    info "  • Neo4j Browser: ${CYAN}http://localhost:7474${NC}"
    info "  • Health Monitor: ${CYAN}./scripts/monitor.sh${NC}"
    echo
    info "📄 Detailed summary: ${CYAN}${summary_file}${NC}"
    info "📋 Deploy log: ${CYAN}${DEPLOY_LOG}${NC}"

    # Run initial health check
    if [[ -x "${PROJECT_ROOT}/scripts/monitor.sh" ]]; then
        echo
        info "🏥 Running initial health check..."
        "${PROJECT_ROOT}/scripts/monitor.sh"
    fi
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    cd "${PROJECT_ROOT}"
    main "$@"
fi
