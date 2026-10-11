import { Pool, PoolClient } from 'pg';
import { withAdminClient, default as sharedPool } from '../../src/config/database';

/**
 * RLS isolation integration test (Architecture Audit W1 + W4).
 *
 * Proves that tenant tables covered by migration 029/030 are actually
 * isolated at the database level: a non-owner connection scoped to gym B
 * must NOT see rows belonging to gym A, even though both rows physically
 * exist in the same table.
 *
 * WHY A DEDICATED NON-OWNER ROLE:
 * PostgreSQL does NOT apply RLS to the table owner unless FORCE ROW LEVEL
 * SECURITY is set (migration 030 adds that). But to test the *tenant* path
 * realistically — i.e. the exact posture an ordinary gym staff request
 * gets — we scope a plain, non-owner connection to a gym_id via
 * `SET LOCAL app.gym_id` inside a transaction. This is the closest
 * simulation of the real `query()` + tenant middleware flow.
 *
 * We seed two REAL gyms (+ a member + staff + plan) via the admin client
 * so FK constraints are satisfied, then confirm gym B cannot see gym A.
 */

const ADMIN_URL =
  process.env.DATABASE_URL ||
  'postgresql://gimawi:gimawi_secret@localhost:5433/gimawi';

// Non-owner role — created by scripts/_create_rls_test_user.js
const TENANT_URL =
  process.env.RLS_TENANT_URL ||
  'postgresql://rls_test_user:rls_test_pw@localhost:5433/gimawi';

const adminPool = sharedPool;
const tenantPool = new Pool({ connectionString: TENANT_URL });

const GYM_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const GYM_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const MEMBER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
const STAFF_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
const PLAN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4';

async function adminQuery(sql: string, params: any[] = []) {
  const client: PoolClient = await adminPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL row_security = off');
    const res = await client.query(sql, params);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function seed() {
  await adminQuery(
    `INSERT INTO gyms (id, name, subdomain, currency, is_active)
     VALUES ($1,'rls_test_a','rls-test-a','EGP',true),($2,'rls_test_b','rls-test-b','EGP',true)
     ON CONFLICT (id) DO NOTHING`,
    [GYM_A, GYM_B]
  );
  await adminQuery(
    `INSERT INTO staff_users (id, gym_id, full_name, email, password_hash, role, is_active)
     VALUES ($1,$2,'RLS Test Staff','rlstest@x.com','x','manager',true)
     ON CONFLICT (id) DO NOTHING`,
    [STAFF_A, GYM_A]
  );
  await adminQuery(
    `INSERT INTO members (id, gym_id, full_name, phone_number, pin_code_hash)
     VALUES ($1,$2,'RLS Test Member','0000000000','x')
     ON CONFLICT (id) DO NOTHING`,
    [MEMBER_A, GYM_A]
  );
  await adminQuery(
    `INSERT INTO billing_plans (id, name, name_ar, price_monthly, price_yearly, max_staff, max_members, max_gyms, is_active)
     VALUES ($1,'RLS Plan','خطة اختبار',100,1000,5,100,1,true)
     ON CONFLICT (id) DO NOTHING`,
    [PLAN_A]
  );
}

async function unseed() {
  await adminQuery('DELETE FROM billing_invoices WHERE gym_id IN ($1,$2)', [GYM_A, GYM_B]);
  await adminQuery('DELETE FROM billing_cycles WHERE gym_id IN ($1,$2)', [GYM_A, GYM_B]);
  await adminQuery('DELETE FROM support_tickets WHERE gym_id IN ($1,$2)', [GYM_A, GYM_B]);
  await adminQuery('DELETE FROM refresh_tokens WHERE token_jti = $1', ['rls-test-jti']);
  await adminQuery('DELETE FROM members WHERE id = $1', [MEMBER_A]);
  await adminQuery('DELETE FROM staff_users WHERE id = $1', [STAFF_A]);
  await adminQuery('DELETE FROM billing_plans WHERE id = $1', [PLAN_A]);
  await adminQuery('DELETE FROM gyms WHERE id IN ($1,$2)', [GYM_A, GYM_B]);
}

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await unseed();
  await adminPool.end();
  await tenantPool.end();
});

/**
 * Scope a NON-owner tenant connection to `gymId` via SET LOCAL inside a
 * transaction, then run `sql`. RLS policies read current_gym_id() =
 * current_setting('app.gym_id'), so gym B must see zero rows for gym A.
 */
async function scopedQuery(gymId: string, sql: string, params: any[] = []) {
  const client: PoolClient = await tenantPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.gym_id = '${gymId}'`);
    const res = await client.query(sql, params);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

describe('RLS multi-tenant isolation (migration 029/030 tables)', () => {
  it('support_tickets is isolated between gyms', async () => {
    await adminQuery(
      `INSERT INTO support_tickets (gym_id, subject, description, status, priority)
       VALUES ($1,'t','d','open','low')`,
      [GYM_A]
    );
    // Gym B scoped connection must NOT see Gym A's row
    const resB = await scopedQuery(GYM_B, `SELECT * FROM support_tickets WHERE gym_id = $1`, [GYM_A]);
    expect(resB.rows.length).toBe(0);
    // Gym A scoped connection MUST see its own row
    const resA = await scopedQuery(GYM_A, `SELECT * FROM support_tickets WHERE gym_id = $1`, [GYM_A]);
    expect(resA.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('billing_invoices is isolated between gyms', async () => {
    await adminQuery(
      `INSERT INTO billing_invoices (gym_id, plan_id, amount, status, period_start, period_end)
       VALUES ($1,$2,100,'paid','2026-01-01','2026-01-31')`,
      [GYM_A, PLAN_A]
    );
    const resB = await scopedQuery(GYM_B, `SELECT * FROM billing_invoices WHERE gym_id = $1`, [GYM_A]);
    expect(resB.rows.length).toBe(0);
  });

  it('billing_cycles is isolated between gyms', async () => {
    await adminQuery(
      `INSERT INTO billing_cycles (gym_id, plan_id, cycle_type, start_date, end_date, auto_renew)
       VALUES ($1,$2,'monthly','2026-01-01','2026-01-31',true)`,
      [GYM_A, PLAN_A]
    );
    const resB = await scopedQuery(GYM_B, `SELECT * FROM billing_cycles WHERE gym_id = $1`, [GYM_A]);
    expect(resB.rows.length).toBe(0);
  });

  it('refresh_tokens is isolated between gyms (W1 critical table)', async () => {
    await adminQuery(
      `INSERT INTO refresh_tokens (staff_user_id, gym_id, token_jti, expires_at)
       VALUES ($1, $2, 'rls-test-jti', NOW() + INTERVAL '1 day')`,
      [STAFF_A, GYM_A]
    );
    const resB = await scopedQuery(GYM_B, `SELECT * FROM refresh_tokens WHERE gym_id = $1`, [GYM_A]);
    expect(resB.rows.length).toBe(0);
  });
});
