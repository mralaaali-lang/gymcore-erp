import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Wallet, Check, Clock, Trash as Trash2 } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import {
  generatePayroll, getPayroll, approvePayroll, payPayroll, deletePayrollRun,
} from '../../services/api';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import { StaffAvatar } from './HrMainPage';
import Modal from '../../components/shared/Modal';
import PageLoader from '../../components/shared/PageLoader';
import StatusBadge from '../../components/ui/StatusBadge';

// ====================================================================
// إدارة الرواتب (/admin/hr/payroll) — مسير شهري: مسودة ← معتمد ← مصروف.
// قاعدة الالتقاط: النشطون وقت التوليد فقط (لا الموقوفين). المعادلة ظاهرة
// في الأعمدة: أساسي + بدلات + مكافآت − خصومات − تقسيط سلف = صافي.
// الصرف يولّد حركة خزنة واحدة بإجمالي الصافي.
// ====================================================================

export default function PayrollPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  const monthNow = new Date().toISOString().slice(0, 7);
  const [draftMonth, setDraftMonth] = useState(monthNow);
  const [draftQ, setDraftQ] = useState('');
  const [applied, setApplied] = useState({ month: monthNow, q: '' });
  const [showGen, setShowGen] = useState(false);
  const [genMonth, setGenMonth] = useState(monthNow);
  const [showPay, setShowPay] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState('cash');

  const { data, isLoading } = useApiQuery(
    ['hr', 'payroll', applied.month],
    () => getPayroll(applied.month),
    { staleTime: 30_000 },
  );
  const run = data?.data ?? null;
  const items = (run?.items ?? []).filter((i) =>
    !applied.q.trim() || i.staff_name.toLowerCase().includes(applied.q.trim().toLowerCase()),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['hr', 'payroll'] });
    queryClient.invalidateQueries({ queryKey: ['hr', 'adjustments'] });
  };

  const gen = useMutation({
    mutationFn: () => generatePayroll(genMonth),
    onSuccess: (r) => {
      invalidate(); setShowGen(false);
      setApplied({ month: r.data.month, q: '' }); setDraftMonth(r.data.month);
      showToast(rtl ? 'تم إنشاء الكشف (مسودة)' : 'Run created (draft)', 'success');
    },
    onError: (e) => showToast((e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل' : 'Failed'), 'error'),
  });
  const approve = useMutation({
    mutationFn: (id: string) => approvePayroll(id),
    onSuccess: () => { invalidate(); showToast(rtl ? 'تم الاعتماد' : 'Approved', 'success'); },
    onError: () => showToast(rtl ? 'فشل' : 'Failed', 'error'),
  });
  const pay = useMutation({
    mutationFn: () => payPayroll(showPay!, payMethod),
    onSuccess: (r) => {
      invalidate(); setShowPay(null);
      showToast(rtl ? `تم الصرف ${money(r.data.total)} — حركة خزنة مسجلة` : `Paid ${money(r.data.total)}`, 'success');
    },
    onError: () => showToast(rtl ? 'فشل الصرف' : 'Pay failed', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deletePayrollRun(id),
    onSuccess: () => { invalidate(); showToast(rtl ? 'تم حذف المسودة' : 'Draft deleted', 'success'); },
    onError: () => showToast(rtl ? 'المسودات فقط تُحذف' : 'Drafts only', 'error'),
  });

  const pendingCount = run ? run.items.filter((i) => i.status !== 'paid').length : 0;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'إدارة الرواتب' : 'Payroll'}</h1>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowGen(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-2xl px-4 py-2.5 min-h-[44px]">
              <Plus size={16} />{rtl ? 'إنشاء الكشف' : 'Generate run'}
            </button>
            <button type="button" onClick={() => navigate('/admin/hr')}
              className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl hover:bg-gray-50 min-h-[44px]">
              <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
              {rtl ? 'رجوع' : 'Back'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          <StatCard icon={Wallet} label={rtl ? 'إجمالي الرواتب' : 'Total'} value={money(run?.total_net ?? 0)} accent="amber" />
          <StatCard icon={Check} label={rtl ? 'تم صرفه' : 'Paid out'} value={money(run?.paid_sum ?? 0)} accent="emerald" />
          <StatCard icon={Clock} label={rtl ? 'معلق' : 'Pending'} value={fmtNum(pendingCount)} accent="rose" />
        </div>

        <Panel title={rtl ? 'الفلاتر' : 'Filters'}>
          <div className="flex flex-wrap items-end gap-3">
            <input type="month" value={draftMonth} onChange={(e) => setDraftMonth(e.target.value)}
              className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none" />
            <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none min-w-[180px]"
              placeholder={rtl ? 'بحث (اسم/رقم)…' : 'Search…'} />
            <button type="button" onClick={() => setApplied({ month: draftMonth, q: draftQ })}
              className="h-11 px-6 rounded-xl bg-gray-900 text-white text-sm font-bold min-h-[44px]">
              {rtl ? 'عرض' : 'Show'}
            </button>
            {run && (
              <span className="ms-auto">
                <StatusBadge
                  status={run.status === 'paid' ? (rtl ? 'مصروف' : 'Paid') : run.status === 'approved' ? (rtl ? 'معتمد' : 'Approved') : (rtl ? 'مسودة' : 'Draft')}
                  variant={run.status === 'paid' ? 'success' : run.status === 'approved' ? 'warning' : 'neutral'}
                />
              </span>
            )}
          </div>
        </Panel>

        <Panel title={`${rtl ? `كشف رواتب شهر ${applied.month}` : `Payroll ${applied.month}`} ${run ? `(${fmtNum(items.length)})` : ''}`}>
          {isLoading ? (
            <PageLoader variant="skeleton" rows={6} />
          ) : !run ? (
            <EmptyState icon={Wallet} accent="gray"
              title={rtl ? 'لا كشف لهذا الشهر' : 'No run this month'}
              description={rtl ? 'أنشئ الكشف — يلتقط الموظفين النشطين وقت التوليد فقط.' : 'Generate a run — it snapshots active staff only.'} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-900">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الأساسي' : 'Base'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'البدلات' : 'Allow.'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المكافآت' : 'Bonus'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الخصومات' : 'Ded.'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'صافي الراتب' : 'Net'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <StaffAvatar name={i.staff_name} size="w-8 h-8 text-xs" />
                            <span className="font-medium whitespace-nowrap">{i.staff_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{money(i.base)}</td>
                        <td className="px-4 py-3 tabular-nums">{money(i.allowances)}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-emerald-600">+{money(i.bonus)}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-red-600">-{money(i.deductions + i.advance_deduction)}</td>
                        <td className="px-4 py-3 tabular-nums font-extrabold">{money(i.net)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={i.status === 'paid' ? (rtl ? 'مصروف' : 'Paid') : i.status === 'approved' ? (rtl ? 'معتمد' : 'Approved') : (rtl ? 'مسودة' : 'Draft')}
                            variant={i.status === 'paid' ? 'success' : i.status === 'approved' ? 'warning' : 'neutral'} />
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-extrabold">
                      <td className="px-4 py-3" colSpan={5}>{rtl ? 'الإجمالي' : 'Total'}</td>
                      <td className="px-4 py-3 tabular-nums">{money(run.total_net)}</td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 mt-4 flex-wrap">
                {run.status === 'draft' && (
                  <>
                    <button type="button" onClick={() => approve.mutate(run.id)} disabled={approve.isPending}
                      className="min-h-[44px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
                      {rtl ? 'اعتماد الكشف' : 'Approve'}
                    </button>
                    <button type="button" onClick={() => { if (confirm(rtl ? 'حذف المسودة؟' : 'Delete draft?')) remove.mutate(run.id); }}
                      className="min-h-[44px] px-4 rounded-xl text-red-600 hover:bg-red-50 text-sm font-bold inline-flex items-center gap-1.5">
                      <Trash2 size={15} />{rtl ? 'حذف المسودة' : 'Delete draft'}
                    </button>
                  </>
                )}
                {run.status === 'approved' && (
                  <button type="button" onClick={() => setShowPay(run.id)}
                    className="min-h-[44px] px-6 rounded-xl bg-gray-900 text-white text-sm font-bold">
                    {rtl ? 'صرف الرواتب' : 'Pay out'}
                  </button>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* إنشاء كشف */}
      {showGen && (
        <Modal
          open
          onClose={() => setShowGen(false)}
          size="sm"
          dir={rtl ? 'rtl' : 'ltr'}
          disableDismiss={gen.isPending}
          title={rtl ? 'إنشاء كشف' : 'Generate run'}
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowGen(false)}
                disabled={gen.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition disabled:opacity-50"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => gen.mutate()}
                disabled={!genMonth || gen.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition disabled:opacity-50"
              >
                {gen.isPending ? (rtl ? 'جارٍ الإنشاء…' : 'Generating…') : (rtl ? 'إنشاء' : 'Generate')}
              </button>
            </>
          }
        >
          <input type="month" value={genMonth} onChange={(e) => setGenMonth(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <p className="mt-2 text-xs text-gray-400">{rtl ? 'يلتقط النشطين وقت التوليد فقط.' : 'Snapshots active staff only.'}</p>
        </Modal>
      )}

      {/* الصرف */}
      {showPay && (
        <Modal
          open
          onClose={() => setShowPay(null)}
          size="sm"
          dir={rtl ? 'rtl' : 'ltr'}
          disableDismiss={pay.isPending}
          title={rtl ? 'صرف الرواتب' : 'Pay out'}
          description={rtl ? 'يولّد حركة خزنة واحدة بإجمالي الصافي.' : 'Books one cashbox expense for the net total.'}
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowPay(null)}
                disabled={pay.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition disabled:opacity-50"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => pay.mutate()}
                disabled={pay.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-gray-900 text-white text-sm font-bold transition disabled:opacity-50"
              >
                {pay.isPending ? (rtl ? 'جارٍ الصرف…' : 'Paying…') : (rtl ? 'تأكيد الصرف' : 'Confirm payout')}
              </button>
            </>
          }
        >
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
            className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="cash">{rtl ? 'نقدي' : 'Cash'}</option>
            <option value="card">{rtl ? 'بطاقة' : 'Card'}</option>
            <option value="bank">{rtl ? 'تحويل' : 'Bank'}</option>
          </select>
        </Modal>
      )}
    </div>
  );
}
