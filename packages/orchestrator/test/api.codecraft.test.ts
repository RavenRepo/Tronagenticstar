import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import nock from 'nock';

let app: any;

describe('API vertical slice – CodeCraft endpoints', () => {
  beforeAll(async () => {
    const agentBase = 'http://localhost:8012';
    process.env.CODECRAFT_URL = agentBase;

    // Mock capabilities discovery performed at import-time in server
    nock(agentBase).get('/capabilities').times(3).reply(200, {
      agent_id: 'codecraft',
      agent_type: 'specialist',
      task_type: 'CODE_GENERATION',
      capabilities: ['generate_code', 'refactor_code']
    });

    // Dynamically import after environment and nock are set
    const mod = await import('../src/server.js');
    app = mod.default;
  });

  afterAll(async () => {
    nock.cleanAll();
  });

  it('rejects generate without prompt', async () => {
    const res = await request(app).post('/api/codecraft/generate').send({});
    expect(res.status).toBe(422);
  });

  it('routes generate to agent and returns result (mocked agent)', async () => {
    const agentBase = process.env.CODECRAFT_URL as string;

    // Mock execute_task
    nock(agentBase)
      .post('/execute_task')
      .reply(200, {
        task_id: 'any',
        status: 'completed',
        result: { generated_code: 'def fib(n): ...' },
        metrics: { processing_time_ms: 42 }
      });

    const res = await request(app)
      .post('/api/codecraft/generate')
      .send({ prompt: 'write fibonacci', language: 'python' });

    expect(res.status).toBe(200);
    expect(res.body.result?.result?.generated_code).toBeDefined();
  });

  it('routes refactor to agent and returns result (mocked agent)', async () => {
    const agentBase = process.env.CODECRAFT_URL as string;

    nock(agentBase)
      .post('/execute_task')
      .reply(200, {
        task_id: 'any',
        status: 'completed',
        result: { refactored_code: 'def fib(n): ... # optimized' },
        metrics: { processing_time_ms: 50 }
      });

    const res = await request(app)
      .post('/api/codecraft/refactor')
      .send({ code: 'def f(n): return n', language: 'python' });

    expect(res.status).toBe(200);
    expect(res.body.result?.result?.refactored_code).toBeDefined();
  });
});
