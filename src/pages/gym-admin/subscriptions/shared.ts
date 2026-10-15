import { useApiQuery } from '../../../hooks/useApiQuery';
import { listSports, type GymSport } from '../../../services/api';

export type { GymSport };

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

/** شبكة الأيقونات الـ12 لصفحة الرياضات (Material Symbols — تُخزَّن بالاسم). */
export const SPORT_ICONS = [
  { name: 'fitness_center', ar: 'دمبل' },
  { name: 'favorite', ar: 'قلب' },
  { name: 'sports_mma', ar: 'قبضة' },
  { name: 'pool', ar: 'سباحة' },
  { name: 'directions_bike', ar: 'دراجة' },
  { name: 'sports_soccer', ar: 'كورة' },
  { name: 'emoji_events', ar: 'ميدالية' },
  { name: 'music_note', ar: 'موسيقى' },
  { name: 'self_improvement', ar: 'تأمل' },
  { name: 'directions_run', ar: 'جري' },
  { name: 'sports_tennis', ar: 'تنس' },
  { name: 'sports_basketball', ar: 'سلة' },
] as const;

/** اسم الرياضة من الكتالوج الحي — fallback للثابت القديم ثم الكود نفسه. */
export function sportName(code?: string | null, catalog?: GymSport[], rtl = true): string {
  const hit = catalog?.find((s) => s.code === code);
  if (hit) {
    if (rtl) return hit.name_ar;
    return SPORTS.find((x) => x.code === code)?.en ?? hit.name_ar;
  }
  return sportLabel(code, rtl);
}

/** الكتالوج الحي للرياضات — query key واحد يشترك فيه كل المستهلكين. */
export function useSportsCatalog() {
  const { data, isLoading } = useApiQuery(['sports'], listSports, { staleTime: 60_000 });
  const sports = data?.data ?? [];
  return { sports, isLoading, active: sports.filter((s) => s.is_active) };
}

/** دوائر الألوان لصفحة الرياضات (صف أول 10 + رمادي/تركواز). */
export const SPORT_COLORS = [
  '#0284c7', '#f97316', '#ef4444', '#8b5cf6', '#22c55e',
  '#eab308', '#ec4899', '#14b8a6', '#6366f1', '#84cc16',
  '#6b7280', '#06b6d4',
] as const;

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
