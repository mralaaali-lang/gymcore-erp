import { SPORTS, useSportsCatalog } from './shared';

// اختيار الرياضة من الكتالوج الحي — fallback للثابت عند تعذر التحميل.
// allowEmpty=false = إجبار (باقات) مع placeholder؛ true = اختيارية.
export default function SportSelect({ value, onChange, rtl, allowEmpty, className }: {
  value: string;
  onChange: (code: string) => void;
  rtl: boolean;
  allowEmpty?: boolean;
  className?: string;
}) {
  const { active } = useSportsCatalog();
  const opts = active.length > 0
    ? active.map((s) => ({ code: s.code, label: rtl ? s.name_ar : s.name_ar }))
    : SPORTS.map((s) => ({ code: s.code, label: rtl ? s.ar : s.en }));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">
        {allowEmpty ? (rtl ? '— بدون تصنيف —' : '— Uncategorized —') : (rtl ? 'اختر الرياضة *' : 'Select sport *')}
      </option>
      {opts.map((s) => (
        <option key={s.code} value={s.code}>{s.label}</option>
      ))}
    </select>
  );
}
