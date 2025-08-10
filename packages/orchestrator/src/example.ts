import { 
  ChiefArchitect, 
  FrameworkRouter, 
  AgentFactory,
  TaskType,
  Task,
  ChiefArchitectConfig
} from "./index.js";
import { ArchitectureAgent, SecurityAgent, QualityAgent } from "./concreteAgents.js";

/**
 * Example implementation of the AgentForge Orchestrator
 * This demonstrates how to set up and use the complete system
 */
export class AgentForgeOrchestrator {
  private chiefArchitect: ChiefArchitect;
  private router: FrameworkRouter;

  constructor(config: ChiefArchitectConfig = {}) {
    // Initialize the framework router
    this.router = new FrameworkRouter();
    
    // Initialize the Chief Architect with all components
    this.chiefArchitect = new ChiefArchitect(config);
    
    // Register agent types
    this.registerAgentTypes();
  }

  /**
   * Initialize the orchestrator with default agents
   */
  async initialize(): Promise<void> {
    console.log("🚀 Initializing AgentForge Orchestrator...");
    
    try {
      // Register concrete agent implementations
      await this.createDefaultAgents();
      
      // Setup event listeners
      this.setupEventListeners();
      
      console.log("✅ AgentForge Orchestrator initialized successfully");
      
      // Display system status
      const health = await this.chiefArchitect.getSystemHealth();
      console.log("📊 System Health:", health);
      
    } catch (error) {
      console.error("❌ Failed to initialize orchestrator:", error);
      throw error;
    }
  }

  /**
   * Process a task through the orchestrator
   */
  async processTask(taskType: TaskType, parameters: any): Promise<any> {
    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: taskType,
      priority: 5,
      parameters,
      correlationId: `corr_${Date.now()}`,
      manifestHash: 'default_manifest'
    };

    console.log(`📋 Processing task: ${task.id} (${taskType})`);
    
    try {
      const result = await this.chiefArchitect.handleRequest(task);
      console.log(`✅ Task completed: ${task.id}`);
      return result;
    } catch (error) {
      console.error(`❌ Task failed: ${task.id}`, error);
      throw error;
    }
  }

  /**
   * Query the memory bank for context
   */
  async queryContext(query: string, taskType?: TaskType): Promise<any[]> {
    return await this.chiefArchitect.queryContext({
      query,
      taskType,
      limit: 10
    });
  }

  /**
   * Get system health and statistics
   */
  async getSystemHealth(): Promise<any> {
    return await this.chiefArchitect.getSystemHealth();
  }

  /**
   * Get error statistics
   */
  getErrorStats(): any {
    return this.chiefArchitect.getErrorCollector().getErrorStats();
  }

  /**
   * Shutdown the orchestrator
   */
  async shutdown(): Promise<void> {
    console.log("🛑 Shutting down AgentForge Orchestrator...");
    await this.chiefArchitect.shutdown();
    console.log("✅ Shutdown complete");
  }

  private registerAgentTypes(): void {
    // Register agent types with the factory
    AgentFactory.registerAgentType('architecture', ArchitectureAgent);
    AgentFactory.registerAgentType('security', SecurityAgent);
    AgentFactory.registerAgentType('quality', QualityAgent);
    
    console.log("📝 Registered agent types:", AgentFactory.getAvailableTypes());
  }

  private async createDefaultAgents(): Promise<void> {
    // Create Architecture Agent
    await this.chiefArchitect.registerAgent(
      'architecture-agent-001',
      'architecture',
      TaskType.ARCHITECTURE,
      [
        'analyze_architecture',
        'generate_c4_model', 
        'suggest_patterns',
        'validate_design'
      ],
      {
        model: 'gpt-4',
        temperature: 0.1,
        max_tokens: 2000
      }
    );

    // Create Security Agent
    await this.chiefArchitect.registerAgent(
      'security-agent-001',
      'security',
      TaskType.SECURITY,
      [
        'security_scan',
        'policy_check',
        'vulnerability_assessment',
        'compliance_audit'
      ],
      {
        model: 'gpt-4',
        temperature: 0.0,
        max_tokens: 1500,
        security_level: 'strict'
      }
    );

    // Create Quality Agent
    await this.chiefArchitect.registerAgent(
      'quality-agent-001',
      'quality',
      TaskType.QUALITY,
      [
        'code_quality_check',
        'run_tests',
        'analyze_coverage',
        'performance_analysis'
      ],
      {
        model: 'gpt-3.5-turbo',
        temperature: 0.2,
        max_tokens: 1000
      }
    );

    console.log("🤖 Created default agents");
  }

  private setupEventListeners(): void {
    // Listen for task events
    this.chiefArchitect.on('task_received', (task) => {
      console.log(`📨 Task received: ${task.id} (${task.type})`);
    });

    this.chiefArchitect.on('task_completed', ({ taskId, result }) => {
      console.log(`✅ Task completed: ${taskId}`);
    });

    this.chiefArchitect.on('task_failed', ({ taskId, error }) => {
      console.error(`❌ Task failed: ${taskId}`, error.message);
    });

    // Listen for agent events
    this.chiefArchitect.on('agent_registered', ({ agentId, agentType }) => {
      console.log(`🤖 Agent registered: ${agentId} (${agentType})`);
    });

    this.chiefArchitect.on('agent_unregistered', ({ agentId }) => {
      console.log(`🗑️ Agent unregistered: ${agentId}`);
    });

    // Listen for critical errors
    this.chiefArchitect.on('critical_error', (error) => {
      console.error(`🚨 CRITICAL ERROR:`, error);
    });

    // Listen for memory updates
    this.chiefArchitect.on('memory_update', ({ type, entry }) => {
      console.log(`🧠 Memory ${type}: ${entry.id}`);
    });
  }
}

/**
 * Example usage and demo
 */
export async function runDemo(): Promise<void> {
  console.log("🎯 Starting AgentForge Demo");
  
  const orchestrator = new AgentForgeOrchestrator({
    retrieverServiceUrl: 'http://localhost:8080',
    errorReportingEnabled: true,
    memoryRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
    authSecretKey: 'demo-secret-key'
  });

  try {
    // Initialize the orchestrator
    await orchestrator.initialize();

    // Demo 1: Architecture Analysis
    console.log("\\n🏗️ Demo 1: Architecture Analysis");
    const archResult = await orchestrator.processTask(TaskType.ARCHITECTURE, {
      action: 'analyze_architecture',
      codebase: 'sample-microservices-app',
      focus: 'scalability'
    });
    console.log("Architecture Analysis Result:", archResult);

    // Demo 2: Security Scan
    console.log("\\n🔒 Demo 2: Security Scan");
    const secResult = await orchestrator.processTask(TaskType.SECURITY, {
      action: 'security_scan',
      target: 'web-application',
      depth: 'comprehensive'
    });
    console.log("Security Scan Result:", secResult);

    // Demo 3: Quality Check
    console.log("\\n✨ Demo 3: Code Quality Check");
    const qualityResult = await orchestrator.processTask(TaskType.QUALITY, {
      action: 'code_quality_check',
      repository: 'main-app',
      standards: 'enterprise'
    });
    console.log("Quality Check Result:", qualityResult);

    // Demo 4: Query Context
    console.log("\\n🧠 Demo 4: Query Memory Context");
    const context = await orchestrator.queryContext(
      "architecture patterns microservices", 
      TaskType.ARCHITECTURE
    );
    console.log("Context Query Result:", context);

    // Demo 5: System Health
    console.log("\\n📊 Demo 5: System Health Check");
    const health = await orchestrator.getSystemHealth();
    console.log("System Health:", JSON.stringify(health, null, 2));

    // Demo 6: Error Statistics
    console.log("\\n📈 Demo 6: Error Statistics");
    const errorStats = orchestrator.getErrorStats();
    console.log("Error Statistics:", errorStats);

  } catch (error) {
    console.error("❌ Demo failed:", error);
  } finally {
    // Clean shutdown
    await orchestrator.shutdown();
  }

  console.log("🏁 Demo completed");
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}
