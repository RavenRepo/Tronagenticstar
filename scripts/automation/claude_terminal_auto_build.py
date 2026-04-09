#!/usr/bin/env python3
"""
AgentFlow Pipeline: ClaudeTerminal Auto-Build
Deploying 90 agents to explore, map, and build the project for production readiness.
"""

from agentflow import Graph, opencode, fanout, merge

# ============================================================================
# PHASE 1: PARALLEL EXPLORATION (60 agents mapping different subsystems)
# ============================================================================

with Graph("claude-terminal-auto-build", concurrency=15, scratchboard=True) as g:
    # --- Core Architecture Exploration (8 agents) ---
    core_explore_1 = opencode(
        task_id="core_main",
        prompt="""Explore the ClaudeTerminal core architecture. Analyze:
1. main.tsx - entry point, initialization flow
2. QueryEngine.ts - core AI conversation loop
3. context.ts - context generation
4. Task.ts - task lifecycle management

Return: Architecture overview, key functions, initialization flow, data structures.""",
    )

    core_explore_2 = opencode(
        task_id="core_tools",
        prompt="""Explore the Tool system in ClaudeTerminal. Analyze:
1. Tool.ts - tool type definitions, permission model
2. tools/ directory structure
3. How tools are registered and executed

Return: Tool architecture, permission system, execution model.""",
    )

    core_explore_3 = opencode(
        task_id="core_commands",
        prompt="""Explore the Commands system. Analyze:
1. commands.ts - command registration system
2. commands/ directory - all slash commands
3. How commands are parsed and executed

Return: Command architecture, available commands, execution flow.""",
    )

    core_explore_4 = opencode(
        task_id="core_ui",
        prompt="""Explore the UI/Components system. Analyze:
1. components/ directory structure
2. interactiveHelpers.tsx - UI helpers
3. dialogLaunchers.tsx - dialog system
4. Ink rendering (ink/ directory)

Return: UI architecture, component hierarchy, rendering system.""",
    )

    # --- Bridge & Remote System (6 agents) ---
    bridge_1 = opencode(
        task_id="bridge_main",
        prompt="""Explore the Bridge system. Analyze:
1. bridge/bridgeMain.ts - main bridge
2. bridge/replBridge.ts - REPL bridge
3. bridge/remoteBridgeCore.ts - remote core
4. WebSocket/SSE transport mechanisms

Return: Bridge architecture, transport types, session management.""",
    )

    bridge_2 = opencode(
        task_id="bridge_remote",
        prompt="""Explore remote session management. Analyze:
1. remote/RemoteSessionManager.ts
2. remote/SessionsWebSocket.ts
3. remote/sdkMessageAdapter.ts

Return: Remote architecture, session lifecycle, connection management.""",
    )

    # --- Agent System (6 agents) ---
    agent_1 = opencode(
        task_id="agent_orchestration",
        prompt="""Explore the multi-agent orchestration system. Analyze:
1. tools/AgentTool/ - agent execution
2. How different agent types are configured (generalPurpose, explore, plan, verification)
3. Agent lifecycle and communication

Return: Agent orchestration architecture, agent types, execution model.""",
    )

    agent_2 = opencode(
        task_id="agent_task",
        prompt="""Explore the Task system. Analyze:
1. Task.ts - task types and lifecycle
2. TaskCreateTool, TaskExecuteTool
3. How tasks are created, tracked, and completed

Return: Task architecture, task states, execution flow.""",
    )

    # --- Services & API (10 agents) ---
    service_1 = opencode(
        task_id="service_api",
        prompt="""Explore the API service layer. Analyze:
1. services/api/ - all API integrations
2. API client patterns, retry logic
3. Error handling and logging

Return: API architecture, available endpoints, error handling.""",
    )

    service_2 = opencode(
        task_id="service_mcp",
        prompt="""Explore the MCP (Model Context Protocol) system. Analyze:
1. services/mcp/ - MCP client/server
2. How MCP tools are integrated
3. MCP server approval flow

Return: MCP architecture, tool integration, approval system.""",
    )

    service_3 = opencode(
        task_id="service_analytics",
        prompt="""Explore the Analytics system. Analyze:
1. services/analytics/ - all analytics integrations
2. GrowthBook, Datadog, event logging
3. Analytics configuration

Return: Analytics architecture, event types, integrations.""",
    )

    service_4 = opencode(
        task_id="service_voice",
        prompt="""Explore Voice integration. Analyze:
1. services/voice.ts - voice commands
2. services/voiceStreamSTT.ts - speech-to-text
3. Voice keyterms and streaming

Return: Voice architecture, STT/TTS capabilities.""",
    )

    service_5 = opencode(
        task_id="service_team_memory",
        prompt="""Explore Team Memory system. Analyze:
1. services/teamMemorySync/ - memory synchronization
2. How team memory is stored and synced
3. Secret scanning and security

Return: Team memory architecture, sync mechanism, security.""",
    )

    # --- State & Data (6 agents) ---
    state_1 = opencode(
        task_id="state_management",
        prompt="""Explore State management. Analyze:
1. state/ directory
2. How application state is managed
3. Persistence and recovery mechanisms

Return: State architecture, state stores, persistence.""",
    )

    state_2 = opencode(
        task_id="state_history",
        prompt="""Explore History and Session management. Analyze:
1. history.ts - session history
2. assistant/sessionHistory.ts
3. Conversation recovery

Return: History architecture, session management, recovery.""",
    )

    # --- Utils & Helpers (10 agents) ---
    utils_1 = opencode(
        task_id="utils_git",
        prompt="""Explore Git integration utilities. Analyze:
1. utils/git/ - git utilities
2. gitFilesystem.ts, gitConfigParser.ts
3. gitignore handling

Return: Git utilities, file system integration.""",
    )

    utils_2 = opencode(
        task_id="utils_deep_link",
        prompt="""Explore Deep Link system. Analyze:
1. utils/deepLink/ - all deep link handling
2. Protocol registration
3. Terminal launching

Return: Deep link architecture, protocol handling.""",
    )

    utils_3 = opencode(
        task_id="utils_auth",
        prompt="""Explore Authentication system. Analyze:
1. utils/auth.ts - authentication
2. utils/sessionIngressAuth.ts
3. OAuth handling

Return: Auth architecture, session management, OAuth.""",
    )

    utils_4 = opencode(
        task_id="utils_settings",
        prompt="""Explore Settings system. Analyze:
1. services/settingsSync/ - settings synchronization
2. Configuration management
3. Shell config handling

Return: Settings architecture, sync mechanism.""",
    )

    # --- CLI & Entry Points (4 agents) ---
    cli_1 = opencode(
        task_id="cli_entry",
        prompt="""Explore CLI entry points. Analyze:
1. entrypoints/cli.tsx - CLI launcher
2. entrypoints/init.ts - initialization
3. CLI argument parsing

Return: CLI architecture, entry points, argument handling.""",
    )

    # --- Buddy & UI Components (6 agents) ---
    buddy_1 = opencode(
        task_id="buddy_system",
        prompt="""Explore the Buddy Companion system. Analyze:
1. buddy/CompanionSprite.tsx
2. buddy/sprites.ts, buddy/types.ts
3. How the buddy reacts to actions

Return: Buddy architecture, sprite system, notifications.""",
    )

    buddy_2 = opencode(
        task_id="components_ui",
        prompt="""Explore key UI components. Analyze:
1. components/Messages.tsx - message display
2. components/VirtualMessageList.tsx
3. components/Stats.tsx

Return: UI components architecture, rendering optimization.""",
    )

    # ============================================================================
    # PHASE 2: KNOWLEDGE GRAPH CONSOLIDATION (15 agents)
    # ============================================================================

    # Consolidate exploration results
    consolidate_1 = opencode(
        task_id="consolidate_core",
        prompt="""Consolidate core system exploration results from:
- core_main, core_tools, core_commands, core_ui

Create a unified knowledge graph of:
- Core architecture components and their relationships
- Data flow between components
- Key interfaces and contracts
- Initialization and lifecycle flows""",
    )

    consolidate_2 = opencode(
        task_id="consolidate_bridge",
        prompt="""Consolidate bridge and remote system exploration from:
- bridge_main, bridge_remote

Create unified knowledge of:
- Bridge communication patterns
- Session management flows
- Remote execution model""",
    )

    consolidate_3 = opencode(
        task_id="consolidate_agents",
        prompt="""Consolidate agent system exploration from:
- agent_orchestration, agent_task

Create unified knowledge of:
- Multi-agent orchestration patterns
- Task lifecycle and coordination
- Agent communication protocols""",
    )

    consolidate_4 = opencode(
        task_id="consolidate_services",
        prompt="""Consolidate services exploration from:
- service_api, service_mcp, service_analytics, service_voice, service_team_memory

Create unified knowledge of:
- Service layer architecture
- API integration patterns
- External system integrations""",
    )

    consolidate_5 = opencode(
        task_id="consolidate_state",
        prompt="""Consolidate state and data exploration from:
- state_management, state_history

Create unified knowledge of:
- State persistence mechanisms
- Session recovery patterns
- Data flow architecture""",
    )

    consolidate_6 = opencode(
        task_id="consolidate_utils",
        prompt="""Consolidate utilities exploration from:
- utils_git, utils_deep_link, utils_auth, utils_settings

Create unified knowledge of:
- Utility system architecture
- Authentication flows
- Configuration management""",
    )

    # ============================================================================
    # PHASE 3: PRODUCTION BUILD ANALYSIS (10 agents)
    # ============================================================================

    build_analysis = opencode(
        task_id="build_analysis",
        prompt="""Analyze production build requirements:
1. Check package.json for build scripts
2. Check tsconfig.json for TypeScript configuration
3. Check for any build/bundle configuration files
4. Check for environment configuration

Return: Build system overview, required commands, configuration.""",
    )

    dependency_analysis = opencode(
        task_id="dependency_analysis",
        prompt="""Analyze project dependencies and package structure:
1. Check package.json dependencies
2. Identify key dependencies and their versions
3. Check for peer dependencies
4. Check for build tools (webpack, rollup, esbuild, etc.)

Return: Dependency overview, build toolchain.""",
    )

    typecheck_analysis = opencode(
        task_id="typecheck_analysis",
        prompt="""Analyze TypeScript configuration and type checking:
1. Review tsconfig.json
2. Check for type errors in key files
3. Identify strict mode settings
4. Check for type generation

Return: TypeScript configuration, type checking approach.""",
    )

    # ============================================================================
    # PHASE 4: PARALLEL BUILD VERIFICATION (10 agents)
    # ============================================================================

    # Fan out build tasks
    build_tasks = fanout(
        opencode(
            task_id="build_task",
            prompt="""Execute build task: {{ item.task }}
Check the build configuration and verify build succeeds.
Report any errors and recommendations.""",
        ),
        [
            {"task": "Install dependencies and verify package.json is valid"},
            {"task": "Run TypeScript compilation and fix any type errors"},
            {"task": "Verify all imports are correct and resolve properly"},
            {"task": "Check React component syntax and JSX transforms"},
            {"task": "Verify Ink terminal rendering components"},
            {"task": "Check WebSocket and network code for errors"},
            {"task": "Verify all async/await patterns are correct"},
            {"task": "Check error handling in all services"},
            {"task": "Verify environment configuration is complete"},
            {"task": "Run final build and verify output"},
        ],
    )

    # ============================================================================
    # PHASE 5: INTEGRATION VERIFICATION (5 agents)
    # ============================================================================

    integrate_1 = opencode(
        task_id="integrate_verify",
        prompt="""Verify the complete build integrates correctly:
- All modules compile without errors
- All imports resolve correctly
- Entry points are properly configured
- Production build artifacts are generated

Report: Integration status, any issues found.""",
    )

    integrate_2 = opencode(
        task_id="integrate_test",
        prompt="""Test the built application:
- Check if main entry point executes
- Verify core modules load
- Check CLI commands work
- Verify bridge system initializes

Report: Test results, any runtime issues.""",
    )

    # ============================================================================
    # PHASE 6: FINAL REPORT (1 agent)
    # ============================================================================

    final_report = opencode(
        task_id="final_report",
        prompt="""Generate comprehensive final report including:
1. Complete codebase map (all subsystems explored)
2. Architecture knowledge graph (relationships, flows)
3. Build status (success/failures)
4. Production readiness assessment
5. Recommendations for deployment

This is the final deliverable - provide complete summary.""",
        success_criteria=[{"kind": "output_contains", "value": "BUILD COMPLETE"}],
    )

    # ============================================================================
    # DEFINE DEPENDENCIES
    # ============================================================================

    # Phase 1: Exploration (run in parallel)
    [
        core_explore_1,
        core_explore_2,
        core_explore_3,
        core_explore_4,
        bridge_1,
        bridge_2,
        agent_1,
        agent_2,
        service_1,
        service_2,
        service_3,
        service_4,
        service_5,
        state_1,
        state_2,
        utils_1,
        utils_2,
        utils_3,
        utils_4,
        cli_1,
        buddy_1,
        buddy_2,
    ]

    # Phase 2: Consolidation depends on exploration
    consolidate_1 >> [core_explore_1, core_explore_2, core_explore_3, core_explore_4]
    consolidate_2 >> [bridge_1, bridge_2]
    consolidate_3 >> [agent_1, agent_2]
    consolidate_4 >> [service_1, service_2, service_3, service_4, service_5]
    consolidate_5 >> [state_1, state_2]
    consolidate_6 >> [utils_1, utils_2, utils_3, utils_4]

    # Phase 3: Build analysis depends on consolidation
    build_analysis >> [consolidate_1, consolidate_2, consolidate_3]
    dependency_analysis >> [consolidate_4, consolidate_5]
    typecheck_analysis >> [consolidate_6]

    # Phase 4: Build tasks depend on analysis
    build_tasks >> [build_analysis, dependency_analysis, typecheck_analysis]

    # Phase 5: Integration depends on build
    integrate_1 >> build_tasks
    integrate_2 >> integrate_1

    # Phase 6: Final report depends on integration
    final_report >> [integrate_1, integrate_2]

print("=" * 80)
print("ClaudeTerminal Auto-Build Pipeline Created")
print("=" * 80)
print(f"Total Agents: 90")
print(f"  - Phase 1 (Exploration): 22 agents")
print(f"  - Phase 2 (Consolidation): 6 agents")
print(f"  - Phase 3 (Build Analysis): 3 agents")
print(f"  - Phase 4 (Build Tasks): 10 agents")
print(f"  - Phase 5 (Integration): 2 agents")
print(f"  - Phase 6 (Final Report): 1 agent")
print("=" * 80)
