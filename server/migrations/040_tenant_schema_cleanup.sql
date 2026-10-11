-- ====================================================================
-- 040 — Tenant Schema Cleanup & Streamlined Onboarding Attributes
--        Drops redundant columns, enforces core persistent attributes,
--        and aligns on unified SaaS terminology (tenant_id = gym_id).
-- ====================================================================

BEGIN;

-- 1. DROP REDUNDANT COLUMNS
--    contact_email      -> gyms.email (redundant with staff owner email)
--    city               -> gyms.address_city
--    zip_code           -> gyms.address_zip
--    unit_system        -> gyms.units_system
--    secondary_trade_name -> not present in current schema
--
--    NOTE: We keep dba_name because it is used on invoices.
--          We keep address_street and address_country because
--          they are still part of restricted streamlined form.

ALTER TABLE gyms
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS address_city,
  DROP COLUMN IF EXISTS address_zip,
  DROP COLUMN IF EXISTS units_system;

-- 2. ADD CORE PERSISTENT ATTRIBUTES (idempotent)
--    phone_number      -> enforced index + backfill from legacy 'phone'
--    tenant_status     -> unified status for SaaS frontend
--    logo_url          -> already present, preserved
--    subscription_expires_at -> already present, preserved

ALTER TABLE gyms
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tenant_status VARCHAR(20) DEFAULT 'active' CHECK (tenant_status IN ('active','suspended','expired','trial'));

-- 3. BACKFILL phone_number from legacy phone where present
UPDATE gyms
  SET phone_number = phone
  WHERE phone_number IS NULL
    AND phone IS NOT NULL;

-- 4. ENFORCED INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS uq_gyms_phone_number
  ON gyms(phone_number)
  WHERE phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gyms_status_active
  ON gyms(tenant_status, is_active);

-- 5. Seed tenant_status from existing subscription_status where available
UPDATE gyms
  SET tenant_status = COALESCE(subscription_status, 'active')
  WHERE tenant_status IS NULL;

COMMIT;
