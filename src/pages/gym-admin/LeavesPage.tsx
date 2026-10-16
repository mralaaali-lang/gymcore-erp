import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, X, Check } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { fmtNum } from '../../utils/date';
import { listLeaves, requestLeave, decideLeave, leaveBalances, listStaff, type StaffData } from '../../services/api';
import { Panel, EmptyState } from '../../components/dashboard';
import { StaffAvatar } from './HrMainPage';
import PageLoader from '../../components/shared/PageLoader';
import StatusBadge from '../../components/ui/StatusBadge';

// ====================================================================
// إدارة الإجازات (/admin/hr/leaves) — رصيد شهري متجدد + طلبات.
// 3 عدّادات منفصلة (سنوي/مرضي/شهري)؛ الخصم لحظة الاعتماد لا الطلب.
// ====================================================================

const LEAVE_AR: Record<string, string> = { annual: 'سنوية', sick: 'مرضية', unpaid: 'بدون راتب' };
const inputCls =
  'w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none';

export default function LeavesPage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const month = new Date().toISOString().slice(0, 7);

  const [draftQ, setDraftQ] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [applied, setApplied] = useState({ q: '', status: '' });
  const [showForm, setShowForm] = useState(false);
  const [fStaff, setFStaff] = useState('');
  const [fType, setFType] = useState('annual');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fNotes, setFNotes] = useState('');

  const { data: balRes, isLoading: balLoading } = useApiQuery(['hr', 'leave-balances', month], () => leaveBalances(month), { staleTime: 60_000 });
  const balances = balRes?.data ?? [];

  const { data: leavesRes, isLoading: leavesLoading } = useApiQuery(
    ['hr', 'leaves', applied.status, applied.q],
    () => listLeaves({ status: applied.status || undefined, q: applied.q || undefined }),
    { staleTime: 30_000 },
  );
  const rows = leavesRes?.data ?? [];

  const { data: staffRes } = useApiQuery(['staff'], listStaff, { staleTime: 60_000 });
  const staff = ((staffRes?.data ?? []) as StaffData[]).filter((s) => s.is_active);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['hr', 'leaves'] });
    queryClient.invalidateQueries({ queryKey: ['hr', 'leave-balances'] });
  };

  const create = useMutation({
    mutationFn: () => requestLeave({ staff_user_id: fStaff, leave_type: fType, start_date: fFrom, end_date: fTo, notes: fNotes.trim() || undefined }),
    onSuccess: () => {
      invalidate(); setShowForm(false);
      setFStaff(''); setFType('annual'); setFFrom(''); setFTo(''); setFNotes('');
      showToast(rtl ? 'تم إرسال الطلب (معلق)' : 'Request sent (pending)', 'success');
    },
    onError: (e) => showToast((e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل' : 'Failed'), 'error'),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => decideLeave(id, approve),
    onSuccess: (_r, v) => {
      invalidate();
      showToast(rtl ? (v.approve ? 'تم الاعتماد والخصم من الرصيد' : 'تم الرفض (بلا خصم)') : 'Done', 'success');
    },
    onError: (e) => showToast((e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل' : 'Failed'), 'error'),
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'إدارة الإجازات' : 'Leaves'}</h1>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-2xl px-4 py-2.5 min-h-[44px]">
              <Plus size={16} />{rtl ? 'طلب إجازة' : 'Request leave'}
            </button>
            <button type="button" onClick={() => navigate('/admin/hr')}
              className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl hover:bg-gray-50 min-h-[44px]">
              <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
              {rtl ? 'رجوع' : 'Back'}
            </button>
          </div>
        </div>

        {/* رصيد الشهر */}
        <Panel title={`${rtl ? 'رصيد إجازات شهر' : 'Leave balances'} ${month} (${fmtNum(balances.length)})`}>
          {balLoading ? (
            <PageLoader variant="skeleton" rows={4} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الكود' : 'Code'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الرصيد الشهري' : 'Monthly'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المستخدم' : 'Used'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'المتبقي' : 'Left'}</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.staff_id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{b.full_name}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs" dir="ltr">{b.employee_code || '—'}</td>
                      <td className="px-4 py-3 tabular-nums">{fmtNum(b.monthly_allowance)}</td>
                      <td className="px-4 py-3 tabular-nums">{fmtNum(b.monthly_used)}</td>
                      <td className="px-4 py-3 tabular-nums font-bold text-emerald-600">{fmtNum(b.monthly_left)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* الطلبات */}
        <Panel title={rtl ? 'الطلبات' : 'Requests'}>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none min-w-[200px]"
              placeholder={rtl ? 'بحث (اسم/رقم)…' : 'Search…'} />
            <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none">
              <option value="">{rtl ? 'الكل' : 'All'}</option>
              <option value="pending">{rtl ? 'معلق' : 'Pending'}</option>
              <option value="approved">{rtl ? 'معتمد' : 'Approved'}</option>
              <option value="rejected">{rtl ? 'مرفوض' : 'Rejected'}</option>
            </select>
            <button type="button" onClick={() => setApplied({ q: draftQ, status: draftStatus })}
              className="h-11 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold min-h-[44px]">
              {rtl ? 'بحث' : 'Search'}
            </button>
          </div>
          {leavesLoading ? (
            <PageLoader variant="skeleton" rows={4} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Plus} accent="gray" title={rtl ? 'لا طلبات' : 'No requests'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'النوع' : 'Type'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'من' : 'From'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'إلى' : 'To'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الأيام' : 'Days'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
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
                      <td className="px-4 py-3 whitespace-nowrap">{LEAVE_AR[r.leave_type] ?? r.leave_type}</td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{r.start_date}</td>
                      <td className="px-4 py-3 tabular-nums whitespace-nowrap">{r.end_date}</td>
                      <td className="px-4 py-3 tabular-nums">{fmtNum(r.days)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={r.status === 'approved' ? (rtl ? 'معتمد' : 'Approved') : r.status === 'rejected' ? (rtl ? 'مرفوض' : 'Rejected') : (rtl ? 'معلق' : 'Pending')}
                          variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'error' : 'warning'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {r.status === 'pending' && (
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => decide.mutate({ id: r.id, approve: true })} disabled={decide.isPending}
                              className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50" title={rtl ? 'اعتماد وخصم' : 'Approve'}>
                              <Check size={15} />
                            </button>
                            <button type="button" onClick={() => decide.mutate({ id: r.id, approve: false })} disabled={decide.isPending}
                              className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-red-100 hover:bg-red-200 text-red-600 disabled:opacity-50" title={rtl ? 'رفض' : 'Reject'}>
                              <X size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* طلب إجازة */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{rtl ? 'طلب إجازة' : 'Request leave'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <select value={fStaff} onChange={(e) => setFStaff(e.target.value)} className={inputCls}>
                <option value="">{rtl ? 'الموظف *' : 'Staff *'}</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <select value={fType} onChange={(e) => setFType(e.target.value)} className={inputCls}>
                <option value="annual">{rtl ? 'سنوية' : 'Annual'}</option>
                <option value="sick">{rtl ? 'مرضية' : 'Sick'}</option>
                <option value="unpaid">{rtl ? 'بدون راتب' : 'Unpaid'}</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className={inputCls} />
                <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className={inputCls} />
              </div>
              <button onClick={() => create.mutate()} disabled={!fStaff || !fFrom || !fTo || create.isPending}
                className="w-full min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
                {rtl ? 'إرسال الطلب' : 'Send request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
