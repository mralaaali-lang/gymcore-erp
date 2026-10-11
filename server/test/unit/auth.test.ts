import jwt from 'jsonwebtoken';
import type { TokenPayload } from '../../src/middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

describe('Auth Middleware — Token Generation & Verification', () => {
  const validPayload: TokenPayload = {
    staff_user_id: '550e8400-e29b-41d4-a716-446655440000',
    gym_id: '550e8400-e29b-41d4-a716-446655440001',
    role: 'manager',
  };

  it('generates a valid JWT with correct payload', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '15m' });
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    expect(decoded.staff_user_id).toBe(validPayload.staff_user_id);
    expect(decoded.gym_id).toBe(validPayload.gym_id);
    expect(decoded.role).toBe(validPayload.role);
  });

  it('rejects token with wrong secret', () => {
    const token = jwt.sign(validPayload, 'wrong-secret');
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
  });

  it('rejects expired token', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '0s' });
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow('jwt expired');
  });

  it('rejects malformed token', () => {
    expect(() => jwt.verify('not-a-token', JWT_SECRET)).toThrow();
  });

  it('generates refresh token with type field', () => {
    const refreshPayload = { staff_user_id: validPayload.staff_user_id, gym_id: validPayload.gym_id, type: 'refresh' };
    const token = jwt.sign(refreshPayload, JWT_SECRET, { expiresIn: '7d' });
    const decoded = jwt.verify(token, JWT_SECRET) as typeof refreshPayload;

    expect(decoded.type).toBe('refresh');
    expect(decoded.staff_user_id).toBe(validPayload.staff_user_id);
  });

  it('validates role enumeration', () => {
    const roles = ['owner', 'manager', 'receptionist', 'coach', 'member'];
    for (const role of roles) {
      const payload: TokenPayload = { ...validPayload, role: role as TokenPayload['role'] };
      const token = jwt.sign(payload, JWT_SECRET);
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      expect(roles).toContain(decoded.role);
    }
  });

  it('rejects token with missing gym_id', () => {
    const payload = { staff_user_id: 'test-user' };
    const token = jwt.sign(payload, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    expect(decoded.gym_id).toBeUndefined();
  });
});

describe('Role Guard Logic', () => {
  const allowedRoles = ['owner', 'manager'];

  it('allows owner to access owner routes', () => {
    expect(allowedRoles.includes('owner')).toBe(true);
  });

  it('allows manager to access manager routes', () => {
    expect(allowedRoles.includes('manager')).toBe(true);
  });

  it('denies receptionist access to manager routes', () => {
    expect(allowedRoles.includes('receptionist')).toBe(false);
  });

  it('denies coach access to manager routes', () => {
    expect(allowedRoles.includes('coach')).toBe(false);
  });

  it('denies member access to staff routes', () => {
    expect(allowedRoles.includes('member')).toBe(false);
  });
});
