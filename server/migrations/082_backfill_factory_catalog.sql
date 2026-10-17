-- =====================================================================
-- §55 — توحيد كتالوج اليوم صفر: تبذر الصالات اللي اتعملت من غير بذر
--
-- العيب: طرق إنشاء الصالة كانت متشعبة. المعالج الذاتي (onboarding.ts) كان
-- يبذر العروض الأربعة، بينما شاشة «إضافة صالة» في المنصة (platformGyms.ts)
-- كانت تنادي `seedNewGym` وهي بلاستيكية (سطر log وبس) — فأي صالة اتعملت من
-- المنصة فتحت بـ0 ألعاب و0 عروض. النتيجة العملية: `createMember(plan_id)`
-- يفشل، والعضو ما ياخدش اشتراك، والـcheck-in اليدوي يرفض
-- («no active subscription found»). الصالات الجديدة اتوحشت في الكود (التقرير §55).
--
-- هذه الـmigration بتقفل الشق الثاني: **الصفوف القائمة**. البذر محصور في
-- الصالات النشطة اللي **لا لعبة واحدة ولا عرض واحد** عندها — وهي بصمة
-- «ما اتبذرتش قط» (التصفير المصنعي بيحذف الاتنين ثم يبذرهما، فأي صالة
-- متصفرة ليها sports وoffers مع بعض). صالة فيها عروض وقليلة ألعاب ما تتلمسش:
-- ده حالة تحرير بشري مش حالة بذر.
--
-- ⚠️ القيم هنا توأم `server/src/seed/seedNewGym.ts` (DEFAULT_SPORTS و
--    OFFER_TEMPLATES) — أي تغيير في الأسعار/المدة/الألعاب يتعدّل في الاتنين
--    في نفس الـcommit، وإلا الصالة الجديدة دي بتبذر حاجة والصالة القديمة
--    بترجع لحاجة تانية.
--    الألعاب نفسها هي السبعة الافتراضية في `074_gym_sports.sql`.
--
-- بيانات تجريبية: صفر. لا أعضاء، لا حضور، لا منتجات، لا مصروفات — كتالوج
-- تشغيلي فقط.
--
-- رول باك (للأمام فقط؛ مش متنفّذ هنا): لو اتطلب التراجع، احذف السطور اللي
-- ما اتلمستش يدويًا للصالات المستهدفة:
--   DELETE FROM membership_offers
--   WHERE gym_id IN (<نفس قائمة الهدف>)
--     AND sport = 'gym' AND title IN ('شهر واحد','3 أشهر','6 أشهر','سنة كاملة')
--     AND total_sessions IS NULL;
--   DELETE FROM gym_sports WHERE gym_id IN (<نفس قائمة الهدف>)
--     AND code IN ('gym','cardio','boxing','kickboxing','swimming','crossfit','yoga');
-- =====================================================================

BEGIN;

-- الهدف يُحسب **مرة واحدة**: لو اتحسب تاني بعد إدراج الألعاب، الشرط
-- «ولا عرض ولا لعبة» هيصير خاطئ وما تندرجش العروض.
CREATE TEMP TABLE _082_unseeded_gyms ON COMMIT DROP AS
SELECT g.id
FROM gyms g
WHERE g.is_active
  AND NOT EXISTS (SELECT 1 FROM gym_sports s WHERE s.gym_id = g.id)
  AND NOT EXISTS (SELECT 1 FROM membership_offers o WHERE o.gym_id = g.id);

-- ── 1) الألعاب السبعة الافتراضية ───────────────────────────────────
INSERT INTO gym_sports (gym_id, code, name_ar, icon, color, sort_order, is_active)
SELECT t.id, d.code, d.name_ar, d.icon, d.color, d.sort_order, true
FROM _082_unseeded_gyms t
CROSS JOIN (VALUES
  ('gym',        'جيم',         'fitness_center',  '#f97316', 1),
  ('cardio',     'كارديو',      'favorite',        '#ef4444', 2),
  ('boxing',     'ملاكمة',      'sports_mma',      '#8b5cf6', 3),
  ('kickboxing', 'كيك بوكسينج', 'bolt',            '#eab308', 4),
  ('swimming',   'سباحة',       'pool',            '#0ea5e9', 5),
  ('crossfit',   'كروس فيت',    'directions_run',  '#22c55e', 6),
  ('yoga',       'يوجا',        'self_improvement','#14b8a6', 7)
) AS d(code, name_ar, icon, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM gym_sports s WHERE s.gym_id = t.id AND s.code = d.code
);

-- ── 2) العروض الأربعة الافتراضية ───────────────────────────────────
INSERT INTO membership_offers (gym_id, title, duration_days, price, is_active, sport)
SELECT t.id, d.title, d.duration_days, d.price::numeric, true, 'gym'
FROM _082_unseeded_gyms t
CROSS JOIN (VALUES
  ('شهر واحد',  30, 200),
  ('3 أشهر',    90, 500),
  ('6 أشهر',   180, 900),
  ('سنة كاملة', 365, 1500)
) AS d(title, duration_days, price);

COMMIT;
