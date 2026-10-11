# GymCore ERP — Billing & Marketing Engine — Implementation Plan

**Date:** 2026-07-24
**Role:** Super Admin
**Status:** Implementation Plan

---

## 1. Current State Assessment

### What Already Exists

| Component | Existing | Notes |
|-----------|----------|-------|
| `server/src/services/paymentFactory.ts` | Yes | Payment gateway factory |
| `server/src/controllers/platform/` | No | Controllers are flat in `server/src/controllers/` |
| `server/src/routes/platform.ts` | Yes | Contains all /platform/* routes |
| `server/src/routes/platform/billing.routes.ts` | No | Needs creation |
| `server/src/controllers/platform/billing.controller.ts` | No | Needs creation |
| `server/src/services/platform/billing.service.ts` | No | Needs creation |
| `server/src/validators/platform/billing.validators.ts` | No | Needs creation |
| `server/src/services/payment/` | Partial | Only `paymentFactory.ts` exists |
| `server/src/services/ai/analytics.service.ts` | No | Needs creation |
| Billing DB tables | Partial | `billing_plans` exists, `billing_subscriptions` exists |
| `billing_payments` table | Partial | Exists in schema |
| Coupons table | No | Needs creation |
| Invoices table | No | Needs creation |
| Loyalty program tables | No | Needs creation |
| Refunds table | No | Needs creation |

### Existing Billing-Related DB Tables (from migrations)

```sql
-- billing_plans (exists)
-- billing_subscriptions (exists)  
-- billing_payments (exists)
-- feature_flags (exists)
-- loyalty_points (exists, from migration 006)
```

---

## 2. New File Structure

```
server/src/
├── controllers/platform/
│   ├── billing.controller.ts          # Billing, invoices, coupons, payments
│   ├── loyalty.controller.ts          # Loyalty program management
│   ├── marketing.controller.ts        # Campaigns, broadcasts, referrals
│   └── support.controller.ts          # Support tickets
├── services/platform/
│   ├── billing.service.ts             # Core billing engine
│   ├── invoice.service.ts             # Invoice generation + PDF
│   ├── coupon.service.ts              # Coupon management + validation
│   ├── payment.service.ts             # Payment processing (Fawry, Paymob, Stripe)
│   ├── loyalty.service.ts             # Points calculation + rewards
│   ├── marketing.service.ts           # Campaign management + analytics
│   ├── notification.service.ts        # Email/SMS broadcast
│   └── aiAnalytics.service.ts         # AI-powered recommendations
├── routes/platform/
│   ├── billing.routes.ts              # /platform/billing/*
│   ├── loyalty.routes.ts              # /platform/loyalty/*
│   ├── marketing.routes.ts            # /platform/marketing/*
│   └── support.routes.ts              # /platform/support/*
├── validators/platform/
│   ├── billing.validators.ts          # Zod schemas for billing
│   ├── loyalty.validators.ts          # Zod schemas for loyalty
│   ├── marketing.validators.ts        # Zod schemas for marketing
│   └── support.validators.ts          # Zod schemas for tickets
└── types/
    └── billing.types.ts               # TypeScript interfaces

server/src/migrations/
├── 042_billing_tables.sql             # Invoices, coupons, payments
├── 043_loyalty_tables.sql             # Loyalty program tables
├── 044_marketing_tables.sql           # Campaigns, broadcasts
└── 045_support_tickets.sql            # Support tickets schema

src/pages/settings/platform/           # Already created
├── PlatformIntegrationsTab.tsx        # Already has payment gateway section
└── (add) PlatformBillingTab.tsx       # New billing settings tab

src/pages/billing/                     # New super admin billing page
├── BillingDashboard.tsx
├── PlansManager.tsx
├── InvoicesManager.tsx
├── CouponsManager.tsx
├── PaymentGateways.tsx
├── BillingReports.tsx
├── LoyaltyProgram.tsx
├── MarketingCampaigns.tsx
├── BroadcastManager.tsx
├── ReferralSystem.tsx
├── SupportTickets.tsx
├── TicketDetail.tsx
└── AIAnalytics.tsx

src/components/billing/                # Reusable billing components
├── RevenueChart.tsx
├── SubscriptionTable.tsx
├── PaymentStatusBadge.tsx
├── InvoicePreview.tsx
├── CouponGenerator.tsx
├── PlanComparison.tsx
├── LoyaltyTierBadge.tsx
├── CampaignCard.tsx
└── TicketBoard.tsx
```

---

## 3. Database Schema Additions

### 3.1 New Migrations

#### `042_billing_tables.sql`

```sql
-- ====================================================================
-- 042 — Billing Tables: Invoices, Coupons, Payment Details
-- ====================================================================
BEGIN;

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
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
    coupon_id UUID,  -- FK to coupons (nullable)
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

CREATE INDEX idx_invoices_gym_id ON invoices(gym_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);

-- Coupon definitions
CREATE TABLE IF NOT EXISTS coupons (
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

CREATE INDEX idx_coupons_code ON coupons(code);
CREATE INDEX idx_coupons_gym_id ON coupons(gym_id);
CREATE INDEX idx_coupons_active ON coupons(is_active, expires_at);

-- Coupon usage log
CREATE TABLE IF NOT EXISTS coupon_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
    used_amount NUMERIC(12, 2) NOT NULL,
    used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payment gateway configurations
CREATE TABLE IF NOT EXISTS payment_gateways (
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

-- Payment transactions (detailed log)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_reference VARCHAR(100) UNIQUE NOT NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    gateway_id UUID REFERENCES payment_gateways(id),
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

CREATE INDEX idx_payments_gym_id ON payment_transactions(gym_id);
CREATE INDEX idx_payments_status ON payment_transactions(status);
CREATE INDEX idx_payments_reference ON payment_transactions(transaction_reference);
CREATE INDEX idx_payments_invoice_id ON payment_transactions(invoice_id);

-- Webhook logs
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gateway_id UUID REFERENCES payment_gateways(id),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    signature TEXT,
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,
    processing_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhooks_processed ON webhook_logs(processed);
CREATE INDEX idx_webhooks_event ON webhook_logs(event_type);

-- Refunds
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    refund_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES payment_transactions(id) ON DELETE SET NULL,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','processed','rejected')),
    processed_by UUID REFERENCES staff_users(id),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
```

#### `043_loyalty_tables.sql`

```sql
-- ====================================================================
-- 043 — Loyalty Program Tables
-- ====================================================================
BEGIN;

-- Loyalty tiers
CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    name_ar VARCHAR(100),
    level INTEGER NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#A0AEC0',
    min_points INTEGER NOT NULL DEFAULT 0,
    discount_percent NUMERIC(5, 2) DEFAULT 0.00,
    free_subscription_months INTEGER DEFAULT 0,
    benefits JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO loyalty_tiers (name, name_ar, level, min_points, color, discount_percent, benefits) VALUES
('Bronze', 'برونزي', 1, 0, '#CD7F32', 0.00, '[]'),
('Silver', 'فضي', 2, 500, '#C0C0C0', 5.00, '[]'),
('Gold', 'ذهبي', 3, 2000, '#FFD700', 10.00, '[]'),
('Platinum', 'بلاتيني', 4, 5000, '#E5E4E2', 15.00, '["free_monthly_class", "priority_support"]');

-- Loyalty program settings (global)
CREATE TABLE IF NOT EXISTS loyalty_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    points_per_currency NUMERIC(10, 2) NOT NULL DEFAULT 10,
    min_redemption_points INTEGER NOT NULL DEFAULT 100,
    points_expiry_days INTEGER NOT NULL DEFAULT 365,
    max_points_per_transaction INTEGER DEFAULT 10000,
    allow_partial_redemption BOOLEAN DEFAULT true,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Member loyalty accounts
CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    tier_id UUID REFERENCES loyalty_tiers(id),
    current_points INTEGER NOT NULL DEFAULT 0,
    lifetime_points INTEGER NOT NULL DEFAULT 0,
    total_redeemed INTEGER NOT NULL DEFAULT 0,
    total_expired INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','suspended','inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, gym_id)
);

CREATE INDEX idx_loyalty_member ON loyalty_accounts(member_id, gym_id);
CREATE INDEX idx_loyalty_tier ON loyalty_accounts(tier_id);

-- Points transaction log
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('earned','redeemed','expired','adjusted','refunded')),
    points INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    reference_type VARCHAR(50),  -- 'subscription_payment', 'manual_adjustment', etc.
    reference_id UUID,
    created_by UUID REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_loyalty_tx_account ON loyalty_transactions(account_id, created_at);

-- Loyalty rewards catalog
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    description TEXT,
    points_cost INTEGER NOT NULL,
    reward_type VARCHAR(20) NOT NULL CHECK (reward_type IN ('discount','free_subscription_period','free_product','cashback')),
    reward_value NUMERIC(10, 2),
    max_claims_per_member INTEGER DEFAULT 1,
    claims_count INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
```

#### `044_marketing_tables.sql`

```sql
-- ====================================================================
-- 044 — Marketing Tables: Campaigns, Broadcasts, Referral tracking
-- ====================================================================
BEGIN;

-- Marketing campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    name_ar VARCHAR(255),
    type VARCHAR(30) NOT NULL CHECK (type IN ('email','sms','whatsapp','referral','social')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','completed','cancelled')),
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    platform_wide BOOLEAN DEFAULT false,
    budget NUMERIC(12, 2) DEFAULT 0.00,
    spent_amount NUMERIC(12, 2) DEFAULT 0.00,
    target_audience JSONB DEFAULT '{"all": true}',
    start_date DATE,
    end_date DATE,
    metrics JSONB DEFAULT '{"views":0,"clicks":0,"conversions":0,"cost_per_conversion":0}',
    created_by UUID REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_campaigns_gym_id ON marketing_campaigns(gym_id);
CREATE INDEX idx_campaigns_status ON marketing_campaigns(status, start_date);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    subject_ar VARCHAR(500),
    body_html TEXT NOT NULL,
    body_text TEXT,
    type VARCHAR(30) NOT NULL CHECK (type IN ('welcome','renewal','offer','referral','broadcast','custom')),
    variables JSONB DEFAULT '[]',
    is_default BOOLEAN DEFAULT false,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Broadcasts
CREATE TABLE IF NOT EXISTS broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    subject VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('all_members','plan_specific','region_specific','selected')),
    target_filter JSONB DEFAULT '{}',
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    total_recipients INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    unsubscribed_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed')),
    created_by UUID REFERENCES staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Refunds table (also in 042, this is a cross-reference index)
-- Already exists in 042

-- Referral tracking
CREATE TABLE IF NOT EXISTS referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    referred_member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    referrer_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    campaign_id UUID REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled','expired')),
    reward_amount NUMERIC(12, 2) DEFAULT 0.00,
    reward_status VARCHAR(20) DEFAULT 'pending' CHECK (reward_status IN ('pending','paid','rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_referrals_code ON referrals(referral_code);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_gym_id);

COMMIT;
```

#### `045_support_tickets.sql`

```sql
-- ====================================================================
-- 045 — Support Tickets Schema
-- ====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    gym_id UUID REFERENCES gyms(id) ON DELETE CASCADE,
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    subject VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(30) CHECK (category IN ('billing','technical','subscription','general','other')),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low','medium','high','critical')),
    status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','in_progress','waiting_customer','closed','escalated')),
    assigned_to UUID REFERENCES staff_users(id),
    resolved_by UUID REFERENCES staff_users(id),
    resolution TEXT,
    resolution_code VARCHAR(20),
    satisfaction_rating INTEGER CHECK (satisfaction_rating BETWEEN 1 AND 5),
    first_response_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    sla_breach BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tickets_gym_id ON support_tickets(gym_id);
CREATE INDEX idx_tickets_status ON support_tickets(status, priority);
CREATE INDEX idx_tickets_assigned ON support_tickets(assigned_to);
CREATE INDEX idx_tickets_created ON support_tickets(created_at);
CREATE INDEX idx_tickets_number ON support_tickets(ticket_number);

-- Ticket messages (conversation history)
CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1mc(),
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('customer','support','system')),
    sender_id UUID,
    content TEXT NOT NULL,
    attachments JSONB DEFAULT '[]',
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_ticket ON ticket_messages(ticket_id, created_at);

-- Ticket SLA configuration
CREATE TABLE IF NOT EXISTS sla_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    priority VARCHAR(20) NOT NULL UNIQUE,
    response_minutes INTEGER NOT NULL,
    resolution_hours INTEGER NOT NULL,
    escalation_minutes INTEGER DEFAULT NULL
);

INSERT INTO sla_configs (priority, response_minutes, resolution_hours) VALUES
('low', 480, 72),
('medium', 240, 48),
('high', 60, 24),
('critical', 15, 4);

-- Ticket tags
CREATE TABLE IF NOT EXISTS ticket_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(10) DEFAULT '#E2E8F0'
);

CREATE TABLE IF NOT EXISTS ticket_tag_map (
    ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES ticket_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_id, tag_id)
);

COMMIT;
```

---

## 4. API Endpoints

### 4.1 Billing Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/platform/billing/dashboard` | Revenue stats for date range | Super Admin |
| GET | `/platform/billing/subscriptions` | List subscriptions with filters | Super Admin |
| GET | `/platform/billing/subscriptions/:id` | Single subscription details | Super Admin |
| PUT | `/platform/billing/subscriptions/:id` | Update subscription | Super Admin |
| GET | `/platform/billing/invoices` | List invoices with filters | Super Admin |
| GET | `/platform/billing/invoices/:id` | Invoice detail + PDF data | Super Admin |
| POST | `/platform/billing/invoices/:id/resend` | Re-send invoice email | Super Admin |
| POST | `/platform/billing/invoices/:id/export-pdf` | Export invoice as PDF | Super Admin |
| POST | `/platform/billing/invoices/:id/collect` | Mark as collected (partial/pay) | Super Admin |
| POST | `/platform/billing/invoices/:id/cancel` | Cancel invoice with reason | Super Admin |
| GET | `/platform/billing/plans` | List billing plans | Super Admin |
| POST | `/platform/billing/plans` | Create new plan | Super Admin |
| PUT | `/platform/billing/plans/:id` | Update plan | Super Admin |
| DELETE | `/platform/billing/plans/:id` | Delete plan (reassign if active) | Super Admin |
| POST | `/platform/billing/plans/:id/duplicate` | Duplicate a plan | Super Admin |
| PUT | `/platform/billing/plans/:id/toggle` | Activate/deactivate plan | Super Admin |
| GET | `/platform/billing/coupons` | List coupons | Super Admin |
| POST | `/platform/billing/coupons` | Create coupon | Super Admin |
| PUT | `/platform/billing/coupons/:id` | Update coupon | Super Admin |
| PUT | `/platform/billing/coupons/:id/toggle` | Activate/disable coupon | Super Admin |
| DELETE | `/platform/billing/coupons/:id` | Delete coupon | Super Admin |
| GET | `/platform/billing/payment-gateways` | List configured gateways | Super Admin |
| POST | `/platform/billing/payment-gateways` | Add/enable gateway | Super Admin |
| PUT | `/platform/billing/payment-gateways/:id` | Update gateway config | Super Admin |
| PUT | `/platform/billing/payment-gateways/:id/toggle` | Enable/disable gateway | Super Admin |
| GET | `/platform/billing/payments` | List payment transactions | Super Admin |
| GET | `/platform/billing/payments/:id` | Payment detail | Super Admin |
| GET | `/platform/billing/webhooks` | Webhook delivery logs | Super Admin |
| POST | `/platform/billing/webhooks/:id/retry` | Retry failed webhook | Super Admin |
| GET | `/platform/billing/refunds` | List refund requests | Super Admin |
| POST | `/platform/billing/refunds` | Request refund | Super Admin |
| PUT | `/platform/billing/refunds/:id` | Approve/reject refund | Super Admin |
| GET | `/platform/billing/reports/revenue` | Monthly revenue chart data | Super Admin |
| GET | `/platform/billing/reports/churn` | Churn rate data | Super Admin |
| GET | `/platform/billing/reports/top-plans` | Most popular plans | Super Admin |
| GET | `/platform/billing/reports/overdue` | Overdue payments report | Super Admin |
| GET | `/platform/billing/reports/export` | Export report (CSV/Excel) | Super Admin |

### 4.2 Loyalty Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/platform/loyalty/settings` | Get loyalty program settings | Super Admin |
| PUT | `/platform/loyalty/settings` | Update loyalty settings | Super Admin |
| GET | `/platform/loyalty/tiers` | List loyalty tiers | Super Admin |
| POST | `/platform/loyalty/tiers` | Create tier | Super Admin |
| PUT | `/platform/loyalty/tiers/:id` | Update tier | Super Admin |
| DELETE | `/platform/loyalty/tiers/:id` | Delete tier | Super Admin |
| GET | `/platform/loyalty/rewards` | List available rewards | Super Admin |
| POST | `/platform/loyalty/rewards` | Create reward | Super Admin |
| PUT | `/platform/loyalty/rewards/:id` | Update reward | Super Admin |
| GET | `/platform/loyalty/members` | List members with points | Super Admin |
| GET | `/platform/loyalty/members/:id` | Member loyalty details | Super Admin |
| POST | `/platform/loyalty/members/:id/adjust` | Manual points adjustment | Super Admin |
| GET | `/platform/loyalty/reports` | Loyalty analytics | Super Admin |

### 4.3 Marketing Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/platform/marketing/campaigns` | List campaigns | Super Admin |
| POST | `/platform/marketing/campaigns` | Create campaign | Super Admin |
| PUT | `/platform/marketing/campaigns/:id` | Update campaign | Super Admin |
| POST | `/platform/marketing/campaigns/:id/start` | Activate campaign | Super Admin |
| POST | `/platform/marketing/campaigns/:id/pause` | Pause campaign | Super Admin |
| GET | `/platform/marketing/campaigns/:id/stats` | Campaign performance stats | Super Admin |
| GET | `/platform/marketing/templates` | List email templates | Super Admin |
| POST | `/platform/marketing/templates` | Create template | Super Admin |
| PUT | `/platform/marketing/templates/:id` | Update template | Super Admin |
| POST | `/platform/marketing/broadcasts` | Create broadcast | Super Admin |
| POST | `/platform/marketing/broadcasts/:id/send` | Send broadcast | Super Admin |
| GET | `/platform/marketing/broadcasts` | List broadcasts | Super Admin |
| GET | `/platform/marketing/referrals` | List referrals | Super Admin |
| GET | `/platform/marketing/referrals/leaderboard` | Top referring gyms | Super Admin |

### 4.4 Support Ticket Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/platform/support/tickets` | List tickets with filters | Super Admin |
| GET | `/platform/support/tickets/:id` | Ticket detail + messages | Super Admin |
| POST | `/platform/support/tickets/:id/assign` | Assign ticket to staff | Super Admin |
| PATCH | `/platform/support/tickets/:id/status` | Update ticket status | Super Admin |
| PATCH | `/platform/support/tickets/:id/priority` | Update ticket priority | Super Admin |
| POST | `/platform/support/tickets/:id/respond` | Add response | Support Staff |
| POST | `/platform/support/tickets/:id/close` | Close ticket with reason | Super Admin |
| POST | `/platform/support/tickets/:id/reopen` | Reopen closed ticket | Super Admin |
| GET | `/platform/support/analytics` | Ticket analytics | Super Admin |
| GET | `/platform/support/tags` | List available tags | Super Admin |
| POST | `/platform/support/tags` | Create tag | Super Admin |

---

## 5. Frontend Components

### 5.1 New Pages (under `src/pages/billing/`)

| Component | Description | Key Features |
|-----------|-------------|-------------|
| `BillingDashboard.tsx` | Main billing overview | KPI cards, revenue chart, recent transactions |
| `PlansManager.tsx` | Plan CRUD | Create/edit/duplicate/delete plans, feature flags |
| `InvoicesManager.tsx` | Invoice listing + detail | Filter, search, export, status badges |
| `InvoiceDetail.tsx` | Single invoice view | Print, PDF export, email re-send, payment collection |
| `CouponsManager.tsx` | Coupon management | Create, toggle, usage stats, expiry |
| `PaymentGateways.tsx` | Gateway configuration | Enable/disable, API keys, test mode, transaction logs |
| `BillingReports.tsx` | Analytics reports | Revenue trends, churn, geo distribution, top plans |
| `LoyaltyProgram.tsx` | Loyalty dashboard | Tiers, settings, rewards catalog |
| `LoyaltyMembers.tsx` | Member loyalty list | Points balance, tier, transaction history |
| `MarketingCampaigns.tsx` | Campaign management | Create, A/B test, performance charts |
| `BroadcastManager.tsx` | Mass messaging | Target audience, schedule, delivery stats |
| `ReferralSystem.tsx` | Referral management | Codes, rewards, leaderboard |
| `SupportTickets.tsx` | Ticket list | Board view, filters, stats |
| `TicketDetail.tsx` | Single ticket | Conversation thread, status change, assignment |
| `AIAnalytics.tsx` | AI recommendations | Churn prediction, plan suggestions, revenue forecast |

### 5.2 Reusable Components (under `src/components/billing/`)

| Component | Purpose |
|-----------|---------|
| `RevenueChart.tsx` | Line/bar chart for revenue trends |
| `SubscriptionTable.tsx` | Table of active subscriptions with actions |
| `PaymentStatusBadge.tsx` | Status indicator (paid/pending/overdue) |
| `InvoicePreview.tsx` | Print-friendly invoice view |
| `CouponGenerator.tsx` | Bulk coupon generation with custom codes |
| `PlanComparison.tsx` | Side-by-side plan comparison table |
| `LoyaltyTierBadge.tsx` | Visualbadge showing tier level |
| `CampaignCard.tsx` | Compact campaign summary card |
| `TicketBoard.tsx` | Kanban-style ticket board |
| `DateRangePicker.tsx` | Preset date filters (day/week/month/quarter/year) |

### 5.3 Design System (consistent with existing)

All components follow the established gray/white design system:
- `bg-white border border-gray-200 rounded-2xl p-6 shadow-sm` — Card containers
- `bg-cyan-600 text-white rounded-xl hover:bg-cyan-700` — Primary buttons
- `bg-gray-50 border border-gray-200 rounded-xl` — Input fields
- `text-cyan-600` — Section icons
- `bg-cyan-50 text-cyan-700` — Active navigation
- `peer-checked:bg-cyan-600` — Toggle switches
- `bg-green-100 text-green-700` — Success badges
- `bg-red-100 text-red-700` — Error/overdue badges
- `bg-yellow-100 text-yellow-700` — Warning/pending badges
- Full RTL support with `dir={rtl ? 'rtl' : 'ltr'}`

---

## 6. AI Integration Plan

### 6.1 Architecture

```
server/src/services/ai/
├── analytics.service.ts          # Main AI service
├── churnPredictor.ts             # Churn prediction model
├── planRecommender.ts            # Plan recommendation engine
├── revenueForecaster.ts          # Revenue forecasting
└── openaiAdapter.ts              # OpenAI API wrapper (optional)
```

### 6.2 AI Use Cases

| Use Case | Algorithm | Input Data | Output |
|----------|-----------|------------|--------|
| Churn Prediction | Logistic Regression / XGBoost | Usage patterns, subscription age, payment history | Risk score (0-100) per gym |
| Plan Recommendation | Collaborative Filtering | Usage data, gym size, plan limits | Recommended plan tier |
| Revenue Forecasting | Time Series (SARIMA) | Monthly revenue, seasonal patterns | 3-month forecast with confidence intervals |
| Customer Segmentation | K-Means Clustering | Member behavior, usage, demographics | Segment labels |
| A/B Test Analysis | Bayesian Statistical Test | Campaign metrics | Winner + confidence level |

### 6.3 Integration Pattern

```typescript
// server/src/services/ai/analytics.service.ts
import { pool } from '../../config/database';

interface ChurnPrediction {
  gym_id: string;
  gym_name: string;
  risk_score: number;       // 0-100
  factors: string[];        // Top reasons for risk
  recommendation: string;   // Actionable suggestion
}

async function predictChurn(daysLookback = 90): Promise<ChurnPrediction[]> {
  // Fetch historical data
  const result = await pool.query(`
    SELECT g.id, g.name, g.plan_tier,
           COUNT(DISTINCT ms.id) AS session_count,
           AVG(ms.duration_minutes) AS avg_session_length,
           MAX(ms.check_in_time) AS last_activity,
           gs.status AS subscription_status
    FROM gyms g
    LEFT JOIN gym_usage_counters gc ON gc.gym_id = g.id
    LEFT JOIN membership_subscriptions ms ON ms.gym_id = g.id
    LEFT JOIN billing_subscriptions gs ON gs.gym_id = g.id
    WHERE g.created_at < NOW() - INTERVAL '90 days'
    GROUP BY g.id, g.name, g.plan_tier, gs.status
  `);

  // Apply ML model
  return result.rows.map(row => ({
    gym_id: row.id,
    gym_name: row.name,
    risk_score: calculateRiskScore(row),
    factors: identifyRiskFactors(row),
    recommendation: generateRecommendation(row)
  }));
}
```

### 6.4 OpenAI Integration (Optional Enhancement)

```typescript
// server/src/services/ai/openaiAdapter.ts
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generatePlanRecommendation(gymData: GymData): Promise<string> {
  const prompt = `Based on gym data: ${JSON.stringify(gymData)}, recommend the best billing plan...`;
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }]
  });
  return response.choices[0].message.content;
}
```

### 6.5 Offline/Fallback Mode

- AI recommendations work even without OpenAI API key
- Uses rule-based heuristics as fallback:
  - If usage < 30% of plan limit → downgrade suggestion
  - If last payment > 30 days overdue → churn risk HIGH
  - If subscription age > 1 year with no upgrade → upgrade suggestion

---

## 7. Implementation Timeline

### Week 1 (Days 1-5): Foundation
| Day | Task | Deliverable |
|-----|------|-------------|
| 1 | DB migrations 042, 043, 044, 045 | All billing/loyalty/marketing/support tables |
| 2 | Billing service (`billing.service.ts`), invoice service (`invoice.service.ts`) | Core billing logic |
| 3 | Coupon service (`coupon.service.ts`), payment factory extension | Coupon + payment processing |
| 4 | AI analytics service (`aiAnalytics.service.ts`), base adapters | AI recommendation engine |
| 5 | Validators for all new Zod schemas | Input validation |

### Week 2 (Days 6-10): Backend Routes & Controllers
| Day | Task | Deliverable |
|-----|------|-------------|
| 6 | Billing controller + routes | CRUD for invoices, coupons, plans |
| 7 | Payment gateway controller + Webhook handler | Gateway management |
| 8 | Loyalty controller + routes | Tier management, points tracking |
| 9 | Marketing controller + routes | Campaigns, broadcasts, templates |
| 10 | Support tickets controller + routes | Ticket CRUD, SLA management |

### Week 3 (Days 11-15): Frontend Pages
| Day | Task | Deliverable |
|-----|------|-------------|
| 11 | BillingDashboard + PlansManager | Revenue charts + plan CRUD |
| 12 | InvoicesManager + InvoiceDetail | Invoice listing + detail view |
| 13 | CouponsManager + PaymentGateways | Coupon management + gateway config |
| 14 | LoyaltyProgram + LoyaltyMembers | Loyalty dashboard + member list |
| 15 | MarketingCampaigns + AIBroadcasts | Campaign creation + broadcast |

### Week 4 (Days 16-20): Advanced Features + Polish
| Day | Task | Deliverable |
|-----|------|-------------|
| 16 | SupportTickets + TicketDetail | Ticket board + conversation view |
| 17 | BillingReports (CSV/Excel export) | Analytics reports |
| 18 | ReferralSystem + Leaderboard | Referral tracking + rankings |
| 19 | AIAnalytics (churn + recommendations) | AI dashboard |
| 20 | RTL polish, responsive testing, bug fixes | Production-ready UI |

### Total: **20 working days** (4 weeks)

---

## 8. Test Cases

### 8.1 Invoice Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| INV-001 | Create invoice with valid data | Invoice created with unique `invoice_number` |
| INV-002 | Create invoice with missing gym_id | 400 error |
| INV-003 | Mark invoice as paid (full amount) | Status → `paid`, `paid_at` set |
| INV-004 | Mark invoice as partial payment | Status → `partial`, `paid_amount` updated |
| INV-005 | Cancel invoice with reason | Status → `cancelled`, cancellation logged |
| INV-006 | Re-send invoice email | Email queued, toast success |
| INV-007 | Export invoice as PDF | File downloadable with correct data |
| INV-008 | Overdue invoice auto-notification | Cron job sends reminder after due_date |

### 8.2 Coupon Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| COUP-001 | Create coupon with valid data | Coupon created with unique `code` |
| COUP-002 | Create coupon with duplicate code | 409 conflict error |
| COUP-003 | Apply coupon to invoice (within usage limit) | Discount applied, usage_count incremented |
| COUP-004 | Apply expired coupon | 400 error |
| COUP-005 | Toggle coupon active/inactive | State changes correctly |
| COUP-006 | Delete coupon with active usage | Prevented until all usages removed |

### 8.3 Payment Gateway Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| PGW-001 | Enable Fawry gateway in test mode | Gateway marked active |
| PGW-002 | Process payment with test mode | Transaction recorded with `status=pending` |
| PGW-003 | Webhook callback received | Transaction updated to `completed` |
| PGW-004 | Webhook with invalid signature | Rejected, logged in webhook_logs |
| PGW-005 | Retry failed webhook | Re-processed successfully |
| PGW-006 | Request refund | Refund created, status `pending` |

### 8.4 Loyalty Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| LY-001 | Earn points for subscription payment | Points added to member account |
| LY-002 | Redeem points for reward | Points deducted, reward applied |
| LY-003 | Points expiry after configured days | Points auto-expired, transaction logged |
| LY-004 | Manual points adjustment by admin | Points updated, audit log created |
| LY-005 | Tier upgrade when crossing threshold | Member tier automatically updated |

### 8.5 Support Ticket Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| TK-001 | Create ticket from gym member | Ticket created, confirmation sent |
| TK-002 | Assign ticket to staff | `assigned_to` set |
| TK-003 | Update status to in_progress | Status changed, timestamp updated |
| TK-004 | Add internal note (not visible to customer) | Message stored with `is_internal=true` |
| TK-005 | Close ticket with resolution | Status → `closed`, resolution recorded |
| TK-006 | Respond to waiting_customer ticket | Status → `in_progress` |
| TK-007 | SLA breach detection | `sla_breach=true` set when response exceeds limit |
| TK-008 | Reopen closed ticket | Status → `open` |

### 8.6 Campaign / Broadcast Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| CMP-001 | Create email campaign | Campaign created in draft state |
| CMP-002 | Schedule broadcast for future date | `scheduled_at` set, status `scheduled` |
| CMP-003 | Send broadcast to all members | Emails queued, `total_recipients` updated |
| CMP-004 | A/B test with two variants | Both variants sent, engagement tracked |
| CMP-005 | Campaign completion analytics | Open rate, CTR, conversion rate calculated |

### 8.7 Integration Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| INT-001 | Full billing cycle: create plan → subscribe → pay → invoice | End-to-end flow works |
| INT-002 | Coupon applied to subscription renewal | Discount applied to next invoice |
| INT-003 | Payment failure → webhook → retry → success | Transaction eventually marked completed |
| INT-004 | Churn prediction runs daily | Cron job triggers prediction, stores results |
| INT-005 | Referral creates linked account | Both referrer and referred get recorded |
| INT-006 | RLS isolation: gym A cannot see gym B invoices | Row-Level Security enforced |

### 8.8 Performance Tests
| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| PERF-001 | Dashboard loads in < 2s with 10k invoices | Acceptable latency |
| PERF-002 | Invoice generation for 1000 gyms | Completes within 30s |
| PERF-003 | Bulk coupon generation (1000 codes) | Processed within 5s |
| PERF-004 | Webhook processing at 100/sec | No queue buildup |

---

## 9. Security Considerations

1. **RBAC**: All billing endpoints require Super Admin role (or platform-level access)
2. **Audit Log**: Every billing action logged to `activity_logs` table
3. **CSRF**: All mutations protected with CSRF tokens
4. **Input Validation**: All inputs validated with Zod schemas
5. **Payment Security**: API keys encrypted at rest, never logged
6. **PII**: Customer payment details masked in logs
7. **Rate Limiting**: Webhook endpoint rate-limited to prevent replay attacks
8. **File Upload**: PDF/export files served with proper Content-Disposition headers

---

## 10. Integration Points

| Feature | Integrates With |
|---------|-----------------|
| Invoices → Payments | `billing_payments` table |
| Coupons → Subscriptions | Applied at renewal time |
| Loyalty → Billing | Points earned from payment_amount |
| Marketing → Email | Nodemailer + Mailpit (dev) |
| AI → Analytics | Historical data from billing tables |
| Webhooks → Payment Gateways | Real-time payment status updates |
| Tickets → CRM | Existing `customers` table for member context |
| Broadcast → i18n | Arabic/English template support |

---

*Plan prepared: 2026-07-24*
*Ready for implementation upon approval*
