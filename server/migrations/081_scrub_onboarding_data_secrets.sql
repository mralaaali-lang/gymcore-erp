-- =====================================================================
-- §34ج-أ — تنقية platform_admins.onboarding_data من الأسرار النصية (توابع)
--
-- العيب: البلوك 8 في migration 068 كان يقتطع مفاتيح **الطبقة الأولى فقط**
-- (`- 'password' - 'token' …`)، بينما الأسرار فعليًا في عمقين:
--   admin.password   و   step_2_data.password
-- فالقياس على القاعدة المحلية بعد 068 مطبَّقة: صفٌّ واحد لا يزال يحمل
-- مفتاحين سرّيين (أُعلِن بالاسم فقط، بلا أي قيمة).
--
-- الإصلاح هنا: دالة تكرارية واحدة تقتطع أي مفتاح يطابق نفس النمط
-- المستخدم في التطبيق (server/src/utils/scrubSecrets.ts)، تُطبَّق على
-- الصفوف القائمة، ثم تبقى معلَّقة على trigger BEFORE حتى لا يستطيع أي
-- كود مستقبلي — مهما نسي الاقتطاع — أن يخزّن سرًا في هذا العمود.
--
-- ⚠️ نمط المفاتيح مُكرَّر عمدًا في SQL والتطبيق. أي تعديل على أحدهما
--    يستلزم تعديل الآخر في نفس الـcommit.
--   JS : /pass|pwd|secret|token|otp|hash|credential|api[_-]?key|\bpin\b/i
--   SQL: pass|pwd|secret|token|otp|hash|credential|api[_-]?key  +  \ypin\y
--        (\y = حد الكلمة في Postgres؛ \b عندها معنى آخر فلا تصلح هنا)
--
-- لا حذف لأي بيانات غير سرّية: gym / admin / config / step_N_data /
-- completed_at / created_gym_id تبقى كما هي، وتُقرأ من الواجهة بعد التنقية.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION scrub_secret_json_keys(input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  out   jsonb := '{}'::jsonb;
  key   text;
  value jsonb;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(input) = 'object' THEN
    FOR key, value IN SELECT * FROM jsonb_each(input) LOOP
      -- نفس قرار isSensitiveKey() في TypeScript
      IF key ~* 'pass|pwd|secret|token|otp|hash|credential|api[_-]?key'
         OR key ~* '\ypin\y' THEN
        CONTINUE;
      END IF;
      out := out || jsonb_build_object(key, scrub_secret_json_keys(value));
    END LOOP;
    RETURN out;
  END IF;

  IF jsonb_typeof(input) = 'array' THEN
    RETURN (
      SELECT COALESCE(
               jsonb_agg(scrub_secret_json_keys(el) ORDER BY ord),
               '[]'::jsonb
             )
      FROM jsonb_array_elements(input) WITH ORDINALITY AS t(el, ord)
    );
  END IF;

  RETURN input;  -- نص / رقم / true / false / null
END;
$fn$;

COMMENT ON FUNCTION scrub_secret_json_keys(jsonb) IS
  '§34ج-أ: إزالة أي مفتاح سرّي على أي عمق من jsonb. شقيقة scrubSecrets() في التطبيق.';

-- ── 1) تنقية الصفوف القائمة ──────────────────────────────────────────
UPDATE platform_admins
   SET onboarding_data = scrub_secret_json_keys(onboarding_data)
 WHERE onboarding_data IS NOT NULL
   AND onboarding_data <> scrub_secret_json_keys(onboarding_data);

-- ── 2) حارس بنيوي: لا سرّ في هذا العمود من الآن فصاعدًا ──────────────
CREATE OR REPLACE FUNCTION scrub_onboarding_data_secrets()
RETURNS trigger
LANGUAGE plpgsql
AS $trg$
BEGIN
  NEW.onboarding_data := scrub_secret_json_keys(NEW.onboarding_data);
  RETURN NEW;
END;
$trg$;

DROP TRIGGER IF EXISTS trg_scrub_onboarding_data_secrets ON platform_admins;
CREATE TRIGGER trg_scrub_onboarding_data_secrets
BEFORE INSERT OR UPDATE OF onboarding_data ON platform_admins
FOR EACH ROW EXECUTE FUNCTION scrub_onboarding_data_secrets();

COMMIT;
