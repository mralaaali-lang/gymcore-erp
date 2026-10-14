-- =====================================================================
-- 068: نموذج العقود الاحترافي بدل نظام الإسناد اليدوي (بند المالك 2026-10-14:
-- «مفضلتش نظام الإسناد — عايز الشغل احترافي أكتر» + «تغيير شامل حتى التصميم»).
--
-- الحقيقة الجديدة: platform_contracts = عقد التعاقد بين المنصة والصالة
-- (باقة + دورة + سعر ملتقط لحظته + تجديد + حالة) وplatform_contract_addons
-- = بنود الوحدات فوق العقد (سعر وحدة + كمية + سريان). billing_invoices
-- يُربط بالعقد (contract_id) فتصبح الفاتورة الدورية دليل تحصيل لا رقمًا طائرًا.
--
-- دوال «الخطة الفعّالة» (066) تعاد كتابتها لتقرأ من العقد أولًا مع fallback
-- لـ gyms.plan_id (توافق صالات لم تُعقَد بعد). الـbackfill يعقد كل صالة لها
-- خطة، ويرحّل إسنادات gym_addons الحالية (NONOGYM: 2) إلى بنود عقد.
-- gyms.plan_id تصبح مرآة للعقد الساري (trigger) حتى تستمر سلسلة 064
-- (plan_tier mirror) دون قطع.
--
-- down (يدويًا عند الحاجة):
--   DROP TRIGGER trg_contract_sync_gym_plan ON platform_contracts;
--   DROP FUNCTION sync_gym_plan_from_contract();
--   إعادة تعريف دوال 066 الثلاثة بنسخها الأصلية؛
--   ALTER TABLE billing_invoices DROP COLUMN contract_id;
--   DROP TABLE platform_contract_addons; DROP TABLE platform_contracts;
--   استعادة قيد audit_action_valid القديم (CREATE/UPDATE/DELETE/DEACTIVATE).
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1) العقد
-- =====================================================================
CREATE TABLE IF NOT EXISTS platform_contracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  plan_id       uuid NOT NULL REFERENCES billing_plans(id),
  cycle         varchar(10) NOT NULL CHECK (cycle IN ('monthly','yearly')),
  price         numeric(12,2) NOT NULL CHECK (price >= 0),
  currency      varchar(10) NOT NULL DEFAULT 'EGP',
  status        varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  start_date    date NOT NULL DEFAULT CURRENT_DATE,
  renewal_date  date,
  auto_renew    boolean NOT NULL DEFAULT true,
  notes         text,
  created_by    uuid REFERENCES platform_admins(id) ON DELETE SET NULL,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_one_active_per_gym
  ON platform_contracts (gym_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contracts_gym ON platform_contracts (gym_id);
CREATE INDEX IF NOT EXISTS idx_contracts_renewal
  ON platform_contracts (renewal_date) WHERE status = 'active';

-- =====================================================================
-- 2) بنود الوحدات فوق العقد (البديل الرسمي لإسناد gym_addons)
--    price_charged القديم كان إجمالي الفترة؛ unit_price = إجمالي/كمية.
-- =====================================================================
CREATE TABLE IF NOT EXISTS platform_contract_addons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES platform_contracts(id) ON DELETE CASCADE,
  addon_id     uuid NOT NULL REFERENCES billing_addons(id),
  quantity     integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price   numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  cycle        varchar(10) NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly','yearly')),
  status       varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  started_at   date NOT NULL DEFAULT CURRENT_DATE,
  expires_at   date,
  cancelled_at timestamptz,
  notes        text,
  added_by     uuid REFERENCES platform_admins(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_addons_active
  ON platform_contract_addons (contract_id, addon_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contract_addons_contract
  ON platform_contract_addons (contract_id);

-- الفاتورة الدورية للمنصة←الصالة تُنسب لعقدها
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS contract_id
  uuid REFERENCES platform_contracts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_billing_invoices_contract
  ON billing_invoices (contract_id) WHERE contract_id IS NOT NULL;

-- =====================================================================
-- 3) قيد الإجراءات في سجل التدقيق: التوسيع من 4 قيم إلى العمليات الحقيقية
-- =====================================================================
ALTER TABLE platform_audit_logs DROP CONSTRAINT IF EXISTS audit_action_valid;
ALTER TABLE platform_audit_logs ADD CONSTRAINT audit_action_valid CHECK (
  action_type IN ('CREATE','UPDATE','DELETE','DEACTIVATE','ACTIVATE','CANCEL',
                  'RENEW','IMPERSONATE','ISSUE','MARK_PAID','GRANT','REVOKE',
                  'LOGIN','LOGOUT','2FA_ENABLE','2FA_DISABLE','SETTINGS_UPDATE',
                  'FEATURE_FLAG_UPDATE','BROADCAST','TICKET_UPDATE')
);
-- الفاعلsystemي (cron/إنشاء ذاتي) بلا سوبر-أدمان → actor_id يصبح nullable
-- (يبقى FK لمنصة الأدمنين عند وجوده)
ALTER TABLE platform_audit_logs ALTER COLUMN actor_id DROP NOT NULL;

-- =====================================================================
-- 4) Backfill: عقد سارٍ لكل صالة لها خطة (سعر لحظة الترحيل = الكتالوج)
-- =====================================================================
INSERT INTO platform_contracts (gym_id, plan_id, cycle, price, currency, status,
                                start_date, renewal_date, auto_renew, notes)
SELECT g.id, g.plan_id, 'monthly',
       coalesce(p.price_monthly, 0),
       coalesce(nullif(g.currency, ''), 'EGP'),
       'active',
       coalesce(g.created_at::date, CURRENT_DATE),
       (coalesce(g.created_at::date, CURRENT_DATE) + interval '1 month')::date,
       true,
       'backfill 068 — عقد آلي من gyms.plan_id (لم يكن هناك سجل تعاقد)'
FROM gyms g
JOIN billing_plans p ON p.id = g.plan_id
WHERE g.plan_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM platform_contracts c WHERE c.gym_id = g.id);

-- =====================================================================
-- 5) ترحيل إسنادات gym_addons (§36) إلى بنود العقد الساري لصالتها
-- =====================================================================
INSERT INTO platform_contract_addons (contract_id, addon_id, quantity, unit_price,
                                      cycle, status, started_at, expires_at, notes, added_by)
SELECT c.id, ga.addon_id,
       greatest(coalesce(ga.quantity, 1), 1),
       round(coalesce(ga.price_charged, 0) / greatest(coalesce(ga.quantity, 1), 1), 2),
       coalesce(ga.cycle, 'monthly'),
       ga.status,
       coalesce(ga.purchased_at::date, CURRENT_DATE),
       ga.expires_at::date,
       'backfill 068 — مرحّل من gym_addons (§36)',
       ga.granted_by
FROM gym_addons ga
JOIN platform_contracts c ON c.gym_id = ga.gym_id AND c.status = 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_contract_addons pca
  WHERE pca.contract_id = c.id AND pca.addon_id = ga.addon_id AND pca.status = 'active');

-- gym_addons تصبح أثرًا تاريخيًا فقط: لا كود يقرأها ولا يكتبها بعد اليوم.
COMMENT ON TABLE gym_addons IS 'DEPRECATED (068): استُبدلت ببنود العقود platform_contract_addons — للرجع فقط';

-- =====================================================================
-- 6) دوال الحقيقة الفعّالة — العقد أولًا، ثم fallback لمرآة gyms.plan_id
-- =====================================================================
CREATE OR REPLACE FUNCTION gym_active_contract(p_gym_id uuid)
RETURNS platform_contracts AS $$
  SELECT c.* FROM platform_contracts c
  WHERE c.gym_id = p_gym_id AND c.status = 'active'
  ORDER BY c.created_at DESC LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION gym_plan_id_effective(p_gym_id uuid)
RETURNS uuid AS $$
  SELECT coalesce(
    (SELECT c.plan_id FROM platform_contracts c
      WHERE c.gym_id = p_gym_id AND c.status = 'active' LIMIT 1),
    (SELECT g.plan_id FROM gyms g WHERE g.id = p_gym_id));
$$ LANGUAGE sql STABLE;

-- نفس التوقيع القديم (addon_id, module_key, limit_column, limit_amount)
-- حتى لا ينفجر أي مستهلك؛ المصادر صارت بنود العقود.
CREATE OR REPLACE FUNCTION gym_live_addons(p_gym_id uuid)
RETURNS TABLE (addon_id uuid, module_key text, limit_column text, limit_amount int) AS $$
  SELECT pca.addon_id,
         mk.k,
         ba.limit_column,
         ba.limit_amount
  FROM platform_contract_addons pca
  JOIN platform_contracts c ON c.id = pca.contract_id AND c.status = 'active'
  JOIN billing_addons ba ON ba.id = pca.addon_id AND ba.is_active
  LEFT JOIN LATERAL jsonb_array_elements_text(ba.module_keys) AS mk(k) ON true
  WHERE c.gym_id = p_gym_id
    AND pca.status = 'active'
    AND (pca.expires_at IS NULL OR pca.expires_at >= CURRENT_DATE);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION gym_effective_features(p_gym_id uuid)
RETURNS text[] AS $$
DECLARE
  feat text[] := ARRAY[]::text[];
  mods jsonb;
  pid  uuid;
BEGIN
  -- 1) موديولات الباقة من العقد الساري (أو المرآة عند غياب عقد)
  pid := gym_plan_id_effective(p_gym_id);
  SELECT p.features -> 'modules' INTO mods
  FROM billing_plans p WHERE p.id = pid;

  IF jsonb_typeof(mods) = 'object' THEN
    SELECT feat || coalesce(array_agg(k), ARRAY[]::text[]) INTO feat
    FROM jsonb_each_text(mods) AS e(k, v)
    WHERE lower(trim(v)) = 'true';
  END IF;

  -- 2) مفاتيح بنود العقد السارية
  SELECT feat || coalesce(array_agg(DISTINCT la.module_key), ARRAY[]::text[]) INTO feat
  FROM gym_live_addons(p_gym_id) la
  WHERE la.module_key IS NOT NULL AND la.module_key <> '';

  -- 3) overrides القديمة في gyms.features (توافق حتى تُنظف)
  SELECT feat || coalesce(array_agg(t.k), ARRAY[]::text[]) INTO feat
  FROM gyms g
  LEFT JOIN LATERAL jsonb_array_elements_text(g.features) AS t(k)
    ON jsonb_typeof(g.features) = 'array'
  WHERE g.id = p_gym_id AND t.k IS NOT NULL;

  RETURN (SELECT coalesce(array_agg(DISTINCT u), ARRAY[]::text[]) FROM unnest(feat) AS u);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION gym_effective_limit(p_gym_id uuid, p_column text)
RETURNS integer AS $$
DECLARE
  base  integer;
  extra integer;
BEGIN
  IF p_column NOT IN ('max_members','max_staff') THEN
    RETURN 0;
  END IF;

  IF p_column = 'max_members' THEN
    SELECT p.max_members INTO base
    FROM billing_plans p WHERE p.id = gym_plan_id_effective(p_gym_id);
  ELSE
    SELECT p.max_staff INTO base
    FROM billing_plans p WHERE p.id = gym_plan_id_effective(p_gym_id);
  END IF;

  IF base IS NULL OR base < 0 THEN
    RETURN coalesce(base, -1);
  END IF;

  -- الكمية مضروبة في المقاعد المضافة (بنود العقد بالسعر والكمية)
  SELECT coalesce(sum(ba.limit_amount * pca.quantity), 0) INTO extra
  FROM platform_contract_addons pca
  JOIN platform_contracts c ON c.id = pca.contract_id AND c.status = 'active'
  JOIN billing_addons ba ON ba.id = pca.addon_id AND ba.is_active
  WHERE c.gym_id = p_gym_id
    AND pca.status = 'active'
    AND (pca.expires_at IS NULL OR pca.expires_at >= CURRENT_DATE)
    AND ba.limit_column = p_column;

  RETURN base + extra;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================================
-- 7) المرآة: gyms.plan_id يتابع العقد الساري (تستمر سلسلة 064 plan_tier)
-- =====================================================================
CREATE OR REPLACE FUNCTION sync_gym_plan_from_contract()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE gyms SET plan_id = NULL
    WHERE id = OLD.gym_id
      AND NOT EXISTS (SELECT 1 FROM platform_contracts c
                      WHERE c.gym_id = OLD.gym_id AND c.status = 'active');
    RETURN OLD;
  END IF;

  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' OR NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
      UPDATE gyms SET plan_id = NEW.plan_id WHERE id = NEW.gym_id;
    END IF;
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'active' AND NEW.status <> 'active') THEN
    UPDATE gyms SET plan_id = NULL
    WHERE id = NEW.gym_id
      AND NOT EXISTS (SELECT 1 FROM platform_contracts c
                      WHERE c.gym_id = NEW.gym_id AND c.status = 'active');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_sync_gym_plan ON platform_contracts;
CREATE TRIGGER trg_contract_sync_gym_plan
AFTER INSERT OR UPDATE OR DELETE ON platform_contracts
FOR EACH ROW EXECUTE FUNCTION sync_gym_plan_from_contract();

-- updated_at تلقائي للجدولين
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contracts_touch ON platform_contracts;
CREATE TRIGGER trg_contracts_touch BEFORE UPDATE ON platform_contracts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_contract_addons_touch ON platform_contract_addons;
CREATE TRIGGER trg_contract_addons_touch BEFORE UPDATE ON platform_contract_addons
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =====================================================================
-- 8) أمني (§34ج-أ): تنقية onboarding_data من أي أسرار نصية مخزنة سابقًا
-- =====================================================================
UPDATE platform_admins
SET onboarding_data = coalesce(onboarding_data, '{}'::jsonb)
  - 'password' - 'admin_password' - 'password_hash' - 'token'
  - 'secret' - 'secrets' - 'credentials' - 'pin'
WHERE coalesce(onboarding_data, '{}'::jsonb)
      ?| ARRAY['password','admin_password','password_hash','token','secret','secrets','credentials','pin'];

COMMIT;
