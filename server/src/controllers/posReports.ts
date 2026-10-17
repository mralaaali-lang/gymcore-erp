import { Request, Response } from 'express';
import { query } from '../config/database';
import logger from '../config/logger';

/**
 * §63 — تقرير POS الحقيقي.
 *
 * التبويب كان يعرض ثلاثة أرقام من `/api/finance/summary` (وهي أصلًا أرقام
 * الخزنة لا الـPOS). هنا كل مقياس يُقاس من `pos_orders` + `pos_order_items`
 * بنفس نافذة الفلتار، وبحدود اليوم بتوقيت الصالة (§34ث) — لا رقم بيتحسب في
 * المتصفح ولا مصدر متخيَّل: الإجماليات بتتجمع من صفوف السلسلة نفسها فالكرت
 * والسجل ما يتناقضوش أبدًا.
 *
 * الهامش: `products.purchase_price` عمود اختياري، فأي منتج بلا تكلفة
 * بيخرج من حسابها — نسبة الكميات اللي لها تكلفة (`costed_units`) بترافق
 * الأرقام علشان الواجهة تقول قد إيه اليقين بدل ما تبيع هامش ناقص على
 * إنه كامل.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TZ = 'Africa/Cairo';

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** pg بيرجع numeric كنص (§61) — كل الأرقام بتتعبر من هنا قبل أي مقارنة أو جمع. */
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

interface Range {
  from: string;
  to: string;
  tz: string;
  currency: string;
}

/**
 * من/إلى بصيغة ISO، افتراضيًا أول الشهر حتى اليوم بتوقيت الصالة، مع تبديل
 * لو انعكس النطاق وسقف 366 يومًا — نفس عقد `/api/reports/*` القائم
 * (analytics.ts بيملك نسخته الخاصة وغير مُصدَّرة، فلا استنساخ هنا مقصود
 * لإبقاء ملفات الجلسةين معزولتين).
 */
async function resolveRange(gym_id: string | undefined, req: Request): Promise<Range> {
  const row = await query(
    `SELECT COALESCE(timezone, $2) AS tz, currency,
            to_char((CURRENT_TIMESTAMP AT TIME ZONE COALESCE(timezone, $2))::date, 'YYYY-MM-DD') AS today,
            to_char(date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(timezone, $2))::timestamp)::date, 'YYYY-MM-DD') AS month_start
       FROM gyms WHERE id = $1`,
    [gym_id, DEFAULT_TZ],
  );
  const tz: string = row.rows[0]?.tz || DEFAULT_TZ;
  const today: string = ISO_DATE.test(String(row.rows[0]?.today || ''))
    ? String(row.rows[0].today)
    : new Date().toISOString().slice(0, 10);
  const monthStart: string = ISO_DATE.test(String(row.rows[0]?.month_start || ''))
    ? String(row.rows[0].month_start)
    : `${today.slice(0, 8)}01`;

  let from = ISO_DATE.test(String(req.query.from || '')) ? String(req.query.from) : monthStart;
  let to = ISO_DATE.test(String(req.query.to || '')) ? String(req.query.to) : today;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  if (addDaysIso(from, 366) < to) to = addDaysIso(from, 366);

  return { from, to, tz, currency: row.rows[0]?.currency || 'EGP' };
}

// $1=gym $2=from $3=tz $4=to — نفس ترتيب الشواهد في getReportsOverview.
const RANGE_ORDER = `
  FROM pos_orders
 WHERE gym_id = $1
   AND created_at >= ( $2::date )::timestamp AT TIME ZONE $3
   AND created_at <  ( $4::date + 1 )::timestamp AT TIME ZONE $3`;

export interface PosDay {
  day: string;
  orders: number;
  gross: number;
}

export interface PosProduct {
  product_id: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  margin: number;
  costed_units: number;
}

/**
 * إجماليات التقرير محسوبة من صفوف السلسلة والأصناف نفسها — لا رقم من استعلام
 * تاني يتناقض مع الرسم. القسمة على صفر (بلا مبيعات، أو بلا تكلفة مسجّلة)
 * بتترد صفر/صير لا NaN ولا Infinity على وجه المنصة.
 */
export function buildPosTotals(
  days: PosDay[],
  products: PosProduct[],
  refunds: { total: number; count: number },
): Record<string, number> {
  const orders = days.reduce((t, d) => t + d.orders, 0);
  const gross = r2(days.reduce((t, d) => t + d.gross, 0));
  const unitsSold = products.reduce((t, p) => t + p.units, 0);
  const costBasis = r2(products.reduce((t, p) => t + p.cost, 0));
  const costedUnits = products.reduce((t, p) => t + p.costed_units, 0);
  const refundTotal = r2(refunds.total);
  return {
    orders,
    units_sold: unitsSold,
    distinct_products: products.length,
    gross,
    net: r2(gross - refundTotal),
    refunds: refundTotal,
    refund_count: refunds.count,
    avg_order_value: orders > 0 ? r2(gross / orders) : 0,
    cost_basis: costBasis,
    gross_margin: r2(gross - costBasis),
    // قد إيه من الكميات له تكلفة مسجّلة — الهامش بلا هذه النسبة كذبة.
    cost_coverage_pct: unitsSold > 0 ? Math.round((costedUnits / unitsSold) * 1000) / 10 : 0,
  };
}

export async function getPosReport(req: Request, res: Response): Promise<void> {
  const gym_id = req.staff?.gym_id;
  try {
    const { from, to, tz, currency } = await resolveRange(gym_id, req);

    const [daily, products, methods, staff, hourly, refunds] = await Promise.all([
      // سلسلة الأيام: هي مصدر الإجماليات، فأي كرت بيساوي مجموع السلسلة حرفيًا.
      query(
        `SELECT to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS orders,
                COALESCE(SUM(total_amount), 0) AS gross
         ${RANGE_ORDER}
         GROUP BY 1
         ORDER BY 1`,
        [gym_id, from, tz, to],
      ),
      // أصناف مبيعة بالاسم المُخزَّن وقت البيع مش الكتالوج الجاري — المرتجعات
      // والحذف اللاحق ما يضيعوش الأرقام.
      query(
        `SELECT poi.product_id,
                COALESCE(p.name, '—') AS name,
                SUM(poi.quantity)::int AS units,
                COALESCE(SUM(poi.quantity * poi.unit_price), 0) AS revenue,
                COALESCE(SUM(poi.quantity * COALESCE(p.purchase_price, 0)), 0) AS cost,
                SUM(poi.quantity) FILTER (WHERE COALESCE(p.purchase_price, 0) > 0)::int AS costed_units
         FROM pos_order_items poi
         JOIN pos_orders po ON po.id = poi.order_id
         LEFT JOIN products p ON p.id = poi.product_id
         WHERE po.gym_id = $1
           AND po.created_at >= ( $2::date )::timestamp AT TIME ZONE $3
           AND po.created_at <  ( $4::date + 1 )::timestamp AT TIME ZONE $3
         GROUP BY 1, 2
         ORDER BY revenue DESC`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT payment_method, COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0) AS amount
         ${RANGE_ORDER}
         GROUP BY 1
         ORDER BY amount DESC`,
        [gym_id, from, tz, to],
      ),
      query(
        `SELECT po.staff_user_id, COALESCE(su.full_name, '—') AS name,
                COUNT(*)::int AS orders, COALESCE(SUM(po.total_amount), 0) AS amount
         FROM pos_orders po
         LEFT JOIN staff_users su ON su.id = po.staff_user_id
         WHERE po.gym_id = $1
           AND po.created_at >= ( $2::date )::timestamp AT TIME ZONE $3
           AND po.created_at <  ( $4::date + 1 )::timestamp AT TIME ZONE $3
         GROUP BY 1, 2
         ORDER BY amount DESC`,
        [gym_id, from, tz, to],
      ),
      // ساعة الذروة بتوقيت الصالة — تشغيليًا أهم من إجمالي اليوم.
      query(
        `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE $3)::int AS hour,
                COUNT(*)::int AS orders,
                COALESCE(SUM(total_amount), 0) AS amount
         ${RANGE_ORDER}
         GROUP BY 1
         ORDER BY 1`,
        [gym_id, from, tz, to],
      ),
      // مرتجعات مربوطة بفاتورة POS (financial_transactions.pos_order_id).
      query(
        `SELECT COALESCE(SUM(ft.amount), 0) AS total, COUNT(*)::int AS count
         FROM financial_transactions ft
         JOIN pos_orders po ON po.id = ft.pos_order_id
         WHERE ft.gym_id = $1 AND ft.type = 'refund'
           AND ft.created_at >= ( $2::date )::timestamp AT TIME ZONE $3
           AND ft.created_at <  ( $4::date + 1 )::timestamp AT TIME ZONE $3`,
        [gym_id, from, tz, to],
      ),
    ]);

    const days: PosDay[] = daily.rows.map((r) => ({
      day: r.day as string,
      orders: num(r.orders),
      gross: r2(num(r.gross)),
    }));

    const productRows: PosProduct[] = products.rows.map((r) => {
      const revenue = num(r.revenue);
      const cost = num(r.cost);
      return {
        product_id: r.product_id as string,
        name: r.name as string,
        units: num(r.units),
        revenue: r2(revenue),
        cost: r2(cost),
        margin: r2(revenue - cost),
        costed_units: num(r.costed_units),
      };
    });

    res.json({
      data: {
        from,
        to,
        timezone: tz,
        currency,
        totals: buildPosTotals(days, productRows, {
          total: num(refunds.rows[0]?.total),
          count: num(refunds.rows[0]?.count),
        }),
        daily: days,
        top_products: productRows.slice(0, 15),
        payment_methods: methods.rows.map((r) => ({
          method: r.payment_method as string,
          orders: num(r.orders),
          amount: r2(num(r.amount)),
        })),
        staff: staff.rows.map((r) => ({
          staff_user_id: r.staff_user_id as string,
          name: r.name as string,
          orders: num(r.orders),
          amount: r2(num(r.amount)),
        })),
        hourly: hourly.rows.map((r) => ({
          hour: num(r.hour),
          orders: num(r.orders),
          amount: r2(num(r.amount)),
        })),
      },
    });
  } catch (error) {
    logger.error('getPosReport failed', { error: (error as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
}
