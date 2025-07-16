# Memory-Bank Structure

AgentForge uses a *knowledge bank* pattern to keep docs structured & machine-readable.

```
frameworks/agentforge/
├── overview.md            # Vision & scope
├── architecture.md        # Diagrams & topology
├── communication_protocols.md
├── development_patterns.md
├── quality_gates.md
├── security_and_compliance.md
└── memory_bank_structure.md (this file)
```

## Rules
1. **Purpose First** – first paragraph of every doc states why it exists.
2. **Update Cadence** – table in README lists owner & frequency; CI fails if `last-updated` heading > 6 months old.
3. **Consistent Headings** – use H2 for major sections (##), H3 for sub sections.
4. **Relational Diagrams** – prefer Mermaid; must compile via CI.
5. **Cross-links** – use relative paths (`../docs/adr/ADR-007…`).

## Automation Scripts
* `scripts/doc_age_check.py` – fails if stale.
* `scripts/diagram_check.py` – runs `mmdc` compile.

---
*Owner*: Knowledge Ops. 