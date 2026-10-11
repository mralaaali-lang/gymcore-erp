# GymCore Phase 2 — Database V2 Migrations

## 📋 Overview

Phase 2 completes the database transformation for GymCore with:
- ✅ Soft delete support (data recovery & compliance)
- ✅ Multi-branch gym support (multi-location operations)
- ✅ Complete Row-Level Security (RLS) isolation per gym
- ✅ Enterprise platform tables (audit, notifications, usage tracking)

**Status:** Ready to apply (5 migration files + tests + verification)

---

## 🚀 Quick Start

### For Windows (PowerShell):
```powershell
# Navigate to server directory
cd server

# Run migration script
.\apply_phase2_migrations.ps1

# When prompted, enter your PostgreSQL password
```

### For macOS/Linux (Bash):
```bash
# Navigate to server directory
cd server

# Make script executable
chmod +x apply_phase2_migrations.sh

# Run migration script
./apply_phase2_migrations.sh
```

### Manual (Supabase Console or psql CLI):
```bash
# Apply migrations in order (no parallel execution)
psql -U postgres -d gymcore_db -f migrations/047_phase2a_soft_delete_columns.sql
psql -U postgres -d gymcore_db -f migrations/048_phase2a_new_platform_tables.sql
psql -U postgres -d gymcore_db -f migrations/049_phase2a_add_member_id_to_invoices.sql
psql -U postgres -d gymcore_db -f migrations/050_phase2b_add_branches_and_branch_id.sql
psql -U postgres -d gymcore_db -f migrations/051_phase2c_rls_policies_and_indexes.sql
```

---

## 📝 Migration Files (Execute in This Order)

### Phase 2أ: Additions (Soft Delete + New Tables)

#### 047_phase2a_soft_delete_columns.sql
**Duration:** ~30 seconds | **Size:** 1.5 KB

Adds `deleted_at TIMESTAMP` columns to:
- `gyms`, `members`, `subscriptions`, `billing_plans`
- `billing_invoices`, `attendance_logs`, `staff`, `products`

Includes indexes for efficient `WHERE deleted_at IS NULL` queries.

**Impact:** No breaking changes. Old queries continue working; can gradually adopt soft_delete pattern.

#### 048_phase2a_new_platform_tables.sql
**Duration:** ~1 minute | **Size:** 6 KB

Creates 7 new enterprise tables:

| Table | Purpose |
|-------|---------|
| `platform_audit_logs` | Super-admin action trail (immutable) |
| `platform_notifications` | General notifications (all 5 roles) |
| `gym_daily_limits` | Usage quotas per gym |
| `gym_daily_usage` | Daily analytics tracking |
| `recycle_bin` | Soft-deleted records (30-day retention) |
| `gym_versions` | Gym config history & snapshots |
| `staff_sessions` | Global session tracking (all roles) |

All tables fully indexed for performance.

**Impact:** No breaking changes. New tables are empty; can be populated gradually.

#### 049_phase2a_add_member_id_to_invoices.sql
**Duration:** ~30 seconds | **Size:** 1 KB

Adds `member_id UUID` foreign key to `billing_invoices`:
- Direct member relationship (faster queries, no subscription join)
- Includes composite index: `(member_id, created_at DESC)`
- **Auto-backfills** existing invoices from subscription relationships

**Impact:** Nullable column (no breaking changes); backfill is automatic.

---

### Phase 2ب: Merge Tenants & Branch Support

#### 050_phase2b_add_branches_and_branch_id.sql
**Duration:** ~1-2 minutes | **Size:** 3 KB

Implements multi-branch gym support:

1. Creates `branches` table with location info (address, city, phone, GPS)
2. Inserts default "Main" branch for all existing gyms
3. Adds `branch_id` to `members` (NOT NULL after backfill)
4. Adds `branch_id` to `attendance_logs`
5. Includes composite indexes for (gym_id, branch_id) queries

**Data Migration Strategy:** Clean rebuild (no complex migration script needed)
- All members → automatically assigned to their gym's main branch
- All attendance logs → automatically linked to member's branch
- No downtime; safe for design-phase projects

**Impact:** Moderate. Adds NOT NULL column; requires updating APIs to set branch_id.

---

### Phase 2ج: RLS Policies & Security

#### 051_phase2c_rls_policies_and_indexes.sql
**Duration:** ~1-2 minutes | **Size:** 8 KB

Implements complete Row-Level Security:

**RLS Strategy:**
```sql
-- Super-admin (app.gym_id = NULL) sees everything
USING (current_setting('app.gym_id', true) IS NULL)

-- Other roles see only their gym's data
OR gym_id = UUID(current_setting('app.gym_id', true))
```

**Coverage:** 14 tables with RLS enabled + 28+ policies
- SELECT policies: Gym isolation for SELECT queries
- WRITE policies (WITH CHECK): Prevent INSERT/UPDATE/DELETE in other gyms
- Optimization indexes: (gym_id) + composite indexes

**Important:** RLS applied uniformly; designed for 5-role scalability (even though only 2 active now).

**Impact:** High. Requires backend code to set `SET app.gym_id` context before queries.

---

## 🧪 Testing After Migrations

### 1. Run Verification Checklist
```bash
psql -U postgres -d gymcore_db -f migrations/999_phase2_verification_checklist.sql
```

Expected output: 9 checks, all passing ✅

### 2. Run Full RLS Test Suite
```bash
psql -U postgres -d gymcore_db -f migrations/051_phase2c_rls_test_scenarios.sql
```

Expected: ✅ for all 10 isolation tests:
- Gym A ↔ Gym B cross-gym prevention
- Super-admin bypass verification
- Soft delete transparency
- Branch isolation
- (+ 6 more comprehensive scenarios)

### 3. Manual API Testing
```bash
# Test with Gym A context
curl -H "X-Gym-ID: <gym-a-uuid>" http://localhost:3000/api/members

# Should return only Gym A members
# If you see Gym B members → RLS not properly set in backend
```

---

## 🔐 Backend Integration Checklist

After migrations, update your backend to properly set RLS context:

- [ ] **API Middleware:** Every request sets `SET app.gym_id = <user_gym_id>`
  ```typescript
  // Example: Express middleware
  app.use((req, res, next) => {
    const gymId = req.user.gym_id;  // From JWT or session
    client.query(`SET app.gym_id = $1`, [gymId]);
    next();
  });
  ```

- [ ] **Super Admin Routes:** Set `SET app.gym_id = NULL` (or don't set it)
  ```typescript
  // Super admin sees all data
  client.query("RESET app.gym_id");
  ```

- [ ] **Queries:** Use `deleted_at IS NULL` in WHERE clauses
  ```sql
  -- Old (will show deleted members)
  SELECT * FROM members WHERE gym_id = $1

  -- New (soft-deleted excluded)
  SELECT * FROM members WHERE gym_id = $1 AND deleted_at IS NULL
  ```

- [ ] **Insert Branch Context:** Always include branch_id for members
  ```sql
  INSERT INTO members (gym_id, branch_id, first_name, ...)
  VALUES ($1, $2, $3, ...)
  ```

---

## 📊 Success Criteria

✅ **Phase 2 Complete When:**

1. All 5 migrations applied successfully (047-051)
2. 0 RLS policy errors in application logs
3. All 10 RLS isolation tests pass (green ✅)
4. Verification checklist shows all 9 checks passing
5. TypeScript: `npm run build` succeeds with 0 errors
6. Production build includes no RLS breakage
7. All API endpoints return correct data (gym-isolated)

**Estimated Total Time:**
- Migrations execution: 3-5 minutes
- Testing: 10-15 minutes
- Backend integration: 1-2 hours
- **Total:** 2-3 hours

---

## ⚠️ Important Notes

### Design-Phase Safety
- Project is in **design phase** (no production data)
- Clean rebuild approach is **safe and recommended** over complex migrations
- No user-facing downtime expected

### RLS Performance
- RLS adds minimal overhead (~0-2% query time for indexed filters)
- Indexes ensure gym_id filtering is efficient
- `idx_members_gym_id`, `idx_invoices_gym_id`, etc. pre-calculate filters

### 5-Role Extensibility
- All RLS policies designed for 5 roles, even though only 2 active now
- Trainer, Reception, Player use same `gym_id` logic
- Future role additions need zero RLS redesign

### Data Recovery
- Soft-deleted records stay in DB for 30 days (in `recycle_bin` table)
- Can be restored or permanently deleted
- Enables compliance with data retention laws

---

## 🆘 Troubleshooting

### Issue: "Column doesn't exist" error
**Solution:** Ensure migrations ran in order (047 → 048 → 049 → 050 → 051)

### Issue: RLS tests fail with "permission denied"
**Solution:** RLS requires `SET app.gym_id` context in your tests:
```sql
SET app.gym_id = '12345678-1234-1234-1234-123456789012';
SELECT * FROM members;  -- Now filtered by gym_id
```

### Issue: "Duplicate key value violates unique constraint"
**Solution:** Likely running migration twice. Restore backup and re-run from scratch.

### Issue: APIs return "permission denied" after migrations
**Solution:** Backend must set `SET app.gym_id` before every query. See "Backend Integration Checklist" above.

---

## 📚 Related Documentation

- [Phase 2 Comprehensive Guide](../docs/PHASE_2_DATABASE_V2_GUIDE.md)
- [RLS Expansion Plan (5 roles)](../docs/rls_expansion_plan.md)
- [Architecture Overview](../docs/multi_tenancy_analysis.md)
- [TODO.md](../TODO.md) — Phase 2 tracking

---

## 🎯 Next Steps After Phase 2

1. **Phase 1ب** — Library Replacement (lucide→phosphor, recharts→apexcharts)
   - Duration: 4-6 hours
   - 7 tests for icon/chart rendering with RTL

2. **Phase 3** — Frontend Structure (6-7 hours)
   - Shared components (UnifiedTabs, PageHeader, etc.)
   - Reorganize 40+ files

3. **Phase 4 & 5** — Deferred until foundation stable
   - Tab consolidation, missing features

---

**Status:** 🔴 **READY TO APPLY** — Run migrations now!
