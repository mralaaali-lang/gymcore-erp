import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, X, Trash as Trash2, Eye } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import { listHrContracts, createHrContract, deleteHrContract, listStaff, type StaffData } from '../../services/api';
import { Panel, EmptyState } from '../../components/dashboard';
import { StaffAvatar } from './HrMainPage';
import PageLoader from '../../components/shared/PageLoader';
import StatusBadge from '../../components/ui/StatusBadge';

// ====================================================================
// العقود الوظيفية (/admin/hr/contracts) — أرقام CON- متسلسلة لا تُعاد
// (الفجوات audit trail). الحالة تُقلب تلقائيًا بانتهاء التاريخ (cron
// يومي). بلا عمود مرفقات: لا ملف واحد مرفوع في الداتا — حُذف العمود
// بدل فيتشر ميتة (قرار موثق لا سهو).
// ====================================================================

const inputCls =
  'w-full min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none';

export default function ContractsPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);
  const [params] = useSearchParams();

  const [draftQ, setDraftQ] = useState(params.get('staff') ? '' : '');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftExp, setDraftExp] = useState(false);
  const [applied, setApplied] = useState({ q: '', status: '', exp: false });
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<(typeof rows)[number] | null>(null);
  const [fStaff, setFStaff] = useState(params.get('staff') || '');
  const [fType, setFType] = useState('دائم');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fSalary, setFSalary] = useState('');
  const [fNotes, setFNotes] = useState('');

  const { data, isLoading } = useApiQuery(
    ['hr', 'contracts', applied.q, applied.status, String(applied.exp)],
    () => listHrContracts({ q: applied.q || undefined, status: applied.status || undefined, expiring: applied.exp || undefined }),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];

  const { data: staffRes } = useApiQuery(['staff'], listStaff, { staleTime: 60_000 });
  const staff = ((staffRes?.data ?? []) as StaffData[]).filter((s) => s.is_active);

  const create = useMutation({
    mutationFn: () => createHrContract({
      staff_user_id: fStaff, contract_type: fType, start_date: fFrom,
      end_date: fTo || null, salary: Number(fSalary), notes: fNotes.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'contracts'] });
      setShowForm(false);
      setFStaff(''); setFType('دائم'); setFFrom(''); setFTo(''); setFSalary(''); setFNotes('');
      showToast(rtl ? 'تم إنشاء العقد برقم مسلسل' : 'Contract created', 'success');
    },
    onError: (e) => showToast((e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل' : 'Failed'), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteHrContract(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['hr', 'contracts'] }); showToast(rtl ? 'تم الحذف' : 'Deleted', 'success'); },
    onError: () => showToast(rtl ? 'فشل الحذف' : 'Delete failed', 'error'),
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-gray-900">{rtl ? 'العقود الوظيفية' : 'Contracts'}</h1>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-2xl px-4 py-2.5 min-h-[44px]">
              <Plus size={16} />{rtl ? 'عقد جديد' : 'New contract'}
            </button>
            <button type="button" onClick={() => navigate('/admin/hr')}
              className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl hover:bg-gray-50 min-h-[44px]">
              <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
              {rtl ? 'رجوع' : 'Back'}
            </button>
          </div>
        </div>

        <Panel title={rtl ? 'الفلاتر' : 'Filters'}>
          <div className="flex flex-wrap items-end gap-3">
            <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none min-w-[220px]"
              placeholder={rtl ? 'بحث (اسم/رقم موظف/رقم عقد)…' : 'Search…'} />
            <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none">
              <option value="">{rtl ? 'الحالة: الكل' : 'All'}</option>
              <option value="active">{rtl ? 'نشط' : 'Active'}</option>
              <option value="expired">{rtl ? 'منتهي' : 'Expired'}</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 min-h-[44px] cursor-pointer">
              <input type="checkbox" checked={draftExp} onChange={(e) => setDraftExp(e.target.checked)} className="w-5 h-5 rounded accent-orange-500" />
              {rtl ? 'تنتهي قريبًا فقط' : 'Expiring soon only'}
            </label>
            <button type="button" onClick={() => setApplied({ q: draftQ, status: draftStatus, exp: draftExp })}
              className="h-11 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold min-h-[44px]">
              {rtl ? 'بحث' : 'Search'}
            </button>
          </div>
        </Panel>

        <Panel title={`${rtl ? 'العقود' : 'Contracts'} (${fmtNum(rows.length)})`}>
          {isLoading ? (
            <PageLoader variant="skeleton" rows={5} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Plus} accent="gray" title={rtl ? 'لا عقود' : 'No contracts'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'رقم العقد' : 'No.'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'رقم الموظف' : 'Code'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'النوع' : 'Type'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'البداية' : 'From'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'النهاية' : 'To'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الراتب' : 'Salary'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                    <th className="text-start px-3 py-3 text-xs font-semibold text-gray-500">{rtl ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-3 font-mono font-bold whitespace-nowrap" dir="ltr">{r.contract_no}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <StaffAvatar name={r.staff_name || '?'} size="w-8 h-8 text-xs" />
                          <span className="font-medium whitespace-nowrap">{r.staff_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-400 text-xs" dir="ltr">{r.employee_code || '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{r.contract_type}</td>
                      <td className="px-3 py-3 tabular-nums whitespace-nowrap">{r.start_date}</td>
                      <td className="px-3 py-3 tabular-nums whitespace-nowrap">{r.end_date || '—'}</td>
                      <td className="px-3 py-3 tabular-nums whitespace-nowrap">{money(r.salary)}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={r.status === 'active' ? (rtl ? 'نشط' : 'Active') : (rtl ? 'منتهي' : 'Expired')} variant={r.status === 'active' ? 'success' : 'neutral'} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => setViewing(r)} title={rtl ? 'عرض' : 'View'}
                            className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">
                            <Eye size={15} />
                          </button>
                          <button type="button" onClick={() => { if (confirm(rtl ? `حذف ${r.contract_no}؟` : `Delete ${r.contract_no}?`)) remove.mutate(r.id); }}
                            className="w-9 h-9 inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* عقد جديد */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{rtl ? 'عقد جديد' : 'New contract'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <select value={fStaff} onChange={(e) => setFStaff(e.target.value)} className={inputCls}>
                <option value="">{rtl ? 'الموظف *' : 'Staff *'}</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input value={fType} onChange={(e) => setFType(e.target.value)} className={inputCls} placeholder={rtl ? 'النوع (دائم)' : 'Type'} />
                <input type="number" min={0} value={fSalary} onChange={(e) => setFSalary(e.target.value)} className={inputCls} placeholder={rtl ? 'الراتب *' : 'Salary *'} />
                <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className={inputCls} />
                <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className={inputCls} />
              </div>
              <button onClick={() => create.mutate()} disabled={!fStaff || !fFrom || !fSalary || create.isPending}
                className="w-full min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-50">
                {rtl ? 'إنشاء برقم مسلسل' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* عرض */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-mono font-bold text-gray-900" dir="ltr">{viewing.contract_no}</h2>
              <button onClick={() => setViewing(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <dl className="space-y-2 text-sm">
              {([
                [rtl ? 'الموظف' : 'Staff', viewing.staff_name || '—'],
                [rtl ? 'النوع' : 'Type', viewing.contract_type],
                [rtl ? 'المدة' : 'Period', `${viewing.start_date} → ${viewing.end_date || '…'} `],
                [rtl ? 'الراتب' : 'Salary', money(viewing.salary)],
                [rtl ? 'ملاحظات' : 'Notes', viewing.notes || '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2 border-b border-gray-50 pb-1.5">
                  <dt className="text-gray-500">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
