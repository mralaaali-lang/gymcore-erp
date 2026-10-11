import request from 'supertest';
import jwt from 'jsonwebtoken';

const app = require('../../src/app').default || require('../../src/app');
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

function generateMemberToken(overrides = {}): string {
  return jwt.sign(
    {
      member_id: '550e8400-e29b-41d4-a716-446655440010',
      gym_id: '550e8400-e29b-41d4-a716-446655440001',
      role: 'member',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

describe('Bookings Integration — Class Booking', () => {
  const memberToken = generateMemberToken();

  it('rejects missing class_id', async () => {
    const res = await request(app)
      .post('/api/classes/book')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Class ID');
  });

  it('rejects non-UUID class_id', async () => {
    const res = await request(app)
      .post('/api/classes/book')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ class_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('rejects request without token', async () => {
    const res = await request(app)
      .post('/api/classes/book')
      .send({ class_id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(res.status).toBe(401);
  });
});

describe('Bookings Integration — Subscription Freeze', () => {
  const memberToken = generateMemberToken();

  it('rejects missing subscription_id', async () => {
    const res = await request(app)
      .post('/api/subscriptions/freeze')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ freeze_days: 15 });
    expect(res.status).toBe(400);
  });

  it('rejects freeze_days over 30', async () => {
    const res = await request(app)
      .post('/api/subscriptions/freeze')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        subscription_id: '550e8400-e29b-41d4-a716-446655440000',
        freeze_days: 31,
      });
    expect(res.status).toBe(400);
  });

  it('rejects freeze_days under 1', async () => {
    const res = await request(app)
      .post('/api/subscriptions/freeze')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        subscription_id: '550e8400-e29b-41d4-a716-446655440000',
        freeze_days: 0,
      });
    expect(res.status).toBe(400);
  });
});

describe('Bookings Integration — Get My Bookings', () => {
  const memberToken = generateMemberToken();

  it('returns bookings list for authenticated member', async () => {
    const res = await request(app)
      .get('/api/classes/my-bookings')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  it('rejects access for staff users', async () => {
    const staffToken = jwt.sign(
      { staff_user_id: 'test-staff', gym_id: 'test-gym', role: 'manager' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await request(app)
      .get('/api/classes/my-bookings')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});
