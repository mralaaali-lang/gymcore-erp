import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserCheck, UserMinus as UserX, Wallet, Plus, Clock, Trash as Trash2, Pencil, Eye, FileText, Bank as Banknote, Key } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import { printDocument, escapeHtml } from '../../utils/print';
import {
  listStaff, deleteStaff, selfCheckin, getPayroll, leaveBalances, listAdjustments,
  type StaffData,
} from '../../services/api';
import { DashboardPage, StatCard, Panel, EmptyState } from '../../components/dashboard';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/shared/Modal';
import BulkLoginCodesDialog from '../../components/staff/BulkLoginCodesDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/shadcn/dropdown-menu';

// ====================================================================
// شئون الموظفين (/admin/hr) — أول تاب في مجموعة الإعدادات.
// 6 موديولات + حضور ذاتي بالـPIN + كود مسلسل + ⋯ واحدة للصف (عرض/ملف/
// تعديل/حذف/عقد) + شارة cross-link للمدربين (موظف ↔ مدرب).
// ====================================================================

const ROLE_AR: Record<string, string> = { manager: 'مدير', coach: 'مدرب', receptionist: 'استقبال' };

export function StaffAvatar({ name, size = 'w-10 h-10 text-base' }: { name: string; size?: string }) {
  return (
    <span className={`${size} rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold shrink-0`}>
      {(name || '?').charAt(0)}
    </span>
  );
}

const MODULES = [
  { key: 'attendance', ar: 'الحضور', icon: 'schedule', to: '/admin/hr/attendance' },
  { key: 'leaves', ar: 'الإجازات', icon: 'flight', to: '/admin/hr/leaves' },
  { key: 'adjust', ar: 'مكافآت/خصومات', icon: 'balance', to: '/admin/hr/adjustments' },
  { key: 'payroll', ar: 'الرواتب', icon: 'payments', to: '/admin/hr/payroll' },
  { key: 'contracts', ar: 'العقود', icon: 'description', to: '/admin/hr/contracts' },
  { key: 'reports', ar: 'التقارير', icon: 'bar_chart', to: '' },
] as const;

export default function HrMainPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  const [draftQ, setDraftQ] = useState('');
  const [draftStatus, setDraftStatus] = useState('active');
  const [applied, setApplied] = useState({ q: '', status: 'active' });
  const [viewing, setViewing] = useState<StaffData | null>(null);
  const [showSelf, setShowSelf] = useState(false);
  const [selfId, setSelfId] = useState('');
  const [selfPin, setSelfPin] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [showCodes, setShowCodes] = useState(false);

  const { data, isLoading, isError } = useApiQuery(['staff'], listStaff, { staleTime: 30_000 });
  const all = useMemo(() => (data?.data ?? []) as StaffData[], [data]);

  const total = all.length;
  const activeList = all.filter((s) => s.is_active);
  const inactive = total - activeList.length;
  const salarySum = all.filter((s) => s.is_active).reduce((s, x) => s + Number(x.salary ?? 0), 0);

  const rows = all.filter((s) => {
    if (applied.status === 'active' && !s.is_active) return false;
    if (applied.status === 'inactive' && s.is_active) return false;
    const q = applied.q.trim().toLowerCase();
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q)
      || (s.phone || '').includes(q)
      || (s.employee_code || '').toLowerCase().includes(q)
      || (s.job_title || '').toLowerCase().includes(q);
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteStaff(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['staff'] }); showToast(rtl ? 'تم حذف الموظف' : 'Deleted', 'success'); },
    onError: (e) => showToast(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل الحذف — سجلات مرتبطة؟ عطّل بدل الحذف' : 'Delete failed'),
      'error',
    ),
  });

  const selfMut = useMutation({
    mutationFn: () => selfCheckin(selfId, selfPin),
    onSuccess: () => {
      setShowSelf(false); setSelfId(''); setSelfPin('');
      showToast(rtl ? 'تم تسجيل الحضور الذاتي' : 'Self check-in done', 'success');
    },
    onError: (e) => showToast(
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (rtl ? 'فشل التسجيل' : 'Failed'),
      'error',
    ),
  });

  // ملخص التقارير الشهري (زر الموديول السادس)
  const month = new Date().toISOString().slice(0, 7);
  const { data: payRes } = useApiQuery(['hr', 'payroll', month], () => getPayroll(month), { enabled: showSummary });
  const { data: balRes } = useApiQuery(['hr', 'leave-balances', month], () => leaveBalances(month), { enabled: showSummary });
  const { data: adjRes } = useApiQuery(['hr', 'adjustments', month], () => listAdjustments({ month }), { enabled: showSummary });

  const doPdf = () => {
    const ok = printDocument({
      title: rtl ? 'كشف الموظفين' : 'Staff directory',
      innerHtml: `<h1>${escapeHtml(rtl ? 'كشف الموظفين' : 'Staff directory')}</h1>
        <table><thead><tr><th>${rtl ? 'الاسم' : 'Name'}</th><th>${rtl ? 'الكود' : 'Code'}</th><th>${rtl ? 'الوظيفة' : 'Job'}</th><th>${rtl ? 'الهاتف' : 'Phone'}</th><th>${rtl ? 'الراتب' : 'Salary'}</th></tr></thead>
        <tbody>${rows.map((s) => `<tr><td>${escapeHtml(s.full_name)}</td><td>${escapeHtml(s.employee_code || '')}</td><td>${escapeHtml(s.job_title || '')}</td><td>${escapeHtml(s.phone || '')}</td><td>${s.salary ?? ''}</td></tr>`).join('')}</tbody></table>`,
    });
    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        actions={
          <>
            <button type="button" onClick={() => navigate('/admin/hr/add')}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-2xl px-4 py-2.5 shadow-sm min-h-[44px]">
              <Plus size={16} />{rtl ? 'إضافة موظف' : 'Add staff'}
            </button>
            <button type="button" onClick={doPdf}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 hover:bg-gray-50 min-h-[44px]">
              {rtl ? 'تصدير PDF' : 'Export PDF'}
            </button>
            <button type="button" onClick={() => navigate('/admin/hr/attendance')}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl px-4 py-2.5 min-h-[44px]">
              <Clock size={16} />{rtl ? 'سجل الحضور' : 'Attendance log'}
            </button>
            <button type="button" onClick={() => setShowSelf(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-700 bg-sky-100 hover:bg-sky-200 rounded-2xl px-4 py-2.5 min-h-[44px]">
              {rtl ? 'حضور ذاتي' : 'Self check-in'}
            </button>
            <button type="button" onClick={() => setShowCodes(true)}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 hover:bg-gray-50 min-h-[44px]">
              <Key size={16} />{rtl ? 'أكواد الدخول' : 'Login codes'}
            </button>
          </>
        }
      >
        {/* ── الكروت الأربعة ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={Users} label={rtl ? 'إجمالي الموظفين' : 'Total staff'} value={fmtNum(total)} accent="violet" />
          <StatCard icon={UserCheck} label={rtl ? 'موظف نشط' : 'Active'} value={fmtNum(activeList.length)} accent="emerald" />
          <StatCard icon={UserX} label={rtl ? 'موظف غير نشط' : 'Inactive'} value={fmtNum(inactive)} accent="rose" />
          <StatCard icon={Wallet} label={rtl ? 'إجمالي الرواتب' : 'Payroll total'} value={money(salarySum)} accent="amber" onClick={() => navigate('/admin/hr/payroll')} />
        </div>

        {/* ── شريط الموديولات الستة ── */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => (m.to ? navigate(m.to) : setShowSummary(true))}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-gray-200 transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-3xl text-emerald-600">{m.icon}</span>
              <span className="text-xs font-bold text-gray-900 text-center">{m.ar}</span>
            </button>
          ))}
        </div>

        {/* ── البحث ── */}
        <Panel icon={Users} accent="cyan" title={rtl ? 'البحث' : 'Search'}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setApplied({ q: draftQ, status: draftStatus }); }}
                className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none"
                placeholder={rtl ? 'الاسم / الهاتف / الكود / الوظيفة…' : 'Name / phone / code / job…'} />
            </div>
            <select value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)} className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none">
              <option value="all">{rtl ? 'الكل' : 'All'}</option>
              <option value="active">{rtl ? 'نشط' : 'Active'}</option>
              <option value="inactive">{rtl ? 'غير نشط' : 'Inactive'}</option>
            </select>
            <button type="button" onClick={() => setApplied({ q: draftQ, status: draftStatus })}
              className="h-11 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold min-h-[44px]">
              {rtl ? 'بحث' : 'Search'}
            </button>
          </div>
        </Panel>

        {/* ── الجدول ── */}
        <Panel title={`${rtl ? 'قائمة الموظفين' : 'Staff'} (${fmtNum(rows.length)})`}>
          {isLoading ? (
            <p className="text-center py-8 text-gray-400">{rtl ? 'جاري التحميل…' : 'Loading…'}</p>
          ) : isError ? (
            <p className="text-center py-8 text-red-500">{rtl ? 'فشل التحميل' : 'Failed'}</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} accent="gray" title={rtl ? 'لا موظفين' : 'No staff'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-900">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الوظيفة' : 'Job'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الهاتف' : 'Phone'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الراتب' : 'Salary'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">⋯</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <StaffAvatar name={s.full_name} />
                          <div>
                            <p className="font-medium whitespace-nowrap flex items-center gap-1.5">
                              {s.full_name}
                              {s.role === 'coach' && (
                                <Link to="/admin/trainers" title={rtl ? 'صفحة المدربين' : 'Coaches page'}
                                  className="text-[11px] font-bold text-sky-700 bg-sky-100 rounded-full px-2 py-0.5 hover:bg-sky-200">
                                  {rtl ? 'مدرب' : 'Coach'}
                                </Link>
                              )}
                            </p>
                            {s.employee_code && <p className="text-xs text-gray-400" dir="ltr">{s.employee_code}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium whitespace-nowrap">{s.job_title || ROLE_AR[s.role] || s.role}</p>
                        {s.department && <p className="text-xs text-gray-400">{rtl ? 'القسم' : 'Dept'}: {s.department}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap" dir="ltr">{s.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold whitespace-nowrap">{s.salary != null ? money(s.salary) : '—'}</p>
                        <p className="text-[11px] text-gray-400">{rtl ? 'جنيه' : ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.is_active ? (rtl ? 'نشط' : 'Active') : (rtl ? 'غير نشط' : 'Inactive')} variant={s.is_active ? 'success' : 'neutral'} />
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button"
                              className="w-10 h-10 inline-flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-600 font-bold" aria-label="⋯">
                              ⋯
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => setViewing(s)}>
                              <Eye size={15} />{rtl ? 'عرض' : 'View'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setViewing(s)}>
                              <FileText size={15} />{rtl ? 'ملف' : 'Dossier'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => navigate(`/admin/hr/add?edit=${s.id}`)}>
                              <Pencil size={15} />{rtl ? 'تعديل' : 'Edit'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => navigate(`/admin/hr/contracts?staff=${s.id}`)}>
                              <FileText size={15} />{rtl ? 'عقد' : 'Contract'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => navigate(`/admin/hr/adjustments?staff=${s.id}`)}>
                              <Banknote size={15} />{rtl ? 'حركة راتب' : 'Adjustment'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="danger"
                              onSelect={() => { if (confirm(rtl ? `حذف ${s.full_name}؟` : `Delete ${s.full_name}?`)) del.mutate(s.id); }}
                            >
                              <Trash2 size={15} />{rtl ? 'حذف' : 'Delete'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </DashboardPage>

      {/* ملف الموظف */}
      {viewing && (
        <Modal
          open
          onClose={() => setViewing(null)}
          size="md"
          title={
            <span className="flex items-center gap-3">
              <StaffAvatar name={viewing.full_name} size="w-12 h-12 text-xl" />
              <span className="min-w-0">
                <span className="block truncate">{viewing.full_name}</span>
                <span className="block text-xs font-normal text-muted-foreground" dir="ltr">
                  {viewing.employee_code || ''}
                </span>
              </span>
            </span>
          }
        >
          <dl className="space-y-2 text-sm">
            {([
              [rtl ? 'الوظيفة' : 'Job', `${viewing.job_title || ROLE_AR[viewing.role] || viewing.role}${viewing.department ? ` / ${viewing.department}` : ''}`],
              [rtl ? 'الهاتف' : 'Phone', viewing.phone || '—'],
              [rtl ? 'البريد' : 'Email', viewing.email],
              [rtl ? 'الراتب' : 'Salary', viewing.salary != null ? money(viewing.salary) : '—'],
              [rtl ? 'العمولة' : 'Commission', `${Number(viewing.commission_pct ?? 0)}%`],
              [rtl ? 'التعيين' : 'Hired', viewing.hire_date || '—'],
              [rtl ? 'الدوام' : 'Shift', viewing.shift_start && viewing.shift_end ? `${viewing.shift_start}–${viewing.shift_end} (+${viewing.late_allowance_min ?? 0}د)` : '—'],
              [rtl ? 'البدلات' : 'Allowances', money(Number(viewing.housing_allowance ?? 0) + Number(viewing.transport_allowance ?? 0) + Number(viewing.other_allowance ?? 0))],
              [rtl ? 'الحالة' : 'Status', viewing.is_active ? (rtl ? 'نشط' : 'Active') : (rtl ? 'غير نشط' : 'Inactive')],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 border-b border-gray-50 pb-1.5">
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-semibold text-gray-900 text-start">{v}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {/* حضور ذاتي */}
      {showSelf && (
        <Modal
          open
          onClose={() => setShowSelf(false)}
          size="sm"
          disableDismiss={selfMut.isPending}
          title={rtl ? 'حضور ذاتي' : 'Self check-in'}
          description={rtl ? 'اختر الموظف ثم أدخل PIN الحضور الخاص به' : 'Pick staff, then enter their attendance PIN'}
          footer={
            <button onClick={() => selfMut.mutate()} disabled={!selfId || selfPin.length < 4 || selfMut.isPending}
              className="w-full min-h-[48px] rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold disabled:opacity-50">
              {rtl ? 'تسجيل الحضور' : 'Check in'}
            </button>
          }
        >
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-gray-500">{rtl ? 'الموظف' : 'Staff'}</label>
            <select value={selfId} onChange={(e) => setSelfId(e.target.value)} className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm outline-none">
              <option value="">{rtl ? 'اختر…' : 'Select…'}</option>
              {activeList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            <label className="mt-2 block text-sm font-semibold text-gray-500">PIN</label>
            <input type="password" inputMode="numeric" dir="ltr" value={selfPin} onChange={(e) => setSelfPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm text-center tracking-[0.5em] outline-none" placeholder="••••" />
          </div>
        </Modal>
      )}

      {/* ملخص التقارير */}
      {showSummary && (
        <Modal
          open
          onClose={() => setShowSummary(false)}
          size="md"
          title={rtl ? `ملخص الموارد — ${month}` : `HR summary — ${month}`}
          description={rtl ? 'أرقام الشهر من المسير والتسويات والإجازات.' : 'This month across payroll, adjustments and leave.'}
          footer={
            <>
              <Link to="/admin/hr/payroll" className="flex-1 text-center min-h-[44px] px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold">{rtl ? 'الرواتب' : 'Payroll'}</Link>
              <Link to="/admin/hr/leaves" className="flex-1 text-center min-h-[44px] px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">{rtl ? 'الإجازات' : 'Leaves'}</Link>
            </>
          }
        >
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-gray-50 pb-1.5"><dt className="text-gray-500">{rtl ? 'مسير الشهر' : 'Payroll'}</dt><dd className="font-bold">{payRes?.data ? money(payRes.data.total_net) : '—'}</dd></div>
            <div className="flex justify-between border-b border-gray-50 pb-1.5"><dt className="text-gray-500">{rtl ? 'مكافآت الشهر' : 'Bonuses'}</dt><dd className="font-bold text-emerald-600">{money(adjRes?.stats?.bonus ?? 0)}</dd></div>
            <div className="flex justify-between border-b border-gray-50 pb-1.5"><dt className="text-gray-500">{rtl ? 'خصومات الشهر' : 'Deductions'}</dt><dd className="font-bold text-red-600">{money(adjRes?.stats?.deductions ?? 0)}</dd></div>
            <div className="flex justify-between border-b border-gray-50 pb-1.5"><dt className="text-gray-500">{rtl ? 'سلف مستحقة' : 'Advances due'}</dt><dd className="font-bold text-amber-600">{money(adjRes?.stats?.advances ?? 0)}</dd></div>
            <div className="flex justify-between border-b border-gray-50 pb-1.5"><dt className="text-gray-500">{rtl ? 'أيام إجازات الشهر' : 'Leave days'}</dt><dd className="font-bold">{fmtNum((balRes?.data ?? []).reduce((s, b) => s + Number(b.monthly_used ?? 0), 0))}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">{rtl ? 'موظفون نشطون' : 'Active staff'}</dt><dd className="font-bold">{fmtNum(activeList.length)}</dd></div>
          </dl>
        </Modal>
      )}

      {showCodes && (
        <BulkLoginCodesDialog open onClose={() => setShowCodes(false)} scope="staff" />
      )}
    </div>
  );
}
