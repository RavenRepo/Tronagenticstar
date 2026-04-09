#!/usr/bin/env python3
"""
Constella/Tronagenticstar Project Understanding Pipeline
=========================================================
Deploys 90 agents in parallel to comprehensively understand and document
the entire enterprise AI operating platform.

Agent Distribution:
- 18 Service Analyzers (one per microservice)
- 14 Framework Deep-Dive Agents
- 10 Documentation Synthesis Agents
- 8 Interface/UI Analyzers
- 8 Security Audit Agents
- 8 DevOps/Infrastructure Agents
- 6 Memory/Knowledge Graph Agents
- 6 Integration Pattern Agents
- 6 Gap Analysis Agents
- 6 Test Infrastructure Agents
= 90 Total Agents
"""

from agentflow import Graph, opencode, fanout, merge

# Project context for all agents
PROJECT_ROOT = "/home/luciousfox/Projects/Tronagenticstar-from-mint"
PROJECT_CONTEXT = f"""
You are analyzing 'Constella: Enterprise AI Operating Platform' located at {PROJECT_ROOT}.
This is a self-hosted, multi-agent ecosystem for software development lifecycle management.

Key technologies: LangGraph, LangChain, Python 3.11+, Neo4j, Qdrant, Redis, Kafka, Docker.
Core concept: Chief Architect agent orchestrates specialized "Gold Standard" agents.
"""

# ============================================================================
# PHASE 1: SERVICE ANALYZERS (18 agents)
# ============================================================================
SERVICES = [
    {"name": "orchestrator-py", "port": 8000, "role": "Core orchestration and Chief Architect"},
    {"name": "codecraft", "port": 8012, "role": "Code generation and implementation"},
    {"name": "securishield", "port": 8011, "role": "Security scanning and compliance"},
    {"name": "designforge", "port": 8010, "role": "Architecture and design patterns"},
    {"name": "perfpulse", "port": 8013, "role": "Performance optimization"},
    {"name": "evaluator", "port": 8014, "role": "Quality assessment and testing"},
    {"name": "expressops", "port": 8015, "role": "Express.js/Node.js backend specialist"},
    {"name": "mobilefirstops", "port": 8016, "role": "React Native/Flutter mobile development"},
    {"name": "database-agent", "port": 8017, "role": "Database design and optimization"},
    {"name": "soc2-compliance", "port": 8020, "role": "Enterprise compliance verification"},
    {"name": "api-gateway", "port": 8080, "role": "Unified API gateway and routing"},
    {"name": "memory-guardian", "port": 8021, "role": "Memory persistence and management"},
    {"name": "embedding", "port": 8030, "role": "Vector embeddings generation"},
    {"name": "retriever", "port": 8031, "role": "RAG retrieval service"},
    {"name": "sandbox-executor", "port": 8040, "role": "Safe code execution environment"},
    {"name": "python-expert", "port": 8050, "role": "Python-specific code analysis"},
    {"name": "errorgold-listener", "port": 8060, "role": "Error tracking and resolution"},
]

# ============================================================================
# PHASE 2: FRAMEWORK ANALYZERS (14 agents)
# ============================================================================
FRAMEWORKS = [
    {"name": "agentforge", "file": "frameworks/agentforge/README.md", "focus": "Core agent framework architecture"},
    {"name": "agentforge-architecture", "file": "frameworks/agentforge/architecture.md", "focus": "System architecture patterns"},
    {"name": "agentforge-memory", "file": "frameworks/agentforge/memory_bank_structure.md", "focus": "Memory bank design"},
    {"name": "agentforge-comms", "file": "frameworks/agentforge/communication_protocols.md", "focus": "Inter-agent communication"},
    {"name": "agentforge-security", "file": "frameworks/agentforge/security_and_compliance.md", "focus": "Security patterns"},
    {"name": "agentforge-quality", "file": "frameworks/agentforge/quality_gates.md", "focus": "Quality control mechanisms"},
    {"name": "agentforge-dev", "file": "frameworks/agentforge/development_patterns.md", "focus": "Development best practices"},
    {"name": "chiefarchitect", "file": "frameworks/chiefarchitectrules.mdc", "focus": "Chief Architect agent rules"},
    {"name": "databasearchitect", "file": "frameworks/databaseArchitectFramework.mdc", "focus": "Database agent framework"},
    {"name": "devopsengr", "file": "frameworks/devopsEngineerFramework.mdc", "focus": "DevOps agent framework"},
    {"name": "deployengr", "file": "frameworks/deploymentEngineerFramework.mdc", "focus": "Deployment automation"},
    {"name": "securityops", "file": "frameworks/securityOpsFramework.mdc", "focus": "Security operations"},
    {"name": "errorgold", "file": "frameworks/universal-errorgold-framework.md", "focus": "Error resolution framework"},
    {"name": "laravelbackend", "file": "frameworks/Laravelbackendcraft.mdc", "focus": "Laravel backend patterns"},
]

# ============================================================================
# PHASE 3: DOCUMENTATION ANALYZERS (10 agents)
# ============================================================================
DOCS = [
    {"area": "architecture", "path": "documentation/architecture/", "focus": "System architecture and ADRs"},
    {"area": "development-guides", "path": "documentation/development/guides/", "focus": "Developer implementation guides"},
    {"area": "implementation", "path": "documentation/development/implementation/", "focus": "Current phase progress"},
    {"area": "business", "path": "documentation/business/", "focus": "PRDs, roadmaps, strategy"},
    {"area": "reports", "path": "documentation/reports/", "focus": "Project status and audits"},
    {"area": "gaps", "path": "gaps-to-be-filled/", "focus": "Critical implementation gaps"},
    {"area": "docs-main", "path": "docs/", "focus": "Main docs folder structure"},
    {"area": "readme-main", "path": "README.md", "focus": "Project overview and quick start"},
    {"area": "changelog", "path": "CHANGELOG.md", "focus": "Version history and changes"},
    {"area": "memory-json", "path": "memory.json", "focus": "Project memory and state"},
]

# ============================================================================
# PHASE 4: INTERFACE ANALYZERS (8 agents)
# ============================================================================
INTERFACES = [
    {"name": "vscode-ext", "path": "agentforge-vscode/", "focus": "VS Code extension architecture"},
    {"name": "vscode-panels", "path": "agentforge-vscode/src/panels/", "focus": "VS Code panel implementations"},
    {"name": "vscode-services", "path": "agentforge-vscode/src/services/", "focus": "VS Code service layer"},
    {"name": "dashboard", "path": "interfaces/dashboard/", "focus": "Web dashboard interface"},
    {"name": "landing", "path": "landing/", "focus": "Landing page and marketing"},
    {"name": "website", "path": "website/", "focus": "Documentation website"},
    {"name": "cli-tools", "path": "tools/", "focus": "CLI tools and utilities"},
    {"name": "scripts", "path": "scripts/", "focus": "Deployment and utility scripts"},
]

# ============================================================================
# PHASE 5: SECURITY AUDIT AGENTS (8 agents)
# ============================================================================
SECURITY_AREAS = [
    {"area": "secrets", "focus": "Scan for hardcoded secrets and credentials in all configs"},
    {"area": "auth", "focus": "Analyze authentication patterns across all services"},
    {"area": "cors-csrf", "focus": "Review CORS configuration and CSRF protection"},
    {"area": "input-validation", "focus": "Assess input validation and sanitization"},
    {"area": "docker-security", "focus": "Review Dockerfile and compose security"},
    {"area": "api-security", "focus": "Analyze API endpoint security and rate limiting"},
    {"area": "mtls", "focus": "Assess service-to-service authentication needs"},
    {"area": "compliance", "focus": "SOC2 compliance readiness assessment"},
]

# ============================================================================
# PHASE 6: DEVOPS INFRASTRUCTURE AGENTS (8 agents)
# ============================================================================
DEVOPS_AREAS = [
    {"area": "docker-compose", "focus": "Analyze docker-compose.dev.yml and docker-compose.prod.yml"},
    {"area": "nginx", "focus": "Review nginx.conf and reverse proxy setup"},
    {"area": "github-actions", "focus": "Analyze .github/ workflows and CI/CD"},
    {"area": "deployment-scripts", "focus": "Review deployment automation scripts"},
    {"area": "monitoring", "focus": "Prometheus, Grafana, Loki observability stack"},
    {"area": "env-configs", "focus": "Analyze .env files and configuration management"},
    {"area": "kubernetes", "focus": "Assess Kubernetes readiness in devops/ folder"},
    {"area": "healthchecks", "focus": "Review health check endpoints across services"},
]

# ============================================================================
# PHASE 7: MEMORY & KNOWLEDGE GRAPH AGENTS (6 agents)
# ============================================================================
MEMORY_AREAS = [
    {"area": "neo4j", "focus": "Neo4j knowledge graph schema and integration"},
    {"area": "qdrant", "focus": "Qdrant vector database and semantic search"},
    {"area": "redis", "focus": "Redis caching and real-time state management"},
    {"area": "kafka", "focus": "Apache Kafka message queue integration"},
    {"area": "memory-service", "focus": "Memory Guardian service implementation"},
    {"area": "embedding-rag", "focus": "Embedding and RAG pipeline architecture"},
]

# ============================================================================
# PHASE 8: INTEGRATION PATTERN AGENTS (6 agents)
# ============================================================================
INTEGRATION_AREAS = [
    {"area": "llm-providers", "focus": "Multi-provider LLM integration (Claude, GPT-4, etc.)"},
    {"area": "websocket", "focus": "WebSocket real-time communication patterns"},
    {"area": "agent-comms", "focus": "Inter-agent communication protocols"},
    {"area": "api-contracts", "focus": "API contracts between services"},
    {"area": "event-driven", "focus": "Event-driven architecture patterns"},
    {"area": "orchestration", "focus": "Task orchestration and workflow patterns"},
]

# ============================================================================
# PHASE 9: GAP ANALYSIS AGENTS (6 agents)
# ============================================================================
GAPS = [
    {"gap": "api-gateway", "file": "gaps-to-be-filled/01-unified-api-gateway.md"},
    {"gap": "llm-specialization", "file": "gaps-to-be-filled/02-llm-specialization.md"},
    {"gap": "soc2-enforcement", "file": "gaps-to-be-filled/05-soc2-enforcement.md"},
    {"gap": "production-deploy", "file": "gaps-to-be-filled/07-production-deployment.md"},
    {"gap": "testing-framework", "file": "gaps-to-be-filled/", "focus": "All testing gaps"},
    {"gap": "integration-gaps", "file": "gaps-to-be-filled/", "focus": "All integration gaps"},
]

# ============================================================================
# PHASE 10: TEST INFRASTRUCTURE AGENTS (6 agents)
# ============================================================================
TEST_AREAS = [
    {"area": "test-scripts", "focus": "Analyze test scripts in tests/ folder"},
    {"area": "integration-tests", "focus": "Review test-integration.js and integration tests"},
    {"area": "ai-tests", "focus": "Analyze test_ai_agents.js and AI testing"},
    {"area": "memory-tests", "focus": "Review test_memory_system.py"},
    {"area": "security-tests", "focus": "Review test-security-hardening.sh"},
    {"area": "test-report", "focus": "Analyze TEST_REPORT.md for current test status"},
]


# ============================================================================
# BUILD THE PIPELINE
# ============================================================================

with Graph("constella-understanding", concurrency=15, scratchboard=True) as g:
    
    # ==========================================================================
    # COORDINATOR NODE - Creates the master plan
    # ==========================================================================
    coordinator = opencode(
        task_id="coordinator",
        prompt=f"""
{PROJECT_CONTEXT}

You are the SWARM COORDINATOR. Create a master analysis plan for 90 agents about to analyze this project.

Review the project structure at {PROJECT_ROOT} and output:
1. Brief project overview (2-3 sentences)
2. Key architectural decisions to investigate
3. Critical integration points between subsystems
4. Priority areas for deep analysis

This plan will guide all subsequent analysis agents.
"""
    )
    
    # ==========================================================================
    # PHASE 1: SERVICE ANALYSIS FANOUT (18 agents)
    # ==========================================================================
    service_analysts = fanout(
        opencode(
            task_id="service-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

COORDINATION CONTEXT: {{{{ nodes.coordinator.output }}}}

You are analyzing the **{{{{ item.name }}}}** service (port {{{{ item.port }}}}).
Role: {{{{ item.role }}}}

Analyze {PROJECT_ROOT}/services/{{{{ item.name }}}}/ and document:
1. Service architecture and main entry point
2. API endpoints and their purposes
3. Dependencies (internal services and external libraries)
4. Configuration requirements
5. Integration points with other Constella services
6. Current implementation status (working/partial/stub)
7. Key files and their purposes

Output a structured JSON summary.
"""
        ),
        SERVICES
    )
    
    # ==========================================================================
    # PHASE 2: FRAMEWORK ANALYSIS FANOUT (14 agents)
    # ==========================================================================
    framework_analysts = fanout(
        opencode(
            task_id="framework-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

You are analyzing the **{{{{ item.name }}}}** framework component.
Focus: {{{{ item.focus }}}}
File: {PROJECT_ROOT}/{{{{ item.file }}}}

Document:
1. Purpose and role in the Constella ecosystem
2. Key concepts and patterns defined
3. How other components should use this framework
4. Integration requirements
5. Any gaps or incomplete sections

Output structured findings.
"""
        ),
        FRAMEWORKS
    )
    
    # ==========================================================================
    # PHASE 3: DOCUMENTATION SYNTHESIS FANOUT (10 agents)
    # ==========================================================================
    doc_analysts = fanout(
        opencode(
            task_id="doc-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

You are analyzing documentation in the **{{{{ item.area }}}}** area.
Path: {PROJECT_ROOT}/{{{{ item.path }}}}
Focus: {{{{ item.focus }}}}

Synthesize:
1. Key information documented
2. Architecture decisions recorded
3. Implementation guidance provided
4. Status tracking information
5. Any gaps or outdated information

Output a documentation summary.
"""
        ),
        DOCS
    )
    
    # ==========================================================================
    # PHASE 4: INTERFACE ANALYSIS FANOUT (8 agents)
    # ==========================================================================
    interface_analysts = fanout(
        opencode(
            task_id="interface-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

You are analyzing the **{{{{ item.name }}}}** interface/tool.
Path: {PROJECT_ROOT}/{{{{ item.path }}}}
Focus: {{{{ item.focus }}}}

Analyze:
1. Interface architecture and components
2. User interaction patterns
3. Backend API integration
4. Technology stack used
5. Current implementation status
6. Key features and capabilities

Output interface analysis.
"""
        ),
        INTERFACES
    )
    
    # ==========================================================================
    # PHASE 5: SECURITY AUDIT FANOUT (8 agents)
    # ==========================================================================
    security_auditors = fanout(
        opencode(
            task_id="security-audit",
            prompt=f"""
{PROJECT_CONTEXT}

You are performing a SECURITY AUDIT focusing on **{{{{ item.area }}}}**.
Focus: {{{{ item.focus }}}}

Scan the entire project at {PROJECT_ROOT} for:
1. Security vulnerabilities in this area
2. Best practice violations
3. Potential attack vectors
4. Remediation recommendations
5. Priority level (critical/high/medium/low)

Reference: Check constella_audit_report.json for known issues.
Output security findings in structured format.
"""
        ),
        SECURITY_AREAS
    )
    
    # ==========================================================================
    # PHASE 6: DEVOPS INFRASTRUCTURE FANOUT (8 agents)
    # ==========================================================================
    devops_analysts = fanout(
        opencode(
            task_id="devops-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

You are analyzing DevOps/Infrastructure in **{{{{ item.area }}}}**.
Focus: {{{{ item.focus }}}}

Analyze the infrastructure at {PROJECT_ROOT} for:
1. Current configuration and setup
2. Deployment readiness
3. Scalability considerations
4. Monitoring and observability
5. Improvement recommendations

Output infrastructure analysis.
"""
        ),
        DEVOPS_AREAS
    )
    
    # ==========================================================================
    # PHASE 7: MEMORY & KNOWLEDGE GRAPH FANOUT (6 agents)
    # ==========================================================================
    memory_analysts = fanout(
        opencode(
            task_id="memory-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

You are analyzing the memory/knowledge system: **{{{{ item.area }}}}**.
Focus: {{{{ item.focus }}}}

Analyze at {PROJECT_ROOT}:
1. Schema and data model
2. Integration patterns
3. Query patterns and access methods
4. Performance considerations
5. Current implementation status

Output memory system analysis.
"""
        ),
        MEMORY_AREAS
    )
    
    # ==========================================================================
    # PHASE 8: INTEGRATION PATTERNS FANOUT (6 agents)
    # ==========================================================================
    integration_analysts = fanout(
        opencode(
            task_id="integration-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

You are analyzing integration patterns: **{{{{ item.area }}}}**.
Focus: {{{{ item.focus }}}}

Analyze at {PROJECT_ROOT}:
1. Current integration implementation
2. Communication protocols used
3. Data flow patterns
4. Error handling approaches
5. Improvement opportunities

Output integration analysis.
"""
        ),
        INTEGRATION_AREAS
    )
    
    # ==========================================================================
    # PHASE 9: GAP ANALYSIS FANOUT (6 agents)
    # ==========================================================================
    gap_analysts = fanout(
        opencode(
            task_id="gap-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

You are analyzing implementation gap: **{{{{ item.gap }}}}**.
Reference: {PROJECT_ROOT}/{{{{ item.file }}}}

Analyze:
1. What the gap specification requires
2. Current implementation status
3. Dependencies and blockers
4. Estimated effort to close the gap
5. Priority and business impact

Output gap analysis.
"""
        ),
        GAPS
    )
    
    # ==========================================================================
    # PHASE 10: TEST INFRASTRUCTURE FANOUT (6 agents)
    # ==========================================================================
    test_analysts = fanout(
        opencode(
            task_id="test-analysis",
            prompt=f"""
{PROJECT_CONTEXT}

You are analyzing test infrastructure: **{{{{ item.area }}}}**.
Focus: {{{{ item.focus }}}}

Analyze at {PROJECT_ROOT}:
1. Test coverage and types
2. Testing frameworks used
3. CI/CD integration
4. Test quality and reliability
5. Gaps in test coverage

Output test infrastructure analysis.
"""
        ),
        TEST_AREAS
    )
    
    # ==========================================================================
    # MERGE PHASES - Consolidate findings by category
    # ==========================================================================
    
    service_summary = opencode(
        task_id="service-summary",
        prompt="""
Synthesize all service analysis results into a comprehensive SERVICE LAYER REPORT:

{% for r in fanouts['service-analysis'].nodes %}
### {{ r.context.name }}
{{ r.output }}
{% endfor %}

Create a unified summary covering:
1. Overall service architecture health
2. Key integration points between services
3. Critical dependencies
4. Implementation completeness by service
5. Priority recommendations
"""
    )
    
    framework_summary = opencode(
        task_id="framework-summary",
        prompt="""
Synthesize all framework analysis into a FRAMEWORK LAYER REPORT:

{% for r in fanouts['framework-analysis'].nodes %}
### {{ r.context.name }}
{{ r.output }}
{% endfor %}

Create a summary covering:
1. Framework cohesion and consistency
2. Key patterns and standards defined
3. Gaps in framework coverage
4. Adoption recommendations
"""
    )
    
    security_summary = opencode(
        task_id="security-summary",
        prompt="""
Synthesize all security findings into a SECURITY AUDIT REPORT:

{% for r in fanouts['security-audit'].nodes %}
### {{ r.context.area }}
{{ r.output }}
{% endfor %}

Create a priority-ordered security report with:
1. Critical issues requiring immediate action
2. High-priority vulnerabilities
3. Medium-priority improvements
4. Overall security posture assessment
"""
    )
    
    infrastructure_summary = opencode(
        task_id="infrastructure-summary",
        prompt="""
Synthesize DevOps and infrastructure findings:

{% for r in fanouts['devops-analysis'].nodes %}
### {{ r.context.area }}
{{ r.output }}
{% endfor %}

{% for r in fanouts['memory-analysis'].nodes %}
### Memory: {{ r.context.area }}
{{ r.output }}
{% endfor %}

Create an INFRASTRUCTURE REPORT covering:
1. Deployment readiness assessment
2. Scalability evaluation
3. Monitoring completeness
4. Infrastructure recommendations
"""
    )
    
    # ==========================================================================
    # FINAL SYNTHESIS - Master Knowledge Document
    # ==========================================================================
    
    master_synthesis = opencode(
        task_id="master-synthesis",
        prompt="""
You are creating the MASTER KNOWLEDGE DOCUMENT for the Constella/Tronagenticstar project.

COORDINATION PLAN:
{{ nodes.coordinator.output }}

SERVICE LAYER:
{{ nodes['service-summary'].output }}

FRAMEWORK LAYER:
{{ nodes['framework-summary'].output }}

SECURITY ASSESSMENT:
{{ nodes['security-summary'].output }}

INFRASTRUCTURE:
{{ nodes['infrastructure-summary'].output }}

DOCUMENTATION (from fanouts):
{% for r in fanouts['doc-analysis'].nodes %}
- {{ r.context.area }}: Key findings captured
{% endfor %}

INTERFACES (from fanouts):
{% for r in fanouts['interface-analysis'].nodes %}
- {{ r.context.name }}: Analysis complete
{% endfor %}

GAP ANALYSIS (from fanouts):
{% for r in fanouts['gap-analysis'].nodes %}
- {{ r.context.gap }}: Gap status documented
{% endfor %}

TEST INFRASTRUCTURE (from fanouts):
{% for r in fanouts['test-analysis'].nodes %}
- {{ r.context.area }}: Tests analyzed
{% endfor %}

INTEGRATION PATTERNS (from fanouts):
{% for r in fanouts['integration-analysis'].nodes %}
- {{ r.context.area }}: Patterns documented
{% endfor %}

---

Create a comprehensive MASTER KNOWLEDGE DOCUMENT that includes:

# 1. EXECUTIVE SUMMARY
Brief overview of Constella as an Enterprise AI Operating Platform

# 2. ARCHITECTURE OVERVIEW
- System architecture diagram description
- Core components and their relationships
- Data flow patterns

# 3. SERVICE CATALOG
Complete catalog of all 18 services with status

# 4. AGENT ECOSYSTEM
- Chief Architect role
- Specialized agents and their capabilities
- Agent communication patterns

# 5. KNOWLEDGE & MEMORY SYSTEMS
- Neo4j knowledge graph purpose
- Qdrant vector search capabilities
- Redis real-time state management

# 6. SECURITY POSTURE
Priority-ordered security findings and remediation roadmap

# 7. IMPLEMENTATION STATUS
- What's complete
- What's in progress
- Critical gaps to address

# 8. RECOMMENDED NEXT ACTIONS
Priority-ordered action items for project advancement

# 9. TECHNOLOGY MATRIX
Complete tech stack reference

Output this as a well-structured markdown document.
"""
    )
    
    # ==========================================================================
    # DEFINE DEPENDENCIES
    # ==========================================================================
    
    # Coordinator feeds all fanouts
    coordinator >> service_analysts
    coordinator >> framework_analysts
    coordinator >> doc_analysts
    coordinator >> interface_analysts
    coordinator >> security_auditors
    coordinator >> devops_analysts
    coordinator >> memory_analysts
    coordinator >> integration_analysts
    coordinator >> gap_analysts
    coordinator >> test_analysts
    
    # Fanouts feed summaries
    service_analysts >> service_summary
    framework_analysts >> framework_summary
    security_auditors >> security_summary
    devops_analysts >> infrastructure_summary
    memory_analysts >> infrastructure_summary
    
    # Summaries feed master synthesis
    service_summary >> master_synthesis
    framework_summary >> master_synthesis
    security_summary >> master_synthesis
    infrastructure_summary >> master_synthesis
    doc_analysts >> master_synthesis
    interface_analysts >> master_synthesis
    gap_analysts >> master_synthesis
    test_analysts >> master_synthesis
    integration_analysts >> master_synthesis


if __name__ == "__main__":
    print("=" * 70)
    print("CONSTELLA/TRONAGENTICSTAR 90-AGENT UNDERSTANDING SWARM")
    print("=" * 70)
    print(f"""
Agent Distribution:
  - 18 Service Analyzers
  - 14 Framework Analyzers  
  - 10 Documentation Synthesizers
  - 8 Interface Analyzers
  - 8 Security Auditors
  - 8 DevOps/Infrastructure Analyzers
  - 6 Memory/Knowledge Analyzers
  - 6 Integration Pattern Analyzers
  - 6 Gap Analysis Agents
  - 6 Test Infrastructure Analyzers
  + 1 Coordinator
  + 5 Summary Synthesizers (service, framework, security, infra, master)
  ─────────────────────────────
  = 96 Total Agent Invocations (90 analysis + 6 synthesis)

Concurrency: 15 parallel agents
Scratchboard: Enabled for shared memory

Run with: agentflow run constella_swarm_pipeline.py
    """)
    print("=" * 70)
