import { describe, it, expect } from 'vitest';
import { scrubSecrets, isSensitiveKey } from '../../src/utils/scrubSecrets';

/**
 * §34ج-أ — عقود الاختبار لاقتطاع الأسرار من بيانات المعالج.
 * القاعدة: أي مفتاح سرّي على أي عمق يُمسح، وأي مفتاح غير سرّي يبقى بقيمته
 * كما هي (بما فيها الأرقام وnull والمصفوفات) — الاقتطاع لا يغيّر الشجرة
 * ولا يعدّل المدخل.
 */
describe('scrubSecrets', () => {
  const wizardPayload = {
    gym: { name: 'نادي التجمع', subdomain: 'tjmy', currency: 'EGP' },
    admin: { display_name: 'Alaa', email: 'alaa@example.com', password: 'S3cret!' },
    config: { platform_name: 'Gimawi', vat_percentage: 14, default_timezone: 'Africa/Cairo' },
    step_2_data: { email: 'alaa@example.com', password: 'S3cret!' },
    step_3_data: { vat_percentage: 14 },
  };

  it('يمسح admin.password وstep_2_data.password (العيب الحقيقي الذي أفلتت منه 068)', () => {
    const out = scrubSecrets(wizardPayload) as typeof wizardPayload & {
      admin: Record<string, unknown>;
      step_2_data: Record<string, unknown>;
    };
    expect('password' in out.admin).toBe(false);
    expect('password' in out.step_2_data).toBe(false);
  });

  it('يبقي كل مفتاح غير سرّي بقيمته، دون المساس بالشجرة', () => {
    const out = scrubSecrets(wizardPayload) as Record<string, any>;
    expect(out.gym).toEqual({ name: 'نادي التجمع', subdomain: 'tjmy', currency: 'EGP' });
    expect(out.config.vat_percentage).toBe(14);
    expect(out.step_3_data).toEqual({ vat_percentage: 14 });
    expect(out.admin).toEqual({ display_name: 'Alaa', email: 'alaa@example.com' });
  });

  it('لا يعدّل المدخل الأصلي (نسخة نقية)', () => {
    const input = { admin: { password: 'x', email: 'a@b.c' } } as any;
    scrubSecrets(input);
    expect(input.admin.password).toBe('x');
  });

  it('يمسح من داخل المصفوفات وعلى أعماق متتالية', () => {
    const out = scrubSecrets({
      steps: [{ token: 't', label: 'خطوة' }],
      deep: { nested: { api_key: 'k', apikey: 'k2', pwd: 'p', keep: 1 } },
    }) as any;
    expect(out.steps[0]).toEqual({ label: 'خطوة' });
    expect(out.deep.nested).toEqual({ keep: 1 });
  });

  it('يُمرّر القيم غير الشجرية كما هي', () => {
    expect(scrubSecrets(null)).toBe(null);
    expect(scrubSecrets('نص')).toBe('نص');
    expect(scrubSecrets(14)).toBe(14);
    expect(scrubSecrets({})).toEqual({});
  });

  it('أسماء المفاتيح السرّية المعترَفة', () => {
    for (const k of ['password', 'pass', 'pwd', 'admin_password', 'password_hash', 'token',
                     'refresh_token', 'secret', 'otp', 'pin', 'credential', 'api_key', 'apikey']) {
      expect(isSensitiveKey(k), k).toBe(true);
    }
  });

  it('لا يلمس أسماء الحقول المشروعة التي يستخدمها المعالج', () => {
    for (const k of ['name', 'subdomain', 'display_name', 'email', 'currency', 'timezone',
                     'default_currency', 'default_timezone', 'vat_percentage', 'platform_name',
                     'support_email', 'plan_tier', 'address_city', 'completed_at',
                     'created_gym_id', 'pincode', 'pinned']) {
      expect(isSensitiveKey(k), k).toBe(false);
    }
  });
});
