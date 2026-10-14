-- §33-توحيد: باقة الصالة مصدرها الوحيد billing_plans عبر gyms.plan_id
-- 1) أعمدة gyms.email/address_city/address_zip تصبح تخزينًا فعليًا (كان المعالج يجمعها ولا يخزنها).
-- 2) backfill: كل gym بـ plan_id NULL تأخذ خطتها من plan_tier القديم (basic→Starter، premium→Pro، enterprise→Enterprise).
-- 3) plan_tier يصير مرآة مشتقة: trigger مازج يمنع أي تعارض بين العمودين إلى الأبد —
--    الكود لا يعود مصدر حقيقة للباقة؛ billing_plans هو الحقيقة، وplanGuard يظل يعمل على plan_id.
-- 4) email يُملأ من بريد مدير الصالة الأول حيث لا بريد مخزن (بيانات فعلية لا وهمية).

-- ── الأعمدة الجديدة ────────────────────────────────────────────────
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS address_city VARCHAR(255);
ALTER TABLE gyms ADD COLUMN IF NOT EXISTS address_zip VARCHAR(20);

-- ── دوال المطابقة (اسم خطة ↔ تيراثي قديم) ─────────────────────────
CREATE OR REPLACE FUNCTION gym_plan_tier_from_name(p_plan_name TEXT)
RETURNS TEXT AS $$
  SELECT CASE lower(coalesce(p_plan_name, ''))
    WHEN 'starter' THEN 'basic'
    WHEN 'growth' THEN 'premium'
    WHEN 'pro' THEN 'premium'
    WHEN 'professional' THEN 'premium'
    WHEN 'enterprise' THEN 'enterprise'
    ELSE 'basic'
  END;
$$ LANGUAGE sql IMMUTABLE;

-- التير القديم → الخطة المفضلة عند التفاوض (premium→Pro كما استقر القرار).
CREATE OR REPLACE FUNCTION gym_plan_id_from_tier(p_tier TEXT)
RETURNS UUID AS $$
  SELECT bp.id
  FROM billing_plans bp
  WHERE lower(bp.name) = CASE lower(coalesce(p_tier, ''))
    WHEN 'basic' THEN 'starter'
    WHEN 'starter' THEN 'starter'
    WHEN 'premium' THEN 'pro'
    WHEN 'professional' THEN 'pro'
    WHEN 'pro' THEN 'pro'
    WHEN 'growth' THEN 'growth'
    WHEN 'enterprise' THEN 'enterprise'
    ELSE 'starter'
  END
  ORDER BY bp.price_monthly
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ── backfill للصفوف القائمة ────────────────────────────────────────
UPDATE gyms g
SET plan_id = gym_plan_id_from_tier(g.plan_tier)
WHERE g.plan_id IS NULL;

UPDATE gyms g
SET plan_tier = gym_plan_tier_from_name(bp.name)
FROM billing_plans bp
WHERE bp.id = g.plan_id
  AND g.plan_tier IS DISTINCT FROM gym_plan_tier_from_name(bp.name);

UPDATE gyms g
SET email = m.email
FROM (
  SELECT DISTINCT ON (s.gym_id) s.gym_id, s.email
  FROM staff_users s
  WHERE s.role = 'manager'
  ORDER BY s.gym_id, s.created_at ASC
) m
WHERE m.gym_id = g.id AND g.email IS NULL;

-- ──Trigger المازج: plan_id يحدد plan_tier، والعكس عند الكتابة بالتير القديم ──
CREATE OR REPLACE FUNCTION sync_gym_plan_columns()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.plan_id IS NOT NULL THEN
      NEW.plan_tier := gym_plan_tier_from_name((SELECT name FROM billing_plans WHERE id = NEW.plan_id));
    ELSE
      NEW.plan_tier := coalesce(lower(nullif(NEW.plan_tier, '')), 'basic');
      NEW.plan_id := gym_plan_id_from_tier(NEW.plan_tier);
    END IF;
  ELSE
    IF OLD.plan_id IS DISTINCT FROM NEW.plan_id THEN
      IF NEW.plan_id IS NOT NULL THEN
        NEW.plan_tier := gym_plan_tier_from_name((SELECT name FROM billing_plans WHERE id = NEW.plan_id));
      END IF;
    ELSIF OLD.plan_tier IS DISTINCT FROM NEW.plan_tier THEN
      NEW.plan_id := gym_plan_id_from_tier(NEW.plan_tier);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gyms_plan_sync ON gyms;
CREATE TRIGGER trg_gyms_plan_sync
BEFORE INSERT OR UPDATE ON gyms
FOR EACH ROW EXECUTE FUNCTION sync_gym_plan_columns();

-- فهرس جزئي للاستعلامات التي تعمل بالخطة المشتقة.
CREATE INDEX IF NOT EXISTS idx_gyms_plan_tier ON gyms (plan_tier) WHERE plan_tier IS NOT NULL;
