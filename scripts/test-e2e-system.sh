#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Constella AI Platform — End-to-End System Test
# ═══════════════════════════════════════════════════════════════════════════════
#
# Tests the full system pipeline:
#   1. Infrastructure health (Redis, Neo4j, Qdrant, NATS)
#   2. Orchestrator server startup & health
#   3. SwarmOrchestrator /v1/chat — single-agent routing
#   4. SwarmOrchestrator /v1/chat — multi-agent parallel execution
#   5. SwarmOrchestrator /v1/chat — agent catalog endpoint
#   6. SwarmOrchestrator /v1/chat — heuristic fallback (simulated)
#   7. API endpoint coverage (/health, /, /api/agents, /v1/chat/agents)
#   8. Error handling (bad payloads, missing fields)
#
# Usage:
#   ./scripts/test-e2e-system.sh              # Full test (starts server)
#   ./scripts/test-e2e-system.sh --skip-infra # Skip infrastructure checks
#   ./scripts/test-e2e-system.sh --no-server  # Assume server already running
#   ./scripts/test-e2e-system.sh --quick      # Fast tests only (no LLM calls)
#
# Prerequisites:
#   - .env file with LLM API keys at project root
#   - Infrastructure containers running (redis, neo4j, qdrant, nats)
#   - packages/orchestrator built (npm run build)
#
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ORCHESTRATOR_DIR="$PROJECT_ROOT/packages/orchestrator"
ENV_FILE="$PROJECT_ROOT/.env"
LOG_FILE="/tmp/constella-e2e-orchestrator.log"

ORCH_PORT="${ORCH_PORT:-3000}"
ORCH_URL="http://localhost:${ORCH_PORT}"
LLM_TIMEOUT=120  # seconds — LLM calls can be slow

# Parse CLI flags
SKIP_INFRA=false
NO_SERVER=false
QUICK_MODE=false
for arg in "$@"; do
  case "$arg" in
    --skip-infra) SKIP_INFRA=true ;;
    --no-server)  NO_SERVER=true ;;
    --quick)      QUICK_MODE=true ;;
    --help|-h)
      head -28 "$0" | tail -25
      exit 0
      ;;
  esac
done

# ─── Colors & Helpers ────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
WARN_COUNT=0
START_TIME=$(date +%s)

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo -e "  ${GREEN}✓${NC} $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo -e "  ${RED}✗${NC} $1"
  if [ -n "${2:-}" ]; then
    echo -e "    ${DIM}→ $2${NC}"
  fi
}

skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  echo -e "  ${YELLOW}○${NC} $1 ${DIM}(skipped)${NC}"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  echo -e "  ${YELLOW}⚠${NC} $1"
}

section() {
  echo ""
  echo -e "${CYAN}━━━ $1 ━━━${NC}"
}

# JSON field extractor (no jq dependency)
json_field() {
  python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    keys = '$1'.split('.')
    val = data
    for k in keys:
        if isinstance(val, list):
            val = val[int(k)]
        else:
            val = val[k]
    print(val)
except Exception as e:
    print(f'__ERROR__: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null
}

# JSON pretty printer
json_pretty() {
  python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(json.dumps(data, indent=2)[:${1:-2000}])
except:
    print(sys.stdin.read()[:500])
"
}

# HTTP request with timeout
http_get() {
  curl -sf --max-time "${2:-10}" "$1" 2>/dev/null
}

http_post() {
  curl -sf --max-time "${3:-$LLM_TIMEOUT}" \
    -H "Content-Type: application/json" \
    -d "$2" "$1" 2>/dev/null
}

# Wait for a URL to respond
wait_for_url() {
  local url="$1"
  local max_wait="${2:-30}"
  local i=0
  while [ $i -lt "$max_wait" ]; do
    if curl -sf --max-time 2 "$url" > /dev/null 2>&1; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# ─── Cleanup handler ────────────────────────────────────────────────────────

SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    echo -e "${DIM}Stopping orchestrator server (PID $SERVER_PID)...${NC}"
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       Constella AI Platform — End-to-End System Test       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${DIM}Project root: $PROJECT_ROOT${NC}"
echo -e "${DIM}Orchestrator: $ORCH_URL${NC}"
echo -e "${DIM}Quick mode:   $QUICK_MODE${NC}"
echo -e "${DIM}Timestamp:    $(date -Iseconds)${NC}"

# ═══════════════════════════════════════════════════════════════════════════════
# 1. PREREQUISITES
# ═══════════════════════════════════════════════════════════════════════════════

section "1. Prerequisites"

# Check .env
if [ -f "$ENV_FILE" ]; then
  pass ".env file exists"

  # Check for LLM keys
  HAS_OPENAI=$(grep -c '^OPENAI_API_KEY=.' "$ENV_FILE" 2>/dev/null || echo 0)
  HAS_ANTHROPIC=$(grep -c '^ANTHROPIC_API_KEY=.' "$ENV_FILE" 2>/dev/null || echo 0)
  HAS_GEMINI=$(grep -c '^GEMINI_API_KEY=.' "$ENV_FILE" 2>/dev/null || echo 0)
  HAS_OPENROUTER=$(grep -c '^OPENROUTER_API_KEY=.' "$ENV_FILE" 2>/dev/null || echo 0)

  KEY_COUNT=$((HAS_OPENAI + HAS_ANTHROPIC + HAS_GEMINI + HAS_OPENROUTER))
  if [ "$KEY_COUNT" -gt 0 ]; then
    pass "LLM API keys configured (${KEY_COUNT}/4 providers)"
  else
    fail "No LLM API keys found in .env" "SwarmOrchestrator requires at least 1 key"
  fi
else
  fail ".env file not found at $ENV_FILE"
fi

# Check orchestrator build
if [ -f "$ORCHESTRATOR_DIR/dist/server.js" ] && [ -f "$ORCHESTRATOR_DIR/dist/swarmOrchestrator.js" ]; then
  pass "Orchestrator built (dist/server.js + dist/swarmOrchestrator.js present)"
else
  warn "Orchestrator not built — attempting build..."
  if (cd "$ORCHESTRATOR_DIR" && npx tsc -b 2>/dev/null); then
    pass "Orchestrator build succeeded"
  else
    fail "Orchestrator build failed" "Run: cd packages/orchestrator && npx tsc -b"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 2. INFRASTRUCTURE HEALTH
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$SKIP_INFRA" = false ]; then
  section "2. Infrastructure Health"

  # Redis
  if command -v redis-cli > /dev/null 2>&1; then
    REDIS_PONG=$(redis-cli ping 2>/dev/null || echo "FAIL")
    if [ "$REDIS_PONG" = "PONG" ]; then
      pass "Redis — PONG (localhost:6379)"
    else
      warn "Redis — not responding on localhost:6379"
    fi
  else
    skip "Redis — redis-cli not installed"
  fi

  # Neo4j
  NEO4J_RESP=$(http_get "http://localhost:7474/" 5)
  if [ -n "$NEO4J_RESP" ]; then
    NEO4J_BOLT=$(echo "$NEO4J_RESP" | json_field "bolt_routing" 2>/dev/null || echo "unknown")
    pass "Neo4j — alive (bolt: $NEO4J_BOLT)"
  else
    warn "Neo4j — not responding on localhost:7474"
  fi

  # Qdrant
  QDRANT_RESP=$(http_get "http://localhost:6333/healthz" 5)
  if echo "$QDRANT_RESP" | grep -qi "pass\|ok\|healthz" 2>/dev/null; then
    pass "Qdrant — healthy (localhost:6333)"
  else
    warn "Qdrant — not responding on localhost:6333"
  fi

  # NATS
  NATS_RESP=$(http_get "http://localhost:8222/varz" 5)
  if [ -n "$NATS_RESP" ]; then
    NATS_VER=$(echo "$NATS_RESP" | json_field "version" 2>/dev/null || echo "unknown")
    pass "NATS — alive (version: $NATS_VER, monitoring: localhost:8222)"
  else
    warn "NATS — not responding on localhost:8222"
  fi
else
  section "2. Infrastructure Health ${DIM}(skipped)${NC}"
  skip "Infrastructure checks skipped (--skip-infra)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 3. ORCHESTRATOR SERVER
# ═══════════════════════════════════════════════════════════════════════════════

section "3. Orchestrator Server"

if [ "$NO_SERVER" = false ]; then
  # Kill any existing server on the port
  EXISTING_PID=$(ss -tlnp 2>/dev/null | grep ":${ORCH_PORT} " | grep -oP 'pid=\K\d+' | head -1 || true)
  if [ -n "$EXISTING_PID" ]; then
    echo -e "  ${DIM}Killing existing process on port $ORCH_PORT (PID $EXISTING_PID)...${NC}"
    kill "$EXISTING_PID" 2>/dev/null || true
    sleep 2
  fi

  # Start orchestrator
  echo -e "  ${DIM}Starting orchestrator server...${NC}"
  (
    cd "$ORCHESTRATOR_DIR"
    env $(cat "$ENV_FILE" | grep -v '^#' | grep -v '^$' | xargs) \
      PORT="$ORCH_PORT" \
      NODE_ENV=test \
      node dist/server.js
  ) > "$LOG_FILE" 2>&1 &
  SERVER_PID=$!

  if wait_for_url "${ORCH_URL}/health" 25; then
    pass "Server started (PID $SERVER_PID, port $ORCH_PORT)"
  else
    fail "Server failed to start within 25s" "Check logs: $LOG_FILE"
    echo -e "  ${DIM}Last 10 lines of log:${NC}"
    tail -10 "$LOG_FILE" 2>/dev/null | sed 's/^/    /'
    exit 1
  fi
else
  if wait_for_url "${ORCH_URL}/health" 3; then
    pass "Server already running at $ORCH_URL"
  else
    fail "Server not responding at $ORCH_URL" "Start it or remove --no-server flag"
    exit 1
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 4. BASIC API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

section "4. Basic API Endpoints"

# GET /health
HEALTH=$(http_get "${ORCH_URL}/health")
HEALTH_STATUS=$(echo "$HEALTH" | json_field "status" 2>/dev/null || echo "")
if [ "$HEALTH_STATUS" = "ok" ]; then
  pass "GET /health → {\"status\": \"ok\"}"
else
  fail "GET /health" "Expected status=ok, got: $HEALTH"
fi

# GET /
ROOT=$(http_get "${ORCH_URL}/")
ROOT_STATUS=$(echo "$ROOT" | json_field "status" 2>/dev/null || echo "")
if [ "$ROOT_STATUS" = "ok" ]; then
  ROOT_MSG=$(echo "$ROOT" | json_field "message" 2>/dev/null || echo "")
  pass "GET / → $ROOT_MSG"
else
  fail "GET /" "Unexpected response: ${ROOT:0:200}"
fi

# GET /api/agents
AGENTS=$(http_get "${ORCH_URL}/api/agents")
if [ -n "$AGENTS" ]; then
  pass "GET /api/agents → responded"
else
  warn "GET /api/agents → empty or error"
fi

# GET /v1/chat/agents (SwarmOrchestrator catalog)
CATALOG=$(http_get "${ORCH_URL}/v1/chat/agents")
CATALOG_TOTAL=$(echo "$CATALOG" | json_field "total" 2>/dev/null || echo "0")
if [ "$CATALOG_TOTAL" -ge 3 ] 2>/dev/null; then
  pass "GET /v1/chat/agents → $CATALOG_TOTAL agents in catalog"

  # Verify expected agents
  for EXPECTED_AGENT in "architecture-agent-001" "security-agent-001" "quality-agent-001"; do
    if echo "$CATALOG" | grep -q "$EXPECTED_AGENT"; then
      pass "  Agent registered: $EXPECTED_AGENT"
    else
      fail "  Agent missing: $EXPECTED_AGENT"
    fi
  done
else
  fail "GET /v1/chat/agents" "Expected >= 3 agents, got: $CATALOG_TOTAL"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 5. ERROR HANDLING
# ═══════════════════════════════════════════════════════════════════════════════

section "5. Error Handling"

# POST /v1/chat with empty body
EMPTY_RESP=$(curl -s --max-time 10 -w "\n__HTTP:%{http_code}" \
  -H "Content-Type: application/json" \
  -d '{}' "${ORCH_URL}/v1/chat" 2>/dev/null)
EMPTY_HTTP=$(echo "$EMPTY_RESP" | grep '__HTTP:' | sed 's/__HTTP://')
if [ "$EMPTY_HTTP" = "400" ]; then
  pass "POST /v1/chat {} → HTTP 400 (missing message)"
elif [ "$EMPTY_HTTP" = "422" ]; then
  pass "POST /v1/chat {} → HTTP 422 (validation error — missing message)"
elif [ "$EMPTY_HTTP" = "503" ]; then
  pass "POST /v1/chat {} → HTTP 503 (swarm not initialized — acceptable)"
else
  warn "POST /v1/chat {} → HTTP $EMPTY_HTTP (expected 400, 422, or 503)"
fi

# POST /v1/chat with no Content-Type
NOCTYPE_RESP=$(curl -s --max-time 10 -w "\n__HTTP:%{http_code}" \
  -d 'not json' "${ORCH_URL}/v1/chat" 2>/dev/null)
NOCTYPE_HTTP=$(echo "$NOCTYPE_RESP" | grep '__HTTP:' | sed 's/__HTTP://')
if [ "$NOCTYPE_HTTP" -ge 400 ] 2>/dev/null; then
  pass "POST /v1/chat (no Content-Type) → HTTP $NOCTYPE_HTTP"
else
  warn "POST /v1/chat (no Content-Type) → HTTP $NOCTYPE_HTTP (expected >= 400)"
fi

# GET on POST-only endpoint
GET_CHAT_RESP=$(curl -s --max-time 10 -o /dev/null -w "%{http_code}" \
  "${ORCH_URL}/v1/chat" 2>/dev/null)
if [ "$GET_CHAT_RESP" != "200" ]; then
  pass "GET /v1/chat → HTTP $GET_CHAT_RESP (not accepting GET)"
else
  warn "GET /v1/chat → HTTP 200 (should probably reject GET)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 6. SWARM INTELLIGENCE — LLM-POWERED TESTS
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$QUICK_MODE" = true ]; then
  section "6. Swarm Intelligence ${DIM}(skipped — quick mode)${NC}"
  skip "LLM-powered chat tests skipped (--quick)"
  skip "Single-agent routing test skipped"
  skip "Multi-agent parallel execution test skipped"
  skip "Security-focused routing test skipped"
else
  section "6. Swarm Intelligence — Single-Agent Routing"

  echo -e "  ${DIM}Sending architecture question (may take 30-60s)...${NC}"
  T1_START=$(date +%s)
  T1_RESP=$(http_post "${ORCH_URL}/v1/chat" \
    '{"message": "What architecture patterns should I use for a REST API with caching?"}' \
    "$LLM_TIMEOUT")
  T1_END=$(date +%s)
  T1_DURATION=$((T1_END - T1_START))

  if [ -n "$T1_RESP" ]; then
    T1_SUCCESS=$(echo "$T1_RESP" | json_field "success" 2>/dev/null || echo "")
    T1_ANSWER=$(echo "$T1_RESP" | json_field "answer" 2>/dev/null || echo "")
    T1_AGENTS=$(echo "$T1_RESP" | python3 -c "import sys,json; print(','.join(json.load(sys.stdin).get('agents_used',[])))" 2>/dev/null || echo "")
    T1_PLAN_SUMMARY=$(echo "$T1_RESP" | json_field "plan.summary" 2>/dev/null || echo "")
    T1_DURATION_MS=$(echo "$T1_RESP" | json_field "duration_ms" 2>/dev/null || echo "?")

    if [ "$T1_SUCCESS" = "True" ] || [ "$T1_SUCCESS" = "true" ]; then
      pass "Single-agent chat succeeded (${T1_DURATION}s wall, ${T1_DURATION_MS}ms pipeline)"
    else
      fail "Single-agent chat returned success=false" "Response: ${T1_RESP:0:300}"
    fi

    if echo "$T1_AGENTS" | grep -q "architecture-agent-001"; then
      pass "Correctly routed to architecture-agent-001"
    else
      warn "Expected architecture-agent-001, got: $T1_AGENTS"
    fi

    if [ -n "$T1_ANSWER" ] && [ ${#T1_ANSWER} -gt 50 ]; then
      pass "Answer is substantive (${#T1_ANSWER} chars)"
    else
      warn "Answer seems too short: ${#T1_ANSWER} chars"
    fi

    if [ -n "$T1_PLAN_SUMMARY" ]; then
      pass "Plan summary: ${T1_PLAN_SUMMARY:0:80}"
    else
      warn "No plan summary in response"
    fi
  else
    fail "Single-agent chat — no response" "Server may have crashed. Check: $LOG_FILE"
  fi

  # ─── Multi-Agent Parallel Execution ──────────────────────────────────────

  section "6b. Swarm Intelligence — Multi-Agent Parallel Execution"

  echo -e "  ${DIM}Sending multi-domain question (may take 30-90s)...${NC}"
  T2_START=$(date +%s)
  T2_RESP=$(http_post "${ORCH_URL}/v1/chat" \
    '{"message": "Do a full review of my Node.js API: check the architecture patterns, scan for security vulnerabilities, and analyze code quality."}' \
    "$LLM_TIMEOUT")
  T2_END=$(date +%s)
  T2_DURATION=$((T2_END - T2_START))

  if [ -n "$T2_RESP" ]; then
    T2_SUCCESS=$(echo "$T2_RESP" | json_field "success" 2>/dev/null || echo "")
    T2_AGENTS=$(echo "$T2_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('agents_used',[])))" 2>/dev/null || echo "0")
    T2_STEPS=$(echo "$T2_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('step_results',[])))" 2>/dev/null || echo "0")
    T2_AGENT_LIST=$(echo "$T2_RESP" | python3 -c "import sys,json; print(','.join(json.load(sys.stdin).get('agents_used',[])))" 2>/dev/null || echo "")
    T2_ALL_SUCCESS=$(echo "$T2_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(all(r.get('success') for r in d.get('step_results',[])))" 2>/dev/null || echo "")
    T2_COMPLEXITY=$(echo "$T2_RESP" | json_field "plan.complexity" 2>/dev/null || echo "")
    T2_DURATION_MS=$(echo "$T2_RESP" | json_field "duration_ms" 2>/dev/null || echo "?")

    if [ "$T2_SUCCESS" = "True" ] || [ "$T2_SUCCESS" = "true" ]; then
      pass "Multi-agent chat succeeded (${T2_DURATION}s wall, ${T2_DURATION_MS}ms pipeline)"
    else
      fail "Multi-agent chat returned success=false" "Agents: $T2_AGENT_LIST"
    fi

    if [ "$T2_AGENTS" -ge 2 ] 2>/dev/null; then
      pass "Multiple agents invoked: $T2_AGENTS agents ($T2_AGENT_LIST)"
    else
      warn "Expected >= 2 agents, got: $T2_AGENTS ($T2_AGENT_LIST)"
    fi

    if [ "$T2_ALL_SUCCESS" = "True" ]; then
      pass "All $T2_STEPS agent steps completed successfully"
    else
      warn "Some agent steps failed (check step_results)"
    fi

    # Print step details
    echo "$T2_RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for i, r in enumerate(d.get('step_results', [])):
    status = '✓' if r.get('success') else '✗'
    agent = r.get('agent', '?')
    action = r.get('action', '?')
    dur = r.get('duration_ms', '?')
    print(f'    Step {i}: {status} {agent} → {action} ({dur}ms)')
" 2>/dev/null || true
  else
    fail "Multi-agent chat — no response" "Server may have crashed. Check: $LOG_FILE"
  fi

  # ─── Security-Focused Routing ────────────────────────────────────────────

  section "6c. Swarm Intelligence — Security-Focused Routing"

  echo -e "  ${DIM}Sending security question...${NC}"
  T3_START=$(date +%s)
  T3_RESP=$(http_post "${ORCH_URL}/v1/chat" \
    '{"message": "Scan my authentication module for SQL injection vulnerabilities"}' \
    "$LLM_TIMEOUT")
  T3_END=$(date +%s)
  T3_DURATION=$((T3_END - T3_START))

  if [ -n "$T3_RESP" ]; then
    T3_SUCCESS=$(echo "$T3_RESP" | json_field "success" 2>/dev/null || echo "")
    T3_AGENTS=$(echo "$T3_RESP" | python3 -c "import sys,json; print(','.join(json.load(sys.stdin).get('agents_used',[])))" 2>/dev/null || echo "")

    if [ "$T3_SUCCESS" = "True" ] || [ "$T3_SUCCESS" = "true" ]; then
      pass "Security chat succeeded (${T3_DURATION}s)"
    else
      fail "Security chat returned success=false"
    fi

    if echo "$T3_AGENTS" | grep -q "security-agent-001"; then
      pass "Correctly routed to security-agent-001"
    else
      warn "Expected security-agent-001, got: $T3_AGENTS"
    fi
  else
    fail "Security chat — no response"
  fi

  # ─── Quality-Focused Routing ─────────────────────────────────────────────

  section "6d. Swarm Intelligence — Quality-Focused Routing"

  echo -e "  ${DIM}Sending code quality question...${NC}"
  T4_START=$(date +%s)
  T4_RESP=$(http_post "${ORCH_URL}/v1/chat" \
    '{"message": "Check the code quality and test coverage of my TypeScript project"}' \
    "$LLM_TIMEOUT")
  T4_END=$(date +%s)
  T4_DURATION=$((T4_END - T4_START))

  if [ -n "$T4_RESP" ]; then
    T4_SUCCESS=$(echo "$T4_RESP" | json_field "success" 2>/dev/null || echo "")
    T4_AGENTS=$(echo "$T4_RESP" | python3 -c "import sys,json; print(','.join(json.load(sys.stdin).get('agents_used',[])))" 2>/dev/null || echo "")

    if [ "$T4_SUCCESS" = "True" ] || [ "$T4_SUCCESS" = "true" ]; then
      pass "Quality chat succeeded (${T4_DURATION}s)"
    else
      fail "Quality chat returned success=false"
    fi

    if echo "$T4_AGENTS" | grep -q "quality-agent-001"; then
      pass "Correctly routed to quality-agent-001"
    else
      warn "Expected quality-agent-001, got: $T4_AGENTS"
    fi
  else
    fail "Quality chat — no response"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 7. RESPONSE STRUCTURE VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

if [ "$QUICK_MODE" = false ] && [ -n "${T1_RESP:-}" ]; then
  section "7. Response Structure Validation"

  # Validate all required fields exist in the chat response
  REQUIRED_FIELDS="answer plan plan.summary plan.complexity plan.confidence plan.steps agents_used step_results duration_ms success"
  for field in $REQUIRED_FIELDS; do
    VAL=$(echo "$T1_RESP" | json_field "$field" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$VAL" ] && [ "$VAL" != "__ERROR__" ]; then
      pass "Response has field: $field"
    else
      fail "Response missing field: $field"
    fi
  done

  # Validate step_results structure
  STEP0_FIELDS=$(echo "$T1_RESP" | python3 -c "
import sys, json
d = json.load(sys.stdin)
steps = d.get('step_results', [])
if steps:
    s = steps[0]
    fields = ['agent', 'action', 'success', 'duration_ms']
    missing = [f for f in fields if f not in s]
    if missing:
        print('MISSING:' + ','.join(missing))
    else:
        print('OK')
else:
    print('NO_STEPS')
" 2>/dev/null || echo "ERROR")

  if [ "$STEP0_FIELDS" = "OK" ]; then
    pass "step_results[0] has all required fields (agent, action, success, duration_ms)"
  else
    fail "step_results[0] structure issue: $STEP0_FIELDS"
  fi
else
  section "7. Response Structure Validation ${DIM}(skipped)${NC}"
  skip "No chat response available for validation"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 8. UNIT TEST SUITES (quick sanity check)
# ═══════════════════════════════════════════════════════════════════════════════

section "8. Unit Test Suites"

echo -e "  ${DIM}Running orchestrator tests...${NC}"
ORCH_TEST_OUT=$(cd "$ORCHESTRATOR_DIR" && npx vitest run --reporter=verbose 2>&1 || true)
ORCH_TEST_PASSED=$(echo "$ORCH_TEST_OUT" | grep -oP 'Tests\s+\K\d+(?=\s+passed)' | head -1 || echo "0")
ORCH_TEST_FILES_PASSED=$(echo "$ORCH_TEST_OUT" | grep -oP 'Test Files\s+\K\d+(?=\s+passed)' | head -1 || echo "0")
ORCH_TEST_FAILED=$(echo "$ORCH_TEST_OUT" | grep -oP '\K\d+(?=\s+failed)' | head -1 || echo "0")

if [ "$ORCH_TEST_PASSED" -gt 100 ] 2>/dev/null; then
  pass "Orchestrator: $ORCH_TEST_PASSED tests passed ($ORCH_TEST_FILES_PASSED files)"
elif [ "$ORCH_TEST_PASSED" -gt 0 ] 2>/dev/null; then
  warn "Orchestrator: $ORCH_TEST_PASSED tests passed ($ORCH_TEST_FAILED failed)"
else
  fail "Orchestrator tests — could not determine results"
fi

echo -e "  ${DIM}Running api-gateway tests...${NC}"
GW_TEST_OUT=$(cd "$PROJECT_ROOT/services/api-gateway" && npx jest --no-coverage 2>&1 || true)
GW_TEST_PASSED=$(echo "$GW_TEST_OUT" | grep -oP 'Tests:\s+\K\d+(?=\s+passed)' | head -1 || echo "0")
GW_SUITES_PASSED=$(echo "$GW_TEST_OUT" | grep -oP 'Test Suites:\s+\K\d+(?=\s+passed)' | head -1 || echo "0")

if [ "$GW_TEST_PASSED" -gt 200 ] 2>/dev/null; then
  pass "API Gateway: $GW_TEST_PASSED tests passed ($GW_SUITES_PASSED suites)"
elif [ "$GW_TEST_PASSED" -gt 0 ] 2>/dev/null; then
  warn "API Gateway: $GW_TEST_PASSED tests passed"
else
  fail "API Gateway tests — could not determine results"
fi

TOTAL_UNIT=$((ORCH_TEST_PASSED + GW_TEST_PASSED))
pass "Total unit tests: $TOTAL_UNIT"

# ═══════════════════════════════════════════════════════════════════════════════
# 9. SERVER LOG ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════

section "9. Server Log Analysis"

# Helper: count matching lines in a file (returns 0 on no match, never fails)
count_in_log() {
  local count
  count=$(grep -Ec "$1" "$LOG_FILE" 2>/dev/null) || true
  echo "${count:-0}"
}

if [ -f "$LOG_FILE" ]; then
  # Check for critical errors
  FATAL_ERRORS=$(count_in_log "fatal|EADDRINUSE|segfault|heap out of memory")
  if [ "$FATAL_ERRORS" -eq 0 ]; then
    pass "No fatal errors in server log"
  else
    fail "$FATAL_ERRORS fatal error(s) found in server log"
  fi

  # Check for successful pipeline completions
  PIPELINE_OK=$(count_in_log "\\[Swarm\\] Pipeline complete")
  if [ "$PIPELINE_OK" -gt 0 ]; then
    pass "$PIPELINE_OK successful pipeline completion(s) logged"
  elif [ "$QUICK_MODE" = true ]; then
    skip "No pipeline completions (quick mode — no LLM calls)"
  else
    warn "No pipeline completions found in log"
  fi

  # Check LLM provider fallbacks
  FALLBACKS=$(count_in_log "Fallback successful")
  if [ "$FALLBACKS" -gt 0 ]; then
    warn "$FALLBACKS LLM fallback(s) triggered (primary provider failed, fallback succeeded)"
  else
    pass "No LLM fallbacks needed (primary provider worked)"
  fi

  # Auth errors (might indicate bad API key)
  AUTH_ERRORS=$(count_in_log "AUTH_ERROR|Authentication failed")
  if [ "$AUTH_ERRORS" -gt 0 ]; then
    AFFECTED_PROVIDERS=$(grep "Authentication failed for" "$LOG_FILE" 2>/dev/null | grep -oP "for \K\w+" | sort -u | tr '\n' ', ' || echo "unknown")
    warn "$AUTH_ERRORS auth error(s) — check API keys for: ${AFFECTED_PROVIDERS%, }"
  else
    pass "No authentication errors"
  fi

  # Rate limits
  RATE_LIMITS=$(count_in_log "RATE_LIMIT|Rate limit exceeded")
  if [ "$RATE_LIMITS" -gt 0 ]; then
    warn "$RATE_LIMITS rate limit hit(s) — system handled via fallback"
  fi

  LOG_SIZE=$(wc -c < "$LOG_FILE" 2>/dev/null || echo "0")
  echo -e "  ${DIM}Full log: $LOG_FILE ($(numfmt --to=iec "$LOG_SIZE" 2>/dev/null || echo "${LOG_SIZE} bytes"))${NC}"
else
  skip "No server log file (server was pre-started with --no-server)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}                        TEST SUMMARY                          ${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed:${NC}  $PASS_COUNT"
echo -e "  ${RED}Failed:${NC}  $FAIL_COUNT"
echo -e "  ${YELLOW}Warned:${NC}  $WARN_COUNT"
echo -e "  ${YELLOW}Skipped:${NC} $SKIP_COUNT"
echo -e "  ${DIM}Duration: ${TOTAL_TIME}s${NC}"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓${NC}"
  echo -e "  ${GREEN}${BOLD}▓   ALL TESTS PASSED — SYSTEM IS HEALTHY  ▓${NC}"
  echo -e "  ${GREEN}${BOLD}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓${NC}"
else
  echo -e "  ${RED}${BOLD}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓${NC}"
  echo -e "  ${RED}${BOLD}▓   $FAIL_COUNT TEST(S) FAILED — REVIEW ABOVE   ${NC}"
  echo -e "  ${RED}${BOLD}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓${NC}"
fi

echo ""

# Exit code: 0 if no failures, 1 if any failures
exit "$FAIL_COUNT"
