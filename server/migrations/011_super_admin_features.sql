-- ====================================================================
-- Super Admin Feature Tables: support tickets, broadcasts, billing
-- Uses 42P07 fallback for idempotent Docker runs (see migrate.ts)
-- ====================================================================

-- 1. SUPPORT TICKETS (from gyms to super admin)
CREATE TABLE IF NOT EXISTS support_tickets (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id        uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  subject       varchar(255) NOT NULL,
  description   text NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','in_progress','resolved','closed')),
  priority      varchar(20) NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high','critical')),
  assigned_to   uuid REFERENCES platform_admins(id),
  resolved_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for listing tickets by gym or status
CREATE INDEX IF NOT EXISTS idx_support_tickets_gym ON support_tickets(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- 2. PLATFORM BROADCASTS (sent by super admin to multiple gyms)
CREATE TABLE IF NOT EXISTS platform_broadcasts (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         varchar(255) NOT NULL,
  content       text NOT NULL,
  target_roles  jsonb DEFAULT '[]'::jsonb,
  sent_by       uuid REFERENCES platform_admins(id),
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_sent ON platform_broadcasts(created_at DESC);

-- 3. BILLING PLANS (platform-level subscription tiers)
CREATE TABLE IF NOT EXISTS billing_plans (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          varchar(100) NOT NULL,
  name_ar       varchar(100) NOT NULL,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  price_yearly  numeric(10,2) NOT NULL DEFAULT 0,
  max_staff     int NOT NULL DEFAULT 5,
  max_members   int NOT NULL DEFAULT 100,
  max_gyms      int NOT NULL DEFAULT 1,
  features      jsonb DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. BILLING INVOICES (per-gym billing records)
CREATE TABLE IF NOT EXISTS billing_invoices (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id        uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan_id       uuid REFERENCES billing_plans(id),
  amount        numeric(10,2) NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','paid','overdue','cancelled')),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  paid_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoices_gym ON billing_invoices(gym_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON billing_invoices(status);

-- ====================================================================
-- Seed default billing plans
-- ====================================================================
INSERT INTO billing_plans (name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, features)
VALUES
  ('Starter',     'ابتدائي',    299,  2990,  3,   50,   1, '["dashboard","members","attendance","products"]'::jsonb),
  ('Professional','احترافي',    599,  5990,  10,  200,  3, '["dashboard","members","attendance","products","crm","hr","training","whatsapp"]'::jsonb),
  ('Enterprise',  'مؤسسات',     999,  9990,  50,  1000, 10, '["dashboard","members","attendance","products","crm","hr","training","whatsapp","ai-coach","zatca","loyalty","leaderboard"]'::jsonb)
ON CONFLICT DO NOTHING;