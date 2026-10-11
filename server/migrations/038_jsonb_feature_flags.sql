-- ====================================================================
-- Migration 038: JSONB Feature Flags
-- ====================================================================
-- Migrates plans.features from flat string arrays to structured JSONB
-- so feature evaluation becomes direct key lookup instead of array scan.

-- Seed / update the 4 core plans as structured JSONB objects
INSERT INTO billing_plans (name, name_ar, price_monthly, price_yearly, max_members, max_employees, max_branches, features, is_active)
VALUES
  ('Starter',    'الانطلاق',    4500.00, 4500.00,  300,  2,  1,
   '{"modules":{"dashboard":true,"attendance":true,"products":false,"daily_reports":false}}'::jsonb,
   true),
  ('Growth',     'المتقدمة',    1500.00, 14000.00, -1,   5,  1,
   '{"modules":{"dashboard":true,"attendance":true,"products":true,"daily_reports":true}}'::jsonb,
   true),
  ('Pro',        'الاحترافية',  3000.00, 0,       -1,  -1,  1,
   '{"modules":{"dashboard":true,"attendance":true,"products":true,"daily_reports":true}}'::jsonb,
   true),
  ('Enterprise', 'الشركات',     5000.00, 0,       -1,  -1, -1,
   '{"modules":{"dashboard":true,"attendance":true,"products":true,"daily_reports":true}}'::jsonb,
   true)
ON CONFLICT (name) DO UPDATE SET
  name_ar       = EXCLUDED.name_ar,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly  = EXCLUDED.price_yearly,
  max_members   = EXCLUDED.max_members,
  max_employees = EXCLUDED.max_employees,
  max_branches  = EXCLUDED.max_branches,
  features      = EXCLUDED.features,
  is_active     = EXCLUDED.is_active;

-- Optional backfill for any plan rows missing structured features
UPDATE billing_plans
SET features = '{"modules":{"dashboard":true,"attendance":true,"products":false,"daily_reports":false}}'::jsonb
WHERE features IS NULL OR features::text = '[]'::text;

-- GIN index for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_billing_plans_features_gin
ON billing_plans USING GIN (features);
