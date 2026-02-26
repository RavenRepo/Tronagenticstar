import request from 'supertest';
import express from 'express';
import { createHealthRouter } from '../routes/health';

describe('Health Check API', () => {
    const app = express();
    app.use('/health', createHealthRouter());

    it('should return 200 OK', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'healthy');
    });
});
