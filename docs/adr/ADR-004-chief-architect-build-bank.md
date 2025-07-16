# ADR-004: Chief-Architect Build Bank as Single Source of Truth

Status: Proposed  
Date: 2025-06-14

## Context
`cheifarchitect.md` defines a framework where all architectural decisions, tech stack analyses, and implementation matrices flow into a *Build Bank*. This aligns with Diagram1's `ChiefArchitect` class.

## Decision
Adopt **Chief-Architect Build Bank** (markdown + Mermaid diagrams) as the master registry for:
• ADR links & status  
• Tech stack analyses  
• Implementation matrix & progress  
• Agent coordination specs

Agents and CLI tools must reference Build Bank paths before creating new files to avoid duplication (`noAgentDupes.md`).

## Consequences
• Requires markdown parsing helper to let agents query Build Bank quickly.  
• Adds discipline but reduces architectural drift.  
• Enables auto-generation of knowledge graphs from ADR metadata.

## Alternatives Considered
• Scatter docs per repo – prone to bit-rot.  
• Wiki-only – harder to version-control with code. 