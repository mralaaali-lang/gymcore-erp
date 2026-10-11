-- ====================================================================
-- Gimawi SaaS v1.0 — Multi-Tenant Gym Management Database Schema
-- Enterprise-Grade DDL with Row-Level Security Foundation
-- Compatible with PostgreSQL 14+ / Supabase
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- CORE SAAS — Multi-Tenant Kernel
-- ====================================================================

CREATE TABLE gyms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    plan_tier VARCHAR(50) DEFAULT 'basic' NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE staff_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (gym_id, email)
);

CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    photo_url TEXT,
    is_blacklisted BOOLEAN DEFAULT false NOT NULL,
    blacklist_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (gym_id, phone_number)
);

CREATE TABLE membership_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    duration_days INTEGER NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    is_active BOOLEAN DEFAULT true NOT NULL
);

CREATE TABLE member_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES membership_offers(id),
    price_paid NUMERIC(10, 2) NOT NULL CHECK (price_paid >= 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_frozen BOOLEAN DEFAULT false NOT NULL,
    freeze_start_date DATE,
    freeze_end_date DATE,
    status VARCHAR(50) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_freeze_dates CHECK (freeze_end_date >= freeze_start_date)
);

CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    entry_method VARCHAR(50) DEFAULT 'qr_code' NOT NULL,
    verified_by_staff_id UUID REFERENCES staff_users(id)
);

-- ====================================================================
-- ERP MODULES — POS, Accounting, HR
-- ====================================================================

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    barcode VARCHAR(100),
    stock_quantity INTEGER DEFAULT 0 NOT NULL CHECK (stock_quantity >= 0),
    purchase_price NUMERIC(10, 2) NOT NULL CHECK (purchase_price >= 0),
    selling_price NUMERIC(10, 2) NOT NULL CHECK (selling_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE pos_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL REFERENCES staff_users(id),
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE pos_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL
);

CREATE TABLE financial_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    description TEXT,
    staff_user_id UUID NOT NULL REFERENCES staff_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE staff_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    clock_in TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    clock_out TIMESTAMP WITH TIME ZONE,
    ip_address VARCHAR(45)
);

CREATE TABLE payroll_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    staff_user_id UUID NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
    base_salary_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (base_salary_paid >= 0),
    commissions_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (commissions_paid >= 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ====================================================================
-- OPERATIONS — Classes, Bookings, Anti-Tampering
-- ====================================================================

CREATE TABLE fitness_classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES staff_users(id),
    title VARCHAR(255) NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    is_cancelled BOOLEAN DEFAULT false NOT NULL,
    CONSTRAINT chk_class_times CHECK (end_time > start_time)
);

CREATE TABLE class_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES fitness_classes(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    booked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'confirmed' NOT NULL,
    UNIQUE(class_id, member_id)
);

CREATE TABLE pending_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    requested_by_staff_id UUID NOT NULL REFERENCES staff_users(id),
    action_type VARCHAR(100) NOT NULL,
    target_table VARCHAR(100) NOT NULL,
    target_record_id UUID NOT NULL,
    old_data_json JSONB,
    new_data_json JSONB NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    reviewed_by_staff_id UUID REFERENCES staff_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    staff_user_id UUID REFERENCES staff_users(id),
    action_description TEXT NOT NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ====================================================================
-- COMPOSITE INDEXES — Tenant Isolation + Query Performance
-- ====================================================================

CREATE INDEX idx_staff_gym ON staff_users(gym_id);
CREATE INDEX idx_members_gym ON members(gym_id);
CREATE INDEX idx_subscriptions_dates ON member_subscriptions(gym_id, end_date, status);
CREATE INDEX idx_attendance_time ON attendance_logs(gym_id, check_in_time DESC);
CREATE INDEX idx_pending_status ON pending_actions(gym_id, status);
CREATE INDEX idx_products_barcode ON products(gym_id, barcode);
CREATE INDEX idx_transactions_type ON financial_transactions(gym_id, type, created_at DESC);
CREATE INDEX idx_classes_schedule ON fitness_classes(gym_id, start_time ASC);
CREATE INDEX idx_activity_gym ON activity_logs(gym_id, created_at DESC);
CREATE INDEX idx_pos_orders_gym ON pos_orders(gym_id, created_at DESC);
CREATE INDEX idx_subs_active ON member_subscriptions(gym_id, status) WHERE status = 'active';
CREATE INDEX idx_class_bookings_class ON class_bookings(class_id, status);

-- ====================================================================
-- IMMUTABLE TRIGGER — Activity Logs Anti-Tampering
-- ====================================================================

CREATE OR REPLACE FUNCTION block_immutable_logs()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'TABLE_IS_IMMUTABLE: UPDATE or DELETE operations on activity_logs are strictly prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_activity_logs
BEFORE UPDATE OR DELETE ON activity_logs
FOR EACH ROW EXECUTE FUNCTION block_immutable_logs();
