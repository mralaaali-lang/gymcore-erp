import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getReportsOverview } from '../../services/api';
import { formatMoney } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import { escapeHtml, printDocument } from '../../utils/print';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import Chart from '../../components/charts/Chart';
import Spinner from '../../components/ui/Spinner';
import {
  FileText,
  Users,
  CreditCard,
  CalendarDots as CalendarDays,
  Warning as AlertTriangle,
  TrendUp as TrendingUp,
  TrendDown as TrendingDown,
  Wallet,
  Crown,
  HandCoins,
  User,
  Bank as Banknote,
  ClipboardText as ClipboardCheck,
  GridFour as LayoutGrid,
  UserMinus as UserX,
  CaretLeft as ChevronLeft
} from '@phosphor-icons/react';

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PACKAGE_ORDER = ['monthly', 'yearly', 'session', 'other'] as const;
const PACKAGE_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  monthly: { ar: 'شهري', en: 'Monthly', color: '#10b981' },
  yearly: { ar: 'سنوي', en: 'Yearly', color: '#8b5cf6' },
  session: { ar: 'حصة', en: 'Session', color: '#f97316' },
  other: { ar: 'أخرى', en: 'Other', color: '#0ea5e9' },
};

export default function FinancialReports() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;

  const today = localDateStr(new Date());
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const firstOfYear = `${today.slice(0, 4)}-01-01`;

  const [draftFrom, setDraftFrom] = useState(firstOfMonth);
  const [draftTo, setDraftTo] = useState(today);
  const [applied, setApplied] = useState({ from: firstOfMonth, to: today });

  const money = (v: unknown) => formatMoney(Number(v || 0), currency);

  const { data: res, isLoading } = useApiQuery(
    ['reports-overview', applied.from, applied.to],
    () => getReportsOverview(applied.from, applied.to),
  );
  const data = res?.data;
  const k = data?.kpis;

  const applyRange = (from: string, to: string) => {
    setDraftFrom(from);
    setDraftTo(to);
    setApplied({ from, to });
  };

  const isThisMonth = applied.from === firstOfMonth && applied.to === today;
  const isThisYear = applied.from === firstOfYear && applied.to === today;

  const dayLabel = (iso: string) => iso.slice(8, 10);
  const daily = data?.daily_revenue ?? [];
  const packRows = PACKAGE_ORDER
    .map((key) => ({
      key,
      count: data?.packages.find((p) => p.key === key)?.count ?? 0,
      ...PACKAGE_LABELS[key],
    }))
    .filter((p) => p.count > 0);

  const detailLinks = [
    {
      to: '/admin/reports/members',
      icon: User,
      title: rtl ? 'تقرير الأعضاء' : 'Members report',
      desc: rtl ? 'قائمة الأعضاء وحالة الاشتراك' : 'Member list and subscription status',
    },
    {
      to: '/admin/reports/financial',
      icon: Banknote,
      title: rtl ? 'التقرير المالي' : 'Financial report',
      desc: rtl ? 'المقبوضات حسب فترة الفلتر' : 'Receipts for the filtered range',
    },
    {
      to: '/admin/reports/attendance',
      icon: ClipboardCheck,
      title: rtl ? 'تقرير الحضور' : 'Attendance report',
      desc: rtl ? 'سجل الدخول والخروج اليومي' : 'Daily check-in and check-out log',
    },
    {
      to: '/admin/reports/subscriptions',
      icon: LayoutGrid,
      title: rtl ? 'تقرير الاشتراكات' : 'Subscriptions report',
      desc: rtl ? 'الباقات النشطة والمنتهية' : 'Active and expired plans',
    },
    {
      to: '/admin/reports/absent',
      icon: UserX,
      title: rtl ? 'الأعضاء الغائبون' : 'Absent members',
      desc: rtl ? 'متابعة من لم يحضروا في الفترة' : 'Follow up members with no visits in the range',
    },
    {
      to: '/admin/reports/employee-sales',
      icon: HandCoins,
      title: rtl ? 'مبيعات الموظفين' : 'Employee sales',
      desc: rtl ? 'جديد وتجديد وقيمة ومحصّل وعمولة' : 'New, renewal, value, collected and commission',
    },
  ];

  const exportPdf = () => {
    if (!k) return;
    const top = data?.top_attendance ?? [];
    const ok = printDocument({
      title: rtl ? `التقارير ${applied.from} → ${applied.to}` : `Reports ${applied.from} → ${applied.to}`,
      innerHtml: `
        <h1>${escapeHtml(rtl ? 'التقارير والإحصائيات' : 'Reports & Statistics')}</h1>
        <p class="muted">${escapeHtml(applied.from)} ← ${escapeHtml(applied.to)} · ${escapeHtml(rtl ? 'أيام' : 'days')}: ${fmtNum(data?.days ?? 0)}</p>
        <p class="muted">${escapeHtml(rtl
          ? 'المستحقات غير المدفوعة = ديون أُنشئت داخل فترة الفلتر، وليست إجمالي ديون الأعضاء.'
          : 'Unpaid dues = remaining debts created in this range, not the gym’s total outstanding.')}</p>
        <div class="box">
          <div class="row"><span>${escapeHtml(rtl ? 'الأعضاء النشطون' : 'Active members')}</span><strong>${fmtNum(k.active_members)}</strong></div>
          <div class="row"><span>${escapeHtml(rtl ? 'اشتراكات نشطة' : 'Active subscriptions')}</span><strong>${fmtNum(k.active_subscriptions)}</strong></div>
          <div class="row"><span>${escapeHtml(rtl ? 'إجمالي الحضور' : 'Total attendance')}</span><strong>${fmtNum(k.attendance_total)} (${escapeHtml(rtl ? 'معدل يومي' : 'daily')} ${fmtNum(k.attendance_daily_avg, { max: 1 })})</strong></div>
          <div class="row"><span>${escapeHtml(rtl ? 'مستحقات غير مدفوعة (فترة الفلتر)' : 'Unpaid dues (filter period)')}</span><strong>${escapeHtml(money(k.unpaid_period))}</strong></div>
          <div class="row"><span>${escapeHtml(rtl ? 'إجمالي الإيرادات' : 'Total revenue')}</span><strong>${escapeHtml(money(k.revenue))}</strong></div>
          <div class="row"><span>${escapeHtml(rtl ? 'إجمالي المصروفات' : 'Total expenses')}</span><strong>${escapeHtml(money(k.expenses))}</strong></div>
          <div class="row total"><span>${escapeHtml(rtl ? 'صافي الربح' : 'Net profit')}</span><strong>${escapeHtml(money(k.net_profit))}</strong></div>
        </div>
        <h1 style="margin-top:18px">${escapeHtml(rtl ? 'أكثر الأعضاء حضوراً' : 'Top attendance')}</h1>
        ${top.length === 0 ? `<p class="muted">${escapeHtml(rtl ? 'لا حضور في هذا النطاق' : 'No attendance in this range')}</p>` : `
        <table>
          <thead><tr><th>#</th><th>${escapeHtml(rtl ? 'العضو' : 'Member')}</th><th>${escapeHtml(rtl ? 'الحضور' : 'Visits')}</th></tr></thead>
          <tbody>${top.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.full_name)} (${escapeHtml(r.card_code || '—')})</td>
              <td>${fmtNum(r.visits)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`}`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  const inputCls =
    'h-11 min-w-[160px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none';

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* PDF sits on the physical left, under the top-bar title. */}
      <div dir="ltr" className="flex">
        <button
          onClick={exportPdf}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px]"
        >
          <FileText size={15} />
          {rtl ? 'تصدير PDF' : 'Export PDF'}
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'من تاريخ' : 'From date'}</label>
            <input type="date" value={draftFrom} max={draftTo} onChange={(e) => setDraftFrom(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">{rtl ? 'إلى تاريخ' : 'To date'}</label>
            <input type="date" value={draftTo} min={draftFrom} max={today} onChange={(e) => setDraftTo(e.target.value)} className={inputCls} />
          </div>
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
      </div>

      {isLoading || !k ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard
              icon={Users}
              label={rtl ? 'الأعضاء النشطون' : 'Active members'}
              value={fmtNum(k.active_members)}
              sub={k.new_members > 0 ? `+${fmtNum(k.new_members)} ${rtl ? 'جديد' : 'new'}` : undefined}
              accent="emerald"
              onClick={() => navigate('/admin/members')}
            />
            <StatCard
              icon={CreditCard}
              label={rtl ? 'اشتراكات نشطة' : 'Active subscriptions'}
              value={fmtNum(k.active_subscriptions)}
              accent="violet"
              onClick={() => navigate('/admin/subscriptions')}
            />
            <StatCard
              icon={CalendarDays}
              label={rtl ? 'إجمالي الحضور' : 'Total attendance'}
              value={fmtNum(k.attendance_total)}
              sub={`${rtl ? 'معدل يومي' : 'Daily avg'} ${fmtNum(k.attendance_daily_avg, { max: 1 })}`}
              accent="sky"
              onClick={() => navigate('/admin/attendance')}
            />
            <StatCard
              icon={AlertTriangle}
              label={rtl ? 'مستحقات غير مدفوعة' : 'Unpaid dues'}
              value={money(k.unpaid_period)}
              sub={rtl ? 'ديون فترة الفلتر' : 'Debts created in range'}
              accent="amber"
              onClick={() => navigate('/admin/debts')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StatCard
              icon={TrendingUp}
              label={rtl ? 'إجمالي الإيرادات' : 'Total revenue'}
              value={money(k.revenue)}
              arrow="up"
              accent="emerald"
              onClick={() => navigate('/admin/payments')}
            />
            <StatCard
              icon={TrendingDown}
              label={rtl ? 'إجمالي المصروفات' : 'Total expenses'}
              value={money(k.expenses)}
              arrow="down"
              accent="rose"
              onClick={() => navigate('/admin/expenses')}
            />
            <StatCard
              icon={Wallet}
              label={rtl ? 'صافي الربح' : 'Net profit'}
              value={money(k.net_profit)}
              accent={k.net_profit >= 0 ? 'emerald' : 'rose'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel icon={TrendingUp} accent="amber" title={rtl ? 'الإيرادات اليومية' : 'Daily revenue'}>
              {daily.length === 0 ? (
                <EmptyState icon={TrendingUp} accent="gray" title={rtl ? 'لا إيراد في هذا النطاق' : 'No revenue in this range'} />
              ) : (
                <Chart
                  type="line"
                  height={280}
                  palette="brass"
                  categories={daily.map((d) => dayLabel(d.date))}
                  series={[{ name: rtl ? 'الإيراد' : 'Revenue', data: daily.map((d) => d.amount) }]}
                  currency={currency || undefined}
                  extraOptions={{
                    stroke: { curve: 'smooth', width: 3 },
                    markers: { size: 4, strokeWidth: 0 },
                    fill: { type: 'gradient', gradient: { shadeIntensity: 0.35, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
                    tooltip: { shared: true, intersect: false },
                  }}
                />
              )}
            </Panel>

            <Panel icon={LayoutGrid} accent="violet" title={rtl ? 'توزيع الباقات' : 'Plan mix'}>
              {packRows.length === 0 ? (
                <EmptyState icon={LayoutGrid} accent="gray" title={rtl ? 'لا اشتراكات في هذا النطاق' : 'No subscriptions in this range'} />
              ) : (
                <Chart
                  type="donut"
                  height={280}
                  showLegend
                  series={packRows.map((p) => p.count)}
                  categories={packRows.map((p) => (rtl ? p.ar : p.en))}
                  colors={packRows.map((p) => p.color)}
                />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel icon={Crown} accent="amber" title={rtl ? 'أكثر الأعضاء حضوراً 🏆' : 'Top attendance 🏆'}>
              {(data?.top_attendance.length ?? 0) === 0 ? (
                <EmptyState
                  icon={Crown}
                  accent="gray"
                  title={rtl ? 'لا حضور في هذا النطاق' : 'No attendance in this range'}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-start px-3 py-2 text-xs font-semibold text-gray-500">#</th>
                        <th className="text-start px-3 py-2 text-xs font-semibold text-gray-500">{rtl ? 'العضو' : 'Member'}</th>
                        <th className="text-start px-3 py-2 text-xs font-semibold text-gray-500">{rtl ? 'الحضور' : 'Visits'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.top_attendance.map((row, i) => (
                        <tr key={row.member_id} className="border-t border-gray-100">
                          <td className="px-3 py-3 text-gray-500 tabular-nums">{i + 1}</td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-gray-900">{row.full_name}</p>
                            <p className="text-xs text-gray-400 tabular-nums" dir="ltr">{row.card_code || '—'}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold tabular-nums">
                              {fmtNum(row.visits)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel icon={FileText} accent="sky" title={rtl ? 'تقارير تفصيلية' : 'Detailed reports'}>
              <ul className="divide-y divide-gray-100">
                {detailLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to + item.title}>
                      <Link
                        to={item.to}
                        className="flex items-center gap-3 py-3 hover:bg-gray-50 rounded-xl px-1 -mx-1 transition"
                      >
                        <span className="w-10 h-10 rounded-xl bg-gray-50 text-gray-600 flex items-center justify-center shrink-0">
                          <Icon size={18} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-gray-900 text-sm">{item.title}</span>
                          <span className="block text-xs text-gray-500">{item.desc}</span>
                        </span>
                        <ChevronLeft size={16} className={`text-gray-400 shrink-0 ${rtl ? '' : 'rotate-180'}`} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
