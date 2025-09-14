#!/bin/bash

# Constella API Gateway Setup Script
# This script sets up the API Gateway service for development and testing

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "This script should not be run as root"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Check system requirements
check_requirements() {
    log_step "Checking system requirements..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js 18+ first."
        log_info "Visit: https://nodejs.org/"
        exit 1
    fi

    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js version 18+ is required. Current version: $(node --version)"
        exit 1
    fi

    log_success "Node.js $(node --version) is installed"

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi

    # Check Docker (optional)
    if command -v docker &> /dev/null; then
        log_success "Docker is available"
    else
        log_warning "Docker is not installed. Docker features will be unavailable."
    fi

    # Check Docker Compose (optional)
    if command -v docker-compose &> /dev/null; then
        log_success "Docker Compose is available"
    else
        log_warning "Docker Compose is not installed. Docker Compose features will be unavailable."
    fi

    # Check Redis (optional)
    if command -v redis-server &> /dev/null; then
        log_success "Redis is available"
    else
        log_warning "Redis is not installed. Will use in-memory rate limiting."
    fi
}

# Install dependencies
install_dependencies() {
    log_step "Installing dependencies..."

    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Are you in the correct directory?"
        exit 1
    fi

    # Check if pnpm is available and preferred
    if command -v pnpm &> /dev/null; then
        log_info "Using pnpm for faster installation..."
        pnpm install
    else
        log_info "Using npm for package installation..."
        npm install
    fi

    log_success "Dependencies installed successfully"
}

# Setup environment file
setup_environment() {
    log_step "Setting up environment configuration..."

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success "Created .env file from .env.example"
        else
            log_error ".env.example file not found"
            exit 1
        fi
    else
        log_warning ".env file already exists. Skipping..."
    fi

    # Generate a secure JWT secret for development
    if command -v openssl &> /dev/null; then
        local jwt_secret=$(openssl rand -hex 32)
        sed -i.bak "s/your-super-secret-jwt-key-change-in-production/$jwt_secret/" .env
        log_success "Generated secure JWT secret"
    else
        log_warning "OpenSSL not found. Using default JWT secret (not secure for production)"
    fi
}

# Create required directories
create_directories() {
    log_step "Creating required directories..."

    mkdir -p logs
    mkdir -p monitoring/grafana/dashboards
    mkdir -p monitoring/grafana/datasources

    log_success "Directories created"
}

# Build the project
build_project() {
    log_step "Building the project..."

    if command -v pnpm &> /dev/null; then
        pnpm run build
    else
        npm run build
    fi

    log_success "Project built successfully"
}

# Setup monitoring configuration
setup_monitoring() {
    log_step "Setting up monitoring configuration..."

    # Create Prometheus configuration
    mkdir -p monitoring
    cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'constella-api-gateway'
    static_configs:
      - targets: ['api-gateway:3000']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
EOF

    # Create Grafana datasource configuration
    mkdir -p monitoring/grafana/datasources
    cat > monitoring/grafana/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

    log_success "Monitoring configuration created"
}

# Run tests
run_tests() {
    log_step "Running tests..."

    if command -v pnpm &> /dev/null; then
        pnpm test
    else
        npm test
    fi

    log_success "All tests passed"
}

# Start development server
start_dev_server() {
    log_step "Starting development server..."

    log_info "Starting API Gateway in development mode..."
    log_info "The gateway will be available at: http://localhost:3000"
    log_info "Health check: http://localhost:3000/health"
    log_info "Metrics: http://localhost:3000/metrics"
    log_info ""
    log_info "Press Ctrl+C to stop the server"

    if command -v pnpm &> /dev/null; then
        pnpm run dev
    else
        npm run dev
    fi
}

# Docker setup
setup_docker() {
    log_step "Setting up Docker environment..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        return 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        return 1
    fi

    # Build the Docker image
    log_info "Building Docker image..."
    docker build -t constella/api-gateway .

    # Start services with Docker Compose
    log_info "Starting services with Docker Compose..."
    docker-compose up -d

    log_success "Docker environment is running"
    log_info "Gateway: http://localhost:3000"
    log_info "Redis: localhost:6379"
    log_info "Prometheus: http://localhost:9090"
    log_info "Grafana: http://localhost:3001 (admin/admin)"
}

# Test gateway functionality
test_gateway() {
    log_step "Testing gateway functionality..."

    # Wait for the gateway to start
    local max_attempts=30
    local attempt=1

    log_info "Waiting for gateway to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:3000/health > /dev/null 2>&1; then
            log_success "Gateway is ready"
            break
        fi

        if [ $attempt -eq $max_attempts ]; then
            log_error "Gateway failed to start within timeout"
            return 1
        fi

        log_info "Attempt $attempt/$max_attempts - waiting..."
        sleep 2
        ((attempt++))
    done

    # Run the test script
    if [ -f "test-gateway.js" ]; then
        log_info "Running gateway tests..."

        # Install test dependencies if needed
        if ! command -v colors &> /dev/null; then
            npm install colors axios
        fi

        node test-gateway.js
    else
        log_warning "test-gateway.js not found. Skipping automated tests."

        # Basic manual test
        log_info "Running basic connectivity test..."
        local health_response=$(curl -s http://localhost:3000/health)
        if echo "$health_response" | grep -q "healthy"; then
            log_success "Basic health check passed"
        else
            log_error "Basic health check failed"
            return 1
        fi
    fi
}

# Show usage information
show_usage() {
    cat << 'EOF'
Constella API Gateway Setup Script

Usage: ./setup.sh [OPTION]

Options:
  install     Install dependencies and setup environment
  build       Build the project
  dev         Start development server
  test        Run tests
  docker      Setup and start Docker environment
  monitor     Setup monitoring only
  check       Check system requirements only
  clean       Clean build artifacts and dependencies
  help        Show this help message

Examples:
  ./setup.sh install     # Full installation and setup
  ./setup.sh dev         # Start development server
  ./setup.sh docker      # Start with Docker
  ./setup.sh test        # Run tests only

Environment Variables:
  NODE_ENV              Environment (development, staging, production)
  API_GATEWAY_PORT      Port to run the gateway (default: 3000)
  SKIP_TESTS           Skip running tests during setup
  FORCE_REINSTALL      Force reinstallation of dependencies

EOF
}

# Clean up function
cleanup() {
    log_step "Cleaning up..."

    # Remove build artifacts
    rm -rf dist/
    rm -rf logs/

    # Remove dependencies
    rm -rf node_modules/

    # Remove generated files
    rm -f .env

    log_success "Cleanup completed"
}

# Main function
main() {
    local command="${1:-install}"

    case "$command" in
        "install")
            log_info "Starting Constella API Gateway installation..."
            check_root
            check_requirements
            install_dependencies
            setup_environment
            create_directories
            setup_monitoring
            build_project
            if [ "$SKIP_TESTS" != "true" ]; then
                run_tests
            fi
            log_success "Installation completed successfully!"
            log_info ""
            log_info "Next steps:"
            log_info "  1. Review and customize .env file if needed"
            log_info "  2. Run './setup.sh dev' to start development server"
            log_info "  3. Run './setup.sh docker' to start with Docker"
            ;;

        "build")
            build_project
            ;;

        "dev")
            start_dev_server
            ;;

        "test")
            run_tests
            test_gateway
            ;;

        "docker")
            setup_docker
            test_gateway
            ;;

        "monitor")
            setup_monitoring
            ;;

        "check")
            check_requirements
            ;;

        "clean")
            cleanup
            ;;

        "help"|"--help"|"-h")
            show_usage
            ;;

        *)
            log_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Script entry point
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
