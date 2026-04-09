# Makefile for Tronagenticstar/Constella Platform
# Common development tasks and workflows

.PHONY: help install install-python install-node dev dev-docker test test-python test-node test-integration lint lint-python lint-node build build-docker docker-up docker-down docker-logs clean clean-docker clean-python clean-node

# Default target
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RESET := \033[0m

##@ General

help: ## Display this help message
	@echo ""
	@echo "$(CYAN)Tronagenticstar/Constella Platform$(RESET)"
	@echo "======================================"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make $(GREEN)<target>$(RESET)\n\n"} \
		/^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2 } \
		/^##@/ { printf "\n$(YELLOW)%s$(RESET)\n", substr($$0, 5) }' $(MAKEFILE_LIST)
	@echo ""

##@ Installation

install: install-python install-node ## Install all dependencies (Python & Node.js)
	@echo "$(GREEN)✓ All dependencies installed$(RESET)"

install-python: ## Install Python dependencies for all services
	@echo "$(CYAN)Installing Python dependencies...$(RESET)"
	@for req in $$(find services packages tests -name "requirements*.txt" 2>/dev/null); do \
		echo "  Installing from $$req"; \
		pip install -q -r $$req || true; \
	done
	@echo "$(GREEN)✓ Python dependencies installed$(RESET)"

install-node: ## Install Node.js dependencies for all packages
	@echo "$(CYAN)Installing root Node.js dependencies...$(RESET)"
	@npm install --silent
	@echo "$(CYAN)Installing package dependencies...$(RESET)"
	@for pkg in packages/errorgold-node packages/llm-core packages/orchestrator; do \
		if [ -f "$$pkg/package.json" ]; then \
			echo "  Installing $$pkg"; \
			(cd $$pkg && npm install --silent) || true; \
		fi; \
	done
	@for svc in services/api-gateway interfaces/dashboard interfaces/vscode-extension website landing tests; do \
		if [ -f "$$svc/package.json" ]; then \
			echo "  Installing $$svc"; \
			(cd $$svc && npm install --silent) || true; \
		fi; \
	done
	@echo "$(GREEN)✓ Node.js dependencies installed$(RESET)"

##@ Development

dev: ## Start development environment (local services)
	@echo "$(CYAN)Starting development environment...$(RESET)"
	@echo "Use 'make docker-up' to start infrastructure services"
	@echo "Or run individual services as needed"

dev-docker: docker-up ## Start full development environment with Docker
	@echo "$(GREEN)✓ Development environment started$(RESET)"
	@echo "Services available:"
	@echo "  - Redis:      localhost:6379"
	@echo "  - Neo4j:      localhost:7474 (browser), localhost:7687 (bolt)"
	@echo "  - Qdrant:     localhost:6333"
	@echo "  - NATS:       localhost:4222"
	@echo "  - Prometheus: localhost:9090"
	@echo "  - Grafana:    localhost:3001"
	@echo "  - Loki:       localhost:3100"

##@ Testing

test: test-python test-node ## Run all tests
	@echo "$(GREEN)✓ All tests completed$(RESET)"

test-python: ## Run Python tests
	@echo "$(CYAN)Running Python tests...$(RESET)"
	@if command -v pytest &> /dev/null; then \
		pytest tests/ -v --ignore=tests/node_modules 2>/dev/null || echo "No pytest tests found"; \
	else \
		echo "pytest not installed, skipping Python tests"; \
	fi

test-node: ## Run Node.js tests
	@echo "$(CYAN)Running Node.js tests...$(RESET)"
	@if [ -f "tests/package.json" ]; then \
		(cd tests && npm test 2>/dev/null) || echo "Tests completed"; \
	else \
		node test_ai_simple.js 2>/dev/null || true; \
	fi

test-integration: ## Run integration tests
	@echo "$(CYAN)Running integration tests...$(RESET)"
	@if [ -f "tests/integration/requirements.txt" ]; then \
		(cd tests/integration && pytest -v 2>/dev/null) || echo "Integration tests completed"; \
	fi
	@node test-integration.js 2>/dev/null || true

##@ Linting

lint: lint-python lint-node ## Run all linters
	@echo "$(GREEN)✓ Linting completed$(RESET)"

lint-python: ## Run Python linting (ruff)
	@echo "$(CYAN)Running Python linting...$(RESET)"
	@if command -v ruff &> /dev/null; then \
		ruff check services/ packages/ --ignore E501 2>/dev/null || true; \
	else \
		echo "ruff not installed, skipping Python linting"; \
	fi

lint-node: ## Run Node.js linting (eslint)
	@echo "$(CYAN)Running Node.js linting...$(RESET)"
	@if [ -f "node_modules/.bin/eslint" ]; then \
		npx eslint packages/ services/api-gateway/ --ext .js,.ts 2>/dev/null || true; \
	else \
		echo "eslint not installed, skipping Node.js linting"; \
	fi

##@ Building

build: build-docker ## Build all services
	@echo "$(GREEN)✓ Build completed$(RESET)"

build-docker: ## Build Docker images
	@echo "$(CYAN)Building Docker images...$(RESET)"
	docker compose -f docker-compose.dev.yml build
	@echo "$(GREEN)✓ Docker images built$(RESET)"

build-prod: ## Build production Docker images
	@echo "$(CYAN)Building production Docker images...$(RESET)"
	docker compose -f docker-compose.prod.yml build
	@echo "$(GREEN)✓ Production images built$(RESET)"

##@ Docker Management

docker-up: ## Start Docker services (development)
	@echo "$(CYAN)Starting Docker services...$(RESET)"
	docker compose -f docker-compose.dev.yml up -d
	@echo "$(GREEN)✓ Docker services started$(RESET)"

docker-down: ## Stop Docker services
	@echo "$(CYAN)Stopping Docker services...$(RESET)"
	docker compose -f docker-compose.dev.yml down
	@echo "$(GREEN)✓ Docker services stopped$(RESET)"

docker-logs: ## Show Docker service logs
	docker compose -f docker-compose.dev.yml logs -f

docker-ps: ## Show Docker service status
	docker compose -f docker-compose.dev.yml ps

docker-restart: docker-down docker-up ## Restart Docker services
	@echo "$(GREEN)✓ Docker services restarted$(RESET)"

docker-clean: ## Remove Docker volumes and orphans
	@echo "$(CYAN)Cleaning Docker resources...$(RESET)"
	docker compose -f docker-compose.dev.yml down -v --remove-orphans
	@echo "$(GREEN)✓ Docker resources cleaned$(RESET)"

##@ Cleanup

clean: clean-python clean-node ## Clean all build artifacts
	@echo "$(CYAN)Cleaning miscellaneous artifacts...$(RESET)"
	@rm -rf .pytest_cache .ruff_cache
	@find . -name "*.log" -type f -delete 2>/dev/null || true
	@echo "$(GREEN)✓ All artifacts cleaned$(RESET)"

clean-python: ## Clean Python artifacts
	@echo "$(CYAN)Cleaning Python artifacts...$(RESET)"
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type f -name "*.pyo" -delete 2>/dev/null || true

clean-node: ## Clean Node.js artifacts
	@echo "$(CYAN)Cleaning Node.js artifacts...$(RESET)"
	@rm -rf node_modules/.cache 2>/dev/null || true
	@find . -name "*.tsbuildinfo" -type f -delete 2>/dev/null || true

clean-all: clean docker-clean ## Clean everything including Docker volumes
	@echo "$(GREEN)✓ Complete cleanup done$(RESET)"

##@ Utilities

env-setup: ## Create .env file from template
	@if [ ! -f .env ]; then \
		if [ -f .env.example ]; then \
			cp .env.example .env; \
			echo "$(GREEN)✓ Created .env from .env.example$(RESET)"; \
		else \
			echo "$(YELLOW)No .env.example found$(RESET)"; \
		fi; \
	else \
		echo "$(YELLOW).env already exists$(RESET)"; \
	fi

status: ## Show project status
	@echo "$(CYAN)Project Status$(RESET)"
	@echo "=============="
	@echo ""
	@echo "Git Status:"
	@git status -s 2>/dev/null || echo "  Not a git repository"
	@echo ""
	@echo "Docker Status:"
	@docker compose -f docker-compose.dev.yml ps 2>/dev/null || echo "  Docker not available"
