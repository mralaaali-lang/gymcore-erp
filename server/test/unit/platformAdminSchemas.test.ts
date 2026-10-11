import {
  createGymSchema,
  setGymActiveSchema,
  createStaffSchemaV2,
  createPaymentSchema,
  createExpenseSchema,
  createProductSchema,
  updateProductSchema,
  updateStaffSchema,
  createSaleSchema,
  createPurchaseSchema,
  createSupplierSchema,
} from '../../src/validators/schemas';

describe('Platform Admin Schemas (Zod)', () => {
  describe('createGymSchema', () => {
    it('accepts valid gym creation data', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'FitZone Gym',
        subdomain: 'fitzone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'ahmed@fitzone.com',
        owner_password: 'StrongPass1',
      });
      expect(result.success).toBe(true);
    });

    it('accepts gym creation with plan_tier', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'Power Gym',
        subdomain: 'powergym',
        owner_full_name: 'Ali Hassan',
        owner_email: 'ali@power.com',
        owner_password: 'StrongPass1',
        plan_tier: 'professional',
      });
      expect(result.success).toBe(true);
    });

    it('rejects short gym_name', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'F',
        subdomain: 'fitzone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'ahmed@fitzone.com',
        owner_password: 'StrongPass1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid subdomain (uppercase)', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'FitZone',
        subdomain: 'FitZone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'ahmed@fitzone.com',
        owner_password: 'StrongPass1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects subdomain with spaces', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'FitZone',
        subdomain: 'fit zone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'ahmed@fitzone.com',
        owner_password: 'StrongPass1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid owner_email', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'FitZone',
        subdomain: 'fitzone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'not-an-email',
        owner_password: 'StrongPass1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects weak owner_password (no uppercase)', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'FitZone',
        subdomain: 'fitzone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'ahmed@fitzone.com',
        owner_password: 'weakpass1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects weak owner_password (no number)', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'FitZone',
        subdomain: 'fitzone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'ahmed@fitzone.com',
        owner_password: 'WeakPassNoNum',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short owner_password', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'FitZone',
        subdomain: 'fitzone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'ahmed@fitzone.com',
        owner_password: 'Sh0rt',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid plan_tier', () => {
      const result = createGymSchema.safeParse({
        gym_name: 'FitZone',
        subdomain: 'fitzone',
        owner_full_name: 'Ahmed Mohammed',
        owner_email: 'ahmed@fitzone.com',
        owner_password: 'StrongPass1',
        plan_tier: 'ultra',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('setGymActiveSchema', () => {
    it('accepts true', () => {
      const result = setGymActiveSchema.safeParse({ is_active: true });
      expect(result.success).toBe(true);
    });

    it('accepts false', () => {
      const result = setGymActiveSchema.safeParse({ is_active: false });
      expect(result.success).toBe(true);
    });

    it('rejects non-boolean', () => {
      const result = setGymActiveSchema.safeParse({ is_active: 'yes' });
      expect(result.success).toBe(false);
    });

    it('rejects missing is_active', () => {
      const result = setGymActiveSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('createStaffSchemaV2', () => {
    it('accepts valid staff data', () => {
      const result = createStaffSchemaV2.safeParse({
        full_name: 'Sara Ahmed',
        email: 'sara@gym.com',
        password: 'pass123',
        role: 'manager',
      });
      expect(result.success).toBe(true);
    });

    it('accepts staff with optional fields', () => {
      const result = createStaffSchemaV2.safeParse({
        full_name: 'Sara Ahmed',
        email: 'sara@gym.com',
        password: 'pass123',
        role: 'coach',
        phone: '+966501234567',
        salary: 5000,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid role', () => {
      const result = createStaffSchemaV2.safeParse({
        full_name: 'Sara Ahmed',
        email: 'sara@gym.com',
        password: 'pass123',
        role: 'admin',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = createStaffSchemaV2.safeParse({
        full_name: 'Sara Ahmed',
        email: 'not-email',
        password: 'pass123',
        role: 'manager',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short full_name', () => {
      const result = createStaffSchemaV2.safeParse({
        full_name: 'S',
        email: 'sara@gym.com',
        password: 'pass123',
        role: 'manager',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createPaymentSchema', () => {
    it('accepts valid payment', () => {
      const result = createPaymentSchema.safeParse({
        member_id: '550e8400-e29b-41d4-a716-446655440000',
        amount: 150.00,
        payment_method: 'cash',
      });
      expect(result.success).toBe(true);
    });

    it('accepts payment with description', () => {
      const result = createPaymentSchema.safeParse({
        member_id: '550e8400-e29b-41d4-a716-446655440000',
        amount: 200,
        description: 'Monthly membership',
        payment_method: 'card',
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative amount', () => {
      const result = createPaymentSchema.safeParse({
        member_id: '550e8400-e29b-41d4-a716-446655440000',
        amount: -50,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid payment_method', () => {
      const result = createPaymentSchema.safeParse({
        member_id: '550e8400-e29b-41d4-a716-446655440000',
        amount: 100,
        payment_method: 'bitcoin',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createSaleSchema', () => {
    it('accepts valid sale', () => {
      const result = createSaleSchema.safeParse({
        items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 }],
        payment_method: 'cash',
      });
      expect(result.success).toBe(true);
    });

    it('accepts sale with member_id', () => {
      const result = createSaleSchema.safeParse({
        member_id: '550e8400-e29b-41d4-a716-446655440000',
        items: [{ product_id: '550e8400-e29b-41d4-a716-446655440001', quantity: 1 }],
        payment_method: 'card',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty items array', () => {
      const result = createSaleSchema.safeParse({
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects items with invalid quantity', () => {
      const result = createSaleSchema.safeParse({
        items: [{ product_id: '550e8400-e29b-41d4-a716-446655440000', quantity: 0 }],
      });
      expect(result.success).toBe(false);
    });
  });
});
