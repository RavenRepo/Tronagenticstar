# Security & Compliance

AgentForge targets **SOC-2 Type 2** compliance by default. This file maps controls to concrete implementation tasks.

## Control Matrix
| SOC-2 Principle | Control | Implementation Artifact |
|-----------------|---------|-------------------------|
| Security | Input validation | `agentforge_core/validators.py`, OWASP rules |
| Availability | Health checks | `/healthz` endpoint, K8s readiness probes |
| Confidentiality | Encryption in transit | Istio mTLS, HTTPS enforced |
| Processing Integrity | Audit logging | OTEL traces + Loki logs retained 1 year |
| Privacy | Data retention | RetrieverService anonymization + TTL |

## Compliance Agents
1. **TrustKeeper Agent** – scans config & infra, raises alerts on drift.
2. **SecuriShield Agent** – runs Semgrep, Bandit, npm audit, docker scans.
3. **ErrorGuardian Agent** – verifies ErrorGold exceptions contain PII-free stack traces.

## Vault Integration
* HashiCorp Vault used for secrets; SDK wrapper in `agentforge_core/secrets.py`.

## Periodic Tasks
* Quarterly penetration test (external vendor).
* Monthly dependency CVE audit (Renovate bot auto-PRs).

---
*Owner*: SecuriShield Agent. 