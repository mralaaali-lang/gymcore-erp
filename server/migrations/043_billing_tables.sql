-- ====================================================================
-- 043 — Billing Tables: Invoices, Coupons, Payments, Webhooks
-- ====================================================================

BEGIN;

-- Drop old billing tables if they were seeded by legacy migrations with
-- incompatible schemas. These tables are empty in the current database,
-- so dropping and recreating them here is safe.
DROP TABLE IF EXISTS billing_coupon_usage CASCADE;
DROP TABLE IF EXISTS billing_invoices CASCADE;
DROP TABLE IF EXISTS billing_line_items CASCADE;
DROP TABLE IF EXISTS billing_refunds CASCADE;
DROP TABLE IF EXISTS billing_webhook_logs CASCADE;
DROP TABLE IF EXISTS billing_payment_transactions CASCADE;
DROP TABLE IF EXISTS billing_payment_gateways CASCADE;
DROP TABLE IF EXISTS billing_coupons CASCADE;

-- Invoices
CREATE TABLE IF NOT EXISTS billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    plan_id UUID REFERENCES billing_plans(id),
    plan_name VARCHAR(255),
    base_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    coupon_id UUID,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','paid','partial','overdue','cancelled','refunded')),
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    paid_amount NUMERIC(12, 2) DEFAULT 0.00,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(255),
    notes TEXT,
    created_by UUID REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_invoices_gym_id ON billing_invoices(gym_id);
CREATE INDEX idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX idx_billing_invoices_due_date ON billing_invoices(due_date);
CREATE INDEX idx_billing_invoices_number ON billing_invoices(invoice_number);

-- Invoice line items
CREATE TABLE IF NOT EXISTS billing_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_line_items_invoice ON billing_line_items(invoice_id);

-- Coupons
CREATE TABLE IF NOT EXISTS billing_coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    platform_wide BOOLEAN NOT NULL DEFAULT false,
    type VARCHAR(20) NOT NULL CHECK (type IN ('percentage','fixed_amount')),
    value NUMERIC(10, 2) NOT NULL CHECK (value >= 0),
    max_uses INTEGER CHECK (max_uses > 0),
    used_count INTEGER NOT NULL DEFAULT 0,
    min_order_amount NUMERIC(12, 2) DEFAULT 0.00,
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_by UUID REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_coupons_code ON billing_coupons(code);
CREATE INDEX idx_coupons_gym_id ON billing_coupons(gym_id);
CREATE INDEX idx_coupons_active ON billing_coupons(is_active, expires_at);

-- Coupon usage log
CREATE TABLE IF NOT EXISTS billing_coupon_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES billing_coupons(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
    used_amount NUMERIC(12, 2) NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_coupon_usage_coupon ON billing_coupon_usage(coupon_id);
CREATE INDEX idx_coupon_usage_gym ON billing_coupon_usage(gym_id);

-- Payment gateway configurations
CREATE TABLE IF NOT EXISTS billing_payment_gateways (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL UNIQUE CHECK (provider IN ('fawry','paymob','stripe','paypal','custom')),
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    is_test_mode BOOLEAN NOT NULL DEFAULT true,
    api_key_test TEXT,
    api_key_production TEXT,
    secret_key_test TEXT,
    secret_key_production TEXT,
    webhook_secret TEXT,
    configuration JSONB DEFAULT '{}',
    fee_percentage NUMERIC(5, 2) DEFAULT 0.00,
    fixed_fee NUMERIC(10, 2) DEFAULT 0.00,
    supported_currencies TEXT[] DEFAULT '{EGP,USD,SAR}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payment transactions
CREATE TABLE IF NOT EXISTS billing_payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_reference VARCHAR(100) UNIQUE NOT NULL,
    invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    gateway_id UUID REFERENCES billing_payment_gateways(id),
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','completed','failed','refunded','partial_refund')),
    payment_method VARCHAR(50),
    customer_reference VARCHAR(255),
    gateway_response JSONB,
    error_message TEXT,
    fee_amount NUMERIC(12, 2) DEFAULT 0.00,
    net_amount NUMERIC(12, 2) DEFAULT 0.00,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_gym_id ON billing_payment_transactions(gym_id);
CREATE INDEX idx_payments_status ON billing_payment_transactions(status);
CREATE INDEX idx_payments_reference ON billing_payment_transactions(transaction_reference);
CREATE INDEX idx_payments_invoice_id ON billing_payment_transactions(invoice_id);

-- Webhook logs
CREATE TABLE IF NOT EXISTS billing_webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gateway_id UUID REFERENCES billing_payment_gateways(id),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT,
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,
    processing_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhooks_processed ON billing_webhook_logs(processed);
CREATE INDEX idx_webhooks_event ON billing_webhook_logs(event_type);

-- Refunds
CREATE TABLE IF NOT EXISTS billing_refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    refund_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES billing_payment_transactions(id) ON DELETE SET NULL,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','processed','rejected')),
    processed_by UUID REFERENCES staff_users(id),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refunds_gym_id ON billing_refunds(gym_id);
CREATE INDEX idx_refunds_status ON billing_refunds(status);

COMMIT;
