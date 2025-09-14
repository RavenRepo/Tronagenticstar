import express from 'express';
import cors from 'cors';
import { ChiefArchitect } from './chiefArchitect.js';
import { AgentFactory } from './agentFactory.js';
import { ArchitectureAgent, SecurityAgent, QualityAgent } from './concreteAgents.js';
import { TaskType } from './types.js';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());

// Simple API key authentication middleware (optional)
const API_KEYS = (process.env.API_KEYS || process.env.API_KEY || '').split(',').map((k) => k.trim()).filter(Boolean);
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/' || req.path.startsWith('/api/codecraft')) {
    // Allow health, root, and legacy thin endpoints without API key
    return next();
  }
  if (API_KEYS.length === 0) {
    return next();
  }
  const key = (req.headers['x-api-key'] as string) || '';
  if (!key || !API_KEYS.includes(key)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
});

// Initialize in-memory orchestrator
const orchestrator = new ChiefArchitect();

async function registerDefaultAgents() {
  try {
    // Register available agent classes with the factory
    AgentFactory.registerAgentType('architecture', ArchitectureAgent);
    AgentFactory.registerAgentType('security', SecurityAgent);
    AgentFactory.registerAgentType('quality', QualityAgent);

    // Architecture
    await orchestrator.registerAgent(
      'architecture-agent-001',
      'architecture',
      TaskType.ARCHITECTURE,
      ['analyze_architecture', 'generate_c4_model', 'suggest_patterns'],
      {}
    );
    // Security
    await orchestrator.registerAgent(
      'security-agent-001',
      'security',
      TaskType.SECURITY,
      ['security_scan', 'policy_check', 'vulnerability_assessment'],
      {}
    );
    // Quality
    await orchestrator.registerAgent(
      'quality-agent-001',
      'quality',
      TaskType.QUALITY,
      ['code_quality_check', 'run_tests', 'analyze_coverage'],
      {}
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Agent registration failed', e);
  }
}
registerDefaultAgents();

// Optionally discover external HTTP agents (ADR-012 compliant)
async function registerExternalAgents() {
  const endpoints = [
    process.env.CODECRAFT_URL || 'http://localhost:8012',
    process.env.SECURISHIELD_URL || 'http://localhost:8011',
    process.env.PERFPULSE_URL || 'http://localhost:8013',
    process.env.DESIGNFORGE_URL || 'http://localhost:8010',
    process.env.EVALUATOR_URL || 'http://localhost:8014',
  ];
  for (const url of endpoints) {
    try {
      const info = await orchestrator.getRegistry().discoverAndRegisterAgent(url);
      if (info) {
        // eslint-disable-next-line no-console
        console.log(`Discovered external agent at ${url}: ${info.id} (${info.specialization})`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`No capabilities discovered at ${url}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to discover external agent at ${url}:`, e);
    }
  }
}
registerExternalAgents();

// Root - simple index
app.get('/', (_req, res) => {
  res.status(200).json({
    message: 'AgentForge Orchestrator',
    status: 'ok',
    endpoints: ['/health', '/api/agents', '/api/activity', '/api/metrics']
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Lightweight agents listing from registry
app.get('/api/agents', (_req, res) => {
  const agents = orchestrator.getRegistry().getAllAgents();
  res.json(agents);
});

// Recent activity placeholder (returns memory summary)
app.get('/api/activity', (_req, res) => {
  const mem = orchestrator.getMemoryBank().getSharedContext(undefined, 50);
  res.json(mem);
});

// Metrics placeholder (error stats + memory stats)
app.get('/api/metrics', async (_req, res) => {
  const health = await orchestrator.getSystemHealth();
  res.json({ health });
});

// Trigger an agent task from the extension
app.post('/api/agents/:name/trigger', async (req, res) => {
  const { name } = req.params;
  const { action, parameters = {} } = req.body || {};

  // Map VS Code names to TaskType
  const nameToType: Record<string, TaskType> = {
    DesignForge: TaskType.ARCHITECTURE,
    SecuriShield: TaskType.SECURITY,
    CodeCraft: TaskType.CODE_GENERATION,
    PerfPulse: TaskType.PERFORMANCE_ANALYSIS,
    Evaluator: TaskType.EVALUATION,
  };
  const taskType = nameToType[name];
  if (!taskType) {
    return res.status(404).json({ error: `Unknown agent: ${name}` });
  }

  // Normalize action mismatches for quality
  let normalizedAction = action;
  if (taskType === TaskType.QUALITY && action === 'quality_check') {
    normalizedAction = 'code_quality_check';
  }

  const taskId = `task_${Date.now()}`;
  try {
    const result = await orchestrator.handleRequest({
      id: taskId,
      type: taskType,
      parameters: { ...parameters, action: normalizedAction },
      priority: 5,
      manifestHash: 'vscode',
    } as any);
    res.json({ taskId, status: 'accepted', result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'failed' });
  }
});

// Stub for agent generation
app.post('/api/agents/generate', (_req, res) => {
  res.json({ status: 'ok' });
});

// Minimal vertical slice endpoints for CodeCraft (external HTTP agent)
app.post('/api/codecraft/generate', async (req, res) => {
  const { prompt, language = 'python', style = 'clean', max_lines = 100 } = req.body || {};
  if (!prompt) {
    return res.status(422).json({ error: "'prompt' is required" });
  }
  const taskId = `cc_gen_${Date.now()}`;
  try {
    const result = await orchestrator.handleRequest({
      id: taskId,
      type: TaskType.CODE_GENERATION,
      parameters: { prompt, language, style, max_lines, action: 'generate_code' },
      priority: 5,
      manifestHash: 'api',
    } as any);
    res.json({ taskId, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'failed' });
  }
});

// Additional thin endpoints for other agents
app.post('/api/securishield/scan', async (req, res) => {
  const { target } = req.body || {};
  if (!target) return res.status(422).json({ error: "'target' is required" });
  const taskId = `sec_scan_${Date.now()}`;
  try {
    const result = await orchestrator.handleRequest({
      id: taskId,
      type: TaskType.SECURITY,
      parameters: { target, action: 'scan_target' },
    } as any);
    res.json({ taskId, result });
  } catch (err: any) {
    try {
      const url = process.env.SECURISHIELD_URL || 'http://localhost:8011';
      const resp = await axios.post(`${url}/execute_task`, {
        task_id: taskId,
        task_type: 'scan_target',
        parameters: { target },
      }, { timeout: 10000 });
      res.json({ taskId, result: resp.data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || err?.message || 'failed' });
    }
  }
});

app.post('/api/perfpulse/analyze', async (req, res) => {
  const { service_name, metrics } = req.body || {};
  if (!service_name || !metrics) return res.status(422).json({ error: "'service_name' and 'metrics' are required" });
  const taskId = `perf_${Date.now()}`;
  try {
    const result = await orchestrator.handleRequest({
      id: taskId,
      type: TaskType.PERFORMANCE_ANALYSIS,
      parameters: { service_name, metrics, action: 'analyze_performance' },
    } as any);
    res.json({ taskId, result });
  } catch (err: any) {
    try {
      const url = process.env.PERFPULSE_URL || 'http://localhost:8013';
      const resp = await axios.post(`${url}/execute_task`, {
        task_id: taskId,
        task_type: 'analyze_performance',
        parameters: { service_name, metrics },
      }, { timeout: 10000 });
      res.json({ taskId, result: resp.data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || err?.message || 'failed' });
    }
  }
});

app.post('/api/designforge/diagram', async (req, res) => {
  const { system_name } = req.body || {};
  if (!system_name) return res.status(422).json({ error: "'system_name' is required" });
  const taskId = `design_${Date.now()}`;
  try {
    const result = await orchestrator.handleRequest({
      id: taskId,
      type: TaskType.DESIGN,
      parameters: { system_name, action: 'generate_diagram' },
    } as any);
    res.json({ taskId, result });
  } catch (err: any) {
    try {
      const url = process.env.DESIGNFORGE_URL || 'http://localhost:8010';
      const resp = await axios.post(`${url}/execute_task`, {
        task_id: taskId,
        task_type: 'generate_diagram',
        parameters: { system_name },
      }, { timeout: 10000 });
      res.json({ taskId, result: resp.data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || err?.message || 'failed' });
    }
  }
});

app.post('/api/evaluator/quality', async (req, res) => {
  const { code, language = 'python' } = req.body || {};
  if (!code) return res.status(422).json({ error: "'code' is required" });
  const taskId = `eval_q_${Date.now()}`;
  try {
    const result = await orchestrator.handleRequest({
      id: taskId,
      type: TaskType.EVALUATION,
      parameters: { code, language, action: 'evaluate_quality' },
    } as any);
    res.json({ taskId, result });
  } catch (err: any) {
    try {
      const url = process.env.EVALUATOR_URL || 'http://localhost:8014';
      const resp = await axios.post(`${url}/execute_task`, {
        task_id: taskId,
        task_type: 'evaluate_quality',
        parameters: { code, language },
      }, { timeout: 10000 });
      res.json({ taskId, result: resp.data });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || err?.message || 'failed' });
    }
  }
});

app.post('/api/codecraft/refactor', async (req, res) => {
  const { code, language = 'python', refactor_type = 'optimize' } = req.body || {};
  if (!code) {
    return res.status(422).json({ error: "'code' is required" });
  }
  const taskId = `cc_ref_${Date.now()}`;
  try {
    const result = await orchestrator.handleRequest({
      id: taskId,
      type: TaskType.REFACTOR,
      parameters: { code, language, refactor_type, action: 'refactor_code' },
      priority: 5,
      manifestHash: 'api',
    } as any);
    res.json({ taskId, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'failed' });
  }
});

// --- Unified API v1 (Gateway-lite) ---

// List all available agents (registry view)
app.get('/v1/agents', (_req, res) => {
  const agents = orchestrator.getRegistry().getAllAgents();
  res.json({ agents });
});

// Trigger agent by id or name with action
app.post('/v1/agents/:agentId/trigger', async (req, res) => {
  const { agentId } = req.params;
  const { action, parameters = {} } = req.body || {};
  const agents = orchestrator.getRegistry().getAllAgents();
  const target = agents.find((a) => a.id === agentId || (a.metadata as any)?.name === agentId);
  if (!target) {
    return res.status(404).json({ error: `Agent not found: ${agentId}` });
  }
  const taskId = `v1_${Date.now()}`;
  try {
    const result = await orchestrator.handleRequest({
      id: taskId,
      type: target.specialization,
      parameters: { ...parameters, action },
      priority: 5,
      manifestHash: 'v1',
    } as any);
    res.json({ task_id: taskId, success: true, result });
  } catch (err: any) {
    res.status(500).json({ task_id: taskId, success: false, error: err?.message || 'failed' });
  }
});

// Proxy to retriever service for semantic search
app.post('/v1/search', async (req, res) => {
  const retrieverUrl = process.env.RETRIEVER_URL || 'http://localhost:8006';
  const { query, filters, domain, max_results = 10, min_score = 0, include_context = true } = req.body || {};
  if (!query) return res.status(422).json({ error: "'query' is required" });
  try {
    const bearer = process.env.AGENT_BEARER || process.env.CODECRAFT_TOKEN;
    const resp = await axios.post(
      `${retrieverUrl}/execute_task`,
      {
        task_id: `search_${Date.now()}`,
        task_type: 'retrieve_memories',
        parameters: { query, top_k: max_results, filters, domain, min_score },
      },
      {
        timeout: 30000,
        headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      }
    );
    res.json(resp.data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'search failed' });
  }
});

// Proxy to embedding service for single/batch embeddings
app.post('/v1/embed', async (req, res) => {
  const embeddingUrl = process.env.EMBEDDING_URL || 'http://localhost:8004';
  const { text, texts } = req.body || {};
  if (!text && !texts) return res.status(422).json({ error: "'text' or 'texts' is required" });
  const taskType = text ? 'generate_embedding' : 'generate_embedding_batch';
  try {
    const bearer = process.env.AGENT_BEARER || process.env.CODECRAFT_TOKEN;
    const resp = await axios.post(
      `${embeddingUrl}/execute_task`,
      {
        task_id: `embed_${Date.now()}`,
        task_type: taskType,
        parameters: text ? { text } : { texts },
      },
      {
        timeout: 30000,
        headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      }
    );
    res.json(resp.data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'embedding failed' });
  }
});

async function start() {
  const port = Number(process.env.PORT || 3000);
  await registerDefaultAgents();
  await registerExternalAgents();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Orchestrator HTTP server listening on :${port}`);
  });
}

start().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', e);
  process.exit(1);
});

export default app;

