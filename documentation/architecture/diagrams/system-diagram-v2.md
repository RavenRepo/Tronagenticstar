classDiagram
    %% Compliance & Observability Layer (already existed, now extended)
    class ComplianceGovernor {
        <<Orchestrator>>
    }
    class ErrorGoldCollector {
        +captureError()
        +sendToBus()
    }
    class ErrorRouter {
        +shardEvents()
    }
    class GlobalErrorAgent {
        +classify()
        +autoRemediate()
    }
    ComplianceGovernor --> GlobalErrorAgent : validates evidence
    ErrorGoldCollector --> ErrorRouter --> GlobalErrorAgent

    %% Core Orchestration
    class ChiefArchitect {
        +plan()
        +route()
    }
    class FrameworkRouter {
        +selectAgent()
    }
    ChiefArchitect --> FrameworkRouter

    %% Memory & Manifest
    class ManifestReader {
        +loadManifest()
        +scanTags()
    }
    class MemoryBankClient {
        +read()
        +write()
    }
    class RetrieverService {
        +similaritySearch()
        +graphBoost()
    }
    ChiefArchitect --> ManifestReader
    FrameworkRouter --> MemoryBankClient
    ArchitectureAgent ..> RetrieverService : queries
    SecurityAgent ..> RetrieverService : queries
    QualityAgent ..> RetrieverService : queries
    PerformanceAgent ..> RetrieverService : queries
    MemoryBankClient --> RetrieverService : powers

    %% Base Agent Extension
    class BaseAgent {
        <<abstract>>
        +execute()
        +metrics()
    }

    %% Specialist Agents with Super-Powers
    class ArchitectureAgent {
        +astAnalyzer
        +c4ModelGenerator
    }
    ArchitectureAgent --|> BaseAgent

    class SecurityAgent {
        +sastScanner
        +cveLookup
        +fuzzHarness
    }
    SecurityAgent --|> BaseAgent

    class QualityAgent {
        +linterRunner
        +mutationTester
    }
    QualityAgent --|> BaseAgent

    class PerformanceAgent {
        +profiler
        +loadTester
        +flameGraphGen
    }
    PerformanceAgent --|> BaseAgent

    %% Data Flow
    BaseAgent --> ErrorGoldCollector : onError()
    BaseAgent --> MemoryBankClient : writeLogs()
    BaseAgent --> ComplianceGovernor : validate() 