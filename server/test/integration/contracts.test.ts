import { Pool, PoolClient } from 'pg';

/**
 * §40 — اختبارات تكامل مستوى قاعدة البيانات لعقود المنصة (migration 068).
 * كل اختبار يعمل داخل transaction تُنهى بـ ROLLBACK: لا يترك أي أثر في
 * قاعدة التطوير، ولا يلمس أي صالة موجودة. نغطّي:
 *  - قيد «عقد سارٍ واحد لكل صالة» (partial unique)
 *  - مرآة gyms.plan_id عبر trigger العقد + تسلسل 064 لـ plan_tier
 *  - دوال الحقيقة: gym_active_contract / gym_plan_id_effective
 *  - gym_effective_features (خطة + بنود + overrides) و gym_effective_limit
 *  - دورة حياة البند (إضافة → إيقاف) وأثرها الفوري
 */

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://gymcore:gymcore_secret@localhost:5433/gymcore',
});

const GYM_ID = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
const CONTRACT_ID = 'cccccccc-cccc-cccc-cccc-ccccccccccc2';
const CONTRACT2_ID = 'cccccccc-cccc-cccc-cccc-ccccccccccc3';
const ADDON_ID = 'cccccccc-cccc-cccc-cccc-ccccccccccc4';
const PLAN_M_ID = 'cccccccc-cccc-cccc-cccc-ccccccccccc5';
const PLAN_L_ID = 'cccccccc-cccc-cccc-cccc-ccccccccccc6';

async function inTransaction(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** بذور معزولة: صالة + باقتان (small/base) + إضافة بوحدة قياس.
 *  موديولات الباقات بنفس شكل بيانات الإنتاج: objects/booleans تحت 'modules'. */
async function seed(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO billing_plans (id, name, name_ar, price_monthly, price_yearly, max_staff, max_members, features, is_active)
     VALUES ($1, 'Test Small', 'صغيرة اختبار', 100, 1000, 3, 50,
             '{"modules": {"dashboard": true, "attendance": true, "products": false, "daily_reports": false}}'::jsonb, true),
            ($2, 'Test Base',  'أساسية اختبار', 500, 5000, 10, -1,
             '{"modules": {"dashboard": true, "attendance": true, "products": true, "daily_reports": true}}'::jsonb, true)`,
    [PLAN_M_ID, PLAN_L_ID]
  );
  await client.query(
    `INSERT INTO gyms (id, name, subdomain, currency, is_active, plan_id)
     VALUES ($1, 'Contract Test Gym', 'contract-test-gym', 'EGP', true, $2)`,
    [GYM_ID, PLAN_M_ID]
  );
  await client.query(
    `INSERT INTO billing_addons (id, code, name, name_ar, pricing_type, price, module_keys, limit_column, limit_amount, price_monthly, price_yearly, is_active)
     VALUES ($1, 'TEST_GATE', 'Test Gates', 'بوابات اختبار', 'subscription', 250, '["products"]'::jsonb, 'max_members', 100, 250, 2500, true)`,
    [ADDON_ID]
  );
}

async function signContract(client: PoolClient, contractId: string, planId: string, cycle = 'monthly'): Promise<void> {
  await client.query(
    `INSERT INTO platform_contracts (id, gym_id, plan_id, cycle, price, currency, status, start_date, renewal_date, auto_renew)
     VALUES ($1, $2, $3, $4, 900, 'EGP', 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', true)`,
    [contractId, GYM_ID, planId, cycle]
  );
}

describe('§40 platform contracts — DB truth', () => {
  afterAll(async () => { await pool.end(); });

  test('constraint: one active contract per gym', async () => {
    await inTransaction(async (client) => {
      await seed(client);
      await signContract(client, CONTRACT_ID, PLAN_L_ID);

      // الإدراج المرفوض يُبقي الـtransaction في حالة aborted — نفصله بحاجز
      // (savepoint) ثم نعود إليه حتى يستمر الاختبار طبيعيًا.
      let rejection: unknown = null;
      await client.query('SAVEPOINT before_dup');
      try {
        await signContract(client, CONTRACT2_ID, PLAN_M_ID);
      } catch (e) {
        rejection = e;
      }
      await client.query('ROLLBACK TO SAVEPOINT before_dup');
      expect((rejection as Error)?.message).toMatch(/uq_contracts_one_active_per_gym/);

      // بعد الإلغاء يُسمح بعقد جديد
      await client.query(`UPDATE platform_contracts SET status='cancelled' WHERE id=$1`, [CONTRACT_ID]);
      await signContract(client, CONTRACT2_ID, PLAN_M_ID);
    });
  });

  test('mirror: contract drives gyms.plan_id then plan_tier; cancel unlinks', async () => {
    await inTransaction(async (client) => {
      await seed(client);
      await signContract(client, CONTRACT_ID, PLAN_L_ID);

      let g = await client.query(`SELECT plan_id, plan_tier FROM gyms WHERE id=$1`, [GYM_ID]);
      expect(g.rows[0].plan_id).toBe(PLAN_L_ID);
      expect(g.rows[0].plan_tier).not.toBe('');

      await client.query(`UPDATE platform_contracts SET status='cancelled' WHERE id=$1`, [CONTRACT_ID]);
      g = await client.query(`SELECT plan_id FROM gyms WHERE id=$1`, [GYM_ID]);
      expect(g.rows[0].plan_id).toBeNull();
    });
  });

  test('truth functions: active contract wins, gyms.plan_id is fallback', async () => {
    await inTransaction(async (client) => {
      await seed(client);
      // بدون عقد: المرجع عمود gyms.plan_id
      let r = await client.query(`SELECT gym_plan_id_effective($1) AS p`, [GYM_ID]);
      expect(r.rows[0].p).toBe(PLAN_M_ID);

      await signContract(client, CONTRACT_ID, PLAN_L_ID);
      r = await client.query(`SELECT gym_plan_id_effective($1) AS p, (gym_active_contract($1)).id AS cid`, [GYM_ID]);
      expect(r.rows[0].p).toBe(PLAN_L_ID);
      expect(r.rows[0].cid).toBe(CONTRACT_ID);
    });
  });

  test('effective features: plan modules + item module_keys; cancel retracts item only', async () => {
    await inTransaction(async (client) => {
      await seed(client);
      await signContract(client, CONTRACT_ID, PLAN_M_ID); // small: dashboard, attendance

      const itemId = await client.query(
        `INSERT INTO platform_contract_addons (contract_id, addon_id, quantity, unit_price, cycle, status)
         VALUES ($1, $2, 1, 250, 'monthly', 'active') RETURNING id`,
        [CONTRACT_ID, ADDON_ID]
      );

      let f = await client.query(`SELECT gym_effective_features($1) AS feats`, [GYM_ID]);
      expect(f.rows[0].feats).toEqual(expect.arrayContaining(['dashboard', 'attendance', 'products']));

      // إيقاف البند يسحب موديوله، ولا يمس موديولات الخطة (attendance من الخطة أصلًا)
      await client.query(`UPDATE platform_contract_addons SET status='cancelled' WHERE id=$1`, [itemId.rows[0].id]);
      f = await client.query(`SELECT gym_effective_features($1) AS feats`, [GYM_ID]);
      expect(f.rows[0].feats).toEqual(expect.arrayContaining(['dashboard', 'attendance']));
      expect(f.rows[0].feats).not.toContain('products');
    });
  });

  test('effective limits: base from effective plan + item limit*quantity; -1 stays unlimited', async () => {
    await inTransaction(async (client) => {
      await seed(client);
      await signContract(client, CONTRACT_ID, PLAN_M_ID); // max_members 50

      let l = await client.query(`SELECT gym_effective_limit($1, 'max_members') AS v`, [GYM_ID]);
      expect(l.rows[0].v).toBe(50);

      await client.query(
        `INSERT INTO platform_contract_addons (contract_id, addon_id, quantity, unit_price, cycle, status)
         VALUES ($1, $2, 3, 250, 'monthly', 'active')`,
        [CONTRACT_ID, ADDON_ID] // +100*3
      );
      l = await client.query(`SELECT gym_effective_limit($1, 'max_members') AS v`, [GYM_ID]);
      expect(l.rows[0].v).toBe(350);

      // الخطة غير المحدودة (-1) تظل غير محدودة مهما أُضيف
      await client.query(`UPDATE platform_contracts SET plan_id=$2 WHERE id=$1`, [CONTRACT_ID, PLAN_L_ID]);
      l = await client.query(`SELECT gym_effective_limit($1, 'max_members') AS v`, [GYM_ID]);
      expect(l.rows[0].v).toBe(-1);
    });
  });

  test('backfill parity: legacy gyms (pre-068) with plan_id all have an active contract', async () => {
    // القيد على الصالات التي وُجدت وقت الـbackfill فقط؛ مجموعات اختبارات
    // متوازية قد تبذر صالات بـ plan_id بلا عقد بعدها، وهذا لا يكسر التماثل.
    const r = await pool.query(
      `SELECT count(*)::int AS orphans
       FROM gyms g
       WHERE g.deleted_at IS NULL AND g.plan_id IS NOT NULL
         AND g.created_at < (SELECT coalesce(max(created_at), now())
                             FROM platform_contracts
                             WHERE notes LIKE 'backfill 068%')
         AND NOT EXISTS (SELECT 1 FROM platform_contracts c WHERE c.gym_id = g.id AND c.status = 'active')`
    );
    expect(r.rows[0].orphans).toBe(0);
  });
});
