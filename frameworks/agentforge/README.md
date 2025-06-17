# AgentForge Framework (Refactored)

This directory hosts the **living, modular documentation & reference implementation** of the AgentForge / CAFS multi-agent framework.

Why a new folder?
1. **Split large monolith** `frameworks/agentforge.md` into focused, maintainable docs.
2. **Align with current roadmap** – ErrorGold, RAG layer, hybrid datastores, Python orchestrator, TypeScript SDK.
3. **Prevent rot** – each file has clear ownership, update cadence & CI quality gates.

## File Index
| File | Purpose | Owner | Update Cadence |
|------|---------|-------|----------------|
| `overview.md` | Vision, scope, non-goals | Chief Architect | Rare (quarterly) |
| `architecture.md` | System topology, component diagrams | Architecture Agent | When topology changes |
| `communication_protocols.md` | Message formats, broker contracts | Engineering Lead | When protocol changes |
| `development_patterns.md` | Factory, router, circuit-breaker, etc. | Framework Team | As patterns evolve |
| `quality_gates.md` | Checklists, CI automation rules | QA Lead | Each release |
| `security_and_compliance.md` | SOC-2 controls, security checklist | SecuriShield Agent | Monthly / audit |
| `memory_bank_structure.md` | Doc/metadata layout rules | Knowledge Ops | Quarterly |

> 📌 **Versioning** – The framework is versioned with `AGENTFORGE_VERSION.md` (semantic versioning). Breaking changes require a major bump and deprecation guideline.

## Contribution Workflow
1. Propose change via ADR (in `docs/adr/`).
2. Update affected markdown(s) **and** reference implementation (Python/TS packages).
3. CI runs:
   * Lint & spell-check markdown.
   * Validate mermaid diagrams.
   * Run quality-gate scripts declared in `quality_gates.md`.
4. Reviewers: Chief Architect, SecuriShield, QA Lead.
5. Merge & release via semantic-release.

## Next Steps
- [ ] Populate each markdown with extracted & updated content.
- [ ] Scaffold `agentforge_core` Python package.
- [ ] Hook quality-gates into GitHub Actions. 