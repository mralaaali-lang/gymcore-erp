import {
  createContractSchema, updateContractSchema, renewContractSchema, cancelContractSchema,
  addContractItemSchema, updateContractItemSchema, markInvoicePaidSchema,
} from '../../src/validators/schemas';

/** §40 — توحيد أقنعة الإدخال لعقود المنصة قبل وصولها للكونترولرات */

const GYM = '1b55f81c-2970-4f2d-b263-eaf76d3b08b0';
const PLAN = '2b55f81c-2970-4f2d-b263-eaf76d3b08b0';
const ADDON = '3b55f81c-2970-4f2d-b263-eaf76d3b08b0';

describe('§40 contract zod schemas', () => {
  test('createContract: defaults cycle/auto_renew, rejects junk', () => {
    const ok = createContractSchema.parse({ gym_id: GYM, plan_id: PLAN });
    expect(ok.cycle).toBe('monthly');

    expect(createContractSchema.safeParse({ gym_id: GYM, plan_id: PLAN, cycle: 'weekly' }).success).toBe(false);
    expect(createContractSchema.safeParse({ gym_id: 'not-uuid', plan_id: PLAN }).success).toBe(false);
    expect(createContractSchema.safeParse({ gym_id: GYM, plan_id: PLAN, price: -5 }).success).toBe(false);
    expect(createContractSchema.safeParse({ gym_id: GYM, plan_id: PLAN, start_date: '14/10/2026' }).success).toBe(false);
  });

  test('updateContract: at least one field, ISO dates only', () => {
    expect(updateContractSchema.safeParse({}).success).toBe(false);
    expect(updateContractSchema.safeParse({ price: 1200 }).success).toBe(true);
    expect(updateContractSchema.safeParse({ renewal_date: '2026-11-01' }).success).toBe(true);
    expect(updateContractSchema.safeParse({ renewal_date: '2026-11-1' }).success).toBe(false);
  });

  test('renewContract: periods 1..24 default 1; cancel reason optional', () => {
    expect(renewContractSchema.parse({}).periods).toBe(1);
    expect(renewContractSchema.safeParse({ periods: 25 }).success).toBe(false);
    expect(renewContractSchema.safeParse({ periods: 0 }).success).toBe(false);
    expect(cancelContractSchema.safeParse({}).success).toBe(true);
  });

  test('contract items: quantity bounds and price sanity', () => {
    const ok = addContractItemSchema.parse({ addon_id: ADDON });
    expect(ok.quantity).toBe(1);
    expect(addContractItemSchema.safeParse({ addon_id: ADDON, quantity: 101 }).success).toBe(false);
    expect(addContractItemSchema.safeParse({ addon_id: ADDON, unit_price: -1 }).success).toBe(false);
    expect(addContractItemSchema.safeParse({ addon_id: ADDON, expires_at: '2026-13-40' }).success).toBe(false);
    expect(updateContractItemSchema.safeParse({}).success).toBe(false);
    expect(updateContractItemSchema.safeParse({ quantity: 5, expires_at: null }).success).toBe(true);
    expect(markInvoicePaidSchema.safeParse({}).success).toBe(true);
  });
});
