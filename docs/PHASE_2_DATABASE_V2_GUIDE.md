---
title: "Phase 2 — Database V2: Comprehensive Migration Guide"
version: "2.0"
created: "2026-02-05"
status: "🔴 ACTIVE"
---

# Phase 2 — Database V2: Soft Deletes, Multi-Branch Support & RLS

## 📋 Overview

**Phase 2** transforms GymCore's database architecture from single-gym isolation to **multi-branch, enterprise-ready infrastructure** with complete Row-Level Security (RLS) isolation.

**Key Deliverables:**
- ✅ Soft delete (deleted_at) for compliance & auditing
- ✅ 7 new platform tables (audit logs, notifications, usage tracking)
- ✅ Multi-branch support (gyms → branches → members)
- ✅ Complete RLS policies for 5-role scalability
- ✅ 10 isolation tests verifying cross-gym data protection

**Duration:** 14-18 hours (3 subtasks: 2a=3-4h, 2b=4-5h, 2c=5-6h)

---

## 🔧 Phase 2أ: Additions (3-4 hours)

### What's Being Added

| Component | Purpose | Tables/Columns |
|-----------|---------|---|
| **Soft Delete** | Data recovery & audit trails | Add `deleted_at` to 8 core tables |
| **Platform Tables** | Enterprise admin features | 7 new tables (audit, notifications, usage, etc) |
| **Member Direct Link** | Faster billing queries | Add `member_id` to `billing_invoices` |

### Migrations

#### 047: Soft Delete Columns
**File:** `server/migrations/047_phase2a_soft_delete_columns.sql`

Adds `deleted_at TIMESTAMP` column to:
- `gyms` - gym deactivation
- `members` - member cancellation
- `subscriptions` - plan cancellation
- `billing_plans` - deprecated plans
- `billing_invoices` - billing corrections
- `attendance_logs` - historical cleanup
- `staff` - staff deactivation
- `products` - product discontinuation

**Includes:** Indexes for `WHERE deleted_at IS NOT NULL` queries (common pattern)

#### 048: New Platform Tables
**File:** `server/migrations/048_phase2a_new_platform_tables.sql`

Creates 7 enterprise tables:

1. **platform_audit_logs** — Immutable super-admin action trail
   - Logs: CREATE, UPDATE, DELETE, DEACTIVATE on any table
   - Fields: actor_id, action_type, table_name, record_id, old/new values
   - Security: Foreign key to users(id), NOT NULL actor_id

2. **platform_notifications** — General notification system
   - Used by: super-admin, gym-admin, trainer, reception, player (designed for all 5 roles)
   - Fields: gym_id (NULL for platform-wide), recipient_role, notification_type
   - Types: alert, reminder, info, warning

3. **gym_daily_limits** — Usage quotas per gym
   - Tracks: API calls, storage, member count
   - Used for: SaaS tier enforcement
   - Composite key: gym_id + limit_date

4. **gym_daily_usage** — Analytics tracking
   - Logs: API calls, storage, active users, check-ins per day
   - Used for: Usage charts, trending, capacity planning

5. **recycle_bin** — Soft-deleted records
   - Shows all soft-deleted records (gyms, members, subscriptions)
   - Retention: 30 days default
   - Supports: Restore + permanent delete

6. **gym_versions** — Configuration history
   - Snapshots gym config at each change
   - Tracks: version_number, gym_data (JSONB), changed_by, change_reason

7. **staff_sessions** — Global session tracking
   - Tracks login/logout + last activity
   - Designed for all 5 roles: super-admin, gym-admin, trainer, reception, player
   - Current: Used only by super-admin; extensible to all roles in Phase 3+

#### 049: Member ID in Invoices
**File:** `server/migrations/049_phase2a_add_member_id_to_invoices.sql`

Adds `member_id UUID` foreign key to `billing_invoices`:
- Allows direct filtering by member (no subscription join needed)
- Includes composite index: (member_id, created_at DESC)
- Backfills existing invoices from subscription relationships

---

## 🔗 Phase 2ب: Merge Tenants & Branch Support (4-5 hours)

### What's Being Changed

| Before | After |
|--------|-------|
| Each gym is isolated but flat | Gyms have branches (multi-location support) |
| Members assigned to gym only | Members assigned to gym + branch |
| Attendance tied to gym | Attendance tied to gym + branch |

### Migrations

#### 050: Add Branches & branch_id
**File:** `server/migrations/050_phase2b_add_branches_and_branch_id.sql`

1. **Create branches table:**
   - Stores location info: address, city, phone, email, GPS coordinates
   - Composite unique key: (gym_id, code)
   - Status: is_active, deleted_at

2. **Add branch_id to members:**
   - Creates `branches` table
   - Inserts default "Main" branch for all existing gyms
   - Backfills members → branch (assigns to first/main branch)
   - Makes column NOT NULL after backfill
   - Adds index: (gym_id, branch_id)

3. **Add branch_id to attendance_logs:**
   - Backfills from member's current branch
   - Adds composite index: (branch_id, check_in_time DESC)

**Design Note:** This is a **clean rebuild** appropriate for design-phase projects (no complex migration). All members automatically assigned to their gym's main branch.

---

## 🔐 Phase 2ج: RLS Policies & Security (5-6 hours)

### What's Being Secured

Complete Row-Level Security implementation ensuring:
- ✅ Each gym sees only its own data
- ✅ Super-admin (app.gym_id = NULL) sees all data
- ✅ Cross-gym access is impossible via any query
- ✅ Designed for 5-role scalability (even though only 2 roles active now)

### Migrations

#### 051a: RLS Policies & Indexes
**File:** `server/migrations/051_phase2c_rls_policies_and_indexes.sql`

**RLS Strategy:**
```sql
-- Super-admin bypass (app.gym_id = NULL)
USING (current_setting('app.gym_id', true) IS NULL)

-- Gym isolation
OR gym_id = UUID(current_setting('app.gym_id', true))

-- Data can never cross gyms, even with manual SQL injection
```

**Policies Created:**

1. **SELECT Policies (one per table):**
   - `super_admin_*` — Bypass for super-admin
   - `gym_isolation_*` — Gym-level filtering for others

   Tables secured:
   - gyms, members, subscriptions, billing_plans, billing_invoices
   - attendance_logs, staff, products, branches, staff_sessions
   - gym_daily_limits, gym_daily_usage, recycle_bin

2. **Write Policies (WITH CHECK):**
   - Prevent inserting data for other gyms
   - Example: Can't INSERT member with gym_id = other_gym

   Tables with write policies:
   - members, attendance_logs, subscriptions, billing_invoices

**Indexes Added:**
- Per-gym: `idx_members_gym_id`, `idx_subscriptions_gym_id`, etc
- Composite: `idx_active_members(gym_id, is_active)` for filtered queries
- Soft delete: `idx_members_deleted_at` for archival queries

#### 051b: RLS Test Scenarios
**File:** `server/migrations/051_phase2c_rls_test_scenarios.sql`

10 automated test scenarios:

| Test # | Scenario | Expected Result |
|--------|----------|---|
| 🧪 1a | Gym A queries members | Sees Alice only |
| 🧪 1b | Gym B queries members | Sees Bob only |
| 🧪 2 | Gym A INSERTs member into Gym B | DENIED (RLS blocks) |
| 🧪 3 | Super-admin queries members | Sees both Alice + Bob |
| 🧪 4 | Gym A queries attendance | Isolated to Gym A |
| 🧪 5 | Gym A queries invoices | Isolated to Gym A |
| 🧪 6 | Cross-tenant UPDATE attempt | DENIED |
| 🧪 7 | Soft-deleted visibility | Excluded from queries |
| 🧪 8 | Branch isolation | Within gym only |
| 🧪 9 | Member PIN visibility | Branch-scoped |
| 🧪 10 | API endpoint filtering | RLS applied |

---

## 📊 Migration Sequence

**Execute in this exact order:**

```bash
# Phase 2أ: Additions (3-4 hours)
047_phase2a_soft_delete_columns.sql          # Add deleted_at columns
048_phase2a_new_platform_tables.sql          # Create 7 new tables
049_phase2a_add_member_id_to_invoices.sql   # Add member direct link

# Phase 2ب: Merge & Branches (4-5 hours)
050_phase2b_add_branches_and_branch_id.sql   # Create branches, backfill

# Phase 2ج: RLS & Security (5-6 hours)
051_phase2c_rls_policies_and_indexes.sql    # Enable RLS, create policies
051_phase2c_rls_test_scenarios.sql          # Run isolation tests
```

---

## 🚀 How to Apply Phase 2

### Prerequisites
- ✅ PostgreSQL 15+ running
- ✅ Supabase project ready (or self-hosted Postgres)
- ✅ Backup existing database (automatic in Supabase)
- ✅ Latest `server/backups/gymcore_backup_*.sql` created

### Apply Migrations

**Option 1: Using Supabase Console**
1. Go to Supabase Dashboard → SQL Editor
2. Copy entire migration file content
3. Run each migration in sequence
4. Verify success (no errors)

**Option 2: Using psql CLI**
```bash
# Apply each migration file in order
psql -U postgres -d gymcore_db -f 047_phase2a_soft_delete_columns.sql
psql -U postgres -d gymcore_db -f 048_phase2a_new_platform_tables.sql
psql -U postgres -d gymcore_db -f 049_phase2a_add_member_id_to_invoices.sql
psql -U postgres -d gymcore_db -f 050_phase2b_add_branches_and_branch_id.sql
psql -U postgres -d gymcore_db -f 051_phase2c_rls_policies_and_indexes.sql

# Run tests
psql -U postgres -d gymcore_db -f 051_phase2c_rls_test_scenarios.sql
```

### Verify Success

After migrations complete, run verification queries:

```sql
-- Verify columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'members' AND column_name = 'deleted_at';
-- Expected: 1 row (deleted_at column exists)

-- Verify branch creation
SELECT COUNT(*) FROM branches;
-- Expected: ≥1 (at least one main branch per gym)

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true
ORDER BY tablename;
-- Expected: 14 tables with RLS enabled

-- Verify RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: 28+ policies (2-3 per table)

-- Verify indexes created
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('members', 'branches', 'attendance_logs')
ORDER BY indexname;
-- Expected: 15+ indexes
```

---

## 🧪 RLS Testing Checklist

After Phase 2ج migration:

- [ ] **Test 1: Gym Isolation**
  ```sql
  SET app.gym_id = 'gym-a-uuid';
  SELECT COUNT(*) FROM members;  -- Should be only Gym A members
  ```

- [ ] **Test 2: Super Admin Bypass**
  ```sql
  RESET app.gym_id;  -- Super admin
  SELECT COUNT(*) FROM members;  -- Should be all members
  ```

- [ ] **Test 3: Cross-Gym Insert Prevention**
  ```sql
  SET app.gym_id = 'gym-a-uuid';
  INSERT INTO members (..., gym_id = 'gym-b-uuid')  -- Should FAIL
  ```

- [ ] **Test 4: Soft Delete Transparency**
  ```sql
  SELECT COUNT(*) FROM members WHERE deleted_at IS NULL;
  -- Should exclude soft-deleted records
  ```

- [ ] **Run Full Test Suite**
  ```bash
  psql -U postgres -d gymcore_db -f 051_phase2c_rls_test_scenarios.sql
  # Should show ✅ for all 10 tests
  ```

---

## 📌 Important Notes

### Design-Phase Database Rebuild
This project is in **design phase** with no production data. Therefore:
- ✅ Clean rebuild preferred over complex migrations
- ✅ No downtime risk (no real users affected)
- ✅ Branch backfill is automatic (fast)
- ✅ RLS can be tested immediately post-deployment

### RLS Performance Impact
- RLS adds minimal overhead (~0-2% query time for indexed filters)
- Indexes ensure gym_id filtering is efficient
- Composite indexes on (gym_id, other_column) pre-calculate policy filters

### 5-Role Extensibility
RLS policies designed for all 5 roles, but only 2 active now:
- ✅ super-admin: app.gym_id = NULL
- ✅ gym-admin: app.gym_id = <their-gym>
- ⏳ trainer, reception, player: Use same gym_id logic (implemented in Phase 3+)

---

## 🎯 Phase 2 Success Criteria

✅ **Complete when:**
1. All 3 migrations (2a/2b/2c) applied successfully
2. No RLS policy errors
3. All 10 test scenarios pass (green ✅)
4. TypeScript compilation: 0 errors
5. Production build succeeds
6. Dev server running without errors
7. All APIs still accessible (no RLS query failures)

**Status:** 🔴 **IN PROGRESS** — Starting Phase 2أ

---

## 📚 Related Documents
- `TODO.md` — Phase 2 subtasks and sequencing
- `ARCH_MAP.html` — Architecture overview
- `docs/rls_expansion_plan.md` — RLS design rationale
- Server migrations: `server/migrations/04X_*.sql`

---

**Next Action:** Execute migrations in order, verify success, run tests.
