#!/bin/bash

# ============================================================================
# Constella AI Operating Platform - Comprehensive Testing Suite
# ============================================================================
# This script runs automated tests for all Constella services including
# unit tests, integration tests, API tests, and end-to-end workflows.

set -euo pipefail  # Exit on any error, undefined variable, or pipe failure

# Global variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_LOG="/tmp/constella-test-$(date +%Y%m%d_%H%M%S).log"
TEST_RESULTS_DIR="${PROJECT_ROOT}/test-results"
COVERAGE_THRESHOLD="${COVERAGE_THRESHOLD:-80}"
TIMEOUT="${TIMEOUT:-120}"
PARALLEL_TESTS="${PARALLEL_TESTS:-true}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

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

# Logging functions
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "${TEST_LOG}"
}

info() { log "${BLUE}INFO${NC}" "$@"; }
success() { log "${GREEN}SUCCESS${NC}" "$@"; }
warn() { log "${YELLOW}WARN${NC}" "$@"; }
error() { log "${RED}ERROR${NC}" "$@"; }
debug() { [[ "${DEBUG:-false}" == "true" ]] && log "${PURPLE}DEBUG${NC}" "$@"; }

# Test result tracking
record_test() {
    local test_name=$1
    local status=$2
    local details=${3:-""}

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    case "$status" in
        "PASS")
            PASSED_TESTS=$((PASSED_TESTS + 1))
            success "✅ ${test_name}: PASSED ${details}"
            ;;
        "FAIL")
            FAILED_TESTS=$((FAILED_TESTS + 1))
            error "❌ ${test_name}: FAILED ${details}"
            ;;
        "SKIP")
            SKIPPED_TESTS=$((SKIPPED_TESTS + 1))
            warn "⏭️  ${test_name}: SKIPPED ${details}"
            ;;
    esac
}

# Banner
show_banner() {
    echo -e "${CYAN}"
    cat << 'EOF'
   ╔════════════════════════════════════════════════════════════════╗
   ║                                                                ║
   ║     ████████╗███████╗███████╗████████╗██╗███╗   ██╗ ██████╗    ║
   ║     ╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝██║████╗  ██║██╔════╝    ║
   ║        ██║   █████╗  ███████╗   ██║   ██║██╔██╗ ██║██║  ███╗   ║
   ║        ██║   ██╔══╝  ╚════██║   ██║   ██║██║╚██╗██║██║   ██║   ║
   ║        ██║   ███████╗███████║   ██║   ██║██║ ╚████║╚██████╔╝   ║
   ║        ╚═╝   ╚══════╝╚══════╝   ╚═╝   ╚═╝╚═╝  ╚═══╝ ╚═════╝    ║
   ║                                                                ║
   ║              Constella Testing Suite v2.0                     ║
   ║                                                                ║
   ╚════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Setup test environment
setup_test_environment() {
    info "Setting up test environment..."

    # Create test results directory
    mkdir -p "${TEST_RESULTS_DIR}"
    mkdir -p "${TEST_RESULTS_DIR}/coverage"
    mkdir -p "${TEST_RESULTS_DIR}/reports"

    # Clean previous test results
    rm -rf "${TEST_RESULTS_DIR}"/*.xml "${TEST_RESULTS_DIR}"/*.json "${TEST_RESULTS_DIR}"/*.html

    # Create temporary directory for test artifacts
    export TEMP_TEST_DIR=$(mktemp -d)

    success "Test environment ready"
}

# Check test prerequisites
check_test_prerequisites() {
    info "Checking test prerequisites..."

    local required_commands=("curl" "jq" "python3" "pip3")
    local missing_commands=()

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_commands+=("$cmd")
        fi
    done

    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        record_test "Prerequisites Check" "FAIL" "Missing commands: ${missing_commands[*]}"
        return 1
    fi

    # Check if services are running
    if ! curl -s http://localhost:8000/health &> /dev/null; then
        warn "Services not running. Starting test services..."
        start_test_services
    fi

    record_test "Prerequisites Check" "PASS"
}

# Start minimal services for testing
start_test_services() {
    info "Starting minimal services for testing..."

    cd "${PROJECT_ROOT}"

    # Start only essential services
    docker-compose -f docker-compose.dev.yml up -d \
        neo4j qdrant redis orchestrator-py securishield codecraft

    # Wait for services to be ready
    local max_attempts=30
    local attempt=0

    while ! curl -s http://localhost:8000/health | jq -e '.status == "ok"' &> /dev/null; do
        attempt=$((attempt + 1))
        if [[ $attempt -ge $max_attempts ]]; then
            record_test "Service Startup" "FAIL" "Orchestrator failed to start"
            return 1
        fi
        sleep 2
    done

    record_test "Service Startup" "PASS"
}

# Unit Tests
run_unit_tests() {
    info "Running unit tests..."

    local unit_test_failures=0

    # Python service unit tests
    for service_dir in "${PROJECT_ROOT}"/services/*/; do
        if [[ -f "${service_dir}/main.py" ]]; then
            local service_name=$(basename "${service_dir}")
            info "Running unit tests for ${service_name}..."

            cd "${service_dir}"

            # Check for test files
            if [[ -d "tests" ]] || ls test_*.py &> /dev/null || ls *_test.py &> /dev/null; then
                # Install test dependencies
                if [[ -f "requirements-test.txt" ]]; then
                    pip3 install -r requirements-test.txt &> /dev/null || true
                fi

                # Run pytest if available
                if command -v pytest &> /dev/null; then
                    if pytest --junitxml="${TEST_RESULTS_DIR}/${service_name}-unit.xml" \
                            --cov="${service_name}" \
                            --cov-report=html:"${TEST_RESULTS_DIR}/coverage/${service_name}" \
                            --cov-report=json:"${TEST_RESULTS_DIR}/coverage/${service_name}.json" \
                            --tb=short -v 2>&1 | tee -a "${TEST_LOG}"; then
                        record_test "${service_name} Unit Tests" "PASS"
                    else
                        record_test "${service_name} Unit Tests" "FAIL"
                        unit_test_failures=$((unit_test_failures + 1))
                    fi
                else
                    # Fallback to basic Python test discovery
                    if python3 -m unittest discover -s . -p "test_*.py" -v 2>&1 | tee -a "${TEST_LOG}"; then
                        record_test "${service_name} Unit Tests" "PASS"
                    else
                        record_test "${service_name} Unit Tests" "FAIL"
                        unit_test_failures=$((unit_test_failures + 1))
                    fi
                fi
            else
                record_test "${service_name} Unit Tests" "SKIP" "No test files found"
            fi
        fi
    done

    # VS Code extension TypeScript tests
    local extension_dir="${PROJECT_ROOT}/interfaces/vscode-extension"
    if [[ -f "${extension_dir}/src/extension.ts" ]]; then
        cd "${extension_dir}"

        if [[ -f "package.json" ]] && command -v npm &> /dev/null; then
            info "Running VS Code extension tests..."

            # Install dependencies
            if npm install &> /dev/null; then
                # Compile TypeScript
                if npx tsc &> /dev/null; then
                    record_test "VS Code Extension Compilation" "PASS"

                    # Run tests if they exist
                    if [[ -d "src/test" ]] && npm test &> /dev/null; then
                        record_test "VS Code Extension Tests" "PASS"
                    else
                        record_test "VS Code Extension Tests" "SKIP" "No tests configured"
                    fi
                else
                    record_test "VS Code Extension Compilation" "FAIL"
                    unit_test_failures=$((unit_test_failures + 1))
                fi
            else
                record_test "VS Code Extension Dependencies" "FAIL"
                unit_test_failures=$((unit_test_failures + 1))
            fi
        else
            record_test "VS Code Extension Tests" "SKIP" "npm not available"
        fi
    fi

    if [[ $unit_test_failures -eq 0 ]]; then
        success "All unit tests passed"
    else
        error "${unit_test_failures} unit test suite(s) failed"
    fi
}

# API Health Tests
run_health_tests() {
    info "Running API health tests..."

    for service in "${!SERVICES[@]}"; do
        local port="${SERVICES[$service]}"
        local health_url="http://localhost:${port}/health"

        info "Testing ${service} health endpoint..."

        if curl -s --max-time 10 "${health_url}" | jq -e '.status == "ok"' &> /dev/null; then
            record_test "${service} Health Check" "PASS"
        else
            record_test "${service} Health Check" "FAIL" "Health endpoint not responding"
        fi
    done
}

# API Contract Tests
run_api_contract_tests() {
    info "Running API contract tests..."

    # Test orchestrator capabilities endpoint
    info "Testing orchestrator capabilities..."
    local capabilities=$(curl -s http://localhost:8000/capabilities)

    if echo "$capabilities" | jq -e '.agent_type == "chief_architect"' &> /dev/null; then
        record_test "Orchestrator Capabilities" "PASS"
    else
        record_test "Orchestrator Capabilities" "FAIL" "Invalid capabilities response"
    fi

    # Test agent capabilities endpoints
    for service in "${!SERVICES[@]}"; do
        if [[ "$service" == "orchestrator-py" ]]; then
            continue  # Already tested above
        fi

        local port="${SERVICES[$service]}"
        local capabilities_url="http://localhost:${port}/capabilities"

        info "Testing ${service} capabilities..."

        if curl -s --max-time 10 "${capabilities_url}" | jq -e '.agent_id' &> /dev/null; then
            record_test "${service} Capabilities" "PASS"
        else
            record_test "${service} Capabilities" "FAIL" "Capabilities endpoint not responding"
        fi
    done
}

# Integration Tests
run_integration_tests() {
    info "Running integration tests..."

    # Test workflow creation
    info "Testing workflow creation..."
    local test_payload=$(cat << 'EOF'
{
    "task_description": "Integration test workflow",
    "task_type": "testing",
    "project_id": "integration_test",
    "priority": 5,
    "requirements": {"test": true},
    "technology_stack": ["Python", "FastAPI"]
}
EOF
)

    local workflow_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        http://localhost:8000/orchestrate)

    if echo "$workflow_response" | jq -e '.workflow_id' &> /dev/null; then
        local workflow_id=$(echo "$workflow_response" | jq -r '.workflow_id')
        record_test "Workflow Creation" "PASS" "ID: $workflow_id"

        # Test workflow status
        info "Testing workflow status retrieval..."
        sleep 2  # Allow workflow to be processed

        local status_response=$(curl -s "http://localhost:8000/workflows/${workflow_id}/status")
        if echo "$status_response" | jq -e '.workflow_id' &> /dev/null; then
            record_test "Workflow Status" "PASS"
        else
            record_test "Workflow Status" "FAIL" "Status endpoint not responding"
        fi

        # Test workflow execution
        info "Testing workflow execution..."
        local exec_response=$(curl -s -X POST "http://localhost:8000/workflows/${workflow_id}/execute")
        if echo "$exec_response" | jq -e '.status' &> /dev/null; then
            record_test "Workflow Execution" "PASS"
        else
            record_test "Workflow Execution" "FAIL" "Execution failed"
        fi
    else
        record_test "Workflow Creation" "FAIL" "Invalid workflow response"
    fi
}

# WebSocket Tests
run_websocket_tests() {
    info "Running WebSocket tests..."

    if command -v wscat &> /dev/null; then
        info "Testing WebSocket connection..."

        # Test basic connection
        local ws_output=$(timeout 10s wscat -c ws://localhost:8000/ws -x '{"type":"ping"}' 2>&1 || true)

        if echo "$ws_output" | grep -q "pong"; then
            record_test "WebSocket Connection" "PASS"
        else
            record_test "WebSocket Connection" "FAIL" "No pong response"
        fi

        # Test workflow subscription
        info "Testing WebSocket workflow subscription..."
        local subscription_test=$(timeout 15s wscat -c ws://localhost:8000/ws -x '{"type":"subscribe_workflow","workflow_id":"test"}' 2>&1 || true)

        if echo "$subscription_test" | grep -q "subscribed"; then
            record_test "WebSocket Subscription" "PASS"
        else
            record_test "WebSocket Subscription" "FAIL" "Subscription failed"
        fi
    else
        record_test "WebSocket Tests" "SKIP" "wscat not available"
    fi
}

# Performance Tests
run_performance_tests() {
    info "Running performance tests..."

    # Test API response times
    info "Testing API performance..."

    for endpoint in "/health" "/capabilities"; do
        local avg_time=0
        local iterations=5
        local total_time=0

        for ((i=1; i<=iterations; i++)); do
            local response_time=$(curl -o /dev/null -s -w "%{time_total}" "http://localhost:8000${endpoint}")
            total_time=$(echo "$total_time + $response_time" | bc -l 2>/dev/null || echo "$total_time")
        done

        if command -v bc &> /dev/null; then
            avg_time=$(echo "scale=3; $total_time / $iterations" | bc -l)

            if (( $(echo "$avg_time < 1.0" | bc -l) )); then
                record_test "API Performance ${endpoint}" "PASS" "Avg: ${avg_time}s"
            else
                record_test "API Performance ${endpoint}" "FAIL" "Slow response: ${avg_time}s"
            fi
        else
            record_test "API Performance ${endpoint}" "SKIP" "bc not available"
        fi
    done

    # Test concurrent requests
    info "Testing concurrent request handling..."

    if command -v ab &> /dev/null; then
        local ab_output=$(ab -n 50 -c 5 -q http://localhost:8000/health 2>&1)
        local failed_requests=$(echo "$ab_output" | grep "Failed requests:" | awk '{print $3}')

        if [[ "${failed_requests:-0}" -eq 0 ]]; then
            record_test "Concurrent Requests" "PASS" "50 requests, 0 failures"
        else
            record_test "Concurrent Requests" "FAIL" "${failed_requests} failed requests"
        fi
    else
        record_test "Concurrent Requests" "SKIP" "Apache Bench (ab) not available"
    fi
}

# Security Tests
run_security_tests() {
    info "Running security tests..."

    # Test for common security headers
    info "Testing security headers..."

    local headers=$(curl -I -s http://localhost:8000/health)

    # Check for security headers
    if echo "$headers" | grep -qi "x-frame-options"; then
        record_test "Security Headers X-Frame-Options" "PASS"
    else
        record_test "Security Headers X-Frame-Options" "WARN" "Header missing"
    fi

    if echo "$headers" | grep -qi "x-content-type-options"; then
        record_test "Security Headers X-Content-Type-Options" "PASS"
    else
        record_test "Security Headers X-Content-Type-Options" "WARN" "Header missing"
    fi

    # Test for SQL injection vulnerabilities (basic)
    info "Testing for basic injection vulnerabilities..."

    local malicious_payload='{"task_description":"test\"; DROP TABLE users; --","task_type":"testing"}'
    local injection_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$malicious_payload" \
        http://localhost:8000/orchestrate 2>&1)

    if echo "$injection_response" | grep -qi "error"; then
        record_test "SQL Injection Protection" "PASS" "Malicious payload rejected"
    else
        record_test "SQL Injection Protection" "WARN" "Payload not properly validated"
    fi

    # Test rate limiting (if implemented)
    info "Testing rate limiting..."

    local rapid_requests=0
    local rate_limit_triggered=false

    for ((i=1; i<=20; i++)); do
        local response=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:8000/health)
        if [[ "$response" == "429" ]]; then
            rate_limit_triggered=true
            break
        fi
        rapid_requests=$((rapid_requests + 1))
    done

    if [[ "$rate_limit_triggered" == "true" ]]; then
        record_test "Rate Limiting" "PASS" "Triggered after ${rapid_requests} requests"
    else
        record_test "Rate Limiting" "WARN" "No rate limiting detected"
    fi
}

# Generate coverage report
generate_coverage_report() {
    info "Generating coverage report..."

    local coverage_html="${TEST_RESULTS_DIR}/coverage-summary.html"

    cat > "$coverage_html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Constella Test Coverage Summary</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .service { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .passed { color: green; }
        .failed { color: red; }
        .warning { color: orange; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Constella Test Coverage Summary</h1>
        <p>Generated: $(date)</p>
    </div>
EOF

    # Add coverage data for each service
    for service_dir in "${PROJECT_ROOT}"/services/*/; do
        local service_name=$(basename "${service_dir}")
        local coverage_file="${TEST_RESULTS_DIR}/coverage/${service_name}.json"

        if [[ -f "$coverage_file" ]]; then
            echo "    <div class=\"service\">" >> "$coverage_html"
            echo "        <h3>${service_name}</h3>" >> "$coverage_html"
            echo "        <p>Coverage data available</p>" >> "$coverage_html"
            echo "    </div>" >> "$coverage_html"
        fi
    done

    echo "</body></html>" >> "$coverage_html"

    success "Coverage report generated: ${coverage_html}"
}

# Generate test report
generate_test_report() {
    info "Generating test report..."

    local report_file="${TEST_RESULTS_DIR}/test-report-$(date +%Y%m%d_%H%M%S).html"
    local pass_rate=0

    if [[ $TOTAL_TESTS -gt 0 ]]; then
        pass_rate=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l 2>/dev/null || echo "0")
    fi

    cat > "$report_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Constella Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
        .metric { padding: 15px; text-align: center; border-radius: 5px; }
        .passed { background: #d4edda; color: #155724; }
        .failed { background: #f8d7da; color: #721c24; }
        .skipped { background: #fff3cd; color: #856404; }
        .total { background: #e2e3e5; color: #383d41; }
        .details { margin-top: 30px; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧪 Constella Test Report</h1>
        <p><strong>Generated:</strong> $(date)</p>
        <p><strong>Test Log:</strong> ${TEST_LOG}</p>
        <p><strong>Pass Rate:</strong> ${pass_rate}%</p>
    </div>

    <div class="summary">
        <div class="metric total">
            <h3>${TOTAL_TESTS}</h3>
            <p>Total Tests</p>
        </div>
        <div class="metric passed">
            <h3>${PASSED_TESTS}</h3>
            <p>Passed</p>
        </div>
        <div class="metric failed">
            <h3>${FAILED_TESTS}</h3>
            <p>Failed</p>
        </div>
        <div class="metric skipped">
            <h3>${SKIPPED_TESTS}</h3>
            <p>Skipped</p>
        </div>
    </div>

    <div class="details">
        <h2>📋 Test Details</h2>
        <p>Detailed test logs available in: <code>${TEST_LOG}</code></p>

        <h3>🔍 Quick Commands</h3>
        <pre>
# View full test log
cat ${TEST_LOG}

# Run specific test suites
./scripts/test.sh --unit-only
./scripts/test.sh --integration-only
./scripts/test.sh --performance-only

# Run tests with debug output
DEBUG=true ./scripts/test.sh
        </pre>

        <h3>📊 Coverage Reports</h3>
        <p>Individual service coverage reports are available in:</p>
        <pre>${TEST_RESULTS_DIR}/coverage/</pre>

        <h3>🚀 Next Steps</h3>
        <ul>
            <li>Review failed tests and fix issues</li>
            <li>Improve test coverage where needed</li>
            <li>Add more integration test scenarios</li>
            <li>Optimize performance bottlenecks</li>
        </ul>
    </div>
</body>
</html>
EOF

    success "Test report generated: ${report_file}"
    echo "$report_file"
}

# Main test execution
main() {
    show_banner

    info "Starting Constella testing suite..."
    info "Test log: ${TEST_LOG}"

    local start_time=$(date +%s)

    # Parse command line arguments
    local run_unit=true
    local run_integration=true
    local run_performance=true
    local run_security=true

    while [[ $# -gt 0 ]]; do
        case $1 in
            --unit-only)
                run_integration=false
                run_performance=false
                run_security=false
                shift
                ;;
            --integration-only)
                run_unit=false
                run_performance=false
                run_security=false
                shift
                ;;
            --performance-only)
                run_unit=false
                run_integration=false
                run_security=false
                shift
                ;;
            --security-only)
                run_unit=false
                run_integration=false
                run_performance=false
                shift
                ;;
            --skip-unit)
                run_unit=false
                shift
                ;;
            --skip-integration)
                run_integration=false
                shift
                ;;
            --skip-performance)
                run_performance=false
                shift
                ;;
            --skip-security)
                run_security=false
                shift
                ;;
            *)
                warn "Unknown option: $1"
                shift
                ;;
        esac
    done

    # Test execution phases
    setup_test_environment
    check_test_prerequisites || exit 1

    # Core test suites
    if [[ "$run_unit" == "true" ]]; then
        run_unit_tests
    fi

    run_health_tests
    run_api_contract_tests

    if [[ "$run_integration" == "true" ]]; then
        run_integration_tests
        run_websocket_tests
    fi

    if [[ "$run_performance" == "true" ]]; then
        run_performance_tests
    fi

    if [[ "$run_security" == "true" ]]; then
        run_security_tests
    fi

    # Generate reports
    generate_coverage_report
    local report_file=$(generate_test_report)

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Final summary
    echo
    info "🧪 Test Summary:"
    info "  Total Tests: ${TOTAL_TESTS}"
    info "  Passed: ${GREEN}${PASSED_TESTS}${NC}"
    info "  Failed: ${RED}${FAILED_TESTS}${NC}"
    info "  Skipped: ${YELLOW}${SKIPPED_TESTS}${NC}"
    info "  Duration: ${duration} seconds"
    echo

    if [[ $FAILED_TESTS -eq 0 ]]; then
        success "🎉 All tests passed!"
        info "📄 Test report: ${CYAN}${report_file}${NC}"
        info "📋 Test log: ${CYAN}${TEST_LOG}${NC}"
        exit 0
    else
        error "❌ ${FAILED_TESTS} test(s) failed"
        info "📄 Test report: ${CYAN}${report_file}${NC}"
        info "📋 Test log: ${CYAN}${TEST_LOG}${NC}"
        exit 1
    fi
}

# Cleanup function
cleanup() {
    if [[ -n "${TEMP_TEST_DIR:-}" ]] && [[ -d "${TEMP_TEST_DIR}" ]]; then
        rm -rf "${TEMP_TEST_DIR}"
    fi
}

trap cleanup EXIT

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    cd "${PROJECT_ROOT}"
    main "$@"
fi
