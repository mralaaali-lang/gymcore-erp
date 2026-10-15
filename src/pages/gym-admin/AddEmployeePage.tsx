import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save } from 'lucide-react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
import { createStaff, updateStaff, getStaff } from '../../services/api';
import { WEEK_DAYS } from './subscriptions/shared';

// ====================================================================
// إضافة موظف (/admin/hr/add) + وضع التعديل (?edit=).
// 4 أقسام: شخصية (الكود تلقائي EMPxxxx) / وظيفية (شيفت + سماح تأخير +
// إجازة أسبوعية + PIN ذاتي 4-8) / راتب وبدلات (إجمالي حي) / أرصدة إجازات.
// الإجمالي الحي (أساسي+بدلات) نفس نمط البرايفت المحسوب.
// ====================================================================

const inputCls =
  'w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/40';
const labelCls = 'block text-sm font-semibold text-gray-700 mb-1';

const DEPARTMENTS = ['التدريب', 'الاستقبال', 'الإدارة', 'تقنية المعلومات'];
const TITLES = ['مدرب', 'عامل', 'محاسب', 'استقبال', 'مدير'];

const empty = {
  name: '', phone: '', email: '', password: '', role: 'coach',
  national: '', birth: '', gender: 'male', address: '',
  dept: '', title: '', hire: '', shiftStart: '', shiftEnd: '', late: '',
  weeklyOff: [] as string[], pin: '',
  salary: '', housing: '', transport: '', other: '',
  annual: '21', sick: '7', monthly: '2',
};

export default function AddEmployeePage() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const money = (v: unknown) => formatMoney(Number(v || 0), gymProfile?.currency);

  const [params] = useSearchParams();
  const editId = params.get('edit');
  const isEdit = !!editId;

  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty, v: any) => setF((p) => ({ ...p, [k]: v }));
  const toggleOff = (c: string) =>
    set('weeklyOff', f.weeklyOff.includes(c) ? f.weeklyOff.filter((d) => d !== c) : [...f.weeklyOff, c]);

  const { data: existing } = useApiQuery(
    ['staff', editId ?? ''],
    () => getStaff(editId!),
    { enabled: isEdit },
  );
  useEffect(() => {
    const s: any = existing?.data;
    if (!s) return;
    setF({
      name: s.full_name || '', phone: s.phone || '', email: s.email || '', password: '',
      role: s.role || 'coach', national: s.national_id || '', birth: s.birth_date || '',
      gender: s.gender || 'male', address: s.address || '',
      dept: s.department || '', title: s.job_title || '', hire: s.hire_date || '',
      shiftStart: (s.shift_start || '').slice(0, 5), shiftEnd: (s.shift_end || '').slice(0, 5),
      late: s.late_allowance_min != null ? String(s.late_allowance_min) : '',
      weeklyOff: s.weekly_off ?? [], pin: '',
      salary: s.salary != null ? String(s.salary) : '',
      housing: s.housing_allowance != null ? String(s.housing_allowance) : '',
      transport: s.transport_allowance != null ? String(s.transport_allowance) : '',
      other: s.other_allowance != null ? String(s.other_allowance) : '',
      annual: s.annual_leave_days != null ? String(s.annual_leave_days) : '21',
      sick: s.sick_leave_days != null ? String(s.sick_leave_days) : '7',
      monthly: s.monthly_leave_days != null ? String(s.monthly_leave_days) : '2',
    });
  }, [existing]);

  const totalSalary = Number(f.salary || 0) + Number(f.housing || 0) + Number(f.transport || 0) + Number(f.other || 0);
  const emailOk = /.+@.+\..+/.test(f.email.trim());
  const valid = f.name.trim().length >= 2 && emailOk && (!isEdit ? f.password.length >= 6 : true)
    && (!f.pin || /^\d{4,8}$/.test(f.pin));

  const save = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return updateStaff(editId!, {
          full_name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined,
          national_id: f.national.trim() || null, birth_date: f.birth || null,
          gender: f.gender, address: f.address.trim() || null,
          department: f.dept.trim() || null, job_title: f.title.trim() || null,
          hire_date: f.hire || null,
          shift_start: f.shiftStart || null, shift_end: f.shiftEnd || null,
          late_allowance_min: f.late === '' ? 0 : Number(f.late),
          weekly_off: f.weeklyOff.length ? f.weeklyOff : null,
          salary: f.salary === '' ? undefined : Number(f.salary),
          housing_allowance: Number(f.housing || 0), transport_allowance: Number(f.transport || 0),
          other_allowance: Number(f.other || 0),
          annual_leave_days: Number(f.annual || 0), sick_leave_days: Number(f.sick || 0),
          monthly_leave_days: Number(f.monthly || 0),
          ...(f.pin ? { pin: f.pin } : {}),
        });
      }
      return createStaff({
        full_name: f.name.trim(), email: f.email.trim(), password: f.password, role: f.role,
        phone: f.phone.trim() || undefined,
        national_id: f.national.trim() || null, birth_date: f.birth || null,
        gender: f.gender, address: f.address.trim() || null,
        department: f.dept.trim() || null, job_title: f.title.trim() || null,
        hire_date: f.hire || null,
        shift_start: f.shiftStart || null, shift_end: f.shiftEnd || null,
        late_allowance_min: f.late === '' ? 0 : Number(f.late),
        weekly_off: f.weeklyOff.length ? f.weeklyOff : null,
        salary: f.salary === '' ? undefined : Number(f.salary),
        housing_allowance: Number(f.housing || 0), transport_allowance: Number(f.transport || 0),
        other_allowance: Number(f.other || 0),
        annual_leave_days: Number(f.annual || 0), sick_leave_days: Number(f.sick || 0),
        monthly_leave_days: Number(f.monthly || 0),
        ...(f.pin ? { pin: f.pin } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      showToast(rtl ? (isEdit ? 'تم حفظ التعديل' : 'تمت إضافة الموظف') : 'Saved', 'success');
      navigate('/admin/hr');
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل الحفظ' : 'Save failed'), 'error');
    },
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-gray-900">
            {isEdit ? (rtl ? 'تعديل موظف' : 'Edit staff') : (rtl ? 'إضافة موظف جديد' : 'New staff')}
          </h1>
          <button type="button" onClick={() => navigate('/admin/hr')}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50">
            <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
            {rtl ? 'رجوع' : 'Back'}
          </button>
        </div>

        {/* البيانات الشخصية */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'البيانات الشخصية' : 'Personal'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{rtl ? 'اسم الموظف' : 'Name'} <span className="text-red-500">*</span></label>
              <input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'كود الموظف' : 'Code'}</label>
              <input value="" disabled placeholder={rtl ? 'فاضي = توليد تلقائي EMPxxxx' : 'Empty = auto EMPxxxx'} className={`${inputCls} disabled:opacity-60`} dir="ltr" />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'رقم الهاتف' : 'Phone'}</label>
              <input dir="ltr" value={f.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'البريد' : 'Email'} <span className="text-red-500">*</span></label>
              <input type="email" dir="ltr" value={f.email} onChange={(e) => set('email', e.target.value)} disabled={isEdit} className={`${inputCls} disabled:opacity-60`} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'رقم الهوية' : 'National ID'}</label>
              <input dir="ltr" value={f.national} onChange={(e) => set('national', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'تاريخ الميلاد' : 'Birth date'}</label>
              <input type="date" value={f.birth} onChange={(e) => set('birth', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'الجنس' : 'Gender'}</label>
              <div className="flex gap-4 min-h-[48px] items-center">
                {(['male', 'female'] as const).map((g) => (
                  <label key={g} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={f.gender === g} onChange={() => set('gender', g)} className="w-4 h-4 accent-orange-500" />
                    <span className="text-sm font-medium">{g === 'male' ? (rtl ? 'ذكر' : 'Male') : (rtl ? 'أنثى' : 'Female')}</span>
                  </label>
                ))}
              </div>
            </div>
            {!isEdit && (
              <>
                <div>
                  <label className={labelCls}>{rtl ? 'الدور' : 'Role'}</label>
                  <select value={f.role} onChange={(e) => set('role', e.target.value)} className={inputCls}>
                    <option value="coach">{rtl ? 'مدرب' : 'Coach'}</option>
                    <option value="receptionist">{rtl ? 'استقبال' : 'Reception'}</option>
                    <option value="manager">{rtl ? 'مدير' : 'Manager'}</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>{rtl ? 'كلمة مرور الدخول (6+ أحرف)' : 'Login password (6+ chars)'} <span className="text-red-500">*</span></label>
                  <input type="password" dir="ltr" value={f.password} onChange={(e) => set('password', e.target.value)} className={inputCls} />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className={labelCls}>{rtl ? 'العنوان' : 'Address'}</label>
              <input value={f.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* البيانات الوظيفية */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'البيانات الوظيفية' : 'Employment'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{rtl ? 'القسم' : 'Department'}</label>
              <input value={f.dept} onChange={(e) => set('dept', e.target.value)} list="dept-list" className={inputCls} />
              <datalist id="dept-list">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'المسمى الوظيفي' : 'Job title'}</label>
              <input value={f.title} onChange={(e) => set('title', e.target.value)} list="title-list" className={inputCls} />
              <datalist id="title-list">{TITLES.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'تاريخ التعيين' : 'Hire date'}</label>
              <input type="date" value={f.hire} onChange={(e) => set('hire', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'PIN الحضور الذاتي (4-8 أرقام، اختياري)' : 'Self check-in PIN (4-8 digits, optional)'}</label>
              <input type="password" inputMode="numeric" dir="ltr" value={f.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder={isEdit ? (rtl ? 'فارغ = إبقاء الحالي' : 'Empty = keep current') : '••••'} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'بداية الدوام' : 'Shift start'}</label>
              <input type="time" value={f.shiftStart} onChange={(e) => set('shiftStart', e.target.value)} className={inputCls} dir="ltr" />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'نهاية الدوام' : 'Shift end'}</label>
              <input type="time" value={f.shiftEnd} onChange={(e) => set('shiftEnd', e.target.value)} className={inputCls} dir="ltr" />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'سماح التأخير (دقائق)' : 'Late allowance (min)'}</label>
              <input type="number" min={0} value={f.late} onChange={(e) => set('late', e.target.value)} className={inputCls} />
              <p className="mt-1 text-[11px] text-gray-400">{rtl ? 'التأخير محسوب آليًا مقابل الشيفت + السماح' : 'Lateness auto-computed vs shift + allowance'}</p>
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'أيام الإجازة الأسبوعية' : 'Weekly days off'}</label>
              <div className="flex flex-wrap gap-1.5">
                {WEEK_DAYS.map((d) => (
                  <button key={d.code} type="button" onClick={() => toggleOff(d.code)}
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-bold ${f.weeklyOff.includes(d.code) ? 'bg-amber-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>
                    {d.ar}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* الراتب والبدلات */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'الراتب والبدلات' : 'Salary & allowances'}</h2>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {([
              ['salary', rtl ? 'الراتب الأساسي' : 'Base'],
              ['housing', rtl ? 'بدل السكن' : 'Housing'],
              ['transport', rtl ? 'بدل النقل' : 'Transport'],
              ['other', rtl ? 'بدلات أخرى' : 'Other'],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <input type="number" min={0} value={f[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-base font-extrabold text-gray-900 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-2.5 inline-block">
            {rtl ? 'إجمالي الراتب' : 'Total'}: {money(totalSalary)} {rtl ? 'جنيه' : ''}
          </p>
        </div>

        {/* رصيد الإجازات */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'رصيد الإجازات' : 'Leave balances'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>{rtl ? 'السنوية (يوم)' : 'Annual (days)'}</label>
              <input type="number" min={0} value={f.annual} onChange={(e) => set('annual', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'المرضية السنوية (يوم)' : 'Sick (days)'}</label>
              <input type="number" min={0} value={f.sick} onChange={(e) => set('sick', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{rtl ? 'الشهري (يوم/شهر — يتجدد)' : 'Monthly (renews)'}</label>
              <input type="number" min={0} value={f.monthly} onChange={(e) => set('monthly', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => save.mutate()} disabled={!valid || save.isPending}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-8 py-3 rounded-2xl shadow-lg shadow-orange-500/25 disabled:opacity-50 min-h-[48px]">
            <Save size={17} />
            {save.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : (rtl ? 'حفظ الموظف' : 'Save staff')}
          </button>
          <button type="button" onClick={() => navigate('/admin/hr')}
            className="px-6 min-h-[48px] rounded-2xl bg-white border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50">
            {rtl ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
