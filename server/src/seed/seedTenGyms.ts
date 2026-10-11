/**
 * Seed 10 varied gyms with large member volumes for local technical testing.
 * Run ONLY on a fresh local database:
 *   dropdb → createdb → extensions → migrate → db:seed10 → bootstrap admin
 *
 * Covers: multi-branch, multi-currency, expired/trial/suspended gyms,
 * varied member statuses, attendance, classes+bookings, POS, cashbox,
 * finance, loyalty, PT, announcements.
 */
import { getClient } from '../config/database';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger';

// ── Static data ──────────────────────────────────────────────
const FIRST_M = ['أحمد','محمد','علي','خالد','عمر','عبدالله','فيصل','سعد','نواف','ماجد','ياسر','هاني','تركي','بدر','سلطان','فهد','نايف','مشعل','عبدالرحمن','طلال','سامي','حسن','حسين','إبراهيم','تامر','كريم','رامي','وليد','مصطفى','حمزة','يوسف','آدم','ريان','سيف','طارق','بلال','أنس','عادل','جمال','فادي','نبيل','رائد','شريف','عماد','وائل','هشام','أيمن','صلاح','كمال','منير'];
const FIRST_F = ['نور','سارة','مريم','فاطمة','عائشة','خديجة','ريم','لينا','دانا','جود','لمى','رنا','هند','سلمى','آية','منى','هدى','دينا','رانيا','نهى','أسماء','إيمان','حنان','عبير','سهى','مها','غادة','رشا','نادية','هالة'];
const LAST = ['الزهراني','القحطاني','العتيبي','الدوسري','الغامدي','الشهراني','المطيري','الحربي','العنزي','الجهني','الشمري','الخالدي','المصري','السيد','إبراهيم','حسن','عبدالرحمن','الشريف','الخطيب','النجار','الحداد','السكران','عوض','فرج','عبدالعزيز'];
const CLASS_NAMES = ['سبيننج','يوجا','كروس فيت','ملاكمة','بيلاتس','زومبا','تمارين وظيفية','حديد حر'];
const PRODUCT_NAMES = ['ماء 500ml','ماء 1.5L','بروتين بار','مشروب طاقة','منشفة رياضية','شيكر','قفازات رفع','رباط ضغط','تيشيرت النادي','اشتراك ضيافة'];
const EXPENSE_CATS = ['كهرباء','مياه','إيجار','رواتب','صيانة أجهزة','تسويق','نظافة','إنترنت'];
const OFFER_T = [
  { title: 'شهر واحد', duration_days: 30, price: 350 },
  { title: '3 أشهر', duration_days: 90, price: 900 },
  { title: '6 أشهر', duration_days: 180, price: 1600 },
  { title: 'سنة كاملة', duration_days: 365, price: 2800 },
];

interface GymSpec {
  name: string; subdomain: string; plan_tier: 'basic'|'premium'|'enterprise';
  currency: string; country: string; city: string; timezone: string; language: string;
  phonePrefix: string; address: string; phone: string;
  is_active: boolean; tenant_status: string; subscription_status: string;
  expiresInDays: number | null; members: number; branches: string[]; priceScale: number;
}

const GYMS: GymSpec[] = [
  { name: 'أطلس جيم', subdomain: 'atlas-gym', plan_tier: 'enterprise', currency: 'EGP', country: 'Egypt', city: 'القاهرة', timezone: 'Africa/Cairo', language: 'ar', phonePrefix: '+2010', address: 'شارع عباس العقاد، مدينة نصر', phone: '+201022334455', is_active: true, tenant_status: 'active', subscription_status: 'active', expiresInDays: 320, members: 400, branches: ['الفرع الرئيسي — مدينة نصر','فرع المعادي','فرع التجمع'], priceScale: 1 },
  { name: 'باور زون', subdomain: 'power-zone', plan_tier: 'premium', currency: 'EGP', country: 'Egypt', city: 'الجيزة', timezone: 'Africa/Cairo', language: 'ar', phonePrefix: '+2011', address: 'شارع فيصل الرئيسي', phone: '+201133445566', is_active: true, tenant_status: 'active', subscription_status: 'active', expiresInDays: 200, members: 320, branches: ['الفرع الرئيسي — فيصل','فرع الهرم'], priceScale: 1 },
  { name: 'فيت هاوس', subdomain: 'fit-house', plan_tier: 'basic', currency: 'EGP', country: 'Egypt', city: 'الإسكندرية', timezone: 'Africa/Cairo', language: 'ar', phonePrefix: '+2012', address: 'كورنيش سموحة', phone: '+201244556677', is_active: true, tenant_status: 'active', subscription_status: 'active', expiresInDays: 90, members: 180, branches: ['الفرع الرئيسي — سموحة'], priceScale: 0.9 },
  { name: 'تيتان الرياض', subdomain: 'titan-riyadh', plan_tier: 'enterprise', currency: 'SAR', country: 'Saudi Arabia', city: 'الرياض', timezone: 'Asia/Riyadh', language: 'ar', phonePrefix: '+9665', address: 'طريق الملك فهد، العليا', phone: '+966112233445', is_active: true, tenant_status: 'active', subscription_status: 'active', expiresInDays: 340, members: 350, branches: ['الفرع الرئيسي — العليا','فرع النرجس','فرع الشفا'], priceScale: 0.09 },
  { name: 'موج اللياقة', subdomain: 'fitness-wave', plan_tier: 'premium', currency: 'SAR', country: 'Saudi Arabia', city: 'جدة', timezone: 'Asia/Riyadh', language: 'ar', phonePrefix: '+9665', address: 'شارع التحلية', phone: '+966122334455', is_active: true, tenant_status: 'active', subscription_status: 'active', expiresInDays: 150, members: 250, branches: ['الفرع الرئيسي — التحلية','فرع أبحر'], priceScale: 0.09 },
  { name: 'أوكسجين', subdomain: 'oxygen-gym', plan_tier: 'basic', currency: 'SAR', country: 'Saudi Arabia', city: 'الدمام', timezone: 'Asia/Riyadh', language: 'ar', phonePrefix: '+9665', address: 'كورنيش الدمام', phone: '+966133445566', is_active: true, tenant_status: 'active', subscription_status: 'active', expiresInDays: 45, members: 150, branches: ['الفرع الرئيسي'], priceScale: 0.085 },
  { name: 'Star Fitness Dubai', subdomain: 'star-fitness', plan_tier: 'enterprise', currency: 'AED', country: 'UAE', city: 'دبي', timezone: 'Asia/Dubai', language: 'en', phonePrefix: '+9715', address: 'Sheikh Zayed Road', phone: '+97143344556', is_active: true, tenant_status: 'active', subscription_status: 'active', expiresInDays: 280, members: 300, branches: ['Main — SZR','Marina Branch'], priceScale: 0.085 },
  { name: 'النخبة', subdomain: 'elite-gym', plan_tier: 'premium', currency: 'EGP', country: 'Egypt', city: 'القاهرة', timezone: 'Africa/Cairo', language: 'ar', phonePrefix: '+2015', address: 'مصر الجديدة، شارع الحجاز', phone: '+201555667788', is_active: true, tenant_status: 'active', subscription_status: 'expired', expiresInDays: -12, members: 220, branches: ['الفرع الرئيسي','فرع مدينة الشروق'], priceScale: 1.1 },
  { name: 'هالك جيم', subdomain: 'hulk-gym', plan_tier: 'basic', currency: 'EGP', country: 'Egypt', city: 'المنصورة', timezone: 'Africa/Cairo', language: 'ar', phonePrefix: '+2010', address: 'شارع الجمهورية', phone: '+201066778899', is_active: false, tenant_status: 'suspended', subscription_status: 'suspended', expiresInDays: -40, members: 120, branches: ['الفرع الرئيسي'], priceScale: 0.8 },
  { name: 'فيوتشر فيت', subdomain: 'future-fit', plan_tier: 'premium', currency: 'EGP', country: 'Egypt', city: 'القاهرة الجديدة', timezone: 'Africa/Cairo', language: 'ar', phonePrefix: '+2011', address: 'التجمع الخامس، شارع التسعين', phone: '+201177889900', is_active: true, tenant_status: 'trial', subscription_status: 'trial', expiresInDays: 14, members: 170, branches: ['الفرع الرئيسي'], priceScale: 1 },
];

const d = (dt: Date) => dt.toISOString().split('T')[0];
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

// Chunked multi-row INSERT (fast for tens of thousands of rows)
async function batchInsert(client: any, table: string, cols: string[], rows: any[][], size = 400) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const ph: string[] = [];
    const vals: any[] = [];
    chunk.forEach((r, ri) => {
      ph.push(`(${r.map((_: any, ci: number) => `$${ri * cols.length + ci + 1}`).join(',')})`);
      vals.push(...r);
    });
    await client.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${ph.join(',')}`, vals);
  }
}

async function seed(): Promise<void> {
  logger.info('=== Seed 10 Gyms: generating varied local test data ===');
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Global loyalty tiers (table has no gym_id)
    const tiers = await client.query('SELECT COUNT(*)::int AS c FROM loyalty_tiers');
    let tierIds: string[] = [];
    if (Number(tiers.rows[0].c) === 0) {
      for (const [i, t] of [['برونزي', 1, 0], ['فضي', 2, 500], ['ذهبي', 3, 1500]].entries()) {
        const id = uuidv4();
        tierIds.push(id);
        await client.query(
          `INSERT INTO loyalty_tiers (id, name, name_ar, level, min_points) VALUES ($1,$2,$3,$4,$5)`,
          [id, ['Bronze', 'Silver', 'Gold'][i], t[0], t[1], t[2]],
        );
      }
    } else {
      tierIds = (await client.query('SELECT id FROM loyalty_tiers ORDER BY level')).rows.map((r: any) => r.id);
    }

    // One password hash per role (uniform credentials across gyms)
    const H = {
      owner: await bcrypt.hash('Owner@123', 10),
      manager: await bcrypt.hash('Manager@123', 10),
      receptionist: await bcrypt.hash('Rec@1234', 10),
      coach: await bcrypt.hash('Coach@123', 10),
    };

    let totalMembers = 0;
    for (let gi = 0; gi < GYMS.length; gi++) {
      const g = GYMS[gi];
      const gymId = uuidv4();
      const expDate = g.expiresInDays === null ? null : d(new Date(Date.now() + g.expiresInDays * 86400000));
      await client.query(
        `INSERT INTO gyms (id, name, subdomain, plan_tier, is_active, currency, timezone, language, phone, phone_number, address_street, address_country, tenant_status, subscription_status, subscription_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [gymId, g.name, g.subdomain, g.plan_tier, g.is_active, g.currency, g.timezone, g.language, g.phone, g.phone, g.address, g.country, g.tenant_status, g.subscription_status, expDate],
      );

      // Branches
      const branchIds: string[] = [];
      for (let bi = 0; bi < g.branches.length; bi++) {
        const bid = uuidv4();
        branchIds.push(bid);
        await client.query(
          `INSERT INTO branches (id, gym_id, name, code, city, country, phone, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
          [bid, gymId, g.branches[bi], `G${gi + 1}-B${bi + 1}`, g.city, g.country, g.phone],
        );
      }

      // Staff (single gym-admin role: manager — founding + deputy)
      const coachCount = g.members > 300 ? 3 : 2;
      const recepCount = g.members > 250 ? 2 : 1;
      const staff: { id: string; role: string; email: string; name: string; hash?: string }[] = [
        { id: uuidv4(), role: 'manager', email: `owner@${g.subdomain}.com`, name: `مدير مؤسس ${g.name}`, hash: H.owner },
        { id: uuidv4(), role: 'manager', email: `manager@${g.subdomain}.com`, name: `مدير ${g.name}`, hash: H.manager },
      ];
      for (let r = 0; r < recepCount; r++) staff.push({ id: uuidv4(), role: 'receptionist', email: r === 0 ? `reception@${g.subdomain}.com` : `reception2@${g.subdomain}.com`, name: `استقبال ${g.name}` });
      for (let c = 0; c < coachCount; c++) staff.push({ id: uuidv4(), role: 'coach', email: c === 0 ? `coach@${g.subdomain}.com` : `coach${c + 1}@${g.subdomain}.com`, name: `مدرب ${c + 1} — ${g.name}` });
      const salaryBase = Math.round(8000 * g.priceScale);
      for (const s of staff) {
        await client.query(
          `INSERT INTO staff_users (id, gym_id, email, password_hash, full_name, role, salary, phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [s.id, gymId, s.email, s.hash ?? (H as any)[s.role], s.name, s.role, salaryBase + rnd(0, 4000), `${g.phonePrefix}${String(1000000 + rnd(0, 8999999))}`],
        );
      }
      const coachIds = staff.filter((s) => s.role === 'coach').map((s) => s.id);
      const recepId = staff.find((s) => s.role === 'receptionist')!.id;
      const mgrId = staff.find((s) => s.role === 'manager')!.id;

      // Offers (scaled prices)
      const offerIds: { id: string; price: number; days: number }[] = [];
      for (const t of OFFER_T) {
        const oid = uuidv4();
        const price = Math.max(5, Math.round(t.price * g.priceScale));
        offerIds.push({ id: oid, price, days: t.duration_days });
        await client.query(`INSERT INTO membership_offers (id, gym_id, title, duration_days, price, is_active) VALUES ($1,$2,$3,$4,$5,true)`, [oid, gymId, t.title, t.duration_days, price]);
      }

      // Members + subscriptions + attendance (batched)
      const statuses: string[] = [];
      const w = [['active', 70], ['expired', 15], ['frozen', 8], ['cancelled', 4], ['suspended', 3]] as const;
      const bag: string[] = [];
      w.forEach(([s, n]) => { for (let k = 0; k < n; k++) bag.push(s); });
      const memberRows: any[][] = [];
      const subRows: any[][] = [];
      const attRows: any[][] = [];
      const memberIds: string[] = [];
      const activeIds: string[] = [];
      const blacklistCount = g.members >= 300 ? 2 : 1;
      for (let m = 0; m < g.members; m++) {
        const mid = uuidv4();
        memberIds.push(mid);
        const female = m % 3 === 2;
        const fn = female ? FIRST_F[m % FIRST_F.length] : FIRST_M[m % FIRST_M.length];
        const fullName = `${fn} ${LAST[(m * 7 + gi) % LAST.length]}`;
        const phone = `${g.phonePrefix}${String(2000000 + m * 37 + gi * 911).padStart(7, '0').slice(-7)}`;
        const bl = m < blacklistCount;
        const status = bl ? 'active' : bag[(m * 13 + gi * 7) % bag.length];
        const branch = branchIds[m % branchIds.length];
        memberRows.push([mid, gymId, branch, fullName, phone, `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`, bl, bl ? 'قيد التحقق — مخالفة قواعد النادي' : null, m % 5 === 0 ? `${fn}.${m}@mail.com` : null]);
        if (status === 'active') activeIds.push(mid);

        const off = offerIds[m % offerIds.length];
        const start = new Date();
        start.setDate(start.getDate() - rnd(0, off.days));
        const end = new Date(start);
        if (status === 'expired' || status === 'cancelled') { end.setDate(end.getDate() - rnd(1, 30)); start.setDate(end.getDate() - off.days); }
        else end.setDate(end.getDate() + off.days);
        const discount = Math.random() < 0.2 ? 0.85 : 1;
        const frozen = status === 'frozen';
        const fzS = frozen ? d(new Date()) : null;
        const fzE = frozen ? d(new Date(Date.now() + 7 * 86400000)) : null;
        subRows.push([uuidv4(), gymId, mid, off.id, Math.round(off.price * discount), d(start), d(end), status, frozen, fzS, fzE]);

        if (status === 'active' && !bl) {
          for (let dd = 0; dd < 30; dd++) {
            if (Math.random() < 0.35) {
              const day = new Date();
              day.setDate(day.getDate() - dd);
              day.setHours(rnd(6, 21), rnd(0, 59), 0, 0);
              attRows.push([uuidv4(), gymId, branchIds[(m + dd) % branchIds.length], mid, day.toISOString(), Math.random() < 0.7 ? 'qr_code' : 'manual_phone']);
            }
          }
        }
      }
      await batchInsert(client, 'members', ['id', 'gym_id', 'branch_id', 'full_name', 'phone_number', 'photo_url', 'is_blacklisted', 'blacklist_reason', 'email'], memberRows);
      await batchInsert(client, 'member_subscriptions', ['id', 'gym_id', 'member_id', 'offer_id', 'price_paid', 'start_date', 'end_date', 'status', 'is_frozen', 'freeze_start_date', 'freeze_end_date'], subRows);
      await batchInsert(client, 'attendance_logs', ['id', 'gym_id', 'branch_id', 'member_id', 'check_in_time', 'entry_method'], attRows);

      // Classes + bookings
      const classIds: string[] = [];
      for (let c = 0; c < 6; c++) {
        const cid = uuidv4();
        classIds.push(cid);
        const sd = new Date();
        sd.setDate(sd.getDate() + rnd(0, 6));
        sd.setHours(rnd(8, 19), 0, 0, 0);
        const ed = new Date(sd);
        ed.setHours(ed.getHours() + 1);
        await client.query(`INSERT INTO fitness_classes (id, gym_id, coach_id, title, capacity, start_time, end_time) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [cid, gymId, coachIds[c % coachIds.length], CLASS_NAMES[(c + gi) % CLASS_NAMES.length], rnd(15, 30), sd.toISOString(), ed.toISOString()]);
      }
      const bookRows: any[][] = [];
      for (const cid of classIds) {
        const n = rnd(8, 14);
        for (let b = 0; b < n && b < activeIds.length; b++) bookRows.push([uuidv4(), gymId, cid, activeIds[(b * 5 + classIds.indexOf(cid)) % activeIds.length]]);
      }
      await batchInsert(client, 'class_bookings', ['id', 'gym_id', 'class_id', 'member_id'], bookRows);

      // Products + POS
      const prodIds: { id: string; price: number }[] = [];
      for (let p = 0; p < 8; p++) {
        const pid = uuidv4();
        const sell = Math.round((10 + Math.random() * 60) * g.priceScale * 100) / 100;
        prodIds.push({ id: pid, price: sell });
        await client.query(`INSERT INTO products (id, gym_id, name, barcode, stock_quantity, purchase_price, selling_price) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [pid, gymId, PRODUCT_NAMES[(p + gi) % PRODUCT_NAMES.length], `${100000 + gi * 100 + p}`, rnd(10, 80), Math.round(sell * 0.6 * 100) / 100, sell]);
      }
      for (let o = 0; o < 40; o++) {
        const oid = uuidv4();
        const nItems = rnd(1, 3);
        let total = 0;
        const items: any[][] = [];
        for (let it = 0; it < nItems; it++) {
          const pr = pick(prodIds);
          const q = rnd(1, 3);
          total += pr.price * q;
          items.push([uuidv4(), oid, pr.id, q, pr.price]);
        }
        total = Math.round(total * 100) / 100;
        await client.query(`INSERT INTO pos_orders (id, gym_id, staff_user_id, member_id, total_amount, payment_method) VALUES ($1,$2,$3,$4,$5,$6)`, [oid, gymId, recepId, Math.random() < 0.7 && activeIds.length ? pick(activeIds) : null, total, Math.random() < 0.6 ? 'cash' : 'card']);
        await batchInsert(client, 'pos_order_items', ['id', 'order_id', 'product_id', 'quantity', 'unit_price'], items, 200);
      }

      // Cashbox + finance
      for (let s = 0; s < 3; s++) {
        const closed = s < 2;
        const open = Math.round(rnd(500, 3000) * g.priceScale);
        await client.query(
          `INSERT INTO cashbox_sessions (id, gym_id, staff_user_id, opened_at, closed_at, opening_balance, closing_balance, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [uuidv4(), gymId, s === 0 ? recepId : mgrId, new Date(Date.now() - (3 - s) * 86400000).toISOString(), closed ? new Date(Date.now() - (2 - s) * 86400000).toISOString() : null, open, closed ? open + rnd(200, 2500) : null, closed ? 'closed' : 'open', closed ? 'إغلاق يومي' : 'وردية حالية'],
        );
      }
      const catIds: string[] = [];
      for (const c of EXPENSE_CATS) {
        const cid = uuidv4();
        catIds.push(cid);
        await client.query(`INSERT INTO expense_categories (id, gym_id, name) VALUES ($1,$2,$3)`, [cid, gymId, c]);
      }
      const finRows: any[][] = [];
      for (let f = 0; f < 30; f++) {
        const income = Math.random() < 0.55;
        finRows.push([uuidv4(), gymId, income ? null : pick(catIds), income ? 'income' : 'expense', Math.round(rnd(100, 5000) * g.priceScale * 100) / 100, income ? pick(['اشتراك عضو جديد', 'تجديد اشتراك', 'مبيعات متجر', 'حصة تدريب خاص']) : pick(['فاتورة كهرباء', 'صيانة جهاز', 'حملة إعلانية', 'مشتريات متجر']), recepId]);
      }
      await batchInsert(client, 'financial_transactions', ['id', 'gym_id', 'category_id', 'type', 'amount', 'description', 'staff_user_id'], finRows);

      // Loyalty (60% of actives)
      const loyRows: any[][] = [];
      const loyTx: any[][] = [];
      const loyCount = Math.floor(activeIds.length * 0.6);
      for (let l = 0; l < loyCount; l++) {
        const aid = uuidv4();
        const pts = rnd(0, 2000);
        const tier = pts >= 1500 ? tierIds[2] : pts >= 500 ? tierIds[1] : tierIds[0];
        loyRows.push([aid, activeIds[l], gymId, tier, pts, pts + rnd(0, 500), 0, 0]);
        loyTx.push([uuidv4(), aid, 'earned', Math.max(10, Math.round(pts / 5)), pts, 'نقاط حضور وحصص', 'attendance', null, recepId]);
        if (pts > 800) loyTx.push([uuidv4(), aid, 'redeemed', 200, pts - 200, 'استبدال خصم اشتراك', 'subscription', null, recepId]);
      }
      await batchInsert(client, 'loyalty_accounts', ['id', 'member_id', 'gym_id', 'tier_id', 'current_points', 'lifetime_points', 'total_redeemed', 'total_expired'], loyRows);
      await batchInsert(client, 'loyalty_transactions', ['id', 'account_id', 'type', 'points', 'balance_after', 'description', 'reference_type', 'reference_id', 'created_by'], loyTx);

      // PT packages + sessions
      const pkgIds: string[] = [];
      for (const [pn, sc, pr] of [['باقة 8 حصص', 8, 1200], ['باقة 12 حصة', 12, 1600]] as const) {
        const pid = uuidv4();
        pkgIds.push(pid);
        await client.query(`INSERT INTO pt_packages (id, gym_id, name, session_count, total_price) VALUES ($1,$2,$3,$4,$5)`, [pid, gymId, pn, sc, Math.round(pr * g.priceScale)]);
      }
      const ptRows: any[][] = [];
      const ptN = Math.min(12, activeIds.length);
      for (let p = 0; p < ptN; p++) {
        const pkg = p % 2;
        const total = pkg === 0 ? 8 : 12;
        const done = rnd(1, total);
        for (let s = 1; s <= done; s++) {
          const past = s < done;
          const sch = new Date();
          sch.setDate(sch.getDate() + (past ? -rnd(1, 20) : rnd(1, 10)));
          ptRows.push([uuidv4(), gymId, pkgIds[pkg], activeIds[(p * 11) % activeIds.length], coachIds[p % coachIds.length], s, sch.toISOString(), past ? sch.toISOString() : null, past ? 'completed' : 'scheduled', null]);
        }
      }
      await batchInsert(client, 'pt_sessions', ['id', 'gym_id', 'package_id', 'member_id', 'trainer_id', 'session_number', 'scheduled_at', 'completed_at', 'status', 'notes'], ptRows);

      // Announcements
      await client.query(`INSERT INTO announcements (id, gym_id, staff_user_id, title, content, is_pinned) VALUES ($1,$2,$3,$4,$5,$6)`, [uuidv4(), gymId, mgrId, 'مواعيد رمضان', 'تم تعديل مواعيد الحصص خلال شهر رمضان.', true]);
      await client.query(`INSERT INTO announcements (id, gym_id, staff_user_id, title, content) VALUES ($1,$2,$3,$4,$5)`, [uuidv4(), gymId, mgrId, 'صيانة دورية', 'صيانة أجهزة الكارديو يوم الجمعة القادم.']);

      totalMembers += g.members;
      logger.info(`Gym "${g.name}" seeded: ${g.members} members, ${g.branches.length} branches, ${attRows.length} check-ins`);
    }

    await client.query('COMMIT');
    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`  ✅ Seed-10 complete!`);
    console.log(`  10 gyms × ${totalMembers} members (${GYMS.map((g) => g.members).join('/')})`);
    console.log(`  Credentials per gym (managers): owner@<subdomain>.com / Owner@123 (founding)`);
    console.log(`  (manager@ / Manager@123, reception@ / Rec@1234, coach@ / Coach@123)`);
    console.log(`═══════════════════════════════════════════════\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seed-10 failed', { error: (error as Error).message });
    console.error('Seed-10 failed:', (error as Error).message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
