import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

// ====================================================================
// §34ج — REAL CSV import (POST /api/import/:type)
// The old MigrationTab only faked a setTimeout + success toast; this is the
// honest endpoint behind it. The frontend parses the CSV file and posts
// normalized rows; every row is inserted for real, per row, and the response
// reports exactly what landed and what did not (no blanket "success").
// ====================================================================

const DEFAULT_TZ = 'Africa/Cairo';

async function getGymTz(gym_id: string | undefined): Promise<string> {
  if (!gym_id) return DEFAULT_TZ;
  const r = await query(`SELECT COALESCE(timezone, $2) AS tz FROM gyms WHERE id = $1`, [gym_id, DEFAULT_TZ]);
  return r.rows[0]?.tz || DEFAULT_TZ;
}

// Ledger rows imported while a shift is open belong to that shift (same rule
// as §34ث createPayment).
const OPEN_SESSION = `
  (SELECT id FROM cashbox_sessions WHERE gym_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1)`;

export const IMPORT_TYPES = ['members', 'memberships', 'attendance', 'leads', 'payments', 'products'] as const;
export type ImportType = typeof IMPORT_TYPES[number];

// Header aliases: CSV headers are trimmed + lowercased before lookup. Both
// English and common Arabic headers map to the canonical field.
const ALIASES: Record<ImportType, Record<string, string>> = {
  members: {
    full_name: 'full_name', name: 'full_name', 'الاسم': 'full_name', 'اسم العضو': 'full_name', 'الاسم الكامل': 'full_name',
    phone_number: 'phone_number', phone: 'phone_number', mobile: 'phone_number', 'الهاتف': 'phone_number', 'التليفون': 'phone_number', 'رقم الهاتف': 'phone_number', 'الموبايل': 'phone_number',
    email: 'email', 'البريد': 'email', 'الايميل': 'email',
    birth_date: 'birth_date', 'birthdate': 'birth_date', 'تاريخ الميلاد': 'birth_date',
    medical_notes: 'medical_notes', notes: 'medical_notes', 'ملاحظات': 'medical_notes', 'ملاحظات طبية': 'medical_notes',
  },
  memberships: {
    member_phone: 'member_phone', phone: 'member_phone', phone_number: 'member_phone', 'هاتف العضو': 'member_phone', 'تليفون العضو': 'member_phone',
    plan_title: 'plan_title', plan: 'plan_title', offer: 'plan_title', 'الباقة': 'plan_title',
    start_date: 'start_date', 'تاريخ البداية': 'start_date', 'بداية الاشتراك': 'start_date',
    end_date: 'end_date', 'تاريخ النهاية': 'end_date', 'نهاية الاشتراك': 'end_date',
    price_paid: 'price_paid', price: 'price_paid', 'المبلغ المدفوع': 'price_paid', 'السعر': 'price_paid',
  },
  attendance: {
    member_phone: 'member_phone', phone: 'member_phone', phone_number: 'member_phone', 'هاتف العضو': 'member_phone', 'تليفون العضو': 'member_phone',
    date: 'date', 'التاريخ': 'date', 'اليوم': 'date',
    time: 'time', 'الوقت': 'time', 'التوقيت': 'time',
  },
  leads: {
    name: 'name', 'الاسم': 'name', 'العميل': 'name',
    phone: 'phone', 'الهاتف': 'phone', 'التليفون': 'phone', 'رقم الهاتف': 'phone',
    email: 'email', 'البريد': 'email',
    source: 'source', 'المصدر': 'source',
    status: 'status', 'الحالة': 'status',
    notes: 'notes', 'ملاحظات': 'notes',
  },
  payments: {
    member_phone: 'member_phone', phone: 'member_phone', phone_number: 'member_phone', 'هاتف العضو': 'member_phone', 'تليفون العضو': 'member_phone',
    amount: 'amount', 'المبلغ': 'amount', 'القيمة': 'amount',
    description: 'description', 'البيان': 'description', 'الوصف': 'description',
    payment_method: 'payment_method', method: 'payment_method', 'طريقة الدفع': 'payment_method',
  },
  products: {
    name: 'name', 'اسم المنتج': 'name', 'المنتج': 'name',
    selling_price: 'selling_price', price: 'selling_price', 'سعر البيع': 'selling_price',
    purchase_price: 'purchase_price', cost: 'purchase_price', 'سعر الشراء': 'purchase_price', 'التكلفة': 'purchase_price',
    stock_quantity: 'stock_quantity', stock: 'stock_quantity', 'المخزون': 'stock_quantity', 'الكمية': 'stock_quantity',
    barcode: 'barcode', 'الباركود': 'barcode',
  },
};

type Row = Record<string, string>;

function normalizeRows(type: ImportType, raw: Row[]): Row[] {
  const map = ALIASES[type];
  return raw.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) {
      const key = String(k).trim().toLowerCase();
      const field = map[key];
      if (!field) continue; // unknown columns are ignored, honestly reported via template
      out[field] = v == null ? '' : String(v).trim();
    }
    return out;
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^(\d{1,2}):(\d{2})$/;

function toIsoDate(v: string): string | null {
  if (!v) return null;
  if (ISO_DATE.test(v)) return v;
  // accept dd/mm/yyyy and dd-mm-yyyy (European order, common in gym exports)
  const m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function toNumber(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

interface RowResult { imported: number; failed: number; errors: { row: number; message: string }[] }

async function importMembers(gym_id: string, rows: Row[], res: Response): Promise<void> {
  const out: RowResult = { imported: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.full_name || r.full_name.length < 2) throw new Error('الاسم مطلوب (حرفان على الأقل)');
      const bd = r.birth_date ? toIsoDate(r.birth_date) : null;
      if (r.birth_date && !bd) throw new Error('تاريخ ميلاد غير صالح — الصيغة YYYY-MM-DD');
      await query(
        `INSERT INTO members (gym_id, full_name, phone_number, email, birth_date, medical_notes)
         VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),$5,NULLIF($6,''))`,
        [gym_id, r.full_name, r.phone_number || '', r.email || '', bd, r.medical_notes || '']);
      out.imported++;
    } catch (e: any) {
      out.failed++;
      if (out.errors.length < 50)
        out.errors.push({ row: i + 2, message: e.code === '23505' ? `هاتف مكرر: ${r.phone_number || '—'}` : e.message });
    }
  }
  respond('members', out, res);
}

async function importProducts(gym_id: string, rows: Row[], res: Response): Promise<void> {
  const out: RowResult = { imported: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.name) throw new Error('اسم المنتج مطلوب');
      const sell = toNumber(r.selling_price);
      const buy = toNumber(r.purchase_price);
      if (sell == null || sell < 0) throw new Error('سعر البيع مطلوب ورقم غير سالب');
      if (buy == null || buy < 0) throw new Error('سعر الشراء مطلوب ورقم غير سالب');
      const stock = toNumber(r.stock_quantity ?? '') ?? 0;
      await query(
        `INSERT INTO products (gym_id, name, barcode, stock_quantity, purchase_price, selling_price)
         VALUES ($1,$2,NULLIF($3,''),$4,$5,$6)`,
        [gym_id, r.name, r.barcode || '', Math.trunc(stock), buy, sell]);
      out.imported++;
    } catch (e: any) {
      out.failed++;
      if (out.errors.length < 50) out.errors.push({ row: i + 2, message: e.message });
    }
  }
  respond('products', out, res);
}

async function importLeads(gym_id: string, rows: Row[], res: Response): Promise<void> {
  const out: RowResult = { imported: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.name) throw new Error('اسم العميل مطلوب');
      if (!r.phone) throw new Error('الهاتف مطلوب');
      await query(
        `INSERT INTO gym_leads (gym_id, name, phone, email, source, status, notes)
         VALUES ($1,$2,$3,NULLIF($4,''),COALESCE(NULLIF($5,''),'import'),COALESCE(NULLIF($6,''),'new'),NULLIF($7,''))`,
        [gym_id, r.name, r.phone, r.email || '', r.source || '', r.status || '', r.notes || '']);
      out.imported++;
    } catch (e: any) {
      out.failed++;
      if (out.errors.length < 50) out.errors.push({ row: i + 2, message: e.message });
    }
  }
  respond('leads', out, res);
}

async function importPayments(gym_id: string, staff_user_id: string, rows: Row[], res: Response): Promise<void> {
  const out: RowResult = { imported: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.member_phone) throw new Error('هاتف العضو مطلوب');
      const amount = toNumber(r.amount);
      if (amount == null || amount <= 0) throw new Error('مبلغ غير صالح');
      // §34ج — trg_members_encrypt يُفرّغ phone_number ويخزّن الهاتف مشفرًا + هاش؛
      // البحث يجب أن يمر عبر phone_hash() مثل بقية الكود (mobile/attendance/customer360).
      const m = await query(`SELECT id FROM members WHERE gym_id=$1 AND (phone_hash = phone_hash($2) OR phone_number=$2)`, [gym_id, r.member_phone]);
      if (m.rows.length === 0) throw new Error(`عضو غير موجود بهاتف ${r.member_phone}`);
      await query(
        `INSERT INTO financial_transactions (gym_id, type, amount, description, staff_user_id, member_id, payment_method, cash_session_id)
         VALUES ($1,'payment',$2,$3,$4,$5,$6,${OPEN_SESSION})`,
        [gym_id, amount, r.description || 'دفعة مستوردة', staff_user_id, m.rows[0].id, r.payment_method || 'cash']);
      out.imported++;
    } catch (e: any) {
      out.failed++;
      if (out.errors.length < 50) out.errors.push({ row: i + 2, message: e.message });
    }
  }
  respond('payments', out, res);
}

async function importMemberships(gym_id: string, rows: Row[], res: Response): Promise<void> {
  const out: RowResult = { imported: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.member_phone || !r.plan_title) throw new Error('هاتف العضو واسم الباقة مطلوبان');
      // §34ج — trg_members_encrypt يُفرّغ phone_number ويخزّن الهاتف مشفرًا + هاش؛
      // البحث يجب أن يمر عبر phone_hash() مثل بقية الكود (mobile/attendance/customer360).
      const m = await query(`SELECT id FROM members WHERE gym_id=$1 AND (phone_hash = phone_hash($2) OR phone_number=$2)`, [gym_id, r.member_phone]);
      if (m.rows.length === 0) throw new Error(`عضو غير موجود بهاتف ${r.member_phone}`);
      const o = await query(
        `SELECT id, duration_days, price FROM membership_offers WHERE gym_id=$1 AND title=$2 AND is_active = true`,
        [gym_id, r.plan_title]);
      if (o.rows.length === 0) throw new Error(`باقة غير موجودة أو غير نشطة: ${r.plan_title}`);
      const offer = o.rows[0];
      const start = r.start_date ? toIsoDate(r.start_date) : null;
      if (r.start_date && !start) throw new Error('تاريخ بداية غير صالح — الصيغة YYYY-MM-DD');
      const startDate = start ?? new Date().toISOString().split('T')[0];
      let endDate = r.end_date ? toIsoDate(r.end_date) : null;
      if (r.end_date && !endDate) throw new Error('تاريخ نهاية غير صالح — الصيغة YYYY-MM-DD');
      if (!endDate) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + Number(offer.duration_days));
        endDate = d.toISOString().split('T')[0];
      }
      const price = toNumber(r.price_paid ?? '') ?? Number(offer.price);
      await query(
        `INSERT INTO member_subscriptions (gym_id, member_id, offer_id, price_paid, start_date, end_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,'active')`,
        [gym_id, m.rows[0].id, offer.id, price, startDate, endDate]);
      out.imported++;
    } catch (e: any) {
      out.failed++;
      if (out.errors.length < 50) out.errors.push({ row: i + 2, message: e.message });
    }
  }
  respond('memberships', out, res);
}

async function importAttendance(gym_id: string, rows: Row[], res: Response): Promise<void> {
  const tz = await getGymTz(gym_id);
  const out: RowResult = { imported: 0, failed: 0, errors: [] };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (!r.member_phone) throw new Error('هاتف العضو مطلوب');
      // §34ج — trg_members_encrypt يُفرّغ phone_number ويخزّن الهاتف مشفرًا + هاش؛
      // البحث يجب أن يمر عبر phone_hash() مثل بقية الكود (mobile/attendance/customer360).
      const m = await query(`SELECT id FROM members WHERE gym_id=$1 AND (phone_hash = phone_hash($2) OR phone_number=$2)`, [gym_id, r.member_phone]);
      if (m.rows.length === 0) throw new Error(`عضو غير موجود بهاتف ${r.member_phone}`);
      const d = r.date ? toIsoDate(r.date) : new Date().toISOString().split('T')[0];
      if (!d) throw new Error('تاريخ غير صالح — الصيغة YYYY-MM-DD');
      let time = '00:00';
      if (r.time) {
        const tm = r.time.match(ISO_TIME);
        if (!tm) throw new Error('وقت غير صالح — الصيغة HH:MM');
        time = `${tm[1].padStart(2, '0')}:${tm[2]}`;
      }
      // Local wall-clock in the gym timezone → timestamptz.
      await query(
        `INSERT INTO attendance_logs (gym_id, member_id, check_in_time, entry_method)
         VALUES ($1,$2, ($3::timestamp AT TIME ZONE $4),'import')`,
        [gym_id, m.rows[0].id, `${d} ${time}`, tz]);
      out.imported++;
    } catch (e: any) {
      out.failed++;
      if (out.errors.length < 50)
        out.errors.push({ row: i + 2, message: e.code === '23505' ? 'حضور مسجل بالفعل لهذا العضو في نفس اليوم' : e.message });
    }
  }
  respond('attendance', out, res);
}

function respond(type: string, out: RowResult, res: Response): void {
  res.json({ data: { type, imported: out.imported, failed: out.failed, errors: out.errors } });
}

export const importData = async (req: Request, res: Response): Promise<void> => {
  const type = req.params.type as ImportType;
  if (!IMPORT_TYPES.includes(type)) {
    res.status(400).json({ error: 'نوع استيراد غير معروف' });
    return;
  }
  const gym_id = req.staff?.gym_id;
  const staff_user_id = req.staff?.staff_user_id;
  if (!gym_id || !staff_user_id) {
    res.status(401).json({ error: 'جلسة غير صالحة' });
    return;
  }
  const raw = req.body?.rows;
  if (!Array.isArray(raw) || raw.length === 0) {
    res.status(400).json({ error: 'لا توجد صفوف للاستيراد' });
    return;
  }
  if (raw.length > 2000) {
    res.status(400).json({ error: 'الحد الأقصى 2000 صف في المرة الواحدة — قسّم الملف' });
    return;
  }
  const rows = normalizeRows(type, raw as Row[]);
  try {
    switch (type) {
      case 'members': await importMembers(gym_id, rows, res); break;
      case 'products': await importProducts(gym_id, rows, res); break;
      case 'leads': await importLeads(gym_id, rows, res); break;
      case 'payments': await importPayments(gym_id, staff_user_id, rows, res); break;
      case 'memberships': await importMemberships(gym_id, rows, res); break;
      case 'attendance': await importAttendance(gym_id, rows, res); break;
    }
    await query(
      `INSERT INTO activity_logs (gym_id, staff_user_id, action_description, ip_address)
       VALUES ($1,$2,$3,$4)`,
      [gym_id, staff_user_id, `CSV import (${type}) requested: ${rows.length} rows`, req.ip]);
  } catch (e: any) {
    logger.error(`importData failed for ${type}`, { error: e.message });
    if (!res.headersSent) res.status(500).json({ error: 'خطأ داخلي أثناء الاستيراد' });
  }
};
