-- =====================================================================
-- §46 — توحيد شكل billing_coupons (كشفه العمل على شاشة الخصم في السوبر-أدمان)
--
-- العيب: الملفان 022 و043 يبنيان نفس الجدول بصيغتين مختلفتين، وكل منهما
-- CREATE TABLE IF NOT EXISTS — فأي صيغة تسبق تتجمّد القاعدة عليها:
--   • القاعدة المحلية/الحديثة: صيغة 043 → type/value/used_count/min_order_amount/
--     starts_at/expires_at/gym_id/platform_wide  (وهذا ما يقرؤه coupon.service.ts
--     الخاص بخصم الطلبات داخل الصالة، وهو الشغّال فعلًا).
--   • كود كوبونات السوبر-أدمان (platformCoupons.ts) والواجهة: صيغة 022 →
--     discount_type/discount_value/current_uses/valid_until/max_discount_amount/
--     min_plan_tier — وهذه الأعمدة غير موجودة محليًا، فـ POST /billing/coupons
--     كان يرجّع 500 من أول ضغطة «إضافة كوبون».
--
-- القرار: الصيغة القانونية صيغة 043 (لأنها التي يعمل بها خصم الطلبات الحقيقي).
-- هذه الـmigration تضيف أي عمود قانوني ناقص، وتُرجّع بيانات صيغة 022 إن كانت
-- موجودة على تلك القاعدة، ثم ترخي قيود NOT NULL على الأعمدة القديمة حتى لا
-- تفشل الكتابة القانونية الجديدة على قاعدة قديمة. لا حذف لأي عمود — الأرقام
-- القديمة تبقى قابلة للقراءة.
-- =====================================================================

BEGIN;

-- ── 1) الأعمدة القانونية (صيغة 043) — تُضاف أينما غابت ────────────────
ALTER TABLE billing_coupons
  ADD COLUMN IF NOT EXISTS type             varchar(20),
  ADD COLUMN IF NOT EXISTS value            numeric(12,2),
  ADD COLUMN IF NOT EXISTS max_uses         integer,
  ADD COLUMN IF NOT EXISTS used_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_order_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS starts_at        timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at       timestamptz,
  ADD COLUMN IF NOT EXISTS gym_id           uuid,
  ADD COLUMN IF NOT EXISTS platform_wide    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- حقول التقييد التي كانت في صيغة 022 وتُستخدم في التحقق من صلاحية الكوبون
  ADD COLUMN IF NOT EXISTS min_plan_tier    varchar(50),
  ADD COLUMN IF NOT EXISTS max_discount_amount numeric(12,2);

-- ── 2) ترحيل بيانات صيغة 022 لو كانت موجودة على هذه القاعدة ──────────
-- الأسماء القديمة تُفحص واحدًا واحدًا قبل استخدامها: قاعدة فيها discount_type
-- بلا min_amount (031 لم تُطبَّق) يجب أن تُرحَّل ولا تسقط في خطأ عمود مفقود.
DO $$
DECLARE
  has_column boolean;
  set_parts  text[] := ARRAY[]::text[];
  sql        text;
  c          text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'billing_coupons' AND column_name = 'discount_type'
  ) INTO has_column;

  IF NOT has_column THEN
    RETURN;
  END IF;

  set_parts := set_parts || ARRAY[format(
    'type = CASE lower(coalesce(discount_type, %L)) WHEN %L THEN %L ELSE %L END',
    'percentage', 'fixed', 'fixed_amount', 'percentage')];

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='billing_coupons' AND column_name='discount_value') INTO has_column;
  IF has_column THEN set_parts := set_parts || ARRAY['value = coalesce(discount_value, value)']; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='billing_coupons' AND column_name='current_uses') INTO has_column;
  IF has_column THEN set_parts := set_parts || ARRAY['used_count = coalesce(current_uses, used_count, 0)']; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='billing_coupons' AND column_name='valid_from') INTO has_column;
  IF has_column THEN set_parts := set_parts || ARRAY['starts_at = coalesce(valid_from, starts_at, created_at)']; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='billing_coupons' AND column_name='valid_until') INTO has_column;
  IF has_column THEN set_parts := set_parts || ARRAY['expires_at = coalesce(valid_until, expires_at)']; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='billing_coupons' AND column_name='min_amount') INTO has_column;
  IF has_column THEN set_parts := set_parts || ARRAY['min_order_amount = coalesce(min_amount, min_order_amount, 0)']; END IF;

  sql := 'UPDATE billing_coupons SET ' || array_to_string(set_parts, ', ') ||
         ' WHERE type IS NULL OR value IS NULL';
  EXECUTE sql;

  -- الأعمدة القديمة تبقى للقراءة فقط، لكن لا يجب أن تُسقط الكتابة القانونية
  FOREACH c IN ARRAY ARRAY['discount_type', 'discount_value', 'valid_from'] LOOP
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name='billing_coupons' AND column_name=c) INTO has_column;
    IF has_column THEN
      EXECUTE format('ALTER TABLE billing_coupons ALTER COLUMN %I DROP NOT NULL', c);
    END IF;
  END LOOP;
END $$;

-- ── 3) إكمال القيم الناقصة في الصيغة القانونية نفسها ─────────────────
UPDATE billing_coupons
   SET type = coalesce(type, 'percentage'),
       value = coalesce(value, 0),
       starts_at = coalesce(starts_at, created_at, CURRENT_TIMESTAMP)
 WHERE type IS NULL OR value IS NULL OR starts_at IS NULL;

-- الصلاحية تصبح اختيارية فعلًا: NULL في expires_at = بلا نهاية، وNULL في
-- max_uses = بلا حد للاستخدام. (043 جعلهما NOT NULL، و022 جعل max_uses NOT
-- NULL DEFAULT 1 — فكلاهما كان يفرض تاريخ انتهاء صناعيًا على كل كوبون.)
ALTER TABLE billing_coupons ALTER COLUMN starts_at  DROP NOT NULL;
ALTER TABLE billing_coupons ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE billing_coupons ALTER COLUMN max_uses   DROP NOT NULL;

-- ── 4) قيد القيم + فهرس الاستخدام ────────────────────────────────────
ALTER TABLE billing_coupons DROP CONSTRAINT IF EXISTS billing_coupons_type_valid;
ALTER TABLE billing_coupons ADD CONSTRAINT billing_coupons_type_valid
  CHECK (type IN ('percentage', 'fixed_amount'));

CREATE INDEX IF NOT EXISTS idx_billing_coupons_active
  ON billing_coupons (is_active, expires_at);

COMMENT ON TABLE billing_coupons IS '§46 الصيغة القانونية: type/value/used_count/starts_at/expires_at (أعمدة 022 للقراءة التاريخية فقط)';

COMMIT;
