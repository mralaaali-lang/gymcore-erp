-- Phase 2 — Verification Checklist
-- Run this AFTER all migrations (047-051) have been applied
-- Purpose: Verify that Phase 2 was successfully applied

-- ============================================================================
-- 1. VERIFY SOFT DELETE COLUMNS EXIST
-- ============================================================================

SELECT '📋 CHECK 1: Soft Delete Columns' AS check_name;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE column_name = 'deleted_at'
AND table_name IN ('gyms', 'members', 'subscriptions', 'billing_plans', 'billing_invoices', 'attendance_logs', 'staff', 'products')
ORDER BY table_name;

-- Expected: 8 rows (one deleted_at column per table)

-- ============================================================================
-- 2. VERIFY NEW PLATFORM TABLES EXIST
-- ============================================================================

SELECT '📋 CHECK 2: New Platform Tables' AS check_name;

SELECT table_name, table_schema
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'platform_audit_logs',
  'platform_notifications', 
  'gym_daily_limits',
  'gym_daily_usage',
  'recycle_bin',
  'gym_versions',
  'staff_sessions'
)
ORDER BY table_name;

-- Expected: 7 rows (all new platform tables)

-- ============================================================================
-- 3. VERIFY BRANCHES TABLE AND branch_id COLUMNS
-- ============================================================================

SELECT '📋 CHECK 3: Branches Support' AS check_name;

-- Check branches table
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'branches';

-- Check branch_id in members
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'members' AND column_name = 'branch_id';

-- Check branch_id in attendance_logs
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'attendance_logs' AND column_name = 'branch_id';

-- Check default branches created
SELECT COUNT(*) as branch_count FROM branches;
SELECT 'Default branches created (should be ≥1)' AS status;

-- Expected: 1 row for branches table, 1 for member branch_id, 1 for attendance branch_id, ≥1 branch count

-- ============================================================================
-- 4. VERIFY RLS IS ENABLED
-- ============================================================================

SELECT '📋 CHECK 4: RLS Enabled on Tables' AS check_name;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;

-- Expected: 14 tables with RLS enabled

-- ============================================================================
-- 5. VERIFY RLS POLICIES CREATED
-- ============================================================================

SELECT '📋 CHECK 5: RLS Policies Count' AS check_name;

SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Expected: 28+ total policies (mix of SELECT, INSERT, UPDATE, DELETE)

-- Sample policies:
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname
LIMIT 10;

-- ============================================================================
-- 6. VERIFY MEMBER_ID IN BILLING_INVOICES
-- ============================================================================

SELECT '📋 CHECK 6: Member ID in Billing Invoices' AS check_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'billing_invoices' AND column_name = 'member_id';

-- Expected: 1 row (member_id column exists)

-- ============================================================================
-- 7. VERIFY INDEXES CREATED
-- ============================================================================

SELECT '📋 CHECK 7: Optimization Indexes' AS check_name;

SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Expected: 25+ indexes for RLS and soft_delete optimization

-- ============================================================================
-- 8. TEST RLS ISOLATION (Quick Sanity Check)
-- ============================================================================

SELECT '📋 CHECK 8: RLS Isolation Quick Test' AS check_name;

-- Test 1: Super admin (NULL gym_id) - should work
RESET app.gym_id;
SELECT COUNT(*) as member_count FROM members WHERE deleted_at IS NULL;
SELECT 'Super admin can query members (no gym_id set)' AS result;

-- Test 2: Set gym_id context
SELECT set_config('app.gym_id', id::TEXT, false)
FROM gyms
ORDER BY id
LIMIT 1;
SELECT current_setting('app.gym_id', false) as current_gym_context;

-- Verify RLS is applied (member count should be ≤ total)
SELECT COUNT(*) as gym_specific_members FROM members WHERE deleted_at IS NULL;
SELECT 'Gym-specific context is set and RLS applies' AS result;

-- Reset
RESET app.gym_id;

-- ============================================================================
-- 9. VERIFY NO SYNTAX ERRORS IN MIGRATIONS
-- ============================================================================

SELECT '📋 CHECK 9: Database Integrity' AS check_name;

-- Check for foreign key constraint violations
SELECT 
  'Foreign Keys' as integrity_check,
  COUNT(*) as issue_count
FROM (
  SELECT 
    t1.tablename as table_with_issue,
    c.conname as constraint_name
  FROM pg_tables t1
  JOIN pg_constraint c ON c.conrelid::regclass::text = t1.tablename
  WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables t2 
    WHERE t2.table_name = SPLIT_PART(c.confrelid::regclass::text, '.', 2)
  )
) subq;

-- Expected: 0 issues (all foreign keys valid)

-- ============================================================================
-- FINAL CHECKLIST
-- ============================================================================

SELECT '
✅ PHASE 2 VERIFICATION CHECKLIST

After running all checks above, verify:

☐ CHECK 1: All 8 soft_delete columns exist
☐ CHECK 2: All 7 new platform tables exist  
☐ CHECK 3: Branches table + branch_id in members & attendance_logs
☐ CHECK 4: RLS enabled on 14 tables
☐ CHECK 5: 28+ RLS policies created
☐ CHECK 6: member_id column in billing_invoices
☐ CHECK 7: 25+ optimization indexes created
☐ CHECK 8: RLS context isolation working
☐ CHECK 9: No database integrity issues

IF ALL CHECKS PASS:
  ✅ Phase 2 migration complete!
  
NEXT STEPS:
  1. Run full RLS test suite: 051_phase2c_rls_test_scenarios.sql
  2. Update backend APIs to handle RLS context setting
  3. Test all endpoints with different gym_id contexts
  4. Proceed to Phase 1ب (library replacement) or Phase 3 (frontend structure)
' AS final_status;
