/**
 * Creates the non-owner `rls_test_user` role used by the RLS isolation
 * integration test (test/integration/rlsIsolation.test.ts).
 *
 * WHY A NON-OWNER ROLE?
 * PostgreSQL does NOT apply Row-Level Security to the table owner unless
 * FORCE ROW LEVEL SECURITY is set. Migration 030 adds FORCE to the tenant
 * tables, but the integration test still uses a dedicated non-owner role
 * to faithfully simulate an ordinary tenant request (the real app connects
 * as the owner, but tenant scoping is done via SET app.gym_id + RLS, never
 * via owner bypass).
 *
 * Run once (idempotent): node scripts/createRlsTestUser.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://gymcore:gymcore_secret@localhost:5433/gymcore',
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rls_test_user') THEN
           CREATE ROLE rls_test_user LOGIN PASSWORD 'rls_test_pw';
         END IF;
       END $$;`
    );
    await client.query('GRANT USAGE ON SCHEMA public TO rls_test_user');
    const tables = [
      'support_tickets',
      'billing_invoices',
      'billing_cycles',
      'refresh_tokens',
      'gyms',
      'members',
      'staff_users',
      'billing_plans',
    ];
    for (const t of tables) {
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${t} TO rls_test_user`);
    }
    await client.query('GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO rls_test_user');
    await client.query('COMMIT');
    console.log('rls_test_user ready (idempotent).');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();

