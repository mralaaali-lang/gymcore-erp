import request from 'supertest';
import jwt from 'jsonwebtoken';

const app = require('../../src/app').default || require('../../src/app');
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const GYM_ID = '550e8400-e29b-41d4-a716-446655440001';
const STAFF_ID = '550e8400-e29b-41d4-a716-446655440000';

function staffToken(overrides = {}): string {
  return jwt.sign(
    { staff_user_id: STAFF_ID, gym_id: GYM_ID, role: 'manager', ...overrides },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

const MANAGER_TOKEN = staffToken();
const RECEP_TOKEN = staffToken({ role: 'receptionist' });

describe('Workflow Definitions API', () => {
  describe('GET /api/workflows — listWorkflows', () => {
    it('returns 200 with workflow list', async () => {
      const res = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns seeded default workflows', async () => {
      const res = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
      expect(res.body.data.length).toBeGreaterThanOrEqual(6);
      expect(res.body.data.some((w: Record<string, unknown>) => w.icon === 'timer_off')).toBe(true);
      expect(res.body.data.some((w: Record<string, unknown>) => w.icon === 'payments')).toBe(true);
    });

    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/workflows');
      expect(res.status).toBe(401);
    });

    it('rejects receptionist role', async () => {
      const res = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${RECEP_TOKEN}`);
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/workflows/:id — updateWorkflow', () => {
    it('toggles a workflow enabled state', async () => {
      const listRes = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
      const wf = listRes.body.data[0];
      const prevEnabled = wf.enabled;

      const res = await request(app)
        .put(`/api/workflows/${wf.id}`)
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
        .send({ enabled: !prevEnabled });
      expect(res.status).toBe(200);
      expect(res.body.data.enabled).toBe(!prevEnabled);
    });

    it('rejects missing enabled field', async () => {
      const listRes = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
      const wf = listRes.body.data[0];

      const res = await request(app)
        .put(`/api/workflows/${wf.id}`)
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown workflow ID', async () => {
      const res = await request(app)
        .put('/api/workflows/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
        .send({ enabled: true });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/workflows/:id/trigger — triggerWorkflow', () => {
    it('triggers a workflow and creates pending action', async () => {
      const listRes = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
      const wf = listRes.body.data[0];

      const res = await request(app)
        .post(`/api/workflows/${wf.id}/trigger`)
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.last_triggered_at).toBeTruthy();
    });

    it('rejects trigger for non-existent workflow', async () => {
      const res = await request(app)
        .post('/api/workflows/00000000-0000-0000-0000-000000000000/trigger')
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
      expect(res.status).toBe(404);
    });
  });
});
