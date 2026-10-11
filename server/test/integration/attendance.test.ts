import request from 'supertest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const app = require('../../src/app').default || require('../../src/app');
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
const QR_SECRET_SALT = process.env.QR_SECRET_SALT || 'test-qr-salt';

function generateStaffToken(overrides = {}): string {
  return jwt.sign(
    {
      staff_user_id: '550e8400-e29b-41d4-a716-446655440000',
      gym_id: '550e8400-e29b-41d4-a716-446655440001',
      role: 'receptionist',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function generateQrToken(memberId: string, gymId: string): string {
  const timestamp = Date.now();
  const secret = QR_SECRET_SALT + gymId;
  const signature = crypto.createHmac('sha256', secret).update(`${memberId}-${gymId}-${timestamp}`).digest('hex');
  const payload = { member_id: memberId, gym_id: gymId, timestamp, signature };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

describe('Attendance Integration — QR Check-In', () => {
  const staffToken = generateStaffToken();
  const validMemberId = '550e8400-e29b-41d4-a716-446655440010';
  const gymId = '550e8400-e29b-41d4-a716-446655440001';

  it('rejects request without token', async () => {
    const res = await request(app)
      .post('/api/attendance/qr')
      .send({ qr_token: 'test' });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('No token');
  });

  it('rejects request with invalid token', async () => {
    const res = await request(app)
      .post('/api/attendance/qr')
      .set('Authorization', 'Bearer invalid-token')
      .send({ qr_token: 'test' });
    expect(res.status).toBe(403);
  });

  it('rejects missing QR token', async () => {
    const res = await request(app)
      .post('/api/attendance/qr')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('QR token');
  });

  it('rejects QR with wrong gym_id (tenant mismatch)', async () => {
    const qrToken = generateQrToken(validMemberId, 'different-gym-id');
    const res = await request(app)
      .post('/api/attendance/qr')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qr_token: qrToken });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Tenant mismatch');
  });

  it('rejects expired QR token (over 30 seconds)', async () => {
    const oldTimestamp = Date.now() - 60000;
    const secret = QR_SECRET_SALT + gymId;
    const signature = crypto.createHmac('sha256', secret).update(`${validMemberId}-${gymId}-${oldTimestamp}`).digest('hex');
    const payload = { member_id: validMemberId, gym_id: gymId, timestamp: oldTimestamp, signature };
    const qrToken = Buffer.from(JSON.stringify(payload)).toString('base64');

    const res = await request(app)
      .post('/api/attendance/qr')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qr_token: qrToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Expired QR');
  });

  it('rejects tampered QR signature', async () => {
    const timestamp = Date.now();
    const payload = { member_id: validMemberId, gym_id: gymId, timestamp, signature: 'fake-signature' };
    const qrToken = Buffer.from(JSON.stringify(payload)).toString('base64');

    const res = await request(app)
      .post('/api/attendance/qr')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ qr_token: qrToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Tampered');
  });
});

describe('Attendance Integration — Manual Check-In', () => {
  const staffToken = generateStaffToken();

  it('rejects missing phone number', async () => {
    const res = await request(app)
      .post('/api/attendance/manual')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects request from unauthorized role', async () => {
    const memberToken = generateStaffToken({ role: 'member', staff_user_id: undefined, member_id: 'test' });
    const res = await request(app)
      .post('/api/attendance/manual')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ member_phone: '+966501234567' });
    expect(res.status).toBe(403);
  });
});
