/**
 * §34ي — صفحة الاشتراكات: قوائم ثابتة واحدة يقرأ منها السيرفر نفس القيم
 * (SPORTS/WEEK_DAYS تطابق enums في createSubscriptionSchema). هذه تسميات
 * عرض للمخازن المشفرة بالأ الإنجليزية — لا بيانات وهمية: كل صف يقرأ قيمته
 * الحقيقية من member_subscriptions، والغياب يعرض «—».
 */

export const SPORTS = [
  { code: 'gym', ar: 'جيم', en: 'Gym' },
  { code: 'cardio', ar: 'كارديو', en: 'Cardio' },
  { code: 'boxing', ar: 'ملاكمة', en: 'Boxing' },
  { code: 'kickboxing', ar: 'كيك بوكسينج', en: 'Kickboxing' },
  { code: 'swimming', ar: 'سباحة', en: 'Swimming' },
  { code: 'crossfit', ar: 'كروس فيت', en: 'CrossFit' },
  { code: 'yoga', ar: 'يوجا', en: 'Yoga' },
] as const;

export const WEEK_DAYS = [
  { code: 'sat', ar: 'السبت' },
  { code: 'sun', ar: 'الأحد' },
  { code: 'mon', ar: 'الاثنين' },
  { code: 'tue', ar: 'الثلاثاء' },
  { code: 'wed', ar: 'الأربعاء' },
  { code: 'thu', ar: 'الخميس' },
  { code: 'fri', ar: 'الجمعة' },
] as const;

/** طرق دفع مصرية — نفس enum createPaymentSchema/createSubscriptionSchema. */
export const PAYMENT_METHODS = [
  { code: 'cash', ar: 'نقدي' },
  { code: 'card', ar: 'فيزا' },
  { code: 'vodafone_cash', ar: 'فودافون كاش' },
  { code: 'instapay', ar: 'انستاباي' },
  { code: 'bank', ar: 'تحويل بنكي' },
] as const;

export function sportLabel(code?: string | null, rtl = true): string {
  const s = SPORTS.find((x) => x.code === code);
  if (!s) return '—';
  return rtl ? s.ar : s.en;
}

export function paymentMethodLabel(code?: string | null): string {
  const m = PAYMENT_METHODS.find((x) => x.code === code);
  return m ? m.ar : 'نقدي';
}

export function durationLabelAr(days: number): string {
  if (days % 365 === 0) return days === 365 ? 'سنة' : `${days / 365} سنوات`;
  if (days % 30 === 0) {
    const m = days / 30;
    if (m === 1) return 'شهر';
    if (m === 2) return 'شهرين';
    return `${m} شهور`;
  }
  return `${days} يوم`;
}
