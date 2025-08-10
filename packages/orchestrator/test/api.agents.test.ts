import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import nock from 'nock';

let app: any;

function mockCapabilities(url: string, payload: any) {
  nock(url).get('/capabilities').times(2).reply(200, payload);
}

describe('API thin endpoints – security/perf/design/evaluator', () => {
  beforeAll(async () => {
    // Mock discovery for all endpoints
    mockCapabilities('http://localhost:8011', {
      agent_id: 'securishield', agent_type: 'guardian', task_type: 'SECURITY', capabilities: ['scan_target']
    });
    mockCapabilities('http://localhost:8013', {
      agent_id: 'perfpulse', agent_type: 'guardian', task_type: 'PERFORMANCE_ANALYSIS', capabilities: ['analyze_performance']
    });
    mockCapabilities('http://localhost:8010', {
      agent_id: 'designforge', agent_type: 'specialist', task_type: 'DESIGN', capabilities: ['generate_diagram']
    });
    mockCapabilities('http://localhost:8014', {
      agent_id: 'evaluator', agent_type: 'guardian', task_type: 'EVALUATION', capabilities: ['evaluate_quality']
    });

    process.env.SECURISHIELD_URL = 'http://localhost:8011';
    process.env.PERFPULSE_URL = 'http://localhost:8013';
    process.env.DESIGNFORGE_URL = 'http://localhost:8010';
    process.env.EVALUATOR_URL = 'http://localhost:8014';
    // Avoid unrelated discovery errors
    process.env.CODECRAFT_URL = 'http://localhost:8012';
    mockCapabilities('http://localhost:8012', {
      agent_id: 'codecraft', agent_type: 'specialist', task_type: 'CODE_GENERATION', capabilities: ['generate_code']
    });

    const mod = await import('../src/server.js');
    app = mod.default;
  });

  afterAll(async () => {
    nock.cleanAll();
  });

  it('security scan routes and returns mocked result', async () => {
    nock('http://localhost:8011')
      .post('/execute_task')
      .reply(200, { task_id: 't', status: 'completed', result: { ok: true, target: 'x' }, metrics: { processing_time_ms: 1 } });

    const res = await request(app).post('/api/securishield/scan').send({ target: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.result?.result?.target).toBe('x');
  });

  it('perf analyze routes and returns mocked result', async () => {
    nock('http://localhost:8013')
      .post('/execute_task')
      .reply(200, { task_id: 't', status: 'completed', result: { score: 90 }, metrics: { processing_time_ms: 1 } });

    const res = await request(app).post('/api/perfpulse/analyze').send({ service_name: 'api', metrics: { cpu_percent: 10 } });
    expect(res.status).toBe(200);
    expect(res.body.result?.result?.score).toBeDefined();
  });

  it('design diagram routes and returns mocked result', async () => {
    nock('http://localhost:8010')
      .post('/execute_task')
      .reply(200, { task_id: 't', status: 'completed', result: { diagram: 'C4...' }, metrics: { processing_time_ms: 1 } });

    const res = await request(app).post('/api/designforge/diagram').send({ system_name: 'Payments' });
    expect(res.status).toBe(200);
    expect(res.body.result?.result?.diagram).toContain('C4');
  });

  it('evaluator quality routes and returns mocked result', async () => {
    nock('http://localhost:8014')
      .post('/execute_task')
      .reply(200, { task_id: 't', status: 'completed', result: { evaluation_type: 'code_quality' }, metrics: { processing_time_ms: 1 } });

    const res = await request(app).post('/api/evaluator/quality').send({ code: 'def add(a,b): return a+b' });
    expect(res.status).toBe(200);
    expect(res.body.result?.result?.evaluation_type).toBe('code_quality');
  });
});
