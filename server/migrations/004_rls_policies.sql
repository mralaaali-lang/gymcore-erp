-- ====================================================================
-- Row-Level Security (RLS): Multi-Tenant Data Isolation
-- Every table with gym_id gets a policy that filters by current gym_id.
-- ====================================================================

-- Helper function to get the gym_id from the current session variable
CREATE OR REPLACE FUNCTION current_gym_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.gym_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- ====================================================================
-- ENABLE RLS ON ALL TENANT-ISOLATED TABLES
-- ====================================================================
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE fitness_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ====================================================================
-- POLICIES — Using app.gym_id set by middleware
-- ====================================================================

-- MEMBERS
DROP POLICY IF EXISTS tenant_isolation ON members;
CREATE POLICY tenant_isolation ON members
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- MEMBER SUBSCRIPTIONS
DROP POLICY IF EXISTS tenant_isolation ON member_subscriptions;
CREATE POLICY tenant_isolation ON member_subscriptions
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- MEMBERSHIP OFFERS
DROP POLICY IF EXISTS tenant_isolation ON membership_offers;
CREATE POLICY tenant_isolation ON membership_offers
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- ATTENDANCE LOGS
DROP POLICY IF EXISTS tenant_isolation ON attendance_logs;
CREATE POLICY tenant_isolation ON attendance_logs
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- STAFF USERS
DROP POLICY IF EXISTS tenant_isolation ON staff_users;
CREATE POLICY tenant_isolation ON staff_users
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- PRODUCTS
DROP POLICY IF EXISTS tenant_isolation ON products;
CREATE POLICY tenant_isolation ON products
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- POS ORDERS
DROP POLICY IF EXISTS tenant_isolation ON pos_orders;
CREATE POLICY tenant_isolation ON pos_orders
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- POS ORDER ITEMS (join via pos_orders)
DROP POLICY IF EXISTS tenant_isolation ON pos_order_items;
CREATE POLICY tenant_isolation ON pos_order_items
  USING (
    EXISTS (
      SELECT 1 FROM pos_orders
      WHERE pos_orders.id = pos_order_items.order_id
        AND pos_orders.gym_id = current_gym_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pos_orders
      WHERE pos_orders.id = pos_order_items.order_id
        AND pos_orders.gym_id = current_gym_id()
    )
  );

-- EXPENSE CATEGORIES
DROP POLICY IF EXISTS tenant_isolation ON expense_categories;
CREATE POLICY tenant_isolation ON expense_categories
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- FINANCIAL TRANSACTIONS
DROP POLICY IF EXISTS tenant_isolation ON financial_transactions;
CREATE POLICY tenant_isolation ON financial_transactions
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- STAFF SHIFTS
DROP POLICY IF EXISTS tenant_isolation ON staff_shifts;
CREATE POLICY tenant_isolation ON staff_shifts
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- PAYROLL LEDGER
DROP POLICY IF EXISTS tenant_isolation ON payroll_ledger;
CREATE POLICY tenant_isolation ON payroll_ledger
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- FITNESS CLASSES
DROP POLICY IF EXISTS tenant_isolation ON fitness_classes;
CREATE POLICY tenant_isolation ON fitness_classes
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- CLASS BOOKINGS (join via fitness_classes)
DROP POLICY IF EXISTS tenant_isolation ON class_bookings;
CREATE POLICY tenant_isolation ON class_bookings
  USING (
    EXISTS (
      SELECT 1 FROM fitness_classes
      WHERE fitness_classes.id = class_bookings.class_id
        AND fitness_classes.gym_id = current_gym_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fitness_classes
      WHERE fitness_classes.id = class_bookings.class_id
        AND fitness_classes.gym_id = current_gym_id()
    )
  );

-- PENDING ACTIONS
DROP POLICY IF EXISTS tenant_isolation ON pending_actions;
CREATE POLICY tenant_isolation ON pending_actions
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- ACTIVITY LOGS
DROP POLICY IF EXISTS tenant_isolation ON activity_logs;
CREATE POLICY tenant_isolation ON activity_logs
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());
