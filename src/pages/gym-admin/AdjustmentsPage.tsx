import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, X, Trash as Trash2, Bank as Banknote } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import {
  listAdjustments, createAdjustment, deleteAdjustment, repayAdvance,
  listStaff, type StaffData,
} from '../../services/api';
import { StatCard, Panel, EmptyState } from '../../components/dashboard';
import { StaffAvatar } from './HrMainPage';
import PageLoader from '../../components/shared/PageLoader';

// ====================================================================
// المكافآت والخصومات (/admin/hr/adjustments) — 3 أنواع على الراتب:
// مكافأة (+) وخصم (−) وسلفة (دين يُسترد بالتقسيط عبر المسير + سداد يدوي).
// تُقفل مع مسير الشهر: تُحتسب في صافي المسير المعتمد لذلك الشهر.
// الإضافة أيضًا من صف الموظف (⋯ ← حركة راتب) لا من هنا فقط.
// ====================================================================

const KIND_AR = { bonus: 'مكافأة', deduction: 'خصم', advance: 'سلفة' } as const;
const inputCls =
  'w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none';

export default function AdjustmentsPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);
  const [params] = useSearchParams();
  const preStaff = params.get('staff') || '';

  const monthNow = new Date().toISOString().slice(0, 7);
  const [draftMonth, setDraftMonth] = useState(monthNow);
  const [draftKind, setDraftKind] = useState('');
  const [draftQ, setDraftQ] = useState('');
  const [applied, setApplied] = useState({ month: monthNow, kind: '', q: '' });

  const [showForm, setShowForm] = useState(preStaff !== '');
  const [fStaff, setFStaff] = useState(preStaff);
  const [fKind, setFKind] = useState('bonus');
  const [fAmount, setFAmount] = useState('');
  const [fInst, setFInst] = useState('');
  const [fReason, setFReason] = useState('');
  const [repayId, setRepayId] = useState<string | null>(null);
  const [repayAmt, setRepayAmt] = useState('');

  const { data, isLoading } = useApiQuery(
    ['hr', 'adjustments', applied.month, applied.kind, applied.q],
    () => listAdjustments({ month: applied.month, kind: applied.kind || undefined, q: applied.q || undefined }),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];
  const stats = data?.stats;

  const { data: staffRes } = useApiQuery(['staff'], listStaff, { staleTime: 60_000 });
  const staff = ((staffRes?.data ?? []) as StaffData[]).filter((s) => s.is_active);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['hr', 'adjustments'] });
    queryClient.invalidateQueries({ queryKey: ['hr', 'payroll'] });
  };

  const create = useMutation({
    mutationFn: () => createAdjustment({
      staff_user_id: fStaff, kind: fKind, amount: Number(fAmount),
      installment: fKind === 'advance' && fInst.trim() !== '' ? Number(fInst) : null,
      month: applied.month, reason: fReason.trim() || undefined,
    }),
    onSuccess: () => {
      invalidate(); setShowForm(false);
      setFStaff(''); setFKind('bonus'); setFAmount(''); setFInst(''); setFReason('');
      showToast(rtl ? 'تمت الإضافة' : 'Added', 'success');
    },
    onError: (e) => showToast((e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل' : 'Failed'), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAdjustment(id),
    onSuccess: () => { invalidate(); showToast(rtl ? 'تم الحذف' : 'Deleted', 'success'); },
    onError: () => showToast(rtl ? 'فشل الحذف' : 'Delete failed', 'error'),
  });

  const repay = useMutation({
    mutationFn: () => repayAdvance(repayId!, Number(repayAmt)),
    onSuccess: () => {
      invalidate(); setRepayId(null); setRepayAmt('');
      showToast(rtl ? 'تم تسجيل السداد' : 'Repayment recorded', 'success');
    },
    onError: () => showToast(rtl ? 'فشل' : 'Failed', 'error'),
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'المكافآت والخصومات' : 'Bonuses & deductions'}</h1>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-2xl px-4 py-2.5 min-h-[44px]">
              <Plus size={16} />{rtl ? 'إضافة' : 'Add'}
            </button>
            <button type="button" onClick={() => navigate('/admin/hr')}
              className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl hover:bg-gray-50 min-h-[44px]">
              <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
              {rtl ? 'رجوع' : 'Back'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
          <StatCard icon={Banknote} label={rtl ? 'المكافآت' : 'Bonuses'} value={money(stats?.bonus ?? 0)} accent="emerald" />
          <StatCard icon={Banknote} label={rtl ? 'الخصومات' : 'Deductions'} value={money(stats?.deductions ?? 0)} accent="rose" />
          <StatCard icon={Banknote} label={rtl ? 'السلف' : 'Advances'} value={money(stats?.advances ?? 0)} accent="amber" />
        </div>

        <Panel title={rtl ? 'الفلاتر' : 'Filters'}>
          <div className="flex flex-wrap items-end gap-3">
            <input type="month" value={draftMonth} onChange={(e) => setDraftMonth(e.target.value)}
              className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none" />
            <select value={draftKind} onChange={(e) => setDraftKind(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none">
              <option value="">{rtl ? 'النوع: الكل' : 'All kinds'}</option>
              <option value="bonus">{rtl ? 'مكافأة' : 'Bonus'}</option>
              <option value="deduction">{rtl ? 'خصم' : 'Deduction'}</option>
              <option value="advance">{rtl ? 'سلفة' : 'Advance'}</option>
            </select>
            <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none min-w-[180px]"
              placeholder={rtl ? 'بحث (اسم/رقم)…' : 'Search…'} />
            <button type="button" onClick={() => setApplied({ month: draftMonth, kind: draftKind, q: draftQ })}
              className="h-11 px-6 rounded-xl bg-gray-900 text-white text-sm font-bold min-h-[44px]">
              {rtl ? 'تصفية' : 'Filter'}
            </button>
          </div>
        </Panel>

        <Panel title={`${rtl ? 'السجلات' : 'Records'} (${fmtNum(rows.length)})`}>
          {isLoading ? (
            <PageLoader variant="skeleton" rows={4} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Banknote} accent="gray" title={rtl ? 'لا توجد سجلات' : 'No records'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'النوع' : 'Kind'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المبلغ' : 'Amount'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'مسدد/متبقي' : 'Paid/Rest'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'السبب' : 'Reason'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">⋯</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <StaffAvatar name={r.staff_name || '?'} size="w-8 h-8 text-xs" />
                          <span className="font-medium whitespace-nowrap">{r.staff_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                          r.kind === 'bonus' ? 'bg-emerald-50 text-emerald-700' : r.kind === 'deduction' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {KIND_AR[r.kind]}
                        </span>
                      </td>
                      <td className={`px-4 py-3 tabular-nums font-bold ${r.kind === 'deduction' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {r.kind === 'deduction' ? '-' : '+'}{money(r.amount)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs text-gray-500">
                        {r.kind === 'advance' ? (
                          <span className="flex items-center gap-2">
                            {money(r.repaid)} / {money(r.outstanding)}
                            {r.outstanding > 0 && (
                              <button type="button" onClick={() => { setRepayId(r.id); setRepayAmt(''); }}
                                className="text-emerald-600 font-bold hover:underline">{rtl ? 'سداد' : 'Repay'}</button>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate">{r.reason || '—'}</td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => { if (confirm(rtl ? 'حذف الحركة؟' : 'Delete?')) remove.mutate(r.id); }}
                          className="w-9 h-9 inline-flex items-center justify-center rounded-xl text-red-500 hover:bg-red-50">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* إضافة */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{rtl ? 'حركة جديدة' : 'New entry'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <select value={fStaff} onChange={(e) => setFStaff(e.target.value)} className={inputCls}>
                <option value="">{rtl ? 'الموظف *' : 'Staff *'}</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <select value={fKind} onChange={(e) => setFKind(e.target.value)} className={inputCls}>
                <option value="bonus">{rtl ? 'مكافأة (+)' : 'Bonus (+)'}</option>
                <option value="deduction">{rtl ? 'خصم (−)' : 'Deduction (−)'}</option>
                <option value="advance">{rtl ? 'سلفة (تُسدد بالتقسيط)' : 'Advance (installments)'}</option>
              </select>
              <input type="number" min={0} value={fAmount} onChange={(e) => setFAmount(e.target.value)} className={inputCls} placeholder={rtl ? 'المبلغ *' : 'Amount *'} />
              {fKind === 'advance' && (
                <input type="number" min={0} value={fInst} onChange={(e) => setFInst(e.target.value)} className={inputCls}
                  placeholder={rtl ? 'القسط الشهري (فارغ = الكل)' : 'Monthly installment (empty = all)'} />
              )}
              <input value={fReason} onChange={(e) => setFReason(e.target.value)} className={inputCls} placeholder={rtl ? 'السبب' : 'Reason'} />
              <button onClick={() => create.mutate()} disabled={!fStaff || !fAmount || Number(fAmount) <= 0 || create.isPending}
                className="w-full min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
                {rtl ? 'إضافة' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* سداد سلفة */}
      {repayId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRepayId(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{rtl ? 'تسجيل سداد' : 'Record repayment'}</h2>
            <input type="number" min={0} autoFocus value={repayAmt} onChange={(e) => setRepayAmt(e.target.value)} className={inputCls} placeholder="0" />
            <button onClick={() => repay.mutate()} disabled={!repayAmt || Number(repayAmt) <= 0 || repay.isPending}
              className="mt-3 w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">
              {rtl ? 'تأكيد' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
