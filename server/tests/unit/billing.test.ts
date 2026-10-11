import { describe, it, expect } from 'vitest';
import { createBillingPlanSchema, updateBillingPlanSchema } from '../../src/validators/schemas';

describe('Billing validators', () => {
  it('accepts valid create plan payload', () => {
    const payload = {
      name: 'Basic',
      name_ar: 'أساسي',
      price_monthly: 100,
      price_yearly: 1200,
      max_staff: 5,
      max_members: 100,
      max_gyms: 1,
      features: ['has_dashboard'],
    };
    expect(createBillingPlanSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts valid update plan payload', () => {
    const payload = {
      name: 'Basic',
      name_ar: 'أساسي',
      price_monthly: 100,
      price_yearly: 1200,
      max_staff: 5,
      max_members: 100,
      max_gyms: 1,
      features: ['has_dashboard'],
      is_active: true,
    };
    expect(updateBillingPlanSchema.safeParse(payload).success).toBe(true);
  });
});
