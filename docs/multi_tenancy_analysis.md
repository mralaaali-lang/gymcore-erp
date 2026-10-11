# Multi-Tenancy Linkage Analysis: tenants <-> gyms

**Date:** 2026-07-24
**Status:** Architecture reviewed - issues found and documented

---

## 1. Schema Relationship Summary

| Aspect | Detail |
|--------|--------|
| **gyms table** | Core tenant entity (created in 001_initial_schema.sql) |
| **tenants table** | Billing/subscription companion (created in migration 036) |
| **Linkage model** | tenant_id = gym_id (unified via migration 040) |
| **FK constraint** | None - no foreign key from tenants -> gyms |
| **Shared field** | subdomain (unique in both tables) |
| **ID alignment** | tenants.id != gyms.id (both are independent UUIDs) |

---

## 2. Migration Analysis

### 001_initial_schema.sql
- gyms table has: id, name, subdomain, plan_tier, is_active, created_at
- No tenant_id column - tenants table does not exist yet at this stage
- tenants table is NOT created in migration 001

### 036_gym_directory_consumption_tracking.sql
- tenants table created with its own id (independent UUID primary key)
- No FOREIGN KEY constraint from tenants.subdomain -> gyms.subdomain
- Backfill INSERT copies from gyms but no referential integrity
- tenants is independent - a gym can be deleted without cascading to tenants

### 040_tenant_schema_cleanup.sql
- Unified terminology: tenant_id = gym_id
- Added phone_number and tenant_status to gyms
- Dropped redundant columns (email, address_city, address_zip, units_system)
- Does NOT add a foreign key between tenants and gyms

---

## 3. Backend Analysis (platformGyms.ts)

### CREATE TRANSACTION (createGym) - CORRECT
Transaction flow:
```
BEGIN -> INSERT gyms -> INSERT staff_users -> INSERT tenants -> INSERT gym_usage_counters -> INSERT activity_logs -> COMMIT
```
- All writes are inside a single DB transaction
- If any INSERT fails -> ROLLBACK (catch block)
- seedNewGymAsync is fire-and-forget (non-critical, outside transaction)
- Transaction safety is correct

### ISSUE: No FK Constraint on tenants table
- No FK ensures the subdomain exists in gyms at DB level
- If a gym is deleted -> tenants row becomes orphaned
- The tenants table has its own id (UUID) independent of gyms.id

### getGym queries only gyms + subqueries, not tenants table
- getGym does not include tenant billing/subscription data
- To get full tenant+gym view, a JOIN is needed

### planGuard uses gyms directly
- Queries gyms LEFT JOIN billing_plans - correct for plan feature checks
- Uses gym_id directly (tenant_isolation sets req.tenantId = req.staff.gym_id)

---

## 4. Frontend Context Analysis

### AuthContext.tsx
- Stores tenantId: string in state
- tenantId = gym_id throughout the app
- switchTenant(id) switches the active tenant

### GymBrandContext.tsx
- Facade composing AuthContext + BrandContext + UIContext
- Exposes tenantId from auth.tenantId

### SettingsGymContext.tsx
- Simple context providing gymId: string | undefined
- Used by settings pages to know which gym's settings to edit
- Note: This is a React context, not DB-linked. The gymId must be correctly passed down from parent components.

### tenantIsolation.ts Middleware
- Bypasses platform admin requests (they operate at platform level)
- For tenant staff, gym_id from JWT is the source of truth
- Attaches req.tenantId = req.staff.gym_id for downstream query builders

---

## 5. Issues Found Summary

### [MEDIUM] Issue 1: No Foreign Key Constraint on tenants table
**File:** server/migrations/036_gym_directory_consumption_tracking.sql  
**Severity:** Medium  
**Description:** tenants table references no parent table at DB level. Gym deletion leaves orphan tenant records.  
**Fix:** Add FK constraint:
```sql
ALTER TABLE tenants
  ADD CONSTRAINT tenants_gym_fk
  FOREIGN KEY (subdomain) REFERENCES gyms(subdomain)
  ON DELETE CASCADE;
```

### [LOW] Issue 2: tenants.id != gyms.id (Independent UUIDs)
**File:** server/migrations/036_gym_directory_consumption_tracking.sql  
**Severity:** Low  
**Description:** Both tables generate independent UUIDs. The unified model (tenant_id = gym_id) works at the app level but DB IDs don't align.  
**Fix:** Option A) Add gym_id column to tenants as FK to gyms.id. Option B) Use subdomain as the join key.

### [LOW] Issue 3: No tenant_id Column in gyms table
**Description:** Migration 040 unified terminology (tenant_id = gym_id) but did not add tenant_id column to gyms schema.
**Fix:** Add tenant_id UUID REFERENCES tenants(id) to gyms, OR rely purely on subdomain matching (preferred).

---

## 6. SQL Queries

### 6a. Unified INNER JOIN (gyms <-> tenants via subdomain)
This join links tenant billing/subscription data with gym operational data:

```sql
-- Unified JOIN: gym operational data + tenant billing data
-- Links via shared subdomain field (1:1 relationship)
SELECT
  g.id AS gym_id,
  g.name AS gym_name,
  g.subdomain,
  g.plan_tier,
  g.is_active AS gym_is_active,
  g.tenant_status,
  g.phone_number,
  g.address_country,
  g.address_street,
  g.address_city,
  g.timezone,
  g.currency,
  g.logo_url,
  g.created_at AS gym_created_at,
  g.subscription_expires_at AS gym_subscription_expires_at,
  t.id AS tenant_id,
  t.status AS tenant_status_db,
  t.billing_cycle,
  t.subscription_expires_at AS tenant_subscription_expires_at,
  t.is_active AS tenant_is_active,
  t.created_at AS tenant_created_at,
  p.name AS plan_name,
  p.price_monthly,
  p.price_yearly,
  p.max_members,
  p.max_staff,
  p.max_branches,
  uc.current_members_count,
  uc.current_staff_count,
  uc.current_branches_count
FROM gyms g
INNER JOIN tenants t ON t.subdomain = g.subdomain
LEFT JOIN billing_plans p ON p.id = g.plan_id
LEFT JOIN gym_usage_counters uc ON uc.gym_id = g.id
ORDER BY g.created_at DESC;
```

### 6b. Single gym lookup with tenant context (for settings pages)
```sql
-- Get full gym + tenant + owner data for a single gym (e.g., settings page)
SELECT
  g.id AS gym_id,
  g.name AS gym_name,
  g.subdomain,
  g.plan_tier,
  g.is_active,
  g.tenant_status,
  g.phone_number,
  g.address_country,
  g.timezone,
  g.currency,
  g.units_system,
  g.logo_url,
  t.billing_cycle,
  t.status AS tenant_status,
  t.subscription_expires_at,
  o.full_name AS owner_name,
  o.email AS owner_email
FROM gyms g
INNER JOIN tenants t ON t.subdomain = g.subdomain
LEFT JOIN staff_users o ON o.gym_id = g.id AND o.role = 'owner'
WHERE g.id = $1;
```

### 6c. Fix FK constraint (recommended migration 041)
```sql
-- migration 041_add_tenant_fk.sql
-- Adds proper FK enforcement between tenants and gyms

BEGIN;

-- 1. Align tenants.id with gyms.id (make tenants.id a FK reference)
-- Note: Requires backfilling tenant records with matching gym IDs first
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gym_id UUID;

UPDATE tenants t
SET gym_id = g.id
FROM gyms g
WHERE t.subdomain = g.subdomain;

ALTER TABLE tenants ALTER COLUMN gym_id SET NOT NULL;

-- 2. Add FK constraint
ALTER TABLE tenants
  ADD CONSTRAINT tenants_gym_id_fk
  FOREIGN KEY (gym_id) REFERENCES gyms(id)
  ON DELETE CASCADE;

-- 3. Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenants_gym_id ON tenants(gym_id);

COMMIT;
```

---

*Report generated: 2026-07-24*
*Author: GitHub Copilot*
