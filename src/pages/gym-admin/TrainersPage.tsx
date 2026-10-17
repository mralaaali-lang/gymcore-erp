import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserCheck, Clock, Ticket, Plus, Phone, Percent, Wallet, X } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import { listCoachesSummary, createStaff, updateStaff, type CoachSummary } from '../../services/api';
import { DashboardPage, StatCard, Panel, EmptyState } from '../../components/dashboard';
import PageLoader from '../../components/shared/PageLoader';
import Modal from '../../components/shared/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { sportName, useSportsCatalog } from './subscriptions/shared';

// ====================================================================
// المدربون (/admin/trainers) — كروت لا جدول.
// الصف: حرف أول الاسم في مربع ملوّن + checkbox تحديد متعدد (شريط أكشن
// جماعي ثابت يظهر عند التحديد: تفعيل/تعطيل). الأرقام من الدفاتر الحية:
// اشتراكات نشطة مربوطة بالمدرب (coach_id)، متواجد الآن (شيفت مفتوح)،
// والرياضة الغالبة من اشتراكاته (لا عمود تخصص في الداتا — بلا اشتراكات
// مصنّفة تُعرض «عام»). لا كود وظيفي في الداتا (staff_users بلا رقم
// موظف) فلا سطر كود مختلق. نوع التعاقد explicit من (راتب>0/عمولة>0):
// راتب ثابت / عمولة فقط / مختلط / بدون تعاقد.
// ====================================================================

const AVATARS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

function avatarCls(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return AVATARS[h % AVATARS.length];
}

function contractOf(salary: unknown, commission: unknown): { ar: string; en: string; cls: string } {
  const s = Number(salary ?? 0) > 0;
  const c = Number(commission ?? 0) > 0;
  if (s && c) return { ar: 'مختلط', en: 'Mixed', cls: 'bg-emerald-50 text-emerald-700' };
  if (s) return { ar: 'راتب ثابت', en: 'Salary', cls: 'bg-sky-50 text-sky-700' };
  if (c) return { ar: 'عمولة فقط', en: 'Commission', cls: 'bg-amber-50 text-amber-700' };
  return { ar: 'بدون تعاقد', en: 'No contract', cls: 'bg-gray-100 text-gray-500' };
}

const inputCls =
  'w-full min-h-[48px] md:min-h-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/40';

export default function TrainersPage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);
  const { sports: catalogSports } = useSportsCatalog();

  const [selected, setSelected] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');
  const [commission, setCommission] = useState('');

  const { data, isLoading, isError } = useApiQuery(
    ['coaches', 'summary'],
    listCoachesSummary,
    { staleTime: 30_000 },
  );
  const coaches = useMemo(() => data?.data ?? [], [data]);

  const total = coaches.length;
  const active = coaches.filter((c) => c.is_active).length;
  const present = coaches.filter((c) => c.on_shift).length;
  const linkedSubs = coaches.reduce((s, c) => s + Number(c.sub_count ?? 0), 0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['coaches'] });
    queryClient.invalidateQueries({ queryKey: ['staff'] });
  };

  const toggle = useMutation({
    mutationFn: (c: CoachSummary) => updateStaff(c.id, { is_active: !c.is_active }),
    onSuccess: () => { invalidate(); showToast(rtl ? 'تم تحديث الحالة' : 'Status updated', 'success'); },
    onError: () => showToast(rtl ? 'فشل التحديث' : 'Update failed', 'error'),
  });

  const bulk = useMutation({
    mutationFn: (toActive: boolean) =>
      Promise.all(selected.map((id) => updateStaff(id, { is_active: toActive }))),
    onSuccess: (_r, toActive) => {
      invalidate(); setSelected([]);
      showToast(rtl ? (toActive ? 'تم تفعيل المحدد' : 'تم تعطيل المحدد') : 'Bulk update done', 'success');
    },
    onError: () => showToast(rtl ? 'فشل الأكشن الجماعي' : 'Bulk action failed', 'error'),
  });

  const create = useMutation({
    mutationFn: () => createStaff({
      full_name: name.trim(), email: email.trim(), password, role: 'coach',
      phone: phone.trim() || undefined,
      salary: salary === '' ? undefined : Number(salary),
      // العمولة من أول يوم — صفر الافتراضي الدائم كان يطفئ الفيتشر
      commission_pct: commission === '' ? 0 : Math.min(100, Math.max(0, Number(commission))),
    }),
    onSuccess: () => {
      invalidate(); setShowForm(false);
      setName(''); setEmail(''); setPassword(''); setPhone(''); setSalary(''); setCommission('');
      showToast(rtl ? 'تمت إضافة المدرب' : 'Coach added', 'success');
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل إضافة المدرب' : 'Failed to add coach'), 'error');
    },
  });

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const formValid = name.trim().length > 1 && /.+@.+\..+/.test(email.trim()) && password.length >= 6;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6 pb-28">
      <DashboardPage
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('/admin/trainer-attendance')}
              title={rtl ? 'حضور المدربين — سجل وتقرير' : 'Coach attendance log and report'}
              className="inline-flex items-center gap-2 bg-sky-100 text-sky-700 text-sm font-bold px-4 py-2.5 rounded-2xl hover:bg-sky-200 active:scale-[0.98] transition-all"
            >
              <Clock size={16} />
              {rtl ? 'الحضور' : 'Attendance'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-orange-500 text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-lg shadow-orange-500/20 hover:bg-orange-600 active:scale-[0.98] transition-all"
            >
              <Plus size={16} />
              {rtl ? 'إضافة مدرب' : 'Add coach'}
            </button>
          </>
        }
      >
        {/* ── الكروت الأربعة ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={Users} label={rtl ? 'إجمالي المدربين' : 'Total coaches'} value={fmtNum(total)} accent="violet" />
          <StatCard icon={UserCheck} label={rtl ? 'نشطين' : 'Active'} value={fmtNum(active)} accent="emerald" />
          <StatCard icon={Clock} label={rtl ? 'متواجدون الآن' : 'Present now'} value={fmtNum(present)} accent="sky" onClick={() => navigate('/admin/trainer-attendance')} />
          <StatCard icon={Ticket} label={rtl ? 'اشتراكات نشطة' : 'Active subscriptions'} value={fmtNum(linkedSubs)} accent="amber" onClick={() => navigate('/admin/subscriptions?status=active')} />
        </div>

        {/* ── قائمة المدربين ── */}
        <Panel
          title={`${rtl ? 'قائمة المدربين' : 'Coaches'} (${fmtNum(total)})`}
          actions={
            total > 0 ? (
              <button
                type="button"
                onClick={() => (selected.length === total ? setSelected([]) : setSelected(coaches.map((c) => c.id)))}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900"
              >
                {selected.length === total ? (rtl ? 'إلغاء تحديد الكل' : 'Clear all') : (rtl ? 'تحديد الكل' : 'Select all')}
              </button>
            ) : undefined
          }
        >
          {isLoading ? (
            <PageLoader variant="skeleton" rows={6} />
          ) : isError ? (
            <p className="text-sm text-red-500 text-center py-8">{rtl ? 'فشل تحميل المدربين' : 'Failed to load coaches'}</p>
          ) : coaches.length === 0 ? (
            <EmptyState
              title={rtl ? 'لا مدربين بعد' : 'No coaches yet'}
              description={rtl ? 'أضف أول مدرب من الزر البرتقالي.' : 'Add your first coach with the orange button.'}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {coaches.map((c) => {
                const checked = selected.includes(c.id);
                const contract = contractOf(c.salary, c.commission_pct);
                const comm = Number(c.commission_pct ?? 0);
                return (
                  <div
                    key={c.id}
                    className={`relative rounded-3xl border p-5 shadow-sm transition-colors ${
                      checked ? 'border-emerald-400 ring-2 ring-emerald-500/20 bg-emerald-50/30' : c.is_active ? 'border-gray-100 bg-white' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    {/* تحديد متعدد — شمال الكارت */}
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(c.id)}
                      aria-label={rtl ? `تحديد ${c.full_name}` : `Select ${c.full_name}`}
                      className="absolute top-3 left-3 w-5 h-5 rounded accent-emerald-600 cursor-pointer"
                    />
                    <div className="flex items-center gap-3">
                      <span className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-xl shrink-0 ${avatarCls(c.full_name)}`}>
                        {c.full_name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{c.full_name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {c.sport_mode ? sportName(c.sport_mode, catalogSports, rtl) : (rtl ? 'عام' : 'General')}
                          {c.on_shift && <span className="text-emerald-600 font-semibold"> · {rtl ? 'متواجد' : 'Present'}</span>}
                        </p>
                      </div>
                    </div>

                    {/* 3 أرقام */}
                    <div className="mt-4 space-y-1.5 text-sm font-semibold">
                      <p className="flex items-center gap-2 text-red-600">
                        <Users size={16} className="shrink-0" />
                        <span>{rtl ? 'اشتراك' : 'Subs'} {fmtNum(Number(c.sub_count ?? 0))}</span>
                      </p>
                      <p className={`flex items-center gap-2 ${comm > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                        <Percent size={16} className="shrink-0" />
                        <span title={comm > 0 ? undefined : (rtl ? 'النسبة صفر — فعّلها من الإضافة/التعديل' : 'Zero rate — set it on create/edit')}>
                          {rtl ? 'العمولة' : 'Commission'} {fmtNum(comm)}%
                        </span>
                      </p>
                      <p className="flex items-center gap-2 text-sky-600">
                        <Wallet size={16} className="shrink-0" />
                        <span>{rtl ? 'الراتب' : 'Salary'} {money(c.salary)}</span>
                      </p>
                    </div>

                    {/* الهاتف */}
                    <p className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                      <Phone size={15} className="text-gray-400 shrink-0" />
                      {c.phone ? <span dir="ltr">{c.phone}</span> : <span className="text-gray-400">{rtl ? 'لا هاتف مسجل' : 'No phone'}</span>}
                    </p>

                    {/* التعاقد + الحالة */}
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${contract.cls}`}>
                        {rtl ? contract.ar : contract.en}
                      </span>
                      <button type="button" onClick={() => toggle.mutate(c)} disabled={toggle.isPending} className="disabled:opacity-50" title={rtl ? 'اضغط للتبديل' : 'Click to toggle'}>
                        <StatusBadge status={c.is_active ? (rtl ? 'نشط' : 'Active') : (rtl ? 'غير نشط' : 'Inactive')} variant={c.is_active ? 'success' : 'neutral'} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </DashboardPage>

      {/* شريط الأكشن الجماعي — يظهر فقط مع التحديد */}
      {selected.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 z-40 flex justify-center pointer-events-none">
          <div className="pointer-events-auto bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold">{rtl ? `تم تحديد ${fmtNum(selected.length)}` : `${selected.length} selected`}</span>
            <button
              type="button"
              onClick={() => bulk.mutate(true)}
              disabled={bulk.isPending}
              className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold disabled:opacity-50"
            >
              {rtl ? 'تفعيل المحدد' : 'Activate'}
            </button>
            <button
              type="button"
              onClick={() => bulk.mutate(false)}
              disabled={bulk.isPending}
              className="min-h-[40px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-sm font-bold disabled:opacity-50"
            >
              {rtl ? 'تعطيل المحدد' : 'Deactivate'}
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="min-h-[40px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* إضافة مدرب — الدور ثابت coach والعمولة من أول يوم */}
      {showForm && (
        <Modal
          open
          onClose={() => setShowForm(false)}
          size="md"
          dir={rtl ? 'rtl' : 'ltr'}
          disableDismiss={create.isPending}
          title={rtl ? 'إضافة مدرب' : 'Add coach'}
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={create.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition disabled:opacity-50"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => create.mutate()}
                disabled={!formValid || create.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition disabled:opacity-50"
              >
                {create.isPending ? (rtl ? 'جارٍ الإضافة…' : 'Adding…') : (rtl ? 'إضافة المدرب' : 'Add coach')}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'الاسم' : 'Name'} *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'البريد' : 'Email'} *</label>
              <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'كلمة المرور' : 'Password'} *</label>
              <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'الهاتف' : 'Phone'}</label>
              <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'الراتب' : 'Salary'}</label>
                <input type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">{rtl ? 'العمولة %' : 'Commission %'}</label>
                <input type="number" min={0} max={100} step={0.5} value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0" className={inputCls} />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              {rtl ? 'نوع التعاقد يُشتق تلقائيًا: راتب>0 وعمولة>0 = مختلط — راتب 0 وعمولة 0 = بدون تعاقد.' : 'Contract type derives automatically from salary/commission.'}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
