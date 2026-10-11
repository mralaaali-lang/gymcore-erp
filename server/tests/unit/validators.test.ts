import { describe, it, expect } from 'vitest';
import { loginSchema, refreshTokenSchema } from '../../src/validators/schemas';

describe('Auth validators', () => {
  it('accepts valid login payload', () => {
    const result = loginSchema.safeParse({ email: 'admin@gymcore.com', password: 'secret123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty login payload', () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts valid refresh token payload', () => {
    const result = refreshTokenSchema.safeParse({ refresh_token: 'abc' });
    expect(result.success).toBe(true);
  });
});
