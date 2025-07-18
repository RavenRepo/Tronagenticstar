# ADR-010 – Specialist Agent Architecture

Date: 2025-07-18

## Status
Proposed

## Context
We are introducing a first wave of domain-specific “specialist agents” (DesignForge, SecuriShield, CodeCraft, PerfPulse). They extend the existing `BaseAgent` but need shared behaviour (metrics, registry hooks) and a clear registration pattern. Previous sprints added `SpecialistAgent` base class and `registerSpecialist()` helper. We must document the architectural approach and rationale before these agents evolve from stubs to production-grade services.

## Decision
1. **SpecialistAgent abstraction**
   * Wraps execution with timing + metrics recording.
   * Provides `simulateWork()` for scaffolding.
2. **Registration via helper**
   * `registerSpecialist(kind, cls)` calls `AgentFactory.registerAgentType` ensuring discovery.
3. **Agent identifiers**
   * Each agent exposes static `KIND`, used for factory key and `noAgentDupes` mapping.
4. **Initial implementation pattern**
   * Scaffold agents inside `packages/orchestrator/src/`.
   * Keep compute-heavy logic in separate worker files to avoid blocking event-loop.
5. **Future expansion**
   * Agents will migrate to independent micro-services communicating over NATS once stable.
   * Security wrapper (`SecureBaseAgent`) from SOC-2 track will compose with SpecialistAgent via mixin pattern.

## Consequences
+ Rapid scaffolding of new specialist agents with minimal boilerplate.
+ Central factory can enumerate all available specialist kinds.
+ Developers follow single registration path; reduces duplicate agents.
− Tight coupling to Node runtime until micro-service split.
− Additional abstraction layer may hide performance issues if overused.

## Alternatives considered
* **Direct subclass of BaseAgent** – every agent defines its own wrappers ↠ more boilerplate.
* **Decorator registration** – nice ergonomics but TS decorators still experimental; decided against now.

## References
* Sprint-D plan (docs/activeFocus.md)
* AgentFactory implementation (packages/orchestrator/src/agentFactory.ts)
* SpecialistAgent utilities (packages/orchestrator/src/agentTemplates.ts) 