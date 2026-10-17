/**
 * §34ج-أ — اقتطاع المفاتيح السرّية من أي كائن يُخزَّن في عمود jsonb.
 *
 * المعالج (onboarding wizard) كان يحفظ بيانات الخطوات كما جاءت، فصار
 * `platform_admins.onboarding_data` يحمل كلمات مرور المدير نصًا صريحًا في
 * `admin.password` و`step_2_data.password`. كلمة المرور تُستهلك بشكل مشروع
 * وقت إنشاء الحساب (تصل في جسم الطلب نفسه)، لكن لا يحق لها البقاء في سجل
 * الخطوات الذي يُقرأ ويُعرض ويُنسخ.
 *
 * النطاق: كل مفتاح على أي عمق يطابق النمط، بما فيها التفرعات داخل
 * `step_N_data`. القيم غير الشجرية (نص/رقم/null) تُمرَّر كما هي.
 *
 * ⚠️ هذا النمط له نسخة SQL مطابقة في
 * `server/migrations/081_scrub_onboarding_data_secrets.sql`
 * (الدالة `scrub_secret_json_keys` + trigger على `platform_admins`)، وأي
 * تعديل هنا يجب أن يُعدّل هناك في نفس الـcommit — وإلا انفصلت الحماية
 * التطبيقية عن الحماية المخزنية.
 */
export const SENSITIVE_KEY_PATTERN =
  /pass|pwd|secret|token|otp|hash|credential|api[_-]?key|\bpin\b/i;

/** هل اسم المفتاح نفسه اسم سرّ؟ (نفس القرار في شجر JSON وفي SQL) */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * يُرجع نسخة من `value` بلا أي مفتاح سرّ، دون تعديل المدخل.
 * المصفوفات تُعالج عنصرًا عنصرًا، والكائنات تُنسخ مفتاحًا مفتاحًا.
 */
export function scrubSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(k)) continue;
      out[k] = scrubSecrets(v);
    }
    return out as unknown as T;
  }
  return value;
}
