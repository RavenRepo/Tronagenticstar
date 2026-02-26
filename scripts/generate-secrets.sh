#!/usr/bin/env bash
# ============================================================================
# CONSTELLA AI PLATFORM — PRODUCTION SECRETS GENERATOR
# ============================================================================
# Reads .env.production.template, generates cryptographically secure values
# for all CHANGEME placeholders, and writes .env.production.
#
# Usage:
#   chmod +x scripts/generate-secrets.sh
#   ./scripts/generate-secrets.sh
#
# Options:
#   --force       Overwrite existing .env.production without prompting
#   --dry-run     Print generated values to stdout without writing file
#   --help        Show this help message
#
# Prerequisites:
#   - openssl (for random generation)
#   - sed, awk (standard unix tools)
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEMPLATE_FILE="$PROJECT_ROOT/.env.production.template"
OUTPUT_FILE="$PROJECT_ROOT/.env.production"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

usage() {
    echo -e "${BOLD}Constella Production Secrets Generator${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --force       Overwrite existing .env.production without prompting"
    echo "  --dry-run     Print what would be generated without writing file"
    echo "  --help        Show this help message"
    echo ""
    echo "This script reads .env.production.template, replaces all CHANGEME"
    echo "placeholders with cryptographically secure random values, and writes"
    echo "the result to .env.production with 600 permissions."
}

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# Generate a base64 secret of specified byte length
gen_base64() {
    local bytes="${1:-32}"
    openssl rand -base64 "$bytes" | tr -d '\n'
}

# Generate a hex secret of specified byte length
gen_hex() {
    local bytes="${1:-24}"
    openssl rand -hex "$bytes" | tr -d '\n'
}

# Check that required tools are available
check_prerequisites() {
    local missing=0
    for cmd in openssl sed awk; do
        if ! command -v "$cmd" &>/dev/null; then
            log_error "Required command not found: $cmd"
            missing=1
        fi
    done
    if [[ "$missing" -ne 0 ]]; then
        log_error "Install missing prerequisites and try again."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
FORCE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --force)
            FORCE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

check_prerequisites

echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║        Constella Production Secrets Generator           ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check template exists
if [[ ! -f "$TEMPLATE_FILE" ]]; then
    log_error "Template file not found: $TEMPLATE_FILE"
    log_error "Make sure you're running this from the project root."
    exit 1
fi

# Check if output already exists
if [[ -f "$OUTPUT_FILE" ]] && [[ "$FORCE" == false ]] && [[ "$DRY_RUN" == false ]]; then
    echo -e "${YELLOW}WARNING: $OUTPUT_FILE already exists.${NC}"
    echo ""
    read -rp "Overwrite? (y/N): " confirm
    if [[ "${confirm,,}" != "y" ]]; then
        log_info "Aborted. Use --force to skip this prompt."
        exit 0
    fi
fi

# ---------------------------------------------------------------------------
# Generate all secrets
# ---------------------------------------------------------------------------

log_info "Generating cryptographically secure secrets..."

# Generate each secret with appropriate length and encoding
SECRET_JWT_SECRET="$(gen_base64 32)"
SECRET_AGENT_BEARER="$(gen_base64 32)"
SECRET_API_KEYS="$(gen_hex 24)"
SECRET_REDIS_PASSWORD="$(gen_base64 20)"
SECRET_NEO4J_PASSWORD="$(gen_base64 20)"
SECRET_GRAFANA_ADMIN_PASSWORD="$(gen_base64 20)"
SECRET_GRAFANA_SECRET_KEY="$(gen_base64 32)"

log_ok "Generated 7 unique secrets"

# ---------------------------------------------------------------------------
# Build .env.production from template
# ---------------------------------------------------------------------------

log_info "Processing template..."

# Read template and perform substitutions
# We use a temporary variable to avoid partial writes on error
CONTENT="$(cat "$TEMPLATE_FILE")"

# Replace each CHANGEME placeholder with its generated value
# Pattern: VALUE=CHANGEME-run-openssl-... or VALUE=CHANGEME...

# JWT_SECRET
CONTENT="$(echo "$CONTENT" | sed "s|^JWT_SECRET=CHANGEME.*|JWT_SECRET=${SECRET_JWT_SECRET}|")"

# AGENT_BEARER
CONTENT="$(echo "$CONTENT" | sed "s|^AGENT_BEARER=CHANGEME.*|AGENT_BEARER=${SECRET_AGENT_BEARER}|")"

# API_KEYS
CONTENT="$(echo "$CONTENT" | sed "s|^API_KEYS=CHANGEME.*|API_KEYS=${SECRET_API_KEYS}|")"

# REDIS_PASSWORD
CONTENT="$(echo "$CONTENT" | sed "s|^REDIS_PASSWORD=CHANGEME.*|REDIS_PASSWORD=${SECRET_REDIS_PASSWORD}|")"

# NEO4J_PASSWORD
CONTENT="$(echo "$CONTENT" | sed "s|^NEO4J_PASSWORD=CHANGEME.*|NEO4J_PASSWORD=${SECRET_NEO4J_PASSWORD}|")"

# GRAFANA_ADMIN_PASSWORD
CONTENT="$(echo "$CONTENT" | sed "s|^GRAFANA_ADMIN_PASSWORD=CHANGEME.*|GRAFANA_ADMIN_PASSWORD=${SECRET_GRAFANA_ADMIN_PASSWORD}|")"

# GRAFANA_SECRET_KEY
CONTENT="$(echo "$CONTENT" | sed "s|^GRAFANA_SECRET_KEY=CHANGEME.*|GRAFANA_SECRET_KEY=${SECRET_GRAFANA_SECRET_KEY}|")"

# Add generation metadata at the top
GENERATED_HEADER="# ============================================================================
# AUTO-GENERATED on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# by scripts/generate-secrets.sh
#
# This file contains production secrets. Handle with extreme care:
#   - NEVER commit to version control
#   - NEVER share via unencrypted channels
#   - Permissions should be 600 (owner read/write only)
#   - Back up securely (e.g., encrypted vault, 1Password, etc.)
# ============================================================================

"

FINAL_CONTENT="${GENERATED_HEADER}${CONTENT}"

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

if [[ "$DRY_RUN" == true ]]; then
    echo ""
    echo -e "${YELLOW}=== DRY RUN — would write to: ${OUTPUT_FILE} ===${NC}"
    echo ""

    # Print only the secrets (not the full file) for safety
    echo -e "${BOLD}Generated secrets:${NC}"
    echo -e "  JWT_SECRET            = ${CYAN}${SECRET_JWT_SECRET}${NC}"
    echo -e "  AGENT_BEARER          = ${CYAN}${SECRET_AGENT_BEARER}${NC}"
    echo -e "  API_KEYS              = ${CYAN}${SECRET_API_KEYS}${NC}"
    echo -e "  REDIS_PASSWORD        = ${CYAN}${SECRET_REDIS_PASSWORD}${NC}"
    echo -e "  NEO4J_PASSWORD        = ${CYAN}${SECRET_NEO4J_PASSWORD}${NC}"
    echo -e "  GRAFANA_ADMIN_PASSWORD= ${CYAN}${SECRET_GRAFANA_ADMIN_PASSWORD}${NC}"
    echo -e "  GRAFANA_SECRET_KEY    = ${CYAN}${SECRET_GRAFANA_SECRET_KEY}${NC}"
    echo ""
    echo -e "${YELLOW}No file was written. Remove --dry-run to generate the file.${NC}"
    exit 0
fi

# Write the file
echo "$FINAL_CONTENT" > "$OUTPUT_FILE"

# Set restrictive permissions (owner read/write only)
chmod 600 "$OUTPUT_FILE"

log_ok "Wrote $OUTPUT_FILE (permissions: 600)"

# ---------------------------------------------------------------------------
# Verify no CHANGEME values remain (except in comments and the checklist)
# ---------------------------------------------------------------------------

REMAINING=$(grep -c "^[^#]*=CHANGEME" "$OUTPUT_FILE" 2>/dev/null || true)
if [[ "$REMAINING" -gt 0 ]]; then
    log_warn "Found $REMAINING lines with CHANGEME values still present."
    log_warn "These may be values you need to set manually:"
    grep --color=always "^[^#]*=CHANGEME" "$OUTPUT_FILE" || true
    echo ""
fi

# Check for values that still need manual configuration
echo ""
echo -e "${BOLD}${GREEN}✅ Secrets generated successfully!${NC}"
echo ""
echo -e "${BOLD}You still need to manually configure:${NC}"
echo ""
echo -e "  ${YELLOW}1.${NC} DOMAIN              — Set your actual domain name"
echo -e "  ${YELLOW}2.${NC} SSL_ADMIN_EMAIL      — Set a real email for Let's Encrypt"
echo -e "  ${YELLOW}3.${NC} OPENAI_API_KEY       — Set your OpenAI API key (sk-...)"
echo -e "  ${YELLOW}4.${NC} ANTHROPIC_API_KEY    — (Optional) Set your Anthropic key"
echo -e "  ${YELLOW}5.${NC} CORS_ORIGINS         — Update with your actual domain"
echo ""
echo -e "Edit the file:"
echo -e "  ${CYAN}nano ${OUTPUT_FILE}${NC}"
echo ""
echo -e "Then deploy:"
echo -e "  ${CYAN}sudo ./scripts/deploy-vps.sh --full${NC}"
echo ""

# ---------------------------------------------------------------------------
# Offer to print secrets for backup
# ---------------------------------------------------------------------------

echo -e "${YELLOW}Would you like to display all generated secrets for secure backup?${NC}"
read -rp "(y/N): " show_secrets

if [[ "${show_secrets,,}" == "y" ]]; then
    echo ""
    echo -e "${RED}${BOLD}⚠️  SENSITIVE — Copy these to your password manager NOW ⚠️${NC}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "JWT_SECRET=$SECRET_JWT_SECRET"
    echo "AGENT_BEARER=$SECRET_AGENT_BEARER"
    echo "API_KEYS=$SECRET_API_KEYS"
    echo "REDIS_PASSWORD=$SECRET_REDIS_PASSWORD"
    echo "NEO4J_PASSWORD=$SECRET_NEO4J_PASSWORD"
    echo "GRAFANA_ADMIN_PASSWORD=$SECRET_GRAFANA_ADMIN_PASSWORD"
    echo "GRAFANA_SECRET_KEY=$SECRET_GRAFANA_SECRET_KEY"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo -e "${YELLOW}These values will not be shown again.${NC}"
fi

echo ""
log_ok "Done. Your production environment file is ready at:"
echo -e "  ${CYAN}${OUTPUT_FILE}${NC}"
echo ""
