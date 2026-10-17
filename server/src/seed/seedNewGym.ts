import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';

const OFFER_TEMPLATES = [
  { title: 'شهر واحد', duration_days: 30, price: 200 },
  { title: '3 أشهر', duration_days: 90, price: 500 },
  { title: '6 أشهر', duration_days: 180, price: 900 },
  { title: 'سنة كاملة', duration_days: 365, price: 1500 },
];

// نفس السبعة الافتراضية في migration 074 — البذرة الحية للكتالوج
export const DEFAULT_SPORTS = [
  { code: 'gym', name_ar: 'جيم', icon: 'fitness_center', color: '#f97316', sort_order: 1 },
  { code: 'cardio', name_ar: 'كارديو', icon: 'favorite', color: '#ef4444', sort_order: 2 },
  { code: 'boxing', name_ar: 'ملاكمة', icon: 'sports_mma', color: '#8b5cf6', sort_order: 3 },
  { code: 'kickboxing', name_ar: 'كيك بوكسينج', icon: 'bolt', color: '#eab308', sort_order: 4 },
  { code: 'swimming', name_ar: 'سباحة', icon: 'pool', color: '#0ea5e9', sort_order: 5 },
  { code: 'crossfit', name_ar: 'كروس فيت', icon: 'directions_run', color: '#22c55e', sort_order: 6 },
  { code: 'yoga', name_ar: 'يوجا', icon: 'self_improvement', color: '#14b8a6', sort_order: 7 },
];

export async function seedDefaultSports(client: PoolClient, gymId: string): Promise<void> {
  for (const s of DEFAULT_SPORTS) {
    await client.query(
      `INSERT INTO gym_sports (id, gym_id, code, name_ar, icon, color, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (gym_id, code) DO NOTHING`,
      [uuidv4(), gymId, s.code, s.name_ar, s.icon, s.color, s.sort_order],
    );
  }
}

/**
 * Seeds the standard membership-offer catalog for a gym. This is operating
 * catalog data (NOT demo junk): without it createMember(plan_id) can never
 * succeed and members can never hold a subscription — which blocks manual
 * check-in entirely ("no active subscription found").
 * Returns the created offer ids so callers can reference them.
 *
 * ⚠️ لا نداء عاري لها بعد §55: كل الطرق (المعالج الذاتي، شاشة إضافة صالة،
 * التصفير المصنعي) تمرّ عبر `seedFactoryCatalog` — وهي التي تضيف الألعاب
 * وتحرُس التكرار. لو أضفت نداءً مباشرًا، اسأل أولًا: هل الكتالوج أُفرغ
 * فعلًا؟ بلا ذلك ستضاعف العروض.
 */
export async function seedDefaultOffers(client: PoolClient, gymId: string): Promise<string[]> {
  const offerIds: string[] = [];
  for (const tmpl of OFFER_TEMPLATES) {
    const offerId = uuidv4();
    offerIds.push(offerId);
    await client.query(
      `INSERT INTO membership_offers (id, gym_id, title, duration_days, price, is_active, sport)
       VALUES ($1, $2, $3, $4, $5, true, 'gym')`,
      [offerId, gymId, tmpl.title, tmpl.duration_days, tmpl.price],
    );
  }
  return offerIds;
}

/**
 * §55 — كتالوج اليوم صفر الوحيد لكل طرق إنشاء الصالة.
 *
 * القرار: صفر بيانات تجريبية، لكن **الكتالوج التشغيلي مطلوب** — وإلا الصالة
 * المفتوحة حديثًا ما تقدر تسجّل عضوًا على باقة (`createMember(plan_id)`) ولا
 * تعمل check-in («no active subscription found»). قبل التوحيد كان المعالج
 * الذاتي (onboarding) يبذر العروض الأربعة، بينما شاشة «إضافة صالة» في
 * المنصة ما تبذرش شيئًا — فصارت صالة منشأة من المنصة تفتح بـ0 عروض و0 ألعاب
 * (مقيس على `zz-fresh-mvbuhpxa`) وصالة منشأة بالمعالج تفتح بـ4 عروض.
 *
 * تاريخ: النسخة القديمة من هذا الملف كانت تحقن 15 عضوًا مختلقًا (أسماء
 * وأرقام `+966…` وصور `ui-avatars.com`) باشتراكات نشطة و7 أيام حضور + 6
 * منتجات + 4 فئات مصروفات، وترفع `gym_usage_counters.current_members_count`
 * إلى 15 — أي ديمو في مسار إنتاجي. ده راح ولن يرجع: الدالة دي **كتالوج
 * فقط**، ولا عضو ولا حضور ولا منتج.
 *
 * آمنة على التكرار: الألعاب بـ`ON CONFLICT DO NOTHING`، والعروض تُتخطّى إن
 * كان للصالة أي عرض موجود (فإعادة التشغيل أو إنشاء صالة بعد تنقية يدوية
 * ما يضاعفش الكتالوج). تُنادى داخل نفس transaction الإنشاء — لو البذر فشل
 * يفشل الإنشاء كله ويتلفّ، بدل fire-and-forget كان يبلع الخطأ بصمت.
 */
export async function seedFactoryCatalog(client: PoolClient, gymId: string): Promise<void> {
  await seedDefaultSports(client, gymId);

  const existingOffers = await client.query(
    `SELECT 1 FROM membership_offers WHERE gym_id = $1 LIMIT 1`,
    [gymId],
  );
  if (existingOffers.rowCount === 0) {
    await seedDefaultOffers(client, gymId);
  }
}


