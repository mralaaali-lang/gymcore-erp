-- =====================================================================
-- §46 — كتالوج الباقات الجديد (قرار المالك 2026-10-17) + طبقة الخصم
--
-- 1) ثلاث باقات محل الأربع: الأساسية / المتقدمة / الشاملة، بأسعار سنوية
--    3,900 — 5,500 — 7,900 بعد خصم أسعار كتالوج 5,000 — 7,000 — 10,000.
--    الشهري = السنوي ÷ 10 (شهرين مجانًا) كما استقر البيت في 065.
-- 2) طبقة خصم على مستوى الباقة: سعر كامل (list_*) + سعر مخفّض (discounted_*)
--    + مفتاح تفعيل. price_monthly/price_yearly تظلان دائمًا «السعر المحمّل
--    الآن» لأن كل المستهلكين (العقود/الفواتير/الإبرام) يقرؤونهما مباشرة —
--    التفعيل/التعطيل ينقل القيمة بينهما، فلا رقم تاريخي يتغيّر في عقد سارٍ
--    (سعر العقد لقطة وقت التوقيع أصلًا).
-- 3) الباقات القديمة تتعطّل (is_active=false) وتبقى لعقودها السارية؛ ولا
--    backfill لعقود الـ47 صالة — بطلب المالك: كتالوج جديد + تعطيل القديمة.
-- 4) دوال المرآة (064) تتعرّف على المسميات الجديدة وإلا صار أي gym يُنشأ
--    بالتير القديم يُسند لباقة معطّلة.
--
-- Migration آمنة التكرار (idempotent) ومغلّفة في transaction واحدة.
-- =====================================================================

BEGIN;

-- ── 1) الأعمدة الجديدة ───────────────────────────────────────────────
ALTER TABLE billing_plans
  ADD COLUMN IF NOT EXISTS list_price_monthly        numeric(12,2),
  ADD COLUMN IF NOT EXISTS list_price_yearly         numeric(12,2),
  ADD COLUMN IF NOT EXISTS discounted_price_monthly  numeric(12,2),
  ADD COLUMN IF NOT EXISTS discounted_price_yearly   numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_active           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS badge                     varchar(80),
  ADD COLUMN IF NOT EXISTS badge_ar                  varchar(120),
  ADD COLUMN IF NOT EXISTS highlights                jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS highlights_en             jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN billing_plans.list_price_monthly IS '§46 السعر الكامل شهريًا قبل الخصم (يظهر مشطوبًا؛ NULL = بلا خصم)';
COMMENT ON COLUMN billing_plans.list_price_yearly IS '§46 السعر الكامل سنويًا قبل الخصم';
COMMENT ON COLUMN billing_plans.discounted_price_monthly IS '§46 السعر المخفّض شهريًا؛ يُنسخ إلى price_monthly عند تفعيل الخصم';
COMMENT ON COLUMN billing_plans.discounted_price_yearly IS '§46 السعر المخفّض سنويًا؛ يُنسخ إلى price_yearly عند تفعيل الخصم';
COMMENT ON COLUMN billing_plans.discount_active IS '§46 مفتاح الخصم: true ⇒ price_* = discounted_*، false ⇒ price_* = list_*';
COMMENT ON COLUMN billing_plans.badge_ar IS '§46 شريط على كارت الباقة (مثال: ⭐ الأكثر طلباً ⭐)';
COMMENT ON COLUMN billing_plans.highlights IS '§46 نقاط ✔️ الظهور على الكارت (نص عرض، بخلاف features.modules المستخدمة في planGuard)';

-- ── 2) الباقات القديمة: لقطة سعر كامل + تعطيل ────────────────────────
UPDATE billing_plans
   SET list_price_monthly = coalesce(list_price_monthly, price_monthly),
       list_price_yearly  = coalesce(list_price_yearly,  price_yearly),
       discount_active    = false,
       is_active          = false
 WHERE name IN ('Starter', 'Growth', 'Pro', 'Enterprise');

-- ── 3) الباقات الثلاث الجديدة ────────────────────────────────────────
-- الأساسية: عضويات + اشتراكات/مدفوعات + حضور + تقارير أساسية
INSERT INTO billing_plans
  (name, name_ar, price_monthly, price_yearly,
   list_price_monthly, list_price_yearly,
   discounted_price_monthly, discounted_price_yearly, discount_active,
   max_staff, max_members, max_gyms, max_employees, max_branches,
   has_dashboard, has_attendance, has_products, has_daily_reports,
   features, highlights, highlights_en, is_active)
VALUES
  ('Basic', 'الأساسية', 390.00, 3900.00, 500.00, 5000.00, 390.00, 3900.00, true,
   3, 300, 1, 3, 1,
   true, true, false, false,
   '{"modules": {"dashboard": true, "attendance": true, "products": false, "inventory": false, "daily_reports": false, "marketing": false, "class_booking": false, "training": false, "whatsapp": false, "white_label": false}}'::jsonb,
   '["إدارة العضويات","الاشتراكات والمدفوعات","تسجيل الحضور","التقارير الأساسية"]'::jsonb,
   '["Membership management","Subscriptions & payments","Attendance check-in","Core reports"]'::jsonb,
   true)
ON CONFLICT (name) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  list_price_monthly = EXCLUDED.list_price_monthly, list_price_yearly = EXCLUDED.list_price_yearly,
  discounted_price_monthly = EXCLUDED.discounted_price_monthly,
  discounted_price_yearly = EXCLUDED.discounted_price_yearly,
  discount_active = EXCLUDED.discount_active,
  max_staff = EXCLUDED.max_staff, max_members = EXCLUDED.max_members, max_gyms = EXCLUDED.max_gyms,
  max_employees = EXCLUDED.max_employees, max_branches = EXCLUDED.max_branches,
  has_dashboard = EXCLUDED.has_dashboard, has_attendance = EXCLUDED.has_attendance,
  has_products = EXCLUDED.has_products, has_daily_reports = EXCLUDED.has_daily_reports,
  features = EXCLUDED.features, highlights = EXCLUDED.highlights,
  highlights_en = EXCLUDED.highlights_en, is_active = EXCLUDED.is_active,
  deleted_at = NULL;

-- المتقدمة: كل الأساسية + POS + مدربون وكباتن + تقارير مالية + تنبيهات الاشتراك
INSERT INTO billing_plans
  (name, name_ar, price_monthly, price_yearly,
   list_price_monthly, list_price_yearly,
   discounted_price_monthly, discounted_price_yearly, discount_active,
   max_staff, max_members, max_gyms, max_employees, max_branches,
   has_dashboard, has_attendance, has_products, has_daily_reports,
   features, highlights, highlights_en, badge, badge_ar, is_active)
VALUES
  ('Advanced', 'المتقدمة', 550.00, 5500.00, 700.00, 7000.00, 550.00, 5500.00, true,
   10, -1, 1, 10, 1,
   true, true, true, true,
   '{"modules": {"dashboard": true, "attendance": true, "products": true, "inventory": true, "daily_reports": true, "marketing": false, "class_booking": true, "training": true, "whatsapp": false, "white_label": false}}'::jsonb,
   '["كل مميزات الباقة الأساسية","نظام مبيعات POS","إدارة المدربين والكباتن","تقارير مالية","تنبيهات الاشتراكات"]'::jsonb,
   '["Everything in Basic","POS sales system","Trainers & captains management","Financial reports","Subscription alerts"]'::jsonb,
   'Most popular', '⭐ الأكثر طلباً ⭐', true)
ON CONFLICT (name) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  list_price_monthly = EXCLUDED.list_price_monthly, list_price_yearly = EXCLUDED.list_price_yearly,
  discounted_price_monthly = EXCLUDED.discounted_price_monthly,
  discounted_price_yearly = EXCLUDED.discounted_price_yearly,
  discount_active = EXCLUDED.discount_active,
  max_staff = EXCLUDED.max_staff, max_members = EXCLUDED.max_members, max_gyms = EXCLUDED.max_gyms,
  max_employees = EXCLUDED.max_employees, max_branches = EXCLUDED.max_branches,
  has_dashboard = EXCLUDED.has_dashboard, has_attendance = EXCLUDED.has_attendance,
  has_products = EXCLUDED.has_products, has_daily_reports = EXCLUDED.has_daily_reports,
  features = EXCLUDED.features, highlights = EXCLUDED.highlights,
  highlights_en = EXCLUDED.highlights_en, badge = EXCLUDED.badge, badge_ar = EXCLUDED.badge_ar,
  is_active = EXCLUDED.is_active, deleted_at = NULL;

-- الشاملة: كل السابق + واتساب + تقارير متقدمة + هوية المنشأة + تدريب الفريق
INSERT INTO billing_plans
  (name, name_ar, price_monthly, price_yearly,
   list_price_monthly, list_price_yearly,
   discounted_price_monthly, discounted_price_yearly, discount_active,
   max_staff, max_members, max_gyms, max_employees, max_branches,
   has_dashboard, has_attendance, has_products, has_daily_reports,
   features, highlights, highlights_en, is_active)
VALUES
  ('Complete', 'الشاملة', 790.00, 7900.00, 1000.00, 10000.00, 790.00, 7900.00, true,
   -1, -1, 3, -1, 3,
   true, true, true, true,
   '{"modules": {"dashboard": true, "attendance": true, "products": true, "inventory": true, "daily_reports": true, "marketing": true, "class_booking": true, "training": true, "whatsapp": true, "white_label": true}}'::jsonb,
   '["جميع المميزات السابقة","ربط واتساب","تقارير احترافية متقدمة","تخصيص النظام باسم المنشأة","تدريب كامل للفريق"]'::jsonb,
   '["Everything in Advanced","WhatsApp integration","Advanced professional reports","White-label branding","Full team training"]'::jsonb,
   true)
ON CONFLICT (name) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly,
  list_price_monthly = EXCLUDED.list_price_monthly, list_price_yearly = EXCLUDED.list_price_yearly,
  discounted_price_monthly = EXCLUDED.discounted_price_monthly,
  discounted_price_yearly = EXCLUDED.discounted_price_yearly,
  discount_active = EXCLUDED.discount_active,
  max_staff = EXCLUDED.max_staff, max_members = EXCLUDED.max_members, max_gyms = EXCLUDED.max_gyms,
  max_employees = EXCLUDED.max_employees, max_branches = EXCLUDED.max_branches,
  has_dashboard = EXCLUDED.has_dashboard, has_attendance = EXCLUDED.has_attendance,
  has_products = EXCLUDED.has_products, has_daily_reports = EXCLUDED.has_daily_reports,
  features = EXCLUDED.features, highlights = EXCLUDED.highlights,
  highlights_en = EXCLUDED.highlights_en, is_active = EXCLUDED.is_active, deleted_at = NULL;

-- ── 4) مرآة التيراثي (064) تعرف المسميات الجديدة وتفضّل النشط ────────
CREATE OR REPLACE FUNCTION gym_plan_tier_from_name(p_plan_name TEXT)
RETURNS TEXT AS $$
  SELECT CASE lower(coalesce(p_plan_name, ''))
    WHEN 'basic' THEN 'basic'
    WHEN 'starter' THEN 'basic'
    WHEN 'advanced' THEN 'premium'
    WHEN 'growth' THEN 'premium'
    WHEN 'pro' THEN 'premium'
    WHEN 'professional' THEN 'premium'
    WHEN 'complete' THEN 'enterprise'
    WHEN 'enterprise' THEN 'enterprise'
    ELSE 'basic'
  END;
$$ LANGUAGE sql IMMUTABLE;

-- التير القديم → الخطة المفضلة، والنشطة أولًا حتى لا يُسند جديد لصالة معطّلة.
CREATE OR REPLACE FUNCTION gym_plan_id_from_tier(p_tier TEXT)
RETURNS UUID AS $$
  SELECT bp.id
  FROM billing_plans bp
  WHERE bp.deleted_at IS NULL
    AND lower(bp.name) = CASE lower(coalesce(p_tier, ''))
      WHEN 'basic' THEN 'basic'
      WHEN 'starter' THEN 'basic'
      WHEN 'premium' THEN 'advanced'
      WHEN 'professional' THEN 'advanced'
      WHEN 'pro' THEN 'advanced'
      WHEN 'growth' THEN 'advanced'
      WHEN 'enterprise' THEN 'complete'
      ELSE 'basic'
    END
  ORDER BY bp.is_active DESC, bp.price_monthly
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ── 5) حجر sanity: الكتالوج الجديد لازم يكون ثلاث باقات نشطة ──────────
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM billing_plans
   WHERE is_active AND deleted_at IS NULL
     AND name IN ('Basic', 'Advanced', 'Complete');
  IF n <> 3 THEN
    RAISE EXCEPTION '079: catalog incomplete — found % active new plan(s), expected 3', n
      USING ERRCODE = 'raise_exception';
  END IF;
END $$;

COMMIT;
