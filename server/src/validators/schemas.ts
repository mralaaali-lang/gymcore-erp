import { z } from 'zod';

function sanitizedString(opts?: { min?: number; max?: number }) {
  let s = z.string();
  if (opts?.min !== undefined) s = s.min(opts.min);
  if (opts?.max !== undefined) s = s.max(opts.max);
  return s.transform((val) =>
    val
      .replace(/<[^>]*>/g, '')
      .replace(/[<>]/g, '')
      .trim()
  );
}

export const loginSchema = z.object({
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  phone_number: z.string().min(7).max(50).regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number format').optional().or(z.literal('')),
  phone: z.string().min(7).max(50).regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number format').optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
}).refine(data => data.email || data.phone_number || data.phone, {
  message: 'Email or phone number is required',
});

export const createStaffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  full_name: sanitizedString({ min: 2, max: 255 }),
  role: z.enum(['manager', 'receptionist', 'coach']),
});

export const createMemberSchema = z.object({
  full_name: sanitizedString({ min: 2, max: 255 }),
  phone_number: z.string().min(7).max(50).regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number format'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  birth_date: sanitizedString().optional(),
  plan_id: z.string().uuid('Invalid plan ID').optional(),
  medical_notes: sanitizedString({ max: 2000 }).optional(),
  photo_url: z.string().url().optional().or(z.literal('')),
});

export const qrAttendanceSchema = z.object({
  qr_token: sanitizedString({ min: 1 }),
});

export const manualCheckinSchema = z.object({
  member_phone: z.string().min(7).max(50).optional(),
  member_id: z.string().uuid('Invalid member ID').optional(),
}).refine((data) => data.member_phone || data.member_id, {
  message: 'Either member_phone or member_id is required',
});

export const classBookingSchema = z.object({
  class_id: z.string().uuid('Invalid class ID format'),
});

// §37b — gym-manager class schedule CRUD payloads (fitness_classes).
export const createFitnessClassSchema = z.object({
  title: z.string().min(2).max(255),
  coach_id: z.string().uuid('Invalid coach ID'),
  capacity: z.number().int().min(1).max(1000),
  start_time: z.string().min(10),
  end_time: z.string().min(10),
});

export const updateFitnessClassSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  coach_id: z.string().uuid('Invalid coach ID').optional(),
  capacity: z.number().int().min(1).max(1000).optional(),
  start_time: z.string().min(10).optional(),
  end_time: z.string().min(10).optional(),
  is_cancelled: z.boolean().optional(),
});

export const freezeSubscriptionSchema = z.object({
  subscription_id: z.string().uuid(),
  freeze_days: z.number().int().min(1).max(30),
});

export const ALLOWED_COLUMNS_BY_TABLE: Record<string, string[]> = {
  members: ['full_name', 'phone_number', 'email', 'photo_url', 'medical_notes', 'birth_date', 'status'],
  member_subscriptions: ['plan_id', 'start_date', 'end_date', 'status', 'is_frozen', 'price'],
  membership_offers: ['name', 'description', 'price', 'duration_days', 'max_members', 'is_active'],
  products: ['name', 'description', 'price', 'stock_quantity', 'category'],
  financial_transactions: ['amount', 'description', 'transaction_type', 'payment_method', 'transaction_date'],
  staff_users: ['full_name', 'phone_number', 'role', 'is_active'],
  pos_orders: ['status', 'notes'],
  fitness_classes: ['name', 'description', 'capacity', 'start_time', 'end_time', 'trainer_id', 'is_active'],
};

export const pendingActionSchema = z.object({
  action_type: sanitizedString({ min: 1, max: 100 }),
  target_table: z.enum([
    'members', 'member_subscriptions', 'membership_offers', 'products',
    'financial_transactions', 'staff_users', 'pos_orders', 'fitness_classes',
  ]),
  target_record_id: z.string().uuid(),
  reason: sanitizedString({ min: 1, max: 1000 }),
  new_data_json: z.record(z.unknown()),
});

export const processPendingSchema = z.object({
  action_id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
});

export const blacklistMemberSchema = z.object({
  reason: sanitizedString({ min: 1, max: 1000 }),
});

export const updateMemberSchema = z.object({
  full_name: sanitizedString({ min: 2, max: 255 }).optional(),
  phone_number: z.string().min(7).max(50).regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number format').optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  birth_date: sanitizedString().optional(),
  medical_notes: sanitizedString({ max: 2000 }).optional(),
  photo_url: z.string().url().optional().or(z.literal('')),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: sanitizedString().optional(),
  status: sanitizedString().optional(),
});

export const earnPointsSchema = z.object({
  member_id: z.string().uuid(),
  points: z.number().int().min(1).max(100000),
  reason: sanitizedString({ min: 1, max: 255 }),
  reference_type: sanitizedString().optional(),
  reference_id: z.string().uuid().optional(),
});

export const redeemPointsSchema = z.object({
  member_id: z.string().uuid(),
  reward_id: z.string().uuid(),
  points_spent: z.number().int().min(1),
});

export const createRewardSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }),
  description: sanitizedString({ max: 2000 }).optional(),
  points_cost: z.number().int().min(1),
  reward_type: z.enum(['discount', 'free_month', 'merchandise', 'session', 'other']).default('discount'),
  reward_value: sanitizedString({ min: 1, max: 255 }),
  stock: z.number().int().min(-1).default(-1),
});

export const registerPushSchema = z.object({
  token: z.string().min(1, 'Push token is required').max(512),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).default('unknown'),
  device_name: z.string().max(255).optional(),
});

export const sendNotificationSchema = z.object({
  member_id: z.string().uuid(),
  type: z.enum(['renewal_reminder', 'attendance', 'promotion', 'payment_receipt', 'class_reminder', 'freeze_confirmation']),
  data: z.record(z.string()).optional(),
});

export const createLeadSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }),
  phone: z.string().min(7).max(50),
  email: z.string().email().optional().or(z.literal('')),
  source: z.enum(['facebook', 'instagram', 'walk_in', 'referral', 'google', 'phone', 'other']).default('walk_in'),
  notes: sanitizedString({ max: 2000 }).optional(),
  assigned_to: z.string().uuid().optional(),
});

export const createProductSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }),
  barcode: sanitizedString({ max: 100 }).optional().or(z.literal('')),
  stock_quantity: z.number().int().min(0).default(0),
  purchase_price: z.number().min(0),
  selling_price: z.number().min(0),
});

export const createPaymentSchema = z.object({
  member_id: z.string().uuid(),
  amount: z.number().min(0),
  description: sanitizedString({ max: 500 }).optional().or(z.literal('')),
  // §34ي: طرق الدفع المصرية — تخزين varchar أصلًا، التوسعة هنا فقط.
  payment_method: z.enum(['cash', 'card', 'bank', 'wallet', 'vodafone_cash', 'instapay']).default('cash'),
});

export const createExpenseSchema = z.object({
  amount: z.number().min(0),
  description: sanitizedString({ max: 500 }),
  category_id: z.string().uuid().optional().nullable(),
  // §34ث: payouts must state the method or the drawer cannot reconcile.
  payment_method: z.enum(['cash', 'card', 'bank', 'wallet', 'vodafone_cash', 'instapay']).optional(),
});

export const createStaffSchemaV2 = z.object({
  full_name: sanitizedString({ min: 2, max: 255 }),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['manager', 'coach', 'receptionist']),
  phone: sanitizedString({ max: 50 }).optional().or(z.literal('')),
  salary: z.number().min(0).optional(),
});

// ====================================================================
// PLATFORM ADMIN (Super Admin) — gym provisioning
// ====================================================================
export const createGymSchema = z.object({
  gym_name: sanitizedString({ min: 2, max: 255 }),
  subdomain: z.string()
    .min(3).max(63)
    .regex(/^[a-z0-9-]+$/, 'Subdomain must be lowercase letters, numbers, and dashes only'),
  owner_full_name: sanitizedString({ min: 2, max: 255 }),
  owner_email: z.string().email(),
  owner_password: z.string().min(8).max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  contact_email: z.string().email().optional().nullable(),
  gym_email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  password: z.string().min(8).max(128).optional(),
  billing_cycle: z.enum(['monthly', 'yearly']).optional(),
  plan_id: z.string().uuid().optional(),
  currency: z.string().max(10).optional(),
  timezone: z.string().optional(),
  logo_url: z.string().url().or(z.string().startsWith('/')).optional().nullable(),
  // Canonical tiers are basic/premium/enterprise; professional kept as legacy alias.
  plan_tier: z.enum(['basic', 'premium', 'professional', 'enterprise']).optional(),
  // Extended Create Gym Wizard fields — consumed by platformGyms.createGym.
  dba_name: sanitizedString({ max: 255 }).optional(),
  address_street: sanitizedString({ max: 500 }).optional(),
  // §33-توحيد: بقية حقول العنوان — كانت تُقص من zod فلا تصل إلى الكونترولر ولا تُخزن.
  address_city: sanitizedString({ max: 255 }).optional(),
  address_zip: sanitizedString({ max: 20 }).optional(),
  address_state: sanitizedString({ max: 255 }).optional(),
  address_country: sanitizedString({ max: 255 }).optional(),
  date_format: z.string().max(20).optional(),
  time_format: z.string().max(10).optional(),
  first_day_of_week: z.string().max(20).optional(),
  language: z.string().max(10).optional(),
  units_system: z.string().max(20).optional(),
  subscription_expires_at: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'subscription_expires_at must be a valid date')
    .optional(),
  is_active: z.boolean().optional(),
});

export const setGymActiveSchema = z.object({
  is_active: z.boolean(),
});

export const createSaleSchema = z.object({
  member_id: z.string().uuid().optional().nullable(),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1) })).min(1),
  payment_method: z.enum(['cash', 'card', 'wallet']).default('cash'),
});

export const createPurchaseSchema = z.object({
  supplier_id: z.string().uuid().optional().nullable(),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1), unit_price: z.number().min(0) })).min(1),
  payment_method: z.enum(['cash', 'card', 'bank']).default('cash'),
  notes: sanitizedString({ max: 1000 }).optional().or(z.literal('')),
});

export const createSupplierSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }),
  phone: sanitizedString({ max: 50 }).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  address: sanitizedString({ max: 500 }).optional().or(z.literal('')),
  notes: sanitizedString({ max: 1000 }).optional().or(z.literal('')),
});

export const createDebtSchema = z.object({
  member_id: z.string().uuid(),
  amount: z.number().min(0),
  due_date: z.string(),
  reason: sanitizedString({ max: 500 }).optional().or(z.literal('')),
});

export const openCashboxSchema = z.object({
  opening_balance: z.number().min(0).default(0),
  notes: sanitizedString({ max: 500 }).optional().or(z.literal('')),
});

export const createAnnouncementSchema = z.object({
  title: sanitizedString({ min: 1, max: 255 }),
  content: sanitizedString({ min: 1, max: 5000 }),
  target_audience: z.enum(['all', 'members', 'staff', 'trainers']).default('all'),
  is_pinned: z.boolean().default(false),
});

export const createPtPackageSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }),
  session_count: z.number().int().min(1),
  total_price: z.number().min(0),
});

export const createPtSessionSchema = z.object({
  package_id: z.string().uuid(),
  member_id: z.string().uuid(),
  trainer_id: z.string().uuid(),
  session_number: z.number().int().min(1),
  scheduled_at: z.string().optional().nullable(),
});

export const updateSettingsSchema = z.record(z.string());

export const updateProductSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }).optional(),
  barcode: sanitizedString({ max: 100 }).optional().or(z.literal('')),
  stock_quantity: z.number().int().min(0).optional(),
  purchase_price: z.number().min(0).optional(),
  selling_price: z.number().min(0).optional(),
});

export const updateStaffSchema = z.object({
  full_name: sanitizedString({ min: 2, max: 255 }).optional(),
  email: z.string().email().optional(),
  role: z.enum(['manager', 'coach', 'receptionist']).optional(),
  phone: sanitizedString({ max: 50 }).optional().or(z.literal('')),
  salary: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const closeCashboxSchema = z.object({
  id: z.string().uuid(),
  closing_balance: z.number().min(0),
  notes: sanitizedString({ max: 500 }).optional().nullable(),
});

export const payDebtSchema = z.object({
  amount: z.number().min(0),
});

export const completePtSessionSchema = z.object({
  notes: sanitizedString({ max: 2000 }).optional().nullable(),
});

export const updateLeadSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }).optional(),
  phone: z.string().min(7).max(50).optional(),
  email: z.string().email().optional().or(z.literal('')),
  source: z.enum(['facebook', 'instagram', 'walk_in', 'referral', 'google', 'phone', 'other']).optional(),
  status: z.enum(['new', 'contacted', 'trial_booked', 'converted', 'lost']).optional(),
  notes: sanitizedString({ max: 2000 }).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

// ====================================================================
// AUTH — Refresh, Forgot, Reset
// ====================================================================
export const refreshTokenSchema = z.object({
  // Optional: HttpOnly-cookie sessions (the normal web flow) carry the
  // refresh token in the cookie, which the controller falls back to. The
  // body field stays supported for non-cookie clients.
  refresh_token: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters').max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
});

// ====================================================================
// MOBILE — Member Login, Push Unregister
// ====================================================================
export const memberLoginSchema = z.object({
  phone: z.string().min(7).max(50).regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number format'),
  pin: z.string().min(4).max(6).regex(/^\d+$/, 'PIN must be numeric'),
});

export const unregisterPushSchema = z.object({
  token: z.string().min(1, 'Push token is required'),
});

// ====================================================================
// MEMBERS — Cancel Subscription
// ====================================================================
export const cancelSubscriptionSchema = z.object({
  reason: sanitizedString({ min: 1, max: 500 }),
});

// ====================================================================
// NOTIFICATIONS — Bulk, Engine Settings, Test
// ====================================================================
export const sendBulkNotificationSchema = z.object({
  member_ids: z.array(z.string().uuid()).min(1),
  type: z.enum(['renewal_reminder', 'attendance', 'promotion', 'payment_receipt', 'class_reminder', 'freeze_confirmation']),
  data: z.record(z.string()).optional(),
});

export const updateNotificationSettingsSchema = z.object({
  provider: z.string().min(1),
  is_enabled: z.boolean(),
  config: z.record(z.unknown()).optional(),
});

export const sendTestNotificationSchema = z.object({
  channel: z.enum(['email', 'sms', 'push', 'webhook', 'inapp']),
  recipient: z.string().min(1),
});

// ====================================================================
// ONBOARDING — Steps, Complete, Platform Settings
// ====================================================================
export const saveOnboardingStepSchema = z.object({
  // Frontend wizard is 0-based (0=welcome … 4=done); controller contract is 0-5.
  step: z.number().int().min(0).max(5),
  data: z.record(z.unknown()),
});

export const completeOnboardingSchema = z.object({
  final_data: z.record(z.unknown()).optional(),
});

export const updatePlatformSettingsSchema = z.record(z.unknown());

// ====================================================================
// BRANDING — Update Platform Branding
// ====================================================================
export const updateBrandingSchema = z.object({
  primary_color: sanitizedString().optional(),
  secondary_color: sanitizedString().optional(),
  logo_url: z.string().url().or(z.string().startsWith('/')).optional().or(z.literal('')),
  gym_name: sanitizedString().optional(),
  gym_name_ar: sanitizedString().optional(),
  tagline: sanitizedString().optional(),
  tagline_ar: sanitizedString().optional(),
}).passthrough();

// ====================================================================
// PLATFORM ADMIN — Login, CRUD, Tickets, Broadcasts
// ====================================================================
export const platformLoginSchema = z.object({
  email: z.string().email().optional().or(z.literal('')),
  phone_number: z.string().min(7).max(50).optional().or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
}).refine(data => data.email || data.phone_number, {
  message: 'Email or phone number is required',
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

export const createBroadcastSchema = z.object({
  title: sanitizedString({ min: 1, max: 255 }),
  content: sanitizedString({ min: 1, max: 5000 }),
  target_roles: z.array(z.enum(['super-admin', 'gym-admin', 'trainer', 'reception', 'player'])).min(1),
});

export const createPlatformAdminSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  phone_number: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? null : value,
    z.string().trim().min(7).max(50).regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number format').nullable().optional(),
  ),
  password: z.string().min(8).max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  full_name: sanitizedString({ min: 2, max: 255 }),
  role_type: z.enum(['super_admin', 'support_admin', 'billing_admin', 'readonly_admin']).default('support_admin'),
});

export const updatePlatformAdminSchema = z.object({
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()).optional(),
  phone_number: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? null : value,
    z.string().trim().min(7).max(50).regex(/^\+?[\d\s\-()]+$/, 'Invalid phone number format').nullable().optional(),
  ),
  password: z.string().min(8).max(128)
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one number')
    .optional(),
  full_name: sanitizedString({ min: 2, max: 255 }).optional(),
  is_active: z.boolean().optional(),
  role_type: z.enum(['super_admin', 'support_admin', 'billing_admin', 'readonly_admin']).optional(),
});

// ====================================================================
// PLATFORM BILLING — Plans, Fawry
// ====================================================================
export const createBillingPlanSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }),
  name_ar: sanitizedString({ min: 1, max: 255 }).optional(),
  price_monthly: z.preprocess(parseNumeric, z.number().min(0)),
  price_yearly: z.preprocess(parseNumeric, z.number().min(0)).optional(),
  max_staff: z.preprocess(parseNumeric, z.number().int().min(1)).default(5),
  max_members: z.preprocess(parseNumeric, z.number().int().min(1)).default(100),
  max_gyms: z.preprocess(parseNumeric, z.number().int().min(1)).default(1),
  features: z.union([z.array(z.string()), z.record(z.unknown())]).optional(),
});

/** Coerce string → number so numeric fields from PostgreSQL (returned as
 *  strings for `numeric` columns) survive validation. */
function parseNumeric(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  const n = typeof val === 'string' ? Number(val) : val;
  return Number.isNaN(n) ? val : n;
}

export const updateBillingPlanSchema = z.object({
  name: sanitizedString({ min: 1, max: 255 }).nullish(),
  name_ar: sanitizedString().nullish(),
  price_monthly: z.preprocess(parseNumeric, z.number().min(0)).nullish(),
  price_yearly: z.preprocess(parseNumeric, z.number().min(0)).nullish(),
  max_staff: z.preprocess(parseNumeric, z.number().int().min(1)).nullish(),
  max_members: z.preprocess(parseNumeric, z.number().int().min(1)).nullish(),
  max_gyms: z.preprocess(parseNumeric, z.number().int().min(1)).nullish(),
  features: z.union([z.array(z.string()), z.record(z.unknown())]).nullish(),
  is_active: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return val;
  }, z.boolean()).nullish(),
}).passthrough();

export const initiateFawryPaymentSchema = z.object({
  gym_id: z.string().uuid(),
  amount: z.number().min(0),
  invoice_id: z.string().uuid().optional(),
});

// ====================================================================
// PLATFORM COUPONS
// ====================================================================
export const createCouponSchema = z.object({
  code: sanitizedString({ min: 3, max: 50 }),
  description: sanitizedString({ max: 500 }).optional(),
  discount_type: z.enum(['percentage', 'fixed']).default('percentage'),
  discount_value: z.number().min(0),
  max_uses: z.number().int().min(1).optional(),
  max_discount_amount: z.number().min(0).optional(),
  min_plan_tier: sanitizedString().optional(),
  valid_until: z.string().optional(),
  min_amount: z.number().min(0).optional(),
  first_purchase_only: z.boolean().default(false),
});

export const validateCouponInputSchema = z.object({
  code: z.string().min(1),
  plan_tier: sanitizedString().optional(),
});

// ====================================================================
// DEVELOPER PORTAL — API Keys
// ====================================================================
export const createApiKeySchema = z.object({
  gym_id: z.string().uuid(),
  name: sanitizedString({ min: 1, max: 255 }),
  permissions: z.array(z.string()).default([]),
  allowed_ips: z.array(z.string()).default([]),
  rate_limit_per_min: z.number().int().min(1).max(1000).default(60),
  expires_at: z.string().optional().nullable(),
});

export const getMultiTenantReportSchema = z.object({
  plan_tier: z.enum(['basic', 'premium', 'enterprise']).optional(),
  min_members: z.number().int().positive().optional(),
  gym_ids: z.array(z.string().uuid()).optional(),
}).optional();

export const createSubscriptionPaymentSchema = z.object({
  gym_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  cycle_type: z.enum(['monthly', 'yearly']).default('monthly'),
  return_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
});

// §33ب — membership offers (single source of truth for gym plans)
export const createOfferSchema = z.object({
  title: sanitizedString({ min: 1, max: 255 }),
  duration_days: z.number().int().min(1).max(3650),
  price: z.number().min(0),
});

export const updateOfferSchema = z.object({
  title: sanitizedString({ min: 1, max: 255 }).optional(),
  duration_days: z.number().int().min(1).max(3650).optional(),
  price: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
});

// ====================================================================
// §34ي — اشتراكات الأعضاء (صفحة الاشتراكات + نموذج «اشتراك جديد»)
// الرياضات وأيام الأسبوع قوائم ثابتة لأنها أعمدة تصنيف في قاعدة البيانات؛
// قيمها ترمّز بالأ الإنجليزية والعرض العربي يقرر في الفرونت.
// ====================================================================
export const SUBSCRIPTION_SPORTS = ['gym', 'cardio', 'boxing', 'kickboxing', 'swimming', 'crossfit', 'yoga'] as const;
export const WEEK_DAY_CODES = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createSubscriptionSchema = z.object({
  member_id: z.string().uuid(),
  offer_id: z.string().uuid(),
  coach_id: z.string().uuid().optional().nullable(),
  sport: z.enum(SUBSCRIPTION_SPORTS).optional().nullable(),
  start_date: z.string().regex(ISO_DATE, 'Date must be YYYY-MM-DD'),
  end_date: z.string().regex(ISO_DATE, 'Date must be YYYY-MM-DD').optional(),
  weekly_days: z.array(z.enum(WEEK_DAY_CODES)).max(7).optional(),
  amount_paid: z.number().min(0),
  payment_method: z.enum(['cash', 'card', 'vodafone_cash', 'instapay', 'bank']).default('cash'),
});
