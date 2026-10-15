import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getEmployeeSalesReport } from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import { StatCard, EmptyState } from '../../components/dashboard';
import Spinner from '../../components/ui/Spinner';
import { Users, Wallet, Banknote, Percent } from 'lucide-react';

// ====================================================================
// مبيعات الموظفين (/admin/reports/employee-sales) — مربوط بزر
// «مبيعات الموظفين» في مجموعة التقارير. البائع = منشئ الاشتراك
// (activity_logs)، وبلا سجل → صف «غير محدد» (لا بيع يضيع).
// جديد = أول اشتراك للعضو، تجديد = له سابق. قيمة البيع = سعر الباقة
// الكامل، والمحصّل = المدفوع؛ الفرق = ديون مفتوحة (صفحة الديون).
// العمولة = النسبة الحالية × قيمة البيع (0 حتى تُضبط من المستخدمين).
// ====================================================================

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inputCls =
  'h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none';

export default function EmployeeSales() {
  const { language, gymProfile } = useApp();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;

  const today = localDateStr(new Date());
  const firstOfMonth = `${today.slice(0, 8)}01`;

  const [draftFrom, setDraftFrom] = useState(firstOfMonth);
  const [draftTo, setDraftTo] = useState(today);
  const [applied, setApplied] = useState({ from: firstOfMonth, to: today });

  const { data: res, isLoading, isError } = useApiQuery(
    ['reports-employee-sales', applied.from, applied.to],
    () => getEmployeeSalesReport(applied.from, applied.to),
    { staleTime: 30_000 },
  );
  const data = res?.data;
  const rows = data?.staff ?? [];
  const totals = data?.totals;
  const money = (v: unknown) => formatMoney(Number(v || 0), currency);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5 bg-gray-50 min-h-screen -m-6 p-6">
      {/* 1) الهيدر: العنوان يمين (الشريط العلوي) + رجوع شمال */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px]"
        >
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
          {rtl ? 'التقارير' : 'Reports'}
        </button>
      </div>

      {/* 2) الفلتر */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {rtl ? 'من تاريخ' : 'From date'}
          <input type="date" value={draftFrom} max={draftTo} onChange={(e) => setDraftFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500">
          {rtl ? 'إلى تاريخ' : 'To date'}
          <input type="date" value={draftTo} min={draftFrom} max={today} onChange={(e) => setDraftTo(e.target.value)} className={inputCls} />
        </label>
        <button
          onClick={() => setApplied({ from: draftFrom, to: draftTo })}
          className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition min-h-[44px]"
        >
          {rtl ? 'عرض' : 'Show'}
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : isError || !totals ? (
        <EmptyState title={rtl ? 'تعذّر تحميل التقرير' : 'Failed to load report'} />
      ) : (
        <>
          {/* 3) الكروت الأربع */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label={rtl ? 'إجمالي الاشتراكات' : 'Total subscriptions'}
              value={fmtNum(totals.total_count)}
              sub={`${fmtNum(totals.new_count)} ${rtl ? 'جديد' : 'new'} · ${fmtNum(totals.renew_count)} ${rtl ? 'تجديد' : 'renewal'}`}
              accent="emerald"
            />
            <StatCard icon={Wallet} label={rtl ? 'قيمة البيع' : 'Sales value'} value={money(totals.sale_value)} accent="sky" />
            <StatCard icon={Banknote} label={rtl ? 'المحصّل فعلياً' : 'Collected'} value={money(totals.collected)} accent="amber" />
            <StatCard icon={Percent} label={rtl ? 'إجمالي العمولات' : 'Total commissions'} value={money(totals.commission)} accent="violet" />
          </div>

          {/* 4) جدول أداء كل موظف */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-start">
                    {[
                      rtl ? 'الموظف' : 'Staff',
                      rtl ? 'اشتراكات جديدة' : 'New subs',
                      rtl ? 'تجديدات' : 'Renewals',
                      rtl ? 'الإجمالي' : 'Total',
                      rtl ? 'قيمة البيع' : 'Sales value',
                      rtl ? 'المحصّل' : 'Collected',
                      rtl ? 'نسبة العمولة' : 'Rate',
                      rtl ? 'العمولة' : 'Commission',
                    ].map((h) => (
                      <th key={h} className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="p-10 text-center text-gray-400 text-sm">
                      {rtl ? 'لا مبيعات في هذا النطاق' : 'No sales in this range'}
                    </td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.staff_id ?? 'unknown'} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 text-start">
                        {r.staff_id ? (
                          <span className="font-semibold text-gray-900 whitespace-nowrap">{r.staff_name}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-gray-400 whitespace-nowrap">
                            <span className="material-symbols-outlined text-lg">person_off</span>
                            {rtl ? 'غير محدد' : 'Unknown'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-start">
                        <span className="inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold tabular-nums">
                          {fmtNum(r.new_count)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-start">
                        <span className="inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full bg-sky-50 text-sky-700 text-xs font-bold tabular-nums">
                          {fmtNum(r.renew_count)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-start font-extrabold text-gray-900 tabular-nums whitespace-nowrap">{fmtNum(r.total_count)}</td>
                      <td className="py-3 px-3 text-start font-semibold text-gray-900 tabular-nums whitespace-nowrap">{money(r.sale_value)}</td>
                      <td className="py-3 px-3 text-start font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{money(r.collected)}</td>
                      <td className="py-3 px-3 text-start tabular-nums whitespace-nowrap text-gray-500">
                        {r.staff_id && r.rate > 0 ? `${r.rate}%` : '—'}
                      </td>
                      <td className="py-3 px-3 text-start font-extrabold tabular-nums whitespace-nowrap text-orange-500">{money(r.commission)}</td>
                    </tr>
                  ))}
                  {rows.length > 0 && totals && (
                    <tr className="bg-gray-50 font-bold">
                      <td className="py-3 px-3 text-start text-gray-900">{rtl ? 'الإجمالي' : 'Total'}</td>
                      <td className="py-3 px-3 text-start tabular-nums text-gray-900">{fmtNum(totals.new_count)}</td>
                      <td className="py-3 px-3 text-start tabular-nums text-gray-900">{fmtNum(totals.renew_count)}</td>
                      <td className="py-3 px-3 text-start tabular-nums text-gray-900">{fmtNum(totals.total_count)}</td>
                      <td className="py-3 px-3 text-start tabular-nums text-gray-900 whitespace-nowrap">{money(totals.sale_value)}</td>
                      <td className="py-3 px-3 text-start tabular-nums text-emerald-700 whitespace-nowrap">{money(totals.collected)}</td>
                      <td className="py-3 px-3 text-start text-gray-400">—</td>
                      <td className="py-3 px-3 text-start tabular-nums text-orange-500 whitespace-nowrap">{money(totals.commission)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5) الملاحظة التوضيحية */}
          <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs text-amber-800 leading-relaxed">
            {rtl
              ? 'العمولة تُحسب تلقائياً = نسبة الموظف × قيمة البيع (بالسعر الكامل). اضبط نسبة كل موظف من: المستخدمون ← تعديل ← نسبة العمولة %.'
              : 'Commission auto-computes as staff rate × sales value (full price). Set each rate in Users → Edit → Commission %.'}{' '}
            <Link to="/admin/users" className="font-bold underline underline-offset-2 hover:text-amber-900">
              {rtl ? 'فتح المستخدمين' : 'Open users'}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
