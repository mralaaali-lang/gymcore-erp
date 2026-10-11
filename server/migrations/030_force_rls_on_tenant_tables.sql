-- ====================================================================
-- 030_force_rls_on_tenant_tables.sql
-- --------------------------------------------------------------------
-- PROBLEM (discovered while writing the RLS isolation integration test):
-- Migration 029 correctly enabled RLS + added the `tenant_isolation`
-- policy to the 8 tables, but `pg_class.relforcerowsecurity` is FALSE for
-- all of them. That means Row-Level Security is BYPASSED for the table
-- OWNER (the `gimawi` superuser used by the app and by tests). In
-- production the app connects as the table owner, so RLS was effectively
-- a no-op for every query the backend issues — cross-tenant leakage was
-- still possible.
--
-- FIX: `ALTER TABLE ... FORCE ROW LEVEL SECURITY` makes the policy apply
-- to the owner as well. The legitimate admin bypass (`withAdminClient` /
-- `getAdminClient`, which do `SET LOCAL row_security = off` inside an
-- explicit transaction) still works because that is a session-level
-- override that FORCE does not prevent.
--
-- This is the correct, defense-in-depth posture: RLS is always on, and
-- the only way to bypass it is the deliberate, transaction-scoped admin
-- client — never accidental owner privilege.
-- ====================================================================

ALTER TABLE refresh_tokens      FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys            FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices    FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles      FORCE ROW LEVEL SECURITY;
ALTER TABLE support_tickets     FORCE ROW LEVEL SECURITY;
ALTER TABLE push_tokens         FORCE ROW LEVEL SECURITY;
ALTER TABLE push_log            FORCE ROW LEVEL SECURITY;
ALTER TABLE api_requests_log    FORCE ROW LEVEL SECURITY;
