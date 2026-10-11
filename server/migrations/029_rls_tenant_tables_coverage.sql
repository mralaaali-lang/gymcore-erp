-- ====================================================================
-- 029_rls_tenant_tables_coverage.sql
-- --------------------------------------------------------------------
-- PROBLEM (Architecture Audit 2026-07-20, Finding W1 — CRITICAL):
-- The following 8 tables carry a gym_id column but Row-Level Security was
-- NEVER enabled on them. Because tenant-scoped queries run through the
-- shared `query()` helper (which only sets app.gym_id to drive RLS, it
-- does NOT add a gym_id filter to the SQL), any query that omits gym_id
-- from its WHERE clause could read/modify rows belonging to a DIFFERENT
-- gym. The highest-risk tables are refresh_tokens (auth tokens!) and
-- api_keys (developer secrets).
--
-- FIX: Enable RLS and add the standard `tenant_isolation` policy used by
-- every other tenant table in the system (see 004_rls_policies.sql). This
-- closes the cross-tenant leakage gap for these tables.
--
-- NOTE: For tables where gym_id is nullable (push_log, api_requests_log)
-- the policy hides rows whose gym_id IS NULL from ordinary tenant
-- requests — those are platform-level rows and must go through the
-- admin client (getAdminClient), exactly like the other platform tables.
-- ====================================================================

-- Helper already exists from 004: current_gym_id()

-- --------------------------------------------------------------------
-- 1. refresh_tokens (AUTH — highest risk)
-- --------------------------------------------------------------------
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON refresh_tokens;
CREATE POLICY tenant_isolation ON refresh_tokens
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- --------------------------------------------------------------------
-- 2. api_keys (DEVELOPER SECRETS — highest risk)
-- --------------------------------------------------------------------
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON api_keys;
CREATE POLICY tenant_isolation ON api_keys
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- --------------------------------------------------------------------
-- 3. billing_invoices
-- --------------------------------------------------------------------
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON billing_invoices;
CREATE POLICY tenant_isolation ON billing_invoices
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- --------------------------------------------------------------------
-- 4. billing_cycles
-- --------------------------------------------------------------------
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON billing_cycles;
CREATE POLICY tenant_isolation ON billing_cycles
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- --------------------------------------------------------------------
-- 5. support_tickets
-- --------------------------------------------------------------------
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON support_tickets;
CREATE POLICY tenant_isolation ON support_tickets
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- --------------------------------------------------------------------
-- 6. push_tokens (gym_id NOT NULL)
-- --------------------------------------------------------------------
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON push_tokens;
CREATE POLICY tenant_isolation ON push_tokens
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- --------------------------------------------------------------------
-- 7. push_log (gym_id nullable — platform rows hidden from tenants)
-- --------------------------------------------------------------------
ALTER TABLE push_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON push_log;
CREATE POLICY tenant_isolation ON push_log
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());

-- --------------------------------------------------------------------
-- 8. api_requests_log (gym_id nullable — platform rows hidden from tenants)
-- --------------------------------------------------------------------
ALTER TABLE api_requests_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON api_requests_log;
CREATE POLICY tenant_isolation ON api_requests_log
  USING (gym_id = current_gym_id())
  WITH CHECK (gym_id = current_gym_id());
