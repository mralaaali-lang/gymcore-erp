-- ====================================================================
-- Migration 034: Fix billing_plans + Four Plans System + Add-ons
-- ====================================================================
-- Replaces 033 (deleted due to syntax errors). Includes:
--   - gyms table extensions (plan_id, features, limits)
--   - billing_addons + gym_addons tables
--   - Unique index on billing_plans.name
--   - Upsert of 4 canonical plans (Starter, Growth, Pro, Enterprise)

-- 1. Extend gyms table
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES billing_plans(id);
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '[]'::jsonb;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS member_limit int;
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS subscription_status varchar(20) DEFAULT 'active';
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz;

-- Add check constraint separately (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'gyms'::regclass AND conname = 'chk_subscription_status'
  ) THEN
    ALTER TABLE gyms ADD CONSTRAINT chk_subscription_status CHECK (subscription_status IN ('active','suspended','expired','trial'));
  END IF;
END $$;

-- Backfill plan_id from existing plan_tier
UPDATE gyms g
SET plan_id = bp.id
FROM billing_plans bp
WHERE g.plan_id IS NULL
  AND lower(bp.name) = lower(g.plan_tier);

-- Backfill member_limit from plan
UPDATE gyms g
SET member_limit = bp.max_members
FROM billing_plans bp
WHERE g.plan_id = bp.id
  AND g.member_limit IS NULL;

-- 2. Ensure uniqueness on plan name
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_plans_name
  ON billing_plans (name);

-- 3. Add-ons tables
CREATE TABLE IF NOT EXISTS billing_addons (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          varchar(50) NOT NULL UNIQUE,
  name          varchar(255) NOT NULL,
  name_ar       varchar(255) NOT NULL,
  pricing_type  varchar(20) NOT NULL DEFAULT 'one_time'
    CHECK (pricing_type IN ('one_time','monthly','usage','subscription')),
  price         numeric(10,2) NOT NULL DEFAULT 0,
  unit          varchar(50),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gym_addons (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id        uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  addon_id      uuid NOT NULL REFERENCES billing_addons(id) ON DELETE CASCADE,
  quantity      int NOT NULL DEFAULT 1,
  purchased_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    timestamptz,
  UNIQUE (gym_id, addon_id)
);

-- Seed add-ons
INSERT INTO billing_addons (code, name, name_ar, pricing_type, price, unit) VALUES
  ('whatsapp_messages', 'WhatsApp Messages Pack', 'حزمة رسائل واتساب', 'usage', 0.05, 'message'),
  ('smart_gates_install', 'Smart Gates Installation', 'تركيب ماكينات ذكية', 'one_time', 2500.00, 'site'),
  ('branding_refresh', 'Branding & Store Refresh', 'تعديل الهوية وتحديث المتاجر', 'subscription', 500.00, 'month')
ON CONFLICT (code) DO NOTHING;

-- 4. Upsert the 4 canonical plans
-- Starter: 400-600 EGP/mo, 4500 EGP/yr, 1 branch, 300 members, manager + reception, basic
INSERT INTO billing_plans (name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features, is_active)
VALUES ('Starter', 'الانطلاق', 4500.00, 4500.00, 2, 300, 1, '["dashboard","members","attendance","products","daily_reports"]'::jsonb, true)
ON CONFLICT (name) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  max_staff = EXCLUDED.max_staff, max_members = EXCLUDED.max_members, max_gyms = EXCLUDED.max_gyms,
  features = EXCLUDED.features, is_active = EXCLUDED.is_active;

-- Growth: unlimited members, 5 staff, smart gates, commissions, WhatsApp/SMS
INSERT INTO billing_plans (name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features, is_active)
VALUES ('Growth', 'المتقدمة', 1500.00, 14000.00, 5, -1, 1, '["dashboard","members","attendance","products","smart_gates","trainer_commissions","whatsapp_marketing","sms_marketing","reports"]'::jsonb, true)
ON CONFLICT (name) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  max_staff = EXCLUDED.max_staff, max_members = EXCLUDED.max_members, max_gyms = EXCLUDED.max_gyms,
  features = EXCLUDED.features, is_active = EXCLUDED.is_active;

-- Pro: unlimited staff, POS, inventory, barcode, class booking, mobile app
INSERT INTO billing_plans (name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features, is_active)
VALUES ('Pro', 'الاحترافية', 3000.00, 0, -1, -1, 1, '["dashboard","members","attendance","products","pos","inventory","barcode","class_booking","mobile_app","smart_gates","trainer_commissions","whatsapp_marketing","sms_marketing","reports"]'::jsonb, true)
ON CONFLICT (name) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  max_staff = EXCLUDED.max_staff, max_members = EXCLUDED.max_members, max_gyms = EXCLUDED.max_gyms,
  features = EXCLUDED.features, is_active = EXCLUDED.is_active;

-- Enterprise: custom pricing 5000+, multi-branch, white-label, AI, ZATCA
INSERT INTO billing_plans (name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features, is_active)
VALUES ('Enterprise', 'الشركات', 5000.00, 0, -1, -1, -1, '["dashboard","members","attendance","products","pos","inventory","barcode","class_booking","mobile_app","smart_gates","trainer_commissions","whatsapp_marketing","sms_marketing","reports","multi_branch","member_transfers","white_label","ai_coach","zatca","loyalty","leaderboard"]'::jsonb, true)
ON CONFLICT (name) DO UPDATE SET
  name_ar = EXCLUDED.name_ar, price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  max_staff = EXCLUDED.max_staff, max_members = EXCLUDED.max_members, max_gyms = EXCLUDED.max_gyms,
  features = EXCLUDED.features, is_active = EXCLUDED.is_active;

-- 5. Remove old duplicate plans (keep highest id per name)
DELETE FROM billing_plans a
USING billing_plans b
WHERE a.id < b.id
  AND a.name = b.name;

-- 6. Remove legacy plans that were replaced by new canonical plans
DELETE FROM billing_plans
WHERE name IN ('Professional', 'Basic')
  AND price_monthly NOT IN (4500.00, 1500.00, 3000.00, 5000.00);

-- 7. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gyms_plan_id ON gyms(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gyms_subscription_status ON gyms(subscription_status);
CREATE INDEX IF NOT EXISTS idx_gym_addons_gym ON gym_addons(gym_id);
