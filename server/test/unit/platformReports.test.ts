import { getMultiTenantReportSchema } from '../../src/validators/schemas';

describe('Platform Reports — Schemas', () => {
  describe('getMultiTenantReportSchema', () => {
    it('accepts undefined body', () => {
      const result = getMultiTenantReportSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('accepts empty object body', () => {
      const result = getMultiTenantReportSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts valid plan_tier', () => {
      const result = getMultiTenantReportSchema.safeParse({ plan_tier: 'premium' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid plan_tier', () => {
      const result = getMultiTenantReportSchema.safeParse({ plan_tier: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('accepts positive min_members', () => {
      const result = getMultiTenantReportSchema.safeParse({ min_members: 50 });
      expect(result.success).toBe(true);
    });

    it('rejects negative min_members', () => {
      const result = getMultiTenantReportSchema.safeParse({ min_members: -5 });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer min_members', () => {
      const result = getMultiTenantReportSchema.safeParse({ min_members: 10.5 });
      expect(result.success).toBe(false);
    });

    it('accepts valid gym_ids array', () => {
      const result = getMultiTenantReportSchema.safeParse({
        gym_ids: ['550e8400-e29b-41d4-a716-446655440001'],
      });
      expect(result.success).toBe(true);
    });
  });
});
