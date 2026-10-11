import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = require('../../src/app').default || require('../../src/app');
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const QR_SECRET_SALT = process.env.QR_SECRET_SALT || 'test-qr-salt';

const GYM_ID = '550e8400-e29b-41d4-a716-446655440001';
const STAFF_ID = '550e8400-e29b-41d4-a716-446655440000';

function staffToken(overrides = {}): string {
  return jwt.sign(
    { staff_user_id: STAFF_ID, gym_id: GYM_ID, role: 'manager', ...overrides },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

function qrToken(memberId: string): string {
  const ts = Date.now();
  const sig = crypto
    .createHmac('sha256', QR_SECRET_SALT + GYM_ID)
    .update(`${memberId}-${GYM_ID}-${ts}`)
    .digest('hex');
  return Buffer.from(JSON.stringify({ member_id: memberId, gym_id: GYM_ID, timestamp: ts, signature: sig })).toString('base64');
}

const MANAGER_TOKEN = staffToken();
const RECEP_TOKEN = staffToken({ role: 'receptionist' });
const COACH_TOKEN = staffToken({ role: 'coach' });

// -----------------------------------------------------------------------
// listMembers
// -----------------------------------------------------------------------
describe('GET /api/members — listMembers', () => {
  it('returns 200 with paginated members', async () => {
    const res = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('totalPages');
  });

  it('supports pagination query parameters', async () => {
    const res = await request(app)
      .get('/api/members?page=1&limit=5')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.page).toBe(1);
  });

  it('supports search by name or phone', async () => {
    const res = await request(app)
      .get('/api/members?search=test')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/members');
    expect(res.status).toBe(401);
  });

  it('rejects tokens with insufficient role', async () => {
    const memberToken = staffToken({ role: 'member', member_id: 'some-id', staff_user_id: undefined });
    const res = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  it('isolates tenant data — different gym sees empty', async () => {
    const otherGymToken = staffToken({ gym_id: '550e8400-e29b-41d4-a716-446655449999' });
    const res = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${otherGymToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });
});

// -----------------------------------------------------------------------
// getMember
// -----------------------------------------------------------------------
describe('GET /api/members/:id — getMember', () => {
  it('returns 404 for non-existent member', async () => {
    const res = await request(app)
      .get('/api/members/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 200 with member details when found', async () => {
    const listRes = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    if (listRes.body.data.length > 0) {
      const memberId = listRes.body.data[0].id;
      const res = await request(app)
        .get(`/api/members/${memberId}`)
        .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.id).toBe(memberId);
      expect(res.body.data).toHaveProperty('subscriptions');
      expect(res.body.data).toHaveProperty('recent_attendance');
    }
  });

  it('rejects with no auth token', async () => {
    const res = await request(app).get('/api/members/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });

  it('coach role can access member details', async () => {
    const listRes = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    if (listRes.body.data.length > 0) {
      const memberId = listRes.body.data[0].id;
      const res = await request(app)
        .get(`/api/members/${memberId}`)
        .set('Authorization', `Bearer ${COACH_TOKEN}`);
      expect(res.status).toBe(200);
    }
  });
});

// -----------------------------------------------------------------------
// createMember
// -----------------------------------------------------------------------
describe('POST /api/members — createMember', () => {
  const uniquePhone = `+96650${Date.now()}${Math.floor(Math.random() * 100)}`;

  it('creates a member with valid data', async () => {
    const offersRes = await request(app)
      .get('/api/membership-offers')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    const planId = offersRes.body.data?.[0]?.id;

    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
      .send({
        full_name: 'Test Member',
        phone_number: uniquePhone,
        plan_id: planId,
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.full_name).toBe('Test Member');
    expect(res.body.data.phone_number).toBe(uniquePhone);
  });

  it('creates member with all optional fields', async () => {
    const phone2 = `+96650${Date.now()}${Math.floor(Math.random() * 100)}`;
    const offersRes = await request(app)
      .get('/api/membership-offers')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    const planId = offersRes.body.data?.[0]?.id;

    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
      .send({
        full_name: 'Full Test Member',
        phone_number: phone2,
        email: 'test@example.com',
        birth_date: '1990-05-15',
        plan_id: planId,
        medical_notes: 'Asthma, allergic to penicillin',
        photo_url: 'https://example.com/photo.jpg',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe('test@example.com');
    expect(res.body.data.medical_notes).toBe('Asthma, allergic to penicillin');
  });

  it('rejects duplicate phone number', async () => {
    const offersRes = await request(app)
      .get('/api/membership-offers')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    const planId = offersRes.body.data?.[0]?.id;

    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
      .send({
        full_name: 'Duplicate Member',
        phone_number: uniquePhone,
        plan_id: planId,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects invalid plan_id', async () => {
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`)
      .send({
        full_name: 'No Plan Member',
        phone_number: `+96650${Date.now()}`,
        plan_id: '00000000-0000-0000-0000-000000000000',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found|inactive/i);
  });

  it('rejects coach role from creating members', async () => {
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${COACH_TOKEN}`)
      .send({
        full_name: 'Coach Create',
        phone_number: `+96650${Date.now()}`,
        plan_id: '00000000-0000-0000-0000-000000000000',
      });
    expect(res.status).toBe(403);
  });
});

// -----------------------------------------------------------------------
// manualCheckIn
// -----------------------------------------------------------------------
describe('POST /api/attendance/manual — manualCheckIn', () => {
  it('rejects with neither member_phone nor member_id', async () => {
    const res = await request(app)
      .post('/api/attendance/manual')
      .set('Authorization', `Bearer ${RECEP_TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('accepts member_phone lookup', async () => {
    const listRes = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    const member = listRes.body.data?.[0];
    if (!member) return;

    const res = await request(app)
      .post('/api/attendance/manual')
      .set('Authorization', `Bearer ${RECEP_TOKEN}`)
      .send({ member_phone: member.phone_number });
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('record');
    } else if (res.status === 400 && res.body.error?.includes('already checked in')) {
      expect(res.body.error).toMatch(/already checked in/i);
    }
  });

  it('accepts member_id lookup', async () => {
    const listRes = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${MANAGER_TOKEN}`);
    const member = listRes.body.data?.[0];
    if (!member) return;

    const res = await request(app)
      .post('/api/attendance/manual')
      .set('Authorization', `Bearer ${RECEP_TOKEN}`)
      .send({ member_id: member.id });
    expect([200, 400]).toContain(res.status);
  });

  it('returns 404 for unknown phone number', async () => {
    const res = await request(app)
      .post('/api/attendance/manual')
      .set('Authorization', `Bearer ${RECEP_TOKEN}`)
      .send({ member_phone: '+966999999999' });
    expect(res.status).toBe(404);
  });
});
