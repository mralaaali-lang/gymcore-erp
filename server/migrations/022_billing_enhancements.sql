-- ====================================================================
-- Migration 022: Billing Enhancements — Coupons, VAT, Fawry payments
-- ====================================================================

-- 1. Coupons / Promo Codes
CREATE TABLE IF NOT EXISTS billing_coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    discount_type VARCHAR(10) NOT NULL DEFAULT 'percentage'
        CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10,2) NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1,
    current_uses INTEGER NOT NULL DEFAULT 0,
    max_discount_amount NUMERIC(10,2),  -- cap for percentage discounts
    min_plan_tier VARCHAR(50),          -- optional: 'basic', 'professional', 'enterprise'
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES platform_admins(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON billing_coupons(code);

-- 2. Add VAT / tax columns to billing_invoices
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 14.00;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES billing_coupons(id);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS fawry_ref_number VARCHAR(100);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Add billing_cycles table for subscription tracking
CREATE TABLE IF NOT EXISTS billing_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES billing_plans(id),
    cycle_type VARCHAR(10) NOT NULL DEFAULT 'monthly'
        CHECK (cycle_type IN ('monthly', 'yearly')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT true,
    last_invoice_id UUID REFERENCES billing_invoices(id),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_cycles_gym ON billing_cycles(gym_id);

-- 4. Add tax_rate to platform_security_settings? No, add to platform_security_settings table
ALTER TABLE platform_security_settings ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 14.00;
ALTER TABLE platform_security_settings ADD COLUMN IF NOT EXISTS tax_registration_number VARCHAR(100);
