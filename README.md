<p align="center">
  <img src="https://img.shields.io/badge/Constella-Enterprise%20AI%20Operating%20Platform-blue?style=for-the-badge&logo=robot&logoColor=white" alt="Constella">
</p>

<p align="center">
  <a href="https://github.com/RavenRepo/Tronagenticstar/stargazers"><img src="https://img.shields.io/github/stars/RavenRepo/Tronagenticstar?style=flat-square&logo=github&color=yellow" alt="Stars"></a>
  <a href="https://github.com/RavenRepo/Tronagenticstar/network/members"><img src="https://img.shields.io/github/forks/RavenRepo/Tronagenticstar?style=flat-square&logo=github&color=blue" alt="Forks"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/RavenRepo/Tronagenticstar?style=flat-square&color=green" alt="License"></a>
  <a href="https://github.com/RavenRepo/Tronagenticstar/releases"><img src="https://img.shields.io/github/v/release/RavenRepo/Tronagenticstar?style=flat-square&logo=github&color=purple" alt="Release"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square" alt="TypeScript">
  <img src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white&style=flat-square" alt="Python">
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white&style=flat-square" alt="Docker">
  <img src="https://img.shields.io/badge/Neo4j-008CC1?logo=neo4j&logoColor=white&style=flat-square" alt="Neo4j">
  <img src="https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white&style=flat-square" alt="OpenAI">
  <img src="https://img.shields.io/badge/Anthropic-D4A574?logo=anthropic&logoColor=black&style=flat-square" alt="Anthropic">
</p>

---

<h1 align="center">🌟 Constella</h1>

<p align="center">
  <strong>The Enterprise AI Operating Platform</strong>
</p>

<p align="center">
  A self-hosted, multi-agent ecosystem that doesn't just assist developers—it <strong>operates</strong> your entire software development lifecycle with Fortune 500 engineering standards.
</p>

<p align="center">
  <a href="#-quick-start">🚀 Quick Start</a> •
  <a href="#-architecture">🏗️ Architecture</a> •
  <a href="#-agents">🤖 Agents</a> •
  <a href="#-documentation">📚 Docs</a> •
  <a href="#-contributing">🤝 Contributing</a>
</p>

---

## ✨ What Makes Constella Different

<div align="center">

| Traditional AI Assistants | Constella |
|--------------------------|-----------|
| ❌ Isolated task completion | ✅ AI engineering organization |
| ❌ Context loss between sessions | ✅ Persistent enterprise memory |
| ❌ Generic code generation | ✅ Specialized expert agents |
| ❌ No governance or audit trails | ✅ Built-in SOC-2 compliance |
| ❌ Cloud-dependent | ✅ Self-hosted, data sovereign |

</div>

### 🧠 Chief Architect Agent

The central intelligence that orchestrates your entire engineering operation:

- **🎯 Intelligent Task Decomposition** — Breaks complex requirements into multi-agent workflows
- **🧠 Enterprise Context Awareness** — Remembers your tech stack, security policies, quality standards
- **🔄 Multi-Agent Coordination** — Routes tasks with dependency management and parallel execution
- **💾 Persistent Memory** — Never loses context across unlimited interactions

### 🎯 Specialized Agent Ecosystem

| Agent | Specialty | Status | Port |
|:------|:----------|:------:|:----:|
| **CodeCraft** | Code generation & implementation | ✅ Active | 8012 |
| **SecuriShield** | Security scanning & compliance | ⚠️ Partial | 8011 |
| **DesignForge** | Architecture & design patterns | ⚠️ Partial | 8010 |
| **PerfPulse** | Performance optimization | ✅ Compliant | 8013 |
| **Evaluator** | Quality assessment & testing | ⚠️ Partial | 8014 |
| **ExpressOps** | Node.js/Express backend | ⚠️ Stub | 8015 |
| **MobileFirstOps** | React Native/Flutter mobile | ⚠️ Stub | 8016 |
| **Database Agent** | Database design & optimization | ⚠️ Stub | 8017 |
| **SOC2-Compliance** | Enterprise compliance verification | ⚠️ Planned | 8020 |

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- [Node.js](https://nodejs.org/) 18+ (for VS Code extension)
- 8GB RAM minimum (16GB recommended)
- 10GB free disk space

### 1️⃣ Clone & Deploy

```bash
# Clone the repository
git clone https://github.com/RavenRepo/Tronagenticstar.git
cd Tronagenticstar

# Copy environment template
cp config/.env.example .env
# ✏️ Edit .env with your API keys and secrets

# Deploy entire platform
make deploy-dev

# Or use the deployment script directly
./scripts/dev/deploy.sh
```

### 2️⃣ Install VS Code Extension

```bash
cd interfaces/vscode-extension
npm install
npm run compile
code --install-extension .
```

### 3️⃣ Configure & Connect

```bash
# VS Code Settings (Cmd/Ctrl + ,)
constella.orchestratorUrl: http://localhost:8000
constella.projectId: my-awesome-project
constella.defaultTechStack: ["TypeScript", "React", "Node.js"]
```

### 4️⃣ Start Creating! ✨

| Action | Shortcut | Command |
|:-------|:--------:|:--------|
| **Orchestrate Task** | `Ctrl+Shift+C O` | Any development task |
| **Generate Feature** | `Ctrl+Shift+C F` | Feature implementation |
| **Fix Bug** | Right-click | "Constella: AI Bug Fix" |
| **Security Audit** | Folder menu | "Constella: Security Audit" |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACES                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  VS Code     │  │  Web         │  │   CLI        │              │
│  │  Extension   │  │  Dashboard   │  │  Interface   │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
└─────────┼─────────────────┼─────────────────┼──────────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │ JWT/API Key Auth
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API GATEWAY (Port 8080)                          │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  • Rate Limiting  • JWT Auth  • Service Discovery          │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR (Port 8000)                          │
│  ┌────────────────────────────────────────────────────────────┐      │
│  │  🧠 CHIEF ARCHITECT AGENT                                  │      │
│  │  • LangGraph Orchestration  • Task Decomposition           │      │
│  │  • DAG Workflows            • Multi-Agent Coordination     │      │
│  └────────────────────────────────────────────────────────────┘      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│ CORE AGENTS  │  │ FRAMEWORK    │  │    KNOWLEDGE LAYER       │
│              │  │ AGENTS       │  │                          │
│ • CodeCraft  │  │              │  │  ┌────┐ ┌────┐ ┌────┐   │
│ • SecuriShield│  │ • ExpressOps │  │  │Neo4j│ │Qdrant│ │Redis│   │
│ • DesignForge│  │ • MobileFirst│  │  │Graph│ │Vector│ │Cache│   │
│ • PerfPulse  │  │ • Database   │  │  └────┘ └────┘ └────┘   │
│ • Evaluator  │  │              │  │                          │
│ • SOC2-Comp  │  │              │  │  Semantic  Real-time   │
└──────────────┘  └──────────────┘  └──────────────────────────┘
```

### 🧬 The Enterprise Brain

Our hybrid memory system eliminates context loss forever:

| Component | Technology | Purpose |
|:----------|:-----------|:--------|
| **Knowledge Graph** | Neo4j | Maps engineering ecosystem relationships |
| **Vector Store** | Qdrant | Semantic search across docs & decisions |
| **Active Memory** | Redis | Real-time state & agent coordination |

---

## 🤖 Agents

Constella deploys **9+ specialized agents** instead of generic code generators:

### Core Agents

```
┌────────────────────────────────────────────────────────────┐
│  🎨 DESIGN & ARCHITECTURE                                    │
│  DesignForge (8010) - Architecture patterns & ADRs          │
├────────────────────────────────────────────────────────────┤
│  💻 IMPLEMENTATION                                           │
│  CodeCraft (8012) - Code generation & implementation        │
├────────────────────────────────────────────────────────────┤
│  🛡️ SECURITY & QUALITY                                       │
│  SecuriShield (8011) - Security scanning & compliance        │
│  Evaluator (8014) - Quality assessment & testing          │
├────────────────────────────────────────────────────────────┤
│  ⚡ PERFORMANCE                                             │
│  PerfPulse (8013) - Performance optimization               │
├────────────────────────────────────────────────────────────┤
│  🔧 FRAMEWORK SPECIALISTS                                    │
│  ExpressOps (8015) - Node.js/Express backend                │
│  MobileFirstOps (8016) - React Native/Flutter mobile        │
│  Database Agent (8017) - Database design & optimization     │
├────────────────────────────────────────────────────────────┤
│  🏢 ENTERPRISE                                               │
│  SOC2-Compliance (8020) - Enterprise compliance verification│
└────────────────────────────────────────────────────────────┘
```

### Agent Communication

- **Protocol**: gRPC + WebSocket for real-time updates
- **Discovery**: Service registry with health checks
- **Authentication**: Bearer token validation
- **Monitoring**: Prometheus metrics per agent

---

## 📊 Monitoring & Observability

### Dashboards

| Service | URL | Purpose |
|:--------|:----|:--------|
| **Grafana** | http://localhost:3001 | System metrics & performance |
| **Prometheus** | http://localhost:9090 | Raw metrics & alerting |
| **Neo4j Browser** | http://localhost:7474 | Knowledge graph exploration |
| **Qdrant** | http://localhost:6333/dashboard | Vector DB management |

### Health Endpoints

```bash
# Orchestrator health
curl http://localhost:8000/health

# Agent health checks
curl http://localhost:8012/health  # CodeCraft
curl http://localhost:8011/health  # SecuriShield

# Service capabilities
curl http://localhost:8000/capabilities
```

---

## 🛠️ Development

### Run Tests

```bash
# Complete test suite
make test

# Or specific test types
./scripts/tests/test.sh --unit-only
./scripts/tests/test.sh --integration-only
./scripts/tests/test.sh --security-only
```

### Development Commands

```bash
# Start development environment
make dev-up

# Rebuild specific service
make rebuild service=codecraft

# View logs
make logs service=orchestrator-py

# Run security hardening
./scripts/dev/execute-security-hardening.sh
```

### Project Structure

```
Tronagenticstar/
├── 📁 config/               # Configuration files
│   ├── .env.example
│   ├── .pre-commit-config.yaml
│   └── docker/
├── 📁 docs/                 # Documentation
│   ├── planning/           # Roadmaps & plans
│   ├── reports/            # Audit & test reports
│   └── gaps/               # Identified gaps
├── 📁 scripts/             # Automation scripts
│   ├── dev/                # Development utilities
│   ├── tests/              # Test scripts
│   └── automation/         # CI/CD pipelines
├── 📁 services/            # Microservices
│   ├── api-gateway/        # API Gateway (8080)
│   ├── orchestrator-py/    # Chief Architect (8000)
│   └── specialist-agents/ # 9+ specialized agents
├── 📁 packages/            # Shared libraries
│   └── llm-provider/       # Multi-provider LLM core
├── 📁 interfaces/          # UI components
│   └── vscode-extension/   # VS Code extension
├── 📁 frameworks/          # Agent framework docs
├── 📁 documentation/       # Full documentation site
├── 📄 docker-compose.*.yml # Docker configurations
├── 📄 Makefile            # Build automation
└── 📄 README.md           # This file
```

---

## 📚 Documentation

### Quick Links

| Document | Description |
|:---------|:------------|
| [📋 Master Knowledge](./docs/planning/MASTER_KNOWLEDGE_DOCUMENT.md) | Complete system understanding (90-agent analysis) |
| [🗺️ Architecture](./documentation/architecture/) | System design, ADRs, framework specs |
| [🔧 Developer Guides](./documentation/development/guides/) | Implementation guides & how-to |
| [📊 Integration Plans](./docs/planning/) | Roadmaps & implementation strategies |
| [📝 Contributing](./CONTRIBUTING.md) | Contribution guidelines & standards |
| [🔒 Security](./SECURITY.md) | Security policies & hardening guides |

### Architecture Decision Records (ADRs)

We document all significant technical decisions:

- ADR-001: LangGraph Primary Orchestration
- ADR-002: Multi-Model LLM Strategy
- ADR-003: Hybrid Datastore (Neo4j + Qdrant + Redis)
- ADR-004: Chief-Architect Build Bank Pattern
- [View all 12 ADRs](./documentation/architecture/adr/)

---

## 🏢 Enterprise Features

### SOC-2 Compliance Built-In

- ✅ **Audit Trails** — Every agent action logged
- ✅ **Policy Enforcement** — Automatic rule validation
- ✅ **Data Sovereignty** — Self-hosted, air-gapped options
- ✅ **RBAC Integration** — Role-based access control
- ✅ **Compliance Reporting** — Automated audit reports

### Scalability

```yaml
Horizontal Scaling:
  - Kubernetes deployment manifests
  - Auto-scaling based on load
  - Multi-region support
  
Performance:
  - Connection pooling
  - Redis caching layer
  - Vector search optimization
  - Circuit breaker patterns
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Quick Start for Contributors

```bash
# Fork & clone
git clone https://github.com/YOUR_USERNAME/Tronagenticstar.git

# Create feature branch
git checkout -b feat/your-feature-name

# Make changes following our standards
# - Add tests
# - Update docs
# - Follow existing patterns

# Run tests
make test

# Submit PR
gh pr create --title "feat: your feature description"
```

### Code Standards

- 🧪 **Tests required** for new features
- 📚 **Documentation updated** for API changes
- 🔒 **Security reviewed** for auth/credential code
- 🎯 **Follow existing patterns** in each service

---

## 🔍 Troubleshooting

### Common Issues

<details>
<summary><b>Services won't start</b></summary>

```bash
# Check Docker daemon
docker info

# View service logs
make logs service=api-gateway

# Check port conflicts
make check-ports
```
</details>

<details>
<summary><b>VS Code Extension not connecting</b></summary>

```bash
# Verify orchestrator health
curl http://localhost:8000/health

# Check extension is installed
code --list-extensions | grep constella

# Restart VS Code
```
</details>

<details>
<summary><b>WebSocket connection issues</b></summary>

```bash
# Test WebSocket
wscat -c ws://localhost:8000/ws -x '{"type":"ping"}'

# Check firewall
sudo ufw status
```
</details>

### Support Channels

- 🐛 [Issues](https://github.com/RavenRepo/Tronagenticstar/issues)
- 💬 [Discussions](./docs/discussion.md)
- 📧 Email: support@constella.ai

---

## 📈 Project Status

<div align="center">

**Phase 1: Foundation** — 60% Complete

| Service | Status |
|:--------|:------:|
| API Gateway | ⚠️ Partial |
| CodeCraft Agent | ✅ Active |
| SecuriShield | ⚠️ Partial |
| DesignForge | ⚠️ Partial |
| PerfPulse | ✅ Compliant |
| Evaluator | ⚠️ Partial |
| SOC2-Compliance | 📋 Planned |

</div>

---

## 📄 License

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="MIT License">
  </a>
</p>

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.

---

## 🌟 The Vision

> *"Constella represents more than a product—it's a fundamental shift in how software gets built. We're not just automating tasks; we're elevating the entire practice of software engineering."*

**The question isn't whether AI will transform software development—it's whether you'll lead that transformation or be disrupted by it.**

---

<p align="center">
  <strong>Constella: Where AI doesn't just assist—it operates.</strong> 🚀
</p>

<p align="center">
  <a href="#-quick-start">⬆️ Back to Top</a>
</p>
