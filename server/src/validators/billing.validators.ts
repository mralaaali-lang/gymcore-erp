/**
 * billing.validators.ts — Zod validation schemas for billing module
 */

import { z } from 'zod';

// ─── Invoice Validators ─────────────────────────────────────────

export const createInvoiceSchema = z.object({
  gym_id: z.string().uuid('Invalid gym ID').trim(),
  tenant_id: z.string().uuid('Invalid tenant ID').optional().or(z.literal('')),
  billing_period_start: z.string().transform((v) => new Date(v)),
  billing_period_end: z.string().transform((v) => new Date(v)),
  plan_id: z.string().uuid('Invalid plan ID').optional().or(z.literal('')),
  plan_name: z.string().max(255).optional(),
  base_amount: z.number().min(0, 'Amount cannot be negative'),
  tax_rate: z.number().min(0).max(100).optional(),
  tax_amount: z.number().min(0).optional(),
  discount_amount: z.number().min(0).default(0),
  coupon_id: z.string().uuid('Invalid coupon ID').optional().or(z.literal('')),
  currency: z.string().length(3).default('EGP'),
  due_date: z.string().transform((v) => new Date(v)),
  notes: z.string().max(1000).optional(),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(['pending', 'paid', 'partial', 'overdue', 'cancelled', 'refunded']).optional(),
  paid_amount: z.number().min(0).optional(),
  payment_method: z.string().max(50).optional(),
  payment_reference: z.string().max(255).optional(),
  notes: z.string().max(1000).optional(),
});

export const invoiceFilterSchema = z.object({
  gym_id: z.string().uuid('Invalid gym ID').optional(),
  status: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ─── Coupon Validators ──────────────────────────────────────────

export const createCouponSchema = z.object({
  code: z.string().min(3).max(50),
  gym_id: z.string().uuid('Invalid gym ID').optional().or(z.literal('')),
  platform_wide: z.boolean().default(false),
  type: z.enum(['percentage', 'fixed_amount']),
  value: z.number().min(0).max(10000),
  max_uses: z.number().int().positive().optional(),
  min_order_amount: z.number().min(0).default(0),
starts_at: z.string(),
  expires_at: z.string(),
  description: z.string().max(500).optional(),
});

export const applyCouponSchema = z.object({
  code: z.string().min(3).max(50),
  gym_id: z.string().uuid('Invalid gym ID').optional().or(z.literal('')),
  order_amount: z.number().min(0),
});

export const couponFilterSchema = z.object({
  gym_id: z.string().uuid('Invalid gym ID').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ─── Payment Gateway Validators ─────────────────────────────────

export const paymentGatewayConfigSchema = z.object({
  name: z.string().max(100),
  provider: z.enum(['fawry', 'paymob', 'stripe', 'paypal', 'custom']),
  is_test_mode: z.boolean().default(true),
  api_key_test: z.string().optional(),
  api_key_production: z.string().optional(),
  secret_key_test: z.string().optional(),
  secret_key_production: z.string().optional(),
  webhook_secret: z.string().optional(),
  configuration: z.record(z.string(), z.unknown()).default({}),
  fee_percentage: z.number().min(0).max(100).default(0),
  fixed_fee: z.number().min(0).default(0),
  supported_currencies: z.array(z.string().length(3)).default(['EGP']),
});

// ─── Loyalty Validators ─────────────────────────────────────────

export const addPointsSchema = z.object({
  account_id: z.string().uuid('Invalid account ID'),
  points: z.number().int().positive('Points must be positive'),
  description: z.string().max(500).optional(),
  reference_type: z.string().max(50).optional(),
  reference_id: z.string().uuid().optional().or(z.literal('')),
});

export const redeemPointsSchema = z.object({
  account_id: z.string().uuid('Invalid account ID'),
  points: z.number().int().positive('Points must be positive'),
  description: z.string().max(500).optional(),
  reward_id: z.string().uuid().optional().or(z.literal('')),
});

export const loyaltySettingsSchema = z.object({
  points_per_currency: z.number().min(0.1).default(10),
  min_redemption_points: z.number().int().positive().default(100),
  points_expiry_days: z.number().int().positive().default(365),
  max_points_per_transaction: z.number().int().positive().default(10000),
  allow_partial_redemption: z.boolean().default(true),
});

// ─── Marketing Validators ──────────────────────────────────────

export const createCampaignSchema = z.object({
  name: z.string().max(255),
  name_ar: z.string().max(255).optional(),
  type: z.enum(['email', 'sms', 'whatsapp', 'referral', 'social']),
  gym_id: z.string().uuid('Invalid gym ID').optional().or(z.literal('')),
  platform_wide: z.boolean().default(false),
  budget: z.number().min(0).default(0),
  target_audience: z.record(z.string(), z.unknown()).default({}),
  start_date: z.string().transform((v) => new Date(v)).optional(),
  end_date: z.string().transform((v) => new Date(v)).optional(),
});

export const createBroadcastSchema = z.object({
  campaign_id: z.string().uuid('Invalid campaign ID').optional().or(z.literal('')),
  subject: z.string().max(500),
  content: z.string().min(1),
  target_type: z.enum(['all_members', 'plan_specific', 'region_specific', 'selected']),
  target_filter: z.record(z.string(), z.unknown()).default({}),
  scheduled_at: z.string().transform((v) => new Date(v)).optional(),
});

export const createReferralSchema = z.object({
  referrer_gym_id: z.string().uuid('Invalid gym ID'),
  referred_member_id: z.string().uuid('Invalid member ID'),
  referrer_member_id: z.string().uuid().optional().or(z.literal('')),
  referral_code: z.string().min(3).max(50),
  campaign_id: z.string().uuid('Invalid campaign ID').optional().or(z.literal('')),
});

// ─── Support Ticket Validators ──────────────────────────────────

export const createTicketSchema = z.object({
  gym_id: z.string().uuid('Invalid gym ID').optional().or(z.literal('')),
  member_id: z.string().uuid('Invalid member ID').optional().or(z.literal('')),
  subject: z.string().max(500),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.enum(['billing', 'technical', 'subscription', 'general', 'other']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

export const addTicketMessageSchema = z.object({
  sender_type: z.enum(['customer', 'support', 'system']),
  sender_id: z.string().uuid().optional().or(z.literal('')),
  content: z.string().min(1, 'Message cannot be empty'),
  is_internal: z.boolean().default(false),
});

export const assignTicketSchema = z.object({
  assigned_to: z.string().uuid('Invalid staff ID'),
});

export const resolveTicketSchema = z.object({
  resolution: z.string().min(10, 'Resolution must be at least 10 characters'),
  resolution_code: z.string().max(20).optional(),
  satisfaction_rating: z.number().int().min(1).max(5).optional(),
});

export const ticketFilterSchema = z.object({
  gym_id: z.string().uuid('Invalid gym ID').optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  assigned_to: z.string().uuid('Invalid staff ID').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
