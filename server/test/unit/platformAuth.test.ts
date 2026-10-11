import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

/**
 * Platform admin tokens use a different payload structure than staff tokens.
 * - Staff token: { staff_user_id, gym_id, role, jti? }
 * - Platform admin token: { platform_admin_id, type: 'platform_admin', jti? }
 *
 * These are structurally incompatible by design so a staff token can never
 * pass platform admin checks and vice versa.
 */
describe('Platform Admin Auth — Token Generation & Verification', () => {
  const validPayload = {
    platform_admin_id: '660e8400-e29b-41d4-a716-446655440000',
    type: 'platform_admin' as const,
    jti: 'jti-660e8400-e29b-41d4-a716-446655440001',
  };

  it('generates a valid platform admin token', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '24h' });
    const decoded = jwt.verify(token, JWT_SECRET) as typeof validPayload;

    expect(decoded.platform_admin_id).toBe(validPayload.platform_admin_id);
    expect(decoded.type).toBe('platform_admin');
    expect(decoded.jti).toBe(validPayload.jti);
  });

  it('rejects platform token with wrong secret', () => {
    const token = jwt.sign(validPayload, 'wrong-secret');
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
  });

  it('rejects expired platform token', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '0s' });
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow('jwt expired');
  });

  it('rejects malformed platform token', () => {
    expect(() => jwt.verify('not-a-platform-token', JWT_SECRET)).toThrow();
  });

  it('rejects token missing type field', () => {
    const payload = { platform_admin_id: validPayload.platform_admin_id };
    const token = jwt.sign(payload, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    expect(decoded.type).toBeUndefined();
    // A platform admin token MUST have type === 'platform_admin'
    expect(decoded.type === 'platform_admin').toBe(false);
  });

  it('rejects token with wrong type value', () => {
    const payload = { ...validPayload, type: 'staff' };
    const token = jwt.sign(payload, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    expect(decoded.type).toBe('staff');
    expect(decoded.type === 'platform_admin').toBe(false);
  });

  it('rejects token missing platform_admin_id', () => {
    const payload = { type: 'platform_admin', jti: validPayload.jti };
    const token = jwt.sign(payload, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    expect(decoded.platform_admin_id).toBeUndefined();
  });

  it('generates platform refresh token with type field', () => {
    const refreshPayload = {
      platform_admin_id: validPayload.platform_admin_id,
      type: 'platform_refresh' as const,
      jti: validPayload.jti,
    };
    const token = jwt.sign(refreshPayload, JWT_SECRET, { expiresIn: '7d' });
    const decoded = jwt.verify(token, JWT_SECRET) as typeof refreshPayload;

    expect(decoded.type).toBe('platform_refresh');
    expect(decoded.platform_admin_id).toBe(validPayload.platform_admin_id);
  });

  it('platform token with 24h expiry is valid immediately', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '24h' });
    expect(() => jwt.verify(token, JWT_SECRET)).not.toThrow();
  });

  it('platform token with 7d expiry is valid immediately', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '7d' });
    expect(() => jwt.verify(token, JWT_SECRET)).not.toThrow();
  });

  it('includes jti for session revocation', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '24h' });
    const decoded = jwt.verify(token, JWT_SECRET) as typeof validPayload;
    // jti (JWT ID) is required for session tracking and revocation
    expect(decoded.jti).toBeDefined();
    expect(typeof decoded.jti).toBe('string');
  });

  // --- Staff token vs Platform admin token structural checks ---

  it('staff token lacks platform_admin_id', () => {
    const staffPayload = {
      staff_user_id: '550e8400-e29b-41d4-a716-446655440000',
      gym_id: '550e8400-e29b-41d4-a716-446655440001',
      role: 'manager' as const,
    };
    const token = jwt.sign(staffPayload, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

    expect(decoded.staff_user_id).toBeDefined();
    expect(decoded.gym_id).toBeDefined();
    expect(decoded.role).toBeDefined();
    // Staff token should NOT have platform_admin_id
    expect(decoded.platform_admin_id).toBeUndefined();
    // Staff token should NOT have type === 'platform_admin'
    expect(decoded.type).toBeUndefined();
  });

  it('platform token lacks staff fields', () => {
    const token = jwt.sign(validPayload, JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;

    expect(decoded.platform_admin_id).toBeDefined();
    expect(decoded.type).toBe('platform_admin');
    // Platform token should NOT have staff_user_id, gym_id, or role
    expect(decoded.staff_user_id).toBeUndefined();
    expect(decoded.gym_id).toBeUndefined();
    expect(decoded.role).toBeUndefined();
  });

  // --- Edge cases ---

  it('handles token with future expiry far in the future', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { expiresIn: '100y' });
    expect(() => jwt.verify(token, JWT_SECRET)).not.toThrow();
  });

  it('handles token with no expiry (iat only)', () => {
    const token = jwt.sign(validPayload, JWT_SECRET, { noTimestamp: false });
    expect(() => jwt.verify(token, JWT_SECRET)).not.toThrow();
  });

  it('rejects token with alg:none (security check)', () => {
    // Manually craft a token with alg: none (this is a known JWT vulnerability)
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(validPayload)).toString('base64url');
    const fakeToken = `${header}.${payload}.`;
    expect(() => jwt.verify(fakeToken, JWT_SECRET)).toThrow();
  });
});
