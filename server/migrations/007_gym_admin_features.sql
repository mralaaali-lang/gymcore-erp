-- Missing tables for gym-admin features: suppliers, purchases, debts, cashbox, announcements, settings, private-training

-- Extend staff_users with phone & salary
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS salary NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  staff_user_id UUID NOT NULL REFERENCES staff_users(id),
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS member_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  original_amount NUMERIC(10,2) NOT NULL CHECK (original_amount > 0),
  remaining_amount NUMERIC(10,2) NOT NULL CHECK (remaining_amount >= 0),
  due_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashbox_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES staff_users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  closing_balance NUMERIC(10,2),
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES staff_users(id),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  target_audience VARCHAR(50) NOT NULL DEFAULT 'all',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gym_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  setting_key VARCHAR(255) NOT NULL,
  setting_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(gym_id, setting_key)
);

CREATE TABLE IF NOT EXISTS pt_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  session_count INTEGER NOT NULL CHECK (session_count > 0),
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pt_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES pt_packages(id),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES staff_users(id),
  session_number INTEGER NOT NULL CHECK (session_number > 0),
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS policies
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashbox_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pt_sessions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_names TEXT[] := ARRAY['suppliers', 'purchases', 'member_debts', 'cashbox_sessions', 'announcements', 'gym_settings', 'pt_packages', 'pt_sessions'];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY policy_names LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (gym_id = current_gym_id()) WITH CHECK (gym_id = current_gym_id())', tbl);
  END LOOP;
  -- purchase_items has a different policy definition
  DROP POLICY IF EXISTS tenant_isolation ON purchase_items;
  EXECUTE 'CREATE POLICY tenant_isolation ON purchase_items USING (EXISTS (SELECT 1 FROM purchases WHERE purchases.id = purchase_items.purchase_id AND purchases.gym_id = current_gym_id())) WITH CHECK (EXISTS (SELECT 1 FROM purchases WHERE purchases.id = purchase_items.purchase_id AND purchases.gym_id = current_gym_id()))';
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_gym ON suppliers(gym_id);
CREATE INDEX IF NOT EXISTS idx_purchases_gym ON purchases(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debts_member ON member_debts(member_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_cashbox_staff ON cashbox_sessions(staff_user_id, gym_id);
CREATE INDEX IF NOT EXISTS idx_announcements_gym ON announcements(gym_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_gym ON gym_settings(gym_id);
CREATE INDEX IF NOT EXISTS idx_pt_packages_gym ON pt_packages(gym_id);
CREATE INDEX IF NOT EXISTS idx_pt_sessions_member ON pt_sessions(member_id, gym_id);
