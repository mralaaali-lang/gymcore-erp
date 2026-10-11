import {
  loginSchema,
  createMemberSchema,
  qrAttendanceSchema,
  classBookingSchema,
  freezeSubscriptionSchema,
  pendingActionSchema,
  processPendingSchema,
} from '../../src/validators/schemas';

describe('Validation Schemas (Zod)', () => {
  describe('loginSchema', () => {
    it('accepts valid login data', () => {
      const result = loginSchema.safeParse({ email: 'admin@gimawi.com', password: 'StrongPass1' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = loginSchema.safeParse({ email: 'not-an-email', password: 'StrongPass1' });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = loginSchema.safeParse({ email: 'admin@gimawi.com', password: '123' });
      expect(result.success).toBe(false);
    });
  });

  describe('createMemberSchema', () => {
    it('accepts valid member data', () => {
      const result = createMemberSchema.safeParse({
        full_name: 'أحمد محمود',
        phone_number: '+966501234567',
      });
      expect(result.success).toBe(true);
    });

    it('rejects short name', () => {
      const result = createMemberSchema.safeParse({ full_name: 'أ', phone_number: '+966501234567' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid phone', () => {
      const result = createMemberSchema.safeParse({ full_name: 'أحمد', phone_number: 'abc' });
      expect(result.success).toBe(false);
    });

    it('accepts member with photo URL', () => {
      const result = createMemberSchema.safeParse({
        full_name: 'محمد',
        phone_number: '+966501234568',
        photo_url: 'https://example.com/photo.jpg',
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty photo_url', () => {
      const result = createMemberSchema.safeParse({
        full_name: 'أحمد',
        phone_number: '+966501234569',
        photo_url: '',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid photo_url', () => {
      const result = createMemberSchema.safeParse({
        full_name: 'أحمد',
        phone_number: '+966501234569',
        photo_url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('qrAttendanceSchema', () => {
    it('accepts valid QR token', () => {
      const result = qrAttendanceSchema.safeParse({ qr_token: 'dGVzdC10b2tlbg==' });
      expect(result.success).toBe(true);
    });

    it('rejects empty QR token', () => {
      const result = qrAttendanceSchema.safeParse({ qr_token: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing QR token', () => {
      const result = qrAttendanceSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('classBookingSchema', () => {
    it('accepts valid UUID', () => {
      const result = classBookingSchema.safeParse({ class_id: '550e8400-e29b-41d4-a716-446655440000' });
      expect(result.success).toBe(true);
    });

    it('rejects non-UUID', () => {
      const result = classBookingSchema.safeParse({ class_id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('freezeSubscriptionSchema', () => {
    it('accepts valid freeze request', () => {
      const result = freezeSubscriptionSchema.safeParse({
        subscription_id: '550e8400-e29b-41d4-a716-446655440000',
        freeze_days: 15,
      });
      expect(result.success).toBe(true);
    });

    it('rejects freeze_days over 30', () => {
      const result = freezeSubscriptionSchema.safeParse({
        subscription_id: '550e8400-e29b-41d4-a716-446655440000',
        freeze_days: 31,
      });
      expect(result.success).toBe(false);
    });

    it('rejects freeze_days under 1', () => {
      const result = freezeSubscriptionSchema.safeParse({
        subscription_id: '550e8400-e29b-41d4-a716-446655440000',
        freeze_days: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('pendingActionSchema', () => {
    it('accepts valid pending action', () => {
      const result = pendingActionSchema.safeParse({
        action_type: 'update',
        target_table: 'members',
        target_record_id: '550e8400-e29b-41d4-a716-446655440000',
        reason: 'Phone number correction',
        new_data_json: { phone_number: '+966501234569' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid target_table', () => {
      const result = pendingActionSchema.safeParse({
        action_type: 'update',
        target_table: 'activity_logs',
        target_record_id: '550e8400-e29b-41d4-a716-446655440000',
        reason: 'test',
        new_data_json: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('processPendingSchema', () => {
    it('accepts approved decision', () => {
      const result = processPendingSchema.safeParse({
        action_id: '550e8400-e29b-41d4-a716-446655440000',
        decision: 'approved',
      });
      expect(result.success).toBe(true);
    });

    it('accepts rejected decision', () => {
      const result = processPendingSchema.safeParse({
        action_id: '550e8400-e29b-41d4-a716-446655440000',
        decision: 'rejected',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid decision', () => {
      const result = processPendingSchema.safeParse({
        action_id: '550e8400-e29b-41d4-a716-446655440000',
        decision: 'maybe',
      });
      expect(result.success).toBe(false);
    });
  });
});
