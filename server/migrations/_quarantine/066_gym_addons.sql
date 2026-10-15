-- =====================================================================
-- 066: الوحدات والإضافات (قرار المستخدم 2026-10-14)
-- الجداول billing_addons / gym_addons موجودة منذ حزمة الباقات القديمة
-- (2026-10-11) بلا أي كود يستخدمها — هنا نوسّعها بدل إنشاء نسخة:
--   billing_addons += مفاتيح موديولات + رفع حدود + أسعار شهرية/سنوية
--   gym_addons     += سعر مخفّض لكل صالة + دورة + حالة ساري/ملغى + مانح
-- ثم دوال «الخطة الفعّالة»: موديولات الباقة true + إضافات سارية + overrides.
-- لا يُمس أي حد/سعر في billing_plans. الصفوف القديمة الثلاثة تبقى صالحة.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1) الكتالوج: توسيع billing_addons
-- =====================================================================
ALTER TABLE billing_addons ADD COLUMN IF NOT EXISTS module_keys   jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE billing_addons ADD COLUMN IF NOT EXISTS limit_column  varchar(20);
ALTER TABLE billing_addons ADD COLUMN IF NOT EXISTS limit_amount  integer;
ALTER TABLE billing_addons ADD COLUMN IF NOT EXISTS price_monthly numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE billing_addons ADD COLUMN IF NOT EXISTS price_yearly  numeric(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_addons_limit_column_check') THEN
    ALTER TABLE billing_addons
      ADD CONSTRAINT billing_addons_limit_column_check
      CHECK (limit_column IS NULL OR limit_column IN ('max_members','max_staff'));
  END IF;
END $$;

-- =====================================================================
-- 2) الإسناد: توسيع gym_addons (إلغاء = status ملغى مع إبقاء الأثر)
-- =====================================================================
ALTER TABLE gym_addons ADD COLUMN IF NOT EXISTS price_charged numeric(10,2);
ALTER TABLE gym_addons ADD COLUMN IF NOT EXISTS cycle         varchar(10) NOT NULL DEFAULT 'monthly';
ALTER TABLE gym_addons ADD COLUMN IF NOT EXISTS status        varchar(10) NOT NULL DEFAULT 'active';
ALTER TABLE gym_addons ADD COLUMN IF NOT EXISTS notes         text;
ALTER TABLE gym_addons ADD COLUMN IF NOT EXISTS granted_by    uuid REFERENCES platform_admins(id) ON DELETE SET NULL;
ALTER TABLE gym_addons ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gym_addons_cycle_check') THEN
    ALTER TABLE gym_addons ADD CONSTRAINT gym_addons_cycle_check CHECK (cycle IN ('monthly','yearly'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gym_addons_status_check') THEN
    ALTER TABLE gym_addons ADD CONSTRAINT gym_addons_status_check CHECK (status IN ('active','cancelled'));
  END IF;
END $$;

-- القيد القديم يمنع أي إعادة إسناد بعد الإلغاء → استبدال بقيد جزئي على الساري فقط
ALTER TABLE gym_addons DROP CONSTRAINT IF EXISTS gym_addons_gym_id_addon_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gym_addons_active
  ON gym_addons (gym_id, addon_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_gym_addons_gym ON gym_addons (gym_id);

-- سعر مخفّض افتراضيًا = سعر الكتالوج حسب الدورة (للقديمة بلا سعر شهري/سنوي)
UPDATE gym_addons
   SET price_charged = price
  WHERE price_charged IS NULL;
ALTER TABLE gym_addons ALTER COLUMN price_charged SET NOT NULL;

-- =====================================================================
-- 3) الإسنادات الحية (السارية غير المنتهية) — مصدر وحيد للقراءات
-- =====================================================================
CREATE OR REPLACE FUNCTION gym_live_addons(p_gym_id uuid)
RETURNS TABLE (addon_id uuid, module_key text, limit_column text, limit_amount int) AS $$
  SELECT ga.addon_id,
         mk.k,
         ba.limit_column,
         ba.limit_amount
  FROM gym_addons ga
  JOIN billing_addons ba ON ba.id = ga.addon_id AND ba.is_active
  LEFT JOIN LATERAL jsonb_array_elements_text(ba.module_keys) AS mk(k) ON true
  WHERE ga.gym_id = p_gym_id
    AND ga.status = 'active'
    AND (ga.expires_at IS NULL OR ga.expires_at >= NOW());
$$ LANGUAGE sql STABLE;

-- =====================================================================
-- 4) الخطة الفعّالة للخصائص: موديولات الباقة true + إضافات الصالة + overrides
-- (union بلا طرح — لا يمكن لسند أن يحذف ميزة مضمّنة في الباقة؛
--  الإلغاء يوقف الإضافات فقط.)
-- =====================================================================
CREATE OR REPLACE FUNCTION gym_effective_features(p_gym_id uuid)
RETURNS text[] AS $$
DECLARE
  feat text[] := ARRAY[]::text[];
  mods jsonb;
BEGIN
  -- 1) موديولات الباقة (features.modules = {"products": false, ...})
  SELECT p.features -> 'modules' INTO mods
  FROM gyms g JOIN billing_plans p ON p.id = g.plan_id
  WHERE g.id = p_gym_id;

  IF jsonb_typeof(mods) = 'object' THEN
    SELECT feat || coalesce(array_agg(k), ARRAY[]::text[]) INTO feat
    FROM jsonb_each_text(mods) AS e(k, v)
    WHERE lower(trim(v)) = 'true';
  END IF;

  -- 2) مفاتيح إضافات الصالة السارية
  SELECT feat || coalesce(array_agg(DISTINCT la.module_key), ARRAY[]::text[]) INTO feat
  FROM gym_live_addons(p_gym_id) la
  WHERE la.module_key IS NOT NULL AND la.module_key <> '';

  -- 3) overrides القديمة في gyms.features (jsonb مصفوفة)
  SELECT feat || coalesce(array_agg(t.k), ARRAY[]::text[]) INTO feat
  FROM gyms g
  LEFT JOIN LATERAL jsonb_array_elements_text(g.features) AS t(k) ON true
  WHERE g.id = p_gym_id AND jsonb_typeof(g.features) = 'array';

  RETURN (SELECT coalesce(array_agg(DISTINCT u), ARRAY[]::text[]) FROM unnest(feat) AS u);
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================================
-- 5) الحد الفعّال (max_X من الباقة + مجموع إضافات المقاعد السارية)
-- -1 في الباقة = غير محدود، يبقى -1.
-- =====================================================================
CREATE OR REPLACE FUNCTION gym_effective_limit(p_gym_id uuid, p_column text)
RETURNS integer AS $$
DECLARE
  base integer;
  extra integer;
BEGIN
  IF p_column = 'max_members' THEN
    SELECT p.max_members INTO base FROM gyms g JOIN billing_plans p ON p.id = g.plan_id WHERE g.id = p_gym_id;
  ELSIF p_column = 'max_staff' THEN
    SELECT p.max_staff INTO base FROM gyms g JOIN billing_plans p ON p.id = g.plan_id WHERE g.id = p_gym_id;
  ELSE
    RETURN 0;
  END IF;

  IF base IS NULL OR base < 0 THEN
    RETURN coalesce(base, -1);
  END IF;

  SELECT coalesce(sum(la.limit_amount), 0) INTO extra
  FROM gym_live_addons(p_gym_id) la
  WHERE la.limit_column = p_column;

  RETURN base + extra;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================================
-- 6) الكتالوج الأولي (أسعار افتراضية قابلة للتعديل من شاشة السوبر-أدمن)
-- المتجر يفعّل products + inventory معًا (رابطا POST /api/products و
-- POST /api/finance/purchases تحتاجهما).
-- =====================================================================
INSERT INTO billing_addons (code, name, name_ar, pricing_type, price, module_keys, price_monthly, price_yearly)
VALUES
  ('store',         'Store (POS & Inventory)', 'المتجر (نقاط بيع ومخزون)',    'subscription', 250.00, '["products","inventory"]'::jsonb, 250.00, 2500.00),
  ('daily_reports', 'Daily Reports',            'التقارير اليومية',            'subscription', 150.00, '["daily_reports"]'::jsonb,          150.00, 1500.00),
  ('marketing',     'Marketing & Leads',        'التسويق والعملاء المحتملون', 'subscription', 200.00, '["marketing"]'::jsonb,                200.00, 2000.00),
  ('attendance',    'Attendance & Check-in',    'الحضور والانصراف',            'subscription', 150.00, '["attendance"]'::jsonb,               150.00, 1500.00),
  ('extra_members', '+200 Member Slots',        '+200 عضو',                    'subscription', 200.00, '[]'::jsonb, 'max_members', 200,      200.00, 2000.00),
  ('extra_staff',   '+3 Staff Seats',           '+3 موظفين',                   'subscription', 150.00, '[]'::jsonb, 'max_staff',   3,         150.00, 1500.00)
ON CONFLICT (code) DO NOTHING;

COMMIT;
