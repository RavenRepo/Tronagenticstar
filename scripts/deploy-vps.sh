#!/usr/bin/env bash
# ============================================================================
# CONSTELLA AI OPERATING PLATFORM — VPS DEPLOYMENT SCRIPT
# ============================================================================
# Target: Hostinger VPS KVM 2 (2 CPU / 8GB RAM / 100GB SSD / Ubuntu 24.04)
# IP: 147.93.105.214
#
# This script handles the COMPLETE deployment lifecycle:
#   1. System hardening & prerequisites
#   2. Docker + Docker Compose installation
#   3. Firewall configuration (UFW)
#   4. SSL certificate provisioning (Let's Encrypt)
#   5. Application deployment with health verification
#   6. Post-deploy smoke tests
#   7. Cron jobs for backups & certificate renewal
#
# Usage:
#   First deploy:
#     chmod +x scripts/deploy-vps.sh
#     sudo ./scripts/deploy-vps.sh --full
#
#   Update existing deployment:
#     sudo ./scripts/deploy-vps.sh --update
#
#   SSL only (after DNS is pointed):
#     sudo ./scripts/deploy-vps.sh --ssl-only
#
#   Health check:
#     sudo ./scripts/deploy-vps.sh --health
#
# Prerequisites:
#   - SSH access to the VPS as root or with sudo
#   - .env.production filled out (copied from .env.production.template)
#   - DNS A record pointing DOMAIN to VPS IP (for SSL)
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# GLOBALS
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_LOG="/var/log/constella/deploy-$(date +%Y%m%d_%H%M%S).log"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
ENV_FILE="$PROJECT_ROOT/.env.production"
REQUIRED_DOCKER_COMPOSE_VERSION="2.20"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Deployment profiles
PROFILE_CORE="core"
PROFILE_AGENTS="agents"
PROFILE_MONITORING="monitoring"

# Default to core + agents (skip monitoring to save RAM)
DEPLOY_PROFILES="${DEPLOY_PROFILES:---profile core --profile agents}"

# ---------------------------------------------------------------------------
# LOGGING
# ---------------------------------------------------------------------------
mkdir -p /var/log/constella

log() {
    local level="$1"
    shift
    local msg="$*"
    local timestamp
    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${timestamp} [${level}] ${msg}" | tee -a "$DEPLOY_LOG"
}

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; log "INFO" "$*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; log "OK" "$*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; log "WARN" "$*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; log "ERROR" "$*"; }
header()  { echo -e "\n${BOLD}${CYAN}=== $* ===${NC}\n"; log "HEADER" "$*"; }

die() {
    error "$*"
    error "Deploy log: $DEPLOY_LOG"
    exit 1
}

# ---------------------------------------------------------------------------
# PRE-FLIGHT CHECKS
# ---------------------------------------------------------------------------
preflight_checks() {
    header "Pre-flight checks"

    # Must be root or have sudo
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root (or with sudo)"
    fi

    # Check we're in the project directory
    if [[ ! -f "$PROJECT_ROOT/README.md" ]]; then
        die "Cannot find project root. Run from the scripts/ directory or set PROJECT_ROOT."
    fi

    # Check .env.production exists
    if [[ ! -f "$ENV_FILE" ]]; then
        die ".env.production not found at $ENV_FILE. Copy from .env.production.template and fill in values."
    fi

    # Validate critical env vars
    local missing=()
    source "$ENV_FILE"

    [[ -z "${JWT_SECRET:-}" || "$JWT_SECRET" == *"CHANGE_ME"* ]] && missing+=("JWT_SECRET")
    [[ -z "${AGENT_BEARER:-}" || "$AGENT_BEARER" == *"CHANGE_ME"* ]] && missing+=("AGENT_BEARER")
    [[ -z "${REDIS_PASSWORD:-}" || "$REDIS_PASSWORD" == *"CHANGE_ME"* ]] && missing+=("REDIS_PASSWORD")
    [[ -z "${NEO4J_PASSWORD:-}" || "$NEO4J_PASSWORD" == *"CHANGE_ME"* ]] && missing+=("NEO4J_PASSWORD")
    [[ -z "${OPENAI_API_KEY:-}" || "$OPENAI_API_KEY" == "sk-CHANGE_ME" ]] && missing+=("OPENAI_API_KEY")
    [[ -z "${DOMAIN:-}" || "$DOMAIN" == *"yourdomain"* ]] && missing+=("DOMAIN")

    if [[ ${#missing[@]} -gt 0 ]]; then
        die "The following required secrets are not configured in .env.production: ${missing[*]}"
    fi

    # Check available RAM
    local total_ram_mb
    total_ram_mb=$(free -m | awk '/^Mem:/{print $2}')
    if [[ $total_ram_mb -lt 6000 ]]; then
        warn "Low RAM detected: ${total_ram_mb}MB. Minimum recommended: 6GB. Deploy may fail under load."
        warn "Consider using only --profile core (skip agents profile) to reduce memory."
    fi

    # Check available disk
    local free_disk_gb
    free_disk_gb=$(df -BG / | awk 'NR==2{print $4}' | sed 's/G//')
    if [[ $free_disk_gb -lt 15 ]]; then
        warn "Low disk space: ${free_disk_gb}GB free. Docker images need ~10GB."
    fi

    success "Pre-flight checks passed (RAM: ${total_ram_mb}MB, Disk: ${free_disk_gb}GB free)"
}

# ---------------------------------------------------------------------------
# SYSTEM HARDENING & PREREQUISITES
# ---------------------------------------------------------------------------
install_prerequisites() {
    header "Installing system prerequisites"

    # Update package list
    info "Updating package lists..."
    apt-get update -qq >> "$DEPLOY_LOG" 2>&1

    # Install essentials
    info "Installing essential packages..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release \
        software-properties-common \
        ufw \
        fail2ban \
        logrotate \
        htop \
        jq \
        unattended-upgrades \
        wget \
        git \
        >> "$DEPLOY_LOG" 2>&1

    # Configure automatic security updates
    info "Configuring automatic security updates..."
    cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF

    # Configure fail2ban for SSH
    info "Configuring fail2ban..."
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 7200
EOF
    systemctl enable fail2ban >> "$DEPLOY_LOG" 2>&1
    systemctl restart fail2ban >> "$DEPLOY_LOG" 2>&1

    # Kernel tuning for Docker
    info "Applying kernel parameters for Docker..."
    cat > /etc/sysctl.d/99-constella.conf << 'EOF'
# Network performance
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5

# Memory management
vm.overcommit_memory = 1
vm.swappiness = 10

# Security
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
EOF
    sysctl --system >> "$DEPLOY_LOG" 2>&1

    # Setup swap if not exists (important for 8GB VPS)
    if ! swapon -s | grep -q '/swapfile'; then
        info "Creating 2GB swap file..."
        if [[ ! -f /swapfile ]]; then
            fallocate -l 2G /swapfile
            chmod 600 /swapfile
            mkswap /swapfile >> "$DEPLOY_LOG" 2>&1
            swapon /swapfile
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
            success "Swap file created (2GB)"
        fi
    else
        info "Swap already configured"
    fi

    # Configure logrotate for Constella
    cat > /etc/logrotate.d/constella << 'EOF'
/var/log/constella/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
    sharedscripts
}
EOF

    success "System prerequisites installed"
}

# ---------------------------------------------------------------------------
# DOCKER INSTALLATION
# ---------------------------------------------------------------------------
install_docker() {
    header "Installing Docker"

    if command -v docker &> /dev/null; then
        local docker_version
        docker_version=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
        info "Docker already installed: v${docker_version}"
    else
        info "Installing Docker Engine..."

        # Add Docker's official GPG key
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
        chmod a+r /etc/apt/keyrings/docker.asc

        # Add Docker repository
        echo \
            "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
            $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
            tee /etc/apt/sources.list.d/docker.list > /dev/null

        apt-get update -qq >> "$DEPLOY_LOG" 2>&1
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
            docker-ce \
            docker-ce-cli \
            containerd.io \
            docker-buildx-plugin \
            docker-compose-plugin \
            >> "$DEPLOY_LOG" 2>&1

        success "Docker installed"
    fi

    # Verify Docker Compose plugin
    if ! docker compose version &> /dev/null; then
        die "Docker Compose plugin not found. Install with: apt-get install docker-compose-plugin"
    fi

    local compose_version
    compose_version=$(docker compose version --short 2>/dev/null || echo "unknown")
    info "Docker Compose version: $compose_version"

    # Configure Docker daemon
    info "Configuring Docker daemon..."
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json << 'EOF'
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "live-restore": true,
    "default-ulimits": {
        "nofile": {
            "Name": "nofile",
            "Hard": 65536,
            "Soft": 65536
        }
    },
    "metrics-addr": "127.0.0.1:9323",
    "experimental": false
}
EOF

    # Start and enable Docker
    systemctl daemon-reload >> "$DEPLOY_LOG" 2>&1
    systemctl enable docker >> "$DEPLOY_LOG" 2>&1
    systemctl restart docker >> "$DEPLOY_LOG" 2>&1

    # Wait for Docker to be ready
    local retries=0
    while ! docker info &> /dev/null; do
        retries=$((retries + 1))
        if [[ $retries -ge 30 ]]; then
            die "Docker failed to start after 30 seconds"
        fi
        sleep 1
    done

    # Prune old data if disk is tight
    local free_disk_gb
    free_disk_gb=$(df -BG / | awk 'NR==2{print $4}' | sed 's/G//')
    if [[ $free_disk_gb -lt 20 ]]; then
        info "Low disk space (${free_disk_gb}GB), pruning Docker..."
        docker system prune -af --volumes >> "$DEPLOY_LOG" 2>&1
    fi

    success "Docker is ready"
}

# ---------------------------------------------------------------------------
# FIREWALL CONFIGURATION
# ---------------------------------------------------------------------------
configure_firewall() {
    header "Configuring firewall (UFW)"

    # Reset UFW to defaults
    info "Resetting UFW rules..."
    ufw --force reset >> "$DEPLOY_LOG" 2>&1

    # Default policies
    ufw default deny incoming >> "$DEPLOY_LOG" 2>&1
    ufw default allow outgoing >> "$DEPLOY_LOG" 2>&1

    # SSH (rate limited — max 6 connections in 30 seconds)
    info "Allowing SSH (rate limited)..."
    ufw limit 22/tcp comment 'SSH rate limited' >> "$DEPLOY_LOG" 2>&1

    # HTTP & HTTPS
    info "Allowing HTTP (80) and HTTPS (443)..."
    ufw allow 80/tcp comment 'HTTP - Nginx' >> "$DEPLOY_LOG" 2>&1
    ufw allow 443/tcp comment 'HTTPS - Nginx' >> "$DEPLOY_LOG" 2>&1

    # Block direct access to internal service ports from outside
    # (Docker publishes on 0.0.0.0 by default; our compose uses internal networks,
    #  but we add belt-and-suspenders UFW rules)
    info "Blocking direct access to internal service ports..."
    for port in 3000 3001 3100 4222 6222 6333 6334 6379 7474 7687 8001 8004 8006 \
                8010 8011 8012 8013 8014 8015 8016 8017 8018 8020 8222 9090; do
        ufw deny "$port/tcp" comment "Block direct access to internal port $port" >> "$DEPLOY_LOG" 2>&1
    done

    # Enable UFW
    info "Enabling UFW..."
    ufw --force enable >> "$DEPLOY_LOG" 2>&1

    success "Firewall configured: SSH(22/rate-limited), HTTP(80), HTTPS(443) allowed; all internal ports blocked"
    info "Current UFW status:"
    ufw status verbose 2>&1 | head -30 | tee -a "$DEPLOY_LOG"
}

# ---------------------------------------------------------------------------
# SSL CERTIFICATE (Let's Encrypt)
# ---------------------------------------------------------------------------
setup_ssl() {
    header "Setting up SSL certificate"

    source "$ENV_FILE"
    local domain="${DOMAIN:-}"
    local email="${ADMIN_EMAIL:-admin@${domain}}"

    if [[ -z "$domain" || "$domain" == *"yourdomain"* ]]; then
        warn "DOMAIN not configured properly in .env.production"
        warn "Skipping SSL setup. You can run './scripts/deploy-vps.sh --ssl-only' later."
        setup_self_signed_ssl
        return 0
    fi

    # Check if certificate already exists
    local cert_path="$PROJECT_ROOT/devops/certbot/conf/live/$domain/fullchain.pem"
    if [[ -f "$cert_path" ]]; then
        info "SSL certificate already exists for $domain"
        local expiry
        expiry=$(openssl x509 -enddate -noout -in "$cert_path" 2>/dev/null | cut -d= -f2)
        info "Certificate expires: $expiry"
        return 0
    fi

    # Check DNS resolution
    info "Checking DNS resolution for $domain..."
    local resolved_ip
    resolved_ip=$(dig +short "$domain" A 2>/dev/null | head -1 || true)
    local vps_ip
    vps_ip=$(curl -sf https://ifconfig.me 2>/dev/null || curl -sf https://api.ipify.org 2>/dev/null || echo "unknown")

    if [[ -z "$resolved_ip" ]]; then
        warn "DNS not resolving for $domain yet."
        warn "Point your DNS A record to $vps_ip, then run: ./scripts/deploy-vps.sh --ssl-only"
        setup_self_signed_ssl
        return 0
    fi

    if [[ "$resolved_ip" != "$vps_ip" ]]; then
        warn "DNS for $domain resolves to $resolved_ip, but VPS IP is $vps_ip"
        warn "Make sure DNS A record points to $vps_ip"
        setup_self_signed_ssl
        return 0
    fi

    info "DNS OK: $domain -> $resolved_ip"

    # Create directories
    mkdir -p "$PROJECT_ROOT/devops/certbot/conf"
    mkdir -p "$PROJECT_ROOT/devops/certbot/www"

    # Stop nginx if running (we need port 80 for standalone mode)
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop nginx 2>/dev/null || true

    # Request certificate using standalone mode (no nginx needed)
    info "Requesting SSL certificate for $domain..."
    docker run --rm \
        -v "$PROJECT_ROOT/devops/certbot/conf:/etc/letsencrypt" \
        -v "$PROJECT_ROOT/devops/certbot/www:/var/www/certbot" \
        -p 80:80 \
        certbot/certbot certonly \
            --standalone \
            -d "$domain" \
            --email "$email" \
            --agree-tos \
            --no-eff-email \
            --non-interactive \
            --force-renewal \
        2>&1 | tee -a "$DEPLOY_LOG"

    if [[ -f "$PROJECT_ROOT/devops/certbot/conf/live/$domain/fullchain.pem" ]]; then
        success "SSL certificate obtained for $domain"
    else
        warn "SSL certificate request failed. Falling back to self-signed."
        setup_self_signed_ssl
    fi
}

setup_self_signed_ssl() {
    info "Generating self-signed SSL certificate for development/testing..."

    source "$ENV_FILE"
    local domain="${DOMAIN:-localhost}"

    local cert_dir="$PROJECT_ROOT/devops/certbot/conf/live/$domain"
    mkdir -p "$cert_dir"

    if [[ -f "$cert_dir/fullchain.pem" ]]; then
        info "Self-signed certificate already exists"
        return 0
    fi

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$cert_dir/privkey.pem" \
        -out "$cert_dir/fullchain.pem" \
        -subj "/C=US/ST=State/L=City/O=Constella/CN=$domain" \
        >> "$DEPLOY_LOG" 2>&1

    success "Self-signed certificate generated (replace with Let's Encrypt for production)"
}

# ---------------------------------------------------------------------------
# BUILD & DEPLOY
# ---------------------------------------------------------------------------
build_and_deploy() {
    header "Building and deploying Constella"

    cd "$PROJECT_ROOT"

    # Ensure required directories exist
    mkdir -p devops/nginx/conf.d
    mkdir -p devops/certbot/conf
    mkdir -p devops/certbot/www

    # Generate Nginx config with actual domain substitution
    info "Generating Nginx configuration..."
    source "$ENV_FILE"
    local domain="${DOMAIN:-localhost}"

    # Substitute ${DOMAIN} placeholders in Nginx config
    if [[ -f devops/nginx/conf.d/constella.conf ]]; then
        sed -i "s/\${DOMAIN}/$domain/g" devops/nginx/conf.d/constella.conf
        info "Nginx config updated for domain: $domain"
    fi

    # Check if SSL cert exists for the real or self-signed path
    if [[ ! -f "devops/certbot/conf/live/$domain/fullchain.pem" ]]; then
        warn "No SSL certificate found for $domain. Creating self-signed..."
        setup_self_signed_ssl
    fi

    # Pull base images first (reduces build time)
    info "Pulling base images..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES pull \
        redis neo4j qdrant 2>&1 | tail -5 | tee -a "$DEPLOY_LOG"

    # Build application images
    info "Building application images (this may take 5-15 minutes on first run)..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES build \
        --parallel 2>&1 | tail -20 | tee -a "$DEPLOY_LOG"

    success "Images built"

    # Stop existing containers gracefully
    info "Stopping existing containers..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES down \
        --timeout 30 2>&1 | tee -a "$DEPLOY_LOG"

    # Start infrastructure first (Redis, Neo4j, Qdrant)
    info "Starting infrastructure services (Redis, Neo4j, Qdrant)..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        --profile core up -d redis neo4j qdrant 2>&1 | tee -a "$DEPLOY_LOG"

    # Wait for infrastructure to be healthy
    info "Waiting for infrastructure to become healthy..."
    wait_for_healthy "constella-redis" 60
    wait_for_healthy "constella-qdrant" 60
    wait_for_healthy "constella-neo4j" 120

    # Start all services
    info "Starting all application services..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES up -d \
        2>&1 | tee -a "$DEPLOY_LOG"

    # Wait for core services
    info "Waiting for core services to become healthy..."
    wait_for_healthy "constella-gateway" 60
    wait_for_healthy "constella-orchestrator" 60
    wait_for_healthy "constella-embedding" 120  # Embedding model takes time to load
    wait_for_healthy "constella-codecraft" 60
    wait_for_healthy "constella-securishield" 60
    wait_for_healthy "constella-evaluator" 60

    # Wait for Nginx (depends on gateway)
    wait_for_healthy "constella-nginx" 30

    success "All services deployed"
}

wait_for_healthy() {
    local container_name="$1"
    local timeout_seconds="${2:-60}"
    local interval=3
    local elapsed=0

    # Check if container exists
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        warn "Container $container_name not found (may not be in selected profiles)"
        return 0
    fi

    while [[ $elapsed -lt $timeout_seconds ]]; do
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "no-healthcheck")

        case "$health" in
            healthy)
                success "$container_name is healthy (${elapsed}s)"
                return 0
                ;;
            unhealthy)
                warn "$container_name is unhealthy after ${elapsed}s"
                docker logs --tail 20 "$container_name" 2>&1 | tail -10 | tee -a "$DEPLOY_LOG"
                return 1
                ;;
            starting)
                # Still starting, keep waiting
                ;;
            no-healthcheck)
                # No healthcheck defined, check if running
                local state
                state=$(docker inspect --format='{{.State.Status}}' "$container_name" 2>/dev/null || echo "not-found")
                if [[ "$state" == "running" ]]; then
                    info "$container_name is running (no healthcheck defined)"
                    return 0
                fi
                ;;
        esac

        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    warn "$container_name did not become healthy within ${timeout_seconds}s"
    info "Last logs from $container_name:"
    docker logs --tail 30 "$container_name" 2>&1 | tail -15 | tee -a "$DEPLOY_LOG"
    return 1
}

# ---------------------------------------------------------------------------
# HEALTH VERIFICATION
# ---------------------------------------------------------------------------
verify_health() {
    header "Verifying deployment health"

    source "$ENV_FILE"
    local domain="${DOMAIN:-localhost}"
    local errors=0
    local warnings=0

    # Check all containers are running
    info "Checking container status..."
    local total_containers
    total_containers=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES ps -q 2>/dev/null | wc -l)
    local running_containers
    running_containers=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES ps --filter "status=running" -q 2>/dev/null | wc -l)

    if [[ $running_containers -eq $total_containers ]]; then
        success "All $total_containers containers are running"
    else
        warn "Only $running_containers of $total_containers containers running"
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES ps 2>&1 | tee -a "$DEPLOY_LOG"
        warnings=$((warnings + 1))
    fi

    # Check API Gateway health
    info "Testing API Gateway..."
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        success "API Gateway responding on internal port 3000"
    else
        error "API Gateway not responding on port 3000"
        errors=$((errors + 1))
    fi

    # Check Nginx (HTTP)
    info "Testing Nginx (HTTP)..."
    if curl -sf http://localhost/nginx-health > /dev/null 2>&1; then
        success "Nginx responding on port 80"
    else
        warn "Nginx not responding on port 80"
        warnings=$((warnings + 1))
    fi

    # Check Nginx (HTTPS)
    info "Testing Nginx (HTTPS)..."
    if curl -sfk https://localhost/health > /dev/null 2>&1; then
        success "Nginx HTTPS proxy responding on port 443"
    else
        warn "Nginx HTTPS not responding (may need valid SSL cert)"
        warnings=$((warnings + 1))
    fi

    # Check Orchestrator
    info "Testing Orchestrator..."
    if curl -sf http://localhost:8001/health > /dev/null 2>&1; then
        local orch_response
        orch_response=$(curl -sf http://localhost:8001/health 2>/dev/null)
        success "Orchestrator healthy: $(echo "$orch_response" | jq -r '.status' 2>/dev/null || echo 'ok')"
    else
        error "Orchestrator not responding on port 8001"
        errors=$((errors + 1))
    fi

    # Check Redis
    info "Testing Redis..."
    if docker exec constella-redis redis-cli -a "${REDIS_PASSWORD}" ping 2>/dev/null | grep -q "PONG"; then
        success "Redis is responding"
    else
        error "Redis not responding"
        errors=$((errors + 1))
    fi

    # Check Qdrant
    info "Testing Qdrant..."
    if curl -sf http://localhost:6333/healthz > /dev/null 2>&1; then
        success "Qdrant is healthy"
    else
        warn "Qdrant not responding (may be on internal network only)"
        warnings=$((warnings + 1))
    fi

    # Check agent services
    info "Testing agent services..."
    declare -A agent_ports=(
        ["codecraft"]="8012"
        ["securishield"]="8011"
        ["evaluator"]="8014"
        ["designforge"]="8010"
        ["perfpulse"]="8013"
        ["expressops"]="8015"
        ["database-agent"]="8017"
    )

    for agent in "${!agent_ports[@]}"; do
        local port="${agent_ports[$agent]}"
        # Use docker network to check internal services
        if docker exec constella-gateway wget -q --spider "http://${agent}:${port}/health" 2>/dev/null; then
            success "  $agent (port $port) - healthy"
        elif curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
            success "  $agent (port $port) - healthy (direct)"
        else
            warn "  $agent (port $port) - not responding (may not be deployed)"
            warnings=$((warnings + 1))
        fi
    done

    # Memory usage summary
    info "Memory usage summary:"
    docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}" 2>&1 | \
        sort | head -25 | tee -a "$DEPLOY_LOG"

    echo ""
    info "Disk usage summary:"
    docker system df 2>&1 | tee -a "$DEPLOY_LOG"

    # Summary
    echo ""
    header "Deployment Summary"
    echo -e "  Domain:     ${BOLD}${domain}${NC}"
    echo -e "  API:        ${BOLD}https://${domain}/v1/${NC}"
    echo -e "  Health:     ${BOLD}https://${domain}/health${NC}"
    echo -e "  WebSocket:  ${BOLD}wss://${domain}/ws${NC}"
    echo -e "  Grafana:    ${BOLD}https://${domain}/grafana/${NC} (if monitoring profile enabled)"
    echo ""

    if [[ $errors -gt 0 ]]; then
        error "Deployment completed with $errors error(s) and $warnings warning(s)"
        return 1
    elif [[ $warnings -gt 0 ]]; then
        warn "Deployment completed with $warnings warning(s)"
        return 0
    else
        success "Deployment completed successfully with no issues!"
        return 0
    fi
}

# ---------------------------------------------------------------------------
# CRON JOBS
# ---------------------------------------------------------------------------
setup_cron_jobs() {
    header "Setting up cron jobs"

    local cron_file="/etc/cron.d/constella"

    cat > "$cron_file" << CRON
# Constella AI Platform - Automated Tasks
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# SSL certificate renewal check (every 12 hours)
0 */12 * * * root cd $PROJECT_ROOT && docker compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker compose -f docker-compose.prod.yml exec nginx nginx -s reload 2>/dev/null

# Docker log cleanup (weekly)
0 3 * * 0 root docker system prune -f --filter "until=168h" >> /var/log/constella/docker-prune.log 2>&1

# Health check (every 5 minutes, log failures)
*/5 * * * * root curl -sf http://localhost:3000/health > /dev/null 2>&1 || echo "\$(date): API Gateway health check FAILED" >> /var/log/constella/healthcheck.log

# Resource monitoring (hourly)
0 * * * * root echo "\$(date): \$(free -h | head -2)" >> /var/log/constella/resources.log && docker stats --no-stream --format "{{.Name}}: {{.MemUsage}} ({{.CPUPerc}} CPU)" >> /var/log/constella/resources.log 2>&1
CRON

    chmod 644 "$cron_file"
    success "Cron jobs configured at $cron_file"
}

# ---------------------------------------------------------------------------
# UPDATE DEPLOYMENT (rebuild + restart without full setup)
# ---------------------------------------------------------------------------
update_deployment() {
    header "Updating Constella deployment"

    cd "$PROJECT_ROOT"

    # Pull latest code (if git repo)
    if [[ -d .git ]]; then
        info "Pulling latest code..."
        git pull --rebase 2>&1 | tee -a "$DEPLOY_LOG" || warn "Git pull failed (not critical if files are manually updated)"
    fi

    # Rebuild only changed images
    info "Rebuilding changed images..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES build \
        --parallel 2>&1 | tail -15 | tee -a "$DEPLOY_LOG"

    # Rolling restart (one service at a time to minimize downtime)
    info "Performing rolling restart..."
    local services
    services=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES config --services 2>/dev/null)

    # Infrastructure first
    for svc in redis neo4j qdrant; do
        if echo "$services" | grep -q "^${svc}$"; then
            info "Restarting $svc..."
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES up -d "$svc" 2>&1 | tee -a "$DEPLOY_LOG"
            sleep 5
        fi
    done

    # Then application services
    for svc in api-gateway orchestrator embedding retriever codecraft securishield evaluator; do
        if echo "$services" | grep -q "^${svc}$"; then
            info "Restarting $svc..."
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES up -d "$svc" 2>&1 | tee -a "$DEPLOY_LOG"
            sleep 3
        fi
    done

    # Remaining services
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES up -d 2>&1 | tee -a "$DEPLOY_LOG"

    # Restart Nginx to pick up any config changes
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec nginx nginx -s reload 2>/dev/null || true

    success "Update complete"

    # Run health check
    verify_health
}

# ---------------------------------------------------------------------------
# TEARDOWN
# ---------------------------------------------------------------------------
teardown() {
    header "Tearing down Constella deployment"

    cd "$PROJECT_ROOT"

    warn "This will stop ALL Constella containers. Data volumes will be preserved."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
            --profile core --profile agents --profile monitoring \
            down --timeout 30 2>&1 | tee -a "$DEPLOY_LOG"
        success "All containers stopped. Volumes preserved."
        info "To remove volumes too: docker compose -f docker-compose.prod.yml down -v"
    else
        info "Teardown cancelled"
    fi
}

# ---------------------------------------------------------------------------
# SHOW LOGS
# ---------------------------------------------------------------------------
show_logs() {
    local service="${1:-}"
    cd "$PROJECT_ROOT"

    if [[ -n "$service" ]]; then
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f --tail=100 "$service"
    else
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" $DEPLOY_PROFILES logs -f --tail=50
    fi
}

# ---------------------------------------------------------------------------
# GENERATE SECRETS HELPER
# ---------------------------------------------------------------------------
generate_secrets() {
    header "Generating production secrets"

    echo "Add these to your .env.production file:"
    echo ""
    echo "JWT_SECRET=$(openssl rand -base64 32)"
    echo "AGENT_BEARER=$(openssl rand -base64 32)"
    echo "API_MASTER_KEY=$(openssl rand -base64 32)"
    echo "REDIS_PASSWORD=$(openssl rand -base64 24)"
    echo "NEO4J_PASSWORD=$(openssl rand -base64 24)"
    echo "QDRANT_API_KEY=$(openssl rand -base64 24)"
    echo "GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 24)"
    echo "GRAFANA_SECRET_KEY=$(openssl rand -base64 32)"
    echo ""
    echo "API_KEYS={\"$(openssl rand -hex 24)\":{\"id\":\"key-prod-001\",\"name\":\"Production Master Key\",\"permissions\":[\"*\"],\"rateLimit\":100,\"active\":true}}"
    echo ""
    success "Copy the above values into .env.production"
}

# ---------------------------------------------------------------------------
# USAGE
# ---------------------------------------------------------------------------
usage() {
    echo -e "${BOLD}Constella AI Platform - VPS Deployment Script${NC}"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  --full              Full deployment (prerequisites + Docker + firewall + SSL + deploy)"
    echo "  --update            Rebuild and restart services (after code changes)"
    echo "  --ssl-only          Only set up SSL certificate (after DNS is pointed)"
    echo "  --health            Run health checks on existing deployment"
    echo "  --firewall          Configure firewall rules only"
    echo "  --logs [service]    Show logs (optionally for a specific service)"
    echo "  --teardown          Stop all containers (preserves data)"
    echo "  --secrets           Generate random secrets for .env.production"
    echo "  --help              Show this help message"
    echo ""
    echo "Options:"
    echo "  DEPLOY_PROFILES     Override profiles (default: '--profile core --profile agents')"
    echo ""
    echo "Examples:"
    echo "  sudo $0 --full                                          # First-time full deploy"
    echo "  sudo $0 --update                                        # Redeploy after code changes"
    echo "  sudo $0 --ssl-only                                      # Add SSL after DNS setup"
    echo "  sudo DEPLOY_PROFILES='--profile core' $0 --full         # Core services only (saves RAM)"
    echo "  sudo DEPLOY_PROFILES='--profile core --profile agents --profile monitoring' $0 --full  # Everything"
    echo ""
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
main() {
    local command="${1:---help}"

    echo -e "${BOLD}${CYAN}"
    echo "  ╔══════════════════════════════════════════════════════╗"
    echo "  ║     CONSTELLA AI OPERATING PLATFORM DEPLOYER        ║"
    echo "  ║     Target: Hostinger VPS KVM 2                     ║"
    echo "  ╚══════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    case "$command" in
        --full)
            preflight_checks
            install_prerequisites
            install_docker
            configure_firewall
            setup_ssl
            build_and_deploy
            setup_cron_jobs
            verify_health
            echo ""
            success "Full deployment complete! 🚀"
            info "Deploy log: $DEPLOY_LOG"
            ;;
        --update)
            preflight_checks
            update_deployment
            ;;
        --ssl-only)
            preflight_checks
            setup_ssl
            # Restart nginx to pick up new cert
            cd "$PROJECT_ROOT"
            docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart nginx 2>/dev/null || true
            success "SSL setup complete"
            ;;
        --health)
            source "$ENV_FILE" 2>/dev/null || true
            verify_health
            ;;
        --firewall)
            configure_firewall
            ;;
        --logs)
            show_logs "${2:-}"
            ;;
        --teardown)
            teardown
            ;;
        --secrets)
            generate_secrets
            ;;
        --help|-h|help)
            usage
            ;;
        *)
            error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
