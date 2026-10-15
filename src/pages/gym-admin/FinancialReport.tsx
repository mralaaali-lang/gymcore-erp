import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getFinancialReport } from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { downloadMatrixXlsx } from '../../utils/csv';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import Chart from '../../components/charts/Chart';
import Spinner from '../../components/ui/Spinner';
import { FileText, FileSpreadsheet, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { paymentMethodLabel } from './subscriptions/shared';

// ====================================================================
// التقرير المالي (/admin/reports/financial) — مربوط بزر «التقرير المالي»
// في شاشة التقارير. نفس جدول المدفوعات (financial_transactions) بمنظور
// محاسبي: إجمالي/مصروف/صافي + تفصيل طرق الدفع + أحدث الحركات.
// ====================================================================

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 10/13 21:37 — يوم/ساعة بلا سنة (توقيت المتصفح المحلي). */
function shortDT(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function FinancialReport() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;

  const today = localDateStr(new Date());
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const firstOfYear = `${today.slice(0, 4)}-01-01`;

  const [draftFrom, setDraftFrom] = useState(firstOfMonth);
  const [draftTo, setDraftTo] = useState(today);
  const [applied, setApplied] = useState({ from: firstOfMonth, to: today });
  const [exporting, setExporting] = useState(false);

  const { data: res, isLoading, isError } = useApiQuery(
    ['reports-financial', applied.from, applied.to],
    () => getFinancialReport(applied.from, applied.to),
    { staleTime: 30_000 },
  );
  const data = res?.data;
  const t = data?.totals;

  const applyRange = (from: string, to: string) => {
    setDraftFrom(from);
    setDraftTo(to);
    setApplied({ from, to });
  };
  const isThisMonth = applied.from === firstOfMonth && applied.to === today;
  const isThisYear = applied.from === firstOfYear && applied.to === today;

  const money = (v: unknown) => formatMoney(Number(v || 0), currency);
  const inputCls =
    'h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none';

  const exportPdf = () => {
    if (!data || !t) return;
    const ok = printDocument({
      title: rtl ? `التقرير المالي ${applied.from} → ${applied.to}` : `Financial report ${applied.from} → ${applied.to}`,
      innerHtml: `
        <h1>${escapeHtml(rtl ? 'التقرير المالي' : 'Financial report')}</h1>
        <p class="muted">${escapeHtml(applied.from)} ← ${escapeHtml(applied.to)}</p>
        <div class="box">
          <div class="row"><span>${escapeHtml(rtl ? 'إجمالي الإيرادات' : 'Total revenue')}</span><strong>${escapeHtml(money(t.revenue))} (${fmtNum(t.revenue_count)})</strong></div>
          <div class="row"><span>${escapeHtml(rtl ? 'إجمالي المصروفات' : 'Total expenses')}</span><strong>${escapeHtml(money(t.expenses))} (${fmtNum(t.expenses_count)})</strong></div>
          <div class="row total"><span>${escapeHtml(rtl ? 'صافي الربح' : 'Net profit')}</span><strong>${escapeHtml(money(t.net))}</strong></div>
        </div>
        <h1 style="margin-top:18px">${escapeHtml(rtl ? 'حسب طريقة الدفع' : 'By payment method')}</h1>
        <table><thead><tr><th>${escapeHtml(rtl ? 'الطريقة' : 'Method')}</th><th>${escapeHtml(rtl ? 'العمليات' : 'Count')}</th><th>${escapeHtml(rtl ? 'الإجمالي' : 'Total')}</th></tr></thead>
        <tbody>${data.methods.map((m) => `<tr><td>${escapeHtml(paymentMethodLabel(m.method))}</td><td>${fmtNum(m.count)}</td><td>${escapeHtml(money(m.total))}</td></tr>`).join('')}</tbody></table>`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  const exportExcel = () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const head = [rtl ? 'البند' : 'Item', rtl ? 'العمليات' : 'Count', rtl ? 'الإجمالي' : 'Total'];
      const matrix: string[][] = [
        head,
        [rtl ? 'إجمالي الإيرادات' : 'Revenue', String(t!.revenue_count), money(t!.revenue)],
        [rtl ? 'إجمالي المصروفات' : 'Expenses', String(t!.expenses_count), money(t!.expenses)],
        [rtl ? 'صافي الربح' : 'Net', '', money(t!.net)],
        ['—', '', ''],
        ...(data.methods.map((m) => [paymentMethodLabel(m.method), String(m.count), money(m.total)])),
      ];
      downloadMatrixXlsx('financial-report.xlsx', matrix);
      showToast(rtl ? 'تم تصدير التقرير' : 'Report exported', 'success');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5 bg-gray-50 min-h-screen -m-6 p-6">
      {/* 1) تصدير شمال */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          type="button"
          onClick={exportPdf}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px]"
        >
          <FileText size={15} />
          {rtl ? 'تصدير PDF' : 'Export PDF'}
        </button>
        <button
          type="button"
          onClick={exportExcel}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px] disabled:opacity-60"
        >
          <FileSpreadsheet size={15} />
          {exporting ? '…' : 'Excel'}
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
          {rtl ? 'تطبيق الفلتر' : 'Apply filter'}
        </button>
        <button
          type="button"
          onClick={() => applyRange(firstOfMonth, today)}
          className={`h-11 px-4 rounded-xl text-sm font-bold transition min-h-[44px] ${isThisMonth ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {rtl ? 'هذا الشهر' : 'This month'}
        </button>
        <button
          type="button"
          onClick={() => applyRange(firstOfYear, today)}
          className={`h-11 px-4 rounded-xl text-sm font-bold transition min-h-[44px] ${isThisYear ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          {rtl ? 'هذه السنة' : 'This year'}
        </button>
      </div>

      {isLoading || !t ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : isError ? (
        <EmptyState title={rtl ? 'تعذّر تحميل التقرير' : 'Failed to load report'} />
      ) : (
        <>
          {/* 3) الكروت الثلاثة */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={TrendingUp}
              label={rtl ? 'إجمالي الإيرادات' : 'Total revenue'}
              value={money(t.revenue)}
              sub={`(${fmtNum(t.revenue_count)} ${rtl ? 'عملية' : 'ops'})`}
              accent="emerald"
            />
            <StatCard
              icon={TrendingDown}
              label={rtl ? 'إجمالي المصروفات' : 'Total expenses'}
              value={money(t.expenses)}
              sub={`(${fmtNum(t.expenses_count)} ${rtl ? 'عملية' : 'ops'})`}
              accent="rose"
            />
            <StatCard
              icon={Wallet}
              label={rtl ? 'صافي الربح' : 'Net profit'}
              value={money(t.net)}
              sub={t.net >= 0 ? (rtl ? 'ربح' : 'Profit') : (rtl ? 'خسارة' : 'Loss')}
              accent={t.net >= 0 ? 'emerald' : 'rose'}
            />
          </div>

          {/* 4) رسم الأعمدة المجمعة */}
          <Panel icon={TrendingUp} accent="emerald" title={rtl ? 'الإيرادات والمصروفات' : 'Income & expenses'}>
            {data.daily.every((d) => d.revenue === 0 && d.expenses === 0) ? (
              <EmptyState icon={TrendingUp} accent="gray" title={rtl ? 'لا حركات في هذا النطاق' : 'No movements in this range'} />
            ) : (
              <Chart
                type="bar"
                height={280}
                colors={['#10b981', '#ef4444']}
                categories={data.daily.map((d) => d.date.slice(5))}
                series={[
                  { name: rtl ? 'الإيرادات' : 'Revenue', data: data.daily.map((d) => d.revenue) },
                  { name: rtl ? 'المصروفات' : 'Expenses', data: data.daily.map((d) => d.expenses) },
                ]}
                currency={currency || undefined}
                showLegend
              />
            )}
          </Panel>

          {/* 5) حسب طريقة الدفع */}
          <Panel icon={Wallet} accent="sky" title={rtl ? 'حسب طريقة الدفع' : 'By payment method'}>
            {data.methods.length === 0 ? (
              <EmptyState icon={Wallet} accent="gray" title={rtl ? 'لا مدفوعات في هذا النطاق' : 'No payments in this range'} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {data.methods.map((m) => (
                  <li key={m.method} className="flex items-center gap-3 py-2.5">
                    <span className="text-sm font-bold text-gray-900 flex-1">{paymentMethodLabel(m.method)}</span>
                    <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">
                      {fmtNum(m.count)} {rtl ? 'عملية' : 'ops'}
                    </span>
                    <span className="text-sm font-extrabold text-emerald-700 tabular-nums whitespace-nowrap min-w-[110px] text-end">
                      {money(m.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* 6) جدولان: أحدث الإيرادات والمصروفات */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-3xl border border-gray-100 border-t-4 !border-t-emerald-500 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900">
                  {rtl ? 'آخر الإيرادات' : 'Latest income'} ({data.recent_income.length})
                </h3>
              </div>
              {data.recent_income.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <span className="material-symbols-outlined text-5xl text-gray-300">inbox</span>
                  <p className="text-sm text-gray-400 mt-2">{rtl ? 'لا إيرادات في هذا النطاق' : 'No income in this range'}</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  {data.recent_income.map((r, i) => (
                    <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="text-xs text-gray-400 tabular-nums shrink-0" dir="ltr">{shortDT(r.created_at)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-gray-900 truncate">{r.member_name || '—'}</span>
                        <span className="block text-xs text-gray-400">{paymentMethodLabel(r.payment_method)}</span>
                      </span>
                      <span className="text-sm font-bold tabular-nums whitespace-nowrap text-emerald-600">+{money(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-white rounded-3xl border border-gray-100 border-t-4 !border-t-red-500 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900">
                  {rtl ? 'آخر المصروفات' : 'Latest expenses'} ({data.recent_expenses.length})
                </h3>
              </div>
              {data.recent_expenses.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <span className="material-symbols-outlined text-5xl text-gray-300">inbox</span>
                  <p className="text-sm text-gray-400 mt-2">{rtl ? 'لا مصروفات في هذا النطاق' : 'No expenses in this range'}</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  {data.recent_expenses.map((r, i) => (
                    <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="text-xs text-gray-400 tabular-nums shrink-0" dir="ltr">{shortDT(r.created_at)}</span>
                      <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">{r.description || '—'}</span>
                      <span className="text-sm font-bold tabular-nums whitespace-nowrap text-red-500">−{money(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
