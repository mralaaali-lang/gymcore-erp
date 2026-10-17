/**
 * §46 — منطق أسعار الباقات وطبقة الخصم (دوال نقية بلا SQL حتى تُختبر وحدها).
 *
 * القاعدة التي تحمي الاتساق في كل النظام:
 *   `price_monthly` / `price_yearly` = **السعر المحمّل الآن** — وهما اللتان
 *   يقرأهما العقد (`planPrice`) والفاتورة وشاشات الإبرام مباشرة. لا يُنسيان.
 *   أما `list_price_*` (السعر قبل الخصم، يظهر مشطوبًا) و`discounted_price_*`
 *   (السعر المخفّض المحجوز للعودة إليه) فطبقة عرض/استرجاع فقط.
 *
 *   discount_active = true  ⇒ price_* = discounted_*
 *   discount_active = false ⇒ price_* = list_*  (والخصم يبقى محفوظًا ولا يُمس)
 *
 * «حذف الخصم» وحده يمسح الطبقتين ويعيد price_* للسعر الكامل.
 */

export interface PlanPricingLike {
  price_monthly?: unknown;
  price_yearly?: unknown;
  list_price_monthly?: unknown;
  list_price_yearly?: unknown;
  discounted_price_monthly?: unknown;
  discounted_price_yearly?: unknown;
  discount_active?: unknown;
}

/** `undefined` = الحقل لم يُرسل (اتركه كما هو) — `null` = امسحه. */
export interface PlanPricingPatch {
  price_monthly?: number | string | null;
  price_yearly?: number | string | null;
  list_price_monthly?: number | string | null;
  list_price_yearly?: number | string | null;
  discounted_price_monthly?: number | string | null;
  discounted_price_yearly?: number | string | null;
  discount_active?: boolean | string | null;
}

export interface ResolvedPlanPricing {
  price_monthly: number;
  price_yearly: number;
  list_price_monthly: number | null;
  list_price_yearly: number | null;
  discounted_price_monthly: number | null;
  discounted_price_yearly: number | null;
  discount_active: boolean;
}

function toNum(value: unknown, fallback: number | null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** الحقل المُرسَل يحل محل المخزّن؛ والحقل الغائب يبقى مخزّنًا؛ و`null` يمسح. */
function pick(incoming: unknown, stored: unknown): number | null {
  if (incoming === undefined) return toNum(stored, null);
  if (incoming === null) return null;
  return toNum(incoming, null);
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return fallback;
}

export function resolvePlanPricing(
  existing: PlanPricingLike,
  patch: PlanPricingPatch = {},
): ResolvedPlanPricing {
  const discountActive = toBool(patch.discount_active, toBool(existing.discount_active, false));

  let listMonthly = pick(patch.list_price_monthly, existing.list_price_monthly);
  let listYearly = pick(patch.list_price_yearly, existing.list_price_yearly);
  const discMonthly = pick(patch.discounted_price_monthly, existing.discounted_price_monthly);
  const discYearly = pick(patch.discounted_price_yearly, existing.discounted_price_yearly);

  const sentMonthly = patch.price_monthly === undefined ? null : toNum(patch.price_monthly, null);
  const sentYearly = patch.price_yearly === undefined ? null : toNum(patch.price_yearly, null);

  // تحرير مباشر لسعر بلا أي طبقة خصم: المقصود هو السعر الكامل نفسه.
  if (sentMonthly !== null && listMonthly === null && discMonthly === null) listMonthly = sentMonthly;
  if (sentYearly !== null && listYearly === null && discYearly === null) listYearly = sentYearly;

  const fallbackMonthly = toNum(existing.price_monthly, 0) ?? 0;
  const fallbackYearly = toNum(existing.price_yearly, 0) ?? 0;

  return {
    discount_active: discountActive,
    list_price_monthly: listMonthly,
    list_price_yearly: listYearly,
    discounted_price_monthly: discMonthly,
    discounted_price_yearly: discYearly,
    price_monthly: discountActive
      ? (discMonthly ?? listMonthly ?? sentMonthly ?? fallbackMonthly)
      : (listMonthly ?? sentMonthly ?? fallbackMonthly),
    price_yearly: discountActive
      ? (discYearly ?? listYearly ?? sentYearly ?? fallbackYearly)
      : (listYearly ?? sentYearly ?? fallbackYearly),
  };
}

/** رسالة خطأ عربية/إنجليزية صريحة، أو null حين الحالة متسقة. */
export function pricingProblem(r: ResolvedPlanPricing): string | null {
  const prices: Array<[string, number]> = [
    ['price_monthly', r.price_monthly],
    ['price_yearly', r.price_yearly],
  ];
  for (const [label, value] of prices) {
    if (!Number.isFinite(value) || value < 0) return `${label} must be a non-negative number.`;
  }
  for (const [label, value] of [
    ['list_price_monthly', r.list_price_monthly],
    ['list_price_yearly', r.list_price_yearly],
    ['discounted_price_monthly', r.discounted_price_monthly],
    ['discounted_price_yearly', r.discounted_price_yearly],
  ] as Array<[string, number | null]>) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return `${label} must be a non-negative number.`;
    }
  }
  if (!r.discount_active) return null;
  if (r.discounted_price_monthly === null && r.discounted_price_yearly === null) {
    return 'خصم مفعّل بلا سعر مخفّض: أدخل «الآن» للشهري أو السنوي أو عطّل الخصم.';
  }
  const badMonthly = r.discounted_price_monthly !== null
    && r.list_price_monthly !== null
    && r.discounted_price_monthly >= r.list_price_monthly;
  const badYearly = r.discounted_price_yearly !== null
    && r.list_price_yearly !== null
    && r.discounted_price_yearly >= r.list_price_yearly;
  if (badMonthly || badYearly) {
    return 'السعر المخفّض لازم يكون أقل من السعر قبل الخصم.';
  }
  return null;
}

/**
 * نسبة الخصم التسويقية (كم بالمئة وفّر العميل من السعر الكامل) — تُحسب من
 * الأعمدة لا من النص، فتبقى صادقة بعد كل تحرير.
 */
export function discountPercent(r: ResolvedPlanPricing): number | null {
  if (!r.discount_active) return null;
  const pairs: Array<[number | null, number | null]> = [
    [r.list_price_monthly, r.discounted_price_monthly],
    [r.list_price_yearly, r.discounted_price_yearly],
  ];
  for (const [list, discounted] of pairs) {
    if (list !== null && discounted !== null && list > 0) {
      return Math.max(0, Math.round((1 - discounted / list) * 100));
    }
  }
  return null;
}
