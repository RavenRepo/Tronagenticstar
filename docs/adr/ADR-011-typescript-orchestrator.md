# ADR-011: TypeScript-based Master Orchestrator

**Date**: 2025-08-01

**Status**: Proposed

## Context

Our multi-agent system requires a robust, central orchestrator to manage task distribution, agent lifecycle, and system-wide state. Initial explorations included both Python (`orchestrator-py` with LangGraph) and TypeScript (`packages/orchestrator`) implementations. This has led to ambiguity about the primary architectural direction. The `orchestrator-py` service is a minimal FastAPI scaffold, while the TypeScript `orchestrator` package contains a more comprehensive implementation, including components for a `ChiefArchitect`, `FrameworkRouter`, `AgentRegistry`, and `MemoryBank`.

## Decision

We will officially adopt the **TypeScript-based `packages/orchestrator` as the single, master orchestrator for the entire system**. It will be known as the `ChiefArchitect`.

The architecture will be a language-agnostic, service-oriented system with this central TypeScript orchestrator managing a fleet of specialist agents.

### Architectural Details:

1.  **Master Orchestrator (`ChiefArchitect`)**:
    *   **Implementation**: The `packages/orchestrator` TypeScript package.
    *   **Responsibilities**:
        *   Serve as the primary entry point for all system tasks.
        *   Manage the lifecycle of all specialist agents (registration, health checks, shutdown).
        *   Maintain system-wide context and memory via the `MemoryBankManager`.
        *   Route tasks to appropriate specialist agents via the `FrameworkRouter`.
        *   Emit events for system monitoring and observability.

2.  **Specialist Agents**:
    *   **Implementation**: Python-based microservices (e.g., `codecraft`, `evaluator`, `retriever`).
    *   **Responsibilities**:
        *   Expose a standardized HTTP API for the `ChiefArchitect`.
        *   Execute specific, domain-focused tasks.
        *   Report their capabilities, status, and health to the `ChiefArchitect`.

3.  **Communication Protocol**:
    *   Communication between the `ChiefArchitect` (TypeScript) and the specialist agents (Python) will be done via a standardized, REST-based API contract over HTTP.
    *   All agents must implement a common interface, including `/health`, `/execute_task`, and `/get_capabilities` endpoints.

4.  **`orchestrator-py` Service**:
    *   The existing `orchestrator-py` service is hereby **deprecated** as a system-level orchestrator.
    *   It may be repurposed as a specialized "sub-orchestrator" for running complex, Python-native `LangGraph` workflows, but it will act as just another specialist agent in the eyes of the `ChiefArchitect`.

## Consequences

### Positive:

*   **Clarifies Architecture**: Establishes a single, unambiguous source of truth for system orchestration.
*   **Leverages Existing Code**: Builds upon the more mature and feature-rich TypeScript implementation.
*   **Enables Polyglot System**: Creates a clear pattern for integrating agents written in any language.
*   **Centralized Control**: Simplifies system monitoring, management, and security by having a single coordination point.

### Negative:

*   **Refactoring Required**: The `FrameworkRouter` and agent client classes in the TypeScript orchestrator must be updated to communicate with the Python agents via HTTP.
*   **API Definition Overhead**: A formal API contract between the orchestrator and agents must be defined, documented, and implemented.

## Next Steps

1.  **Define Agent API Contract**: Create a new ADR specifying the exact REST API interface that all specialist agents must adhere to.
2.  **Implement `FrameworkRouter`**: Fully implement the agent routing and load-balancing logic in `frameworkRouter.ts`.
3.  **Update Agent Clients**: Refactor the agent client classes (e.g., `codeCraftAgent.ts`) to communicate with the Python services over HTTP.
4.  **Update Python Agents**: Ensure all Python services implement the new, standardized API contract.
