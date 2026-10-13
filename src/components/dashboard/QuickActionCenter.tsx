import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/currency';
import {
  createMember, createStaff, manualCheckInByPhone, createPayment, createExpense,
  listOffers, listExpenseCategories, searchMembers,
} from '../../services/api';
import Spinner from '../../components/ui/Spinner';
import { UserPlus, UserCog, Clock, Banknote, Receipt, X } from 'lucide-react';

// ====================================================================
// §33 دفعة 1 — Quick Action Center for the manager dashboard.
//
// Every day-1 gym admin action starts HERE (competitor pattern: Mindbody/
// Gym Engine dashboards put the whole front desk in the dashboard header),
// and every action calls a REAL existing endpoint — no navigation to a
// half-wired page, no placeholder buttons:
//   إضافة عضو        → POST /api/members          (+ live offers from /api/membership-offers)
//   إضافة كابتن/ريسبشن → POST /api/staff           (bcrypt + role allowlist server-side)
//   تسجيل حضور       → POST /api/attendance/manual
//   تسجيل دفعة       → POST /api/finance/payments (member via /api/customer360/search)
//   تسجيل مصروف      → POST /api/finance/expenses (categories from the DB)
// On success the relevant dashboard queries are invalidated so the KPI
// cards and action lists reflect the change immediately.
// ====================================================================

type ActionKey = 'member' | 'coach' | 'reception' | 'checkin' | 'payment' | 'expense';

/** Extract the server's own error text so the UI never hides a real rejection. */
function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { error?: string; details?: { field?: string; message: string }[] } } })?.response?.data;
  if (data?.details?.length) {
    const parts = data.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
    return `${data.error ?? 'Validation failed'} — ${parts.join(' · ')}`;
  }
  return data?.error || fallback;
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';
const labelCls = 'block text-xs font-semibold text-gray-600 mb-1';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

/** Sliding side panel (opens from the trailing edge per RTL/LTR). */
function Drawer({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { language } = useApp();
  const rtl = language === 'ar';
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        dir={rtl ? 'rtl' : 'ltr'}
        className={`absolute top-0 bottom-0 ${rtl ? 'left-0' : 'right-0'} w-full max-w-md bg-white shadow-2xl overflow-y-auto`}
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function SubmitButton({ pending, disabled, label }: { pending: boolean; disabled: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending && <Spinner size="sm" />}
      {label}
    </button>
  );
}

// ── 1. Add member ──────────────────────────────────────────────────
interface OfferRow { id: string; title: string; duration_days: number; price: number }

function AddMemberForm({ onDone, defaultPlanNote }: { onDone: () => void; defaultPlanNote?: string }) {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [planId, setPlanId] = useState('');
  const [created, setCreated] = useState<{ name: string; pin: string } | null>(null);

  const offersQuery = useApiQuery<OfferRow[]>(['membership-offers'], async () => (((await listOffers()).data ?? []) as OfferRow[]), { staleTime: 60_000 });
  const offers = offersQuery.data ?? [];

  const mut = useMutation({
    mutationFn: () => createMember({
      full_name: fullName.trim(),
      phone_number: phone.trim(),
      email: email.trim() || undefined,
      birth_date: birthDate || undefined,
      plan_id: planId || undefined,
    }),
    onSuccess: (res: { data?: { full_name?: string }; generated_pin?: string }) => {
      // The PIN is returned exactly once by the server — show it now so the
      // manager can hand it to the member (their app login).
      setCreated({ name: res?.data?.full_name || fullName, pin: res?.generated_pin || '' });
      queryClient.invalidateQueries({ queryKey: ['gym', 'members', 'summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'expiring-soon'] });
      queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
      showToast(rtl ? 'تم إضافة العضو' : 'Member added', 'success');
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل إضافة العضو' : 'Failed to add member'), 'error'),
  });

  if (created) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-5">
          <p className="font-bold text-gray-900">{created.name}</p>
          <p className="text-sm text-gray-600 mt-1">{rtl ? 'رمز دخول التطبيق للعضو (يُعرض مرة واحدة):' : 'Member app login PIN (shown once):'}</p>
          <p className="text-3xl font-black tracking-widest text-emerald-700 mt-2">{created.pin}</p>
        </div>
        <button onClick={onDone} className="text-sm font-semibold text-emerald-600 hover:underline">
          {rtl ? 'إغلاق' : 'Close'}
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label={rtl ? 'الاسم الكامل' : 'Full name'} required>
        <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
      </Field>
      <Field label={rtl ? 'رقم الهاتف' : 'Phone'} required>
        <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="01xxxxxxxxx" />
      </Field>
      <Field label={rtl ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)'}>
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={rtl ? 'تاريخ الميلاد (اختياري)' : 'Birth date (optional)'}>
        <input className={inputCls} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </Field>
      <Field label={rtl ? 'الاشتراك / العرض' : 'Membership offer'}>
        {offersQuery.isLoading ? (
          <div className="text-xs text-gray-400 py-2">{rtl ? 'جارِ التحميل…' : 'Loading…'}</div>
        ) : offers.length === 0 ? (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3">
            {rtl
              ? 'لا توجد عروض مفعّلة لهذه الصالة بعد — يمكنك تسجيل العضو بدون اشتراك وإضافة العروض من «الإدارة ← الاشتراكات».'
              : 'No active offers yet — you can register the member without a plan and add offers under Admin → Subscriptions.'}
          </p>
        ) : (
          <select className={inputCls} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">{rtl ? 'بدون اشتراك' : 'No subscription'}</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {o.duration_days} {rtl ? 'يوم' : 'd'} · {formatMoney(Number(o.price), gymProfile?.currency)}
              </option>
            ))}
          </select>
        )}
        {defaultPlanNote && !planId && <p className="text-[11px] text-gray-400 mt-1">{defaultPlanNote}</p>}
      </Field>
      <SubmitButton pending={mut.isPending} disabled={!fullName.trim() || !phone.trim()} label={rtl ? 'إضافة العضو' : 'Add member'} />
    </form>
  );
}

// ── 2. Add staff (coach / receptionist / manager) ──────────────────
function AddStaffForm({ defaultRole, onDone }: { defaultRole: 'coach' | 'receptionist' | 'manager'; onDone: () => void }) {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>(defaultRole);
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');

  const mut = useMutation({
    mutationFn: () => createStaff({
      full_name: fullName.trim(),
      email: email.trim(),
      password,
      role,
      phone: phone.trim() || undefined,
      salary: salary ? Number(salary) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      showToast(rtl ? 'تمت إضافة الموظف ويمكنه الدخول فورًا بكلمة السر هذه' : 'Staff member added — they can log in now with this password', 'success');
      onDone();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل إضافة الموظف' : 'Failed to add staff'), 'error'),
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label={rtl ? 'الاسم الكامل' : 'Full name'} required>
        <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
      </Field>
      <Field label={rtl ? 'الدور' : 'Role'} required>
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="coach">{rtl ? 'كابتن / مدرب' : 'Coach'}</option>
          <option value="receptionist">{rtl ? 'عامل ريسبشن' : 'Receptionist'}</option>
          <option value="manager">{rtl ? 'مدير صالة' : 'Gym manager'}</option>
        </select>
      </Field>
      <Field label={rtl ? 'البريد الإلكتروني (اسم الدخول)' : 'Email (login)'} required>
        <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label={rtl ? 'كلمة السر (٦ أحرف على الأقل)' : 'Password (min 6 chars)'} required>
        <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
      </Field>
      <Field label={rtl ? 'التليفون (اختياري)' : 'Phone (optional)'}>
        <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </Field>
      <Field label={rtl ? 'الراتب (اختياري)' : 'Salary (optional)'}>
        <input className={inputCls} type="number" min={0} step="0.01" value={salary} onChange={(e) => setSalary(e.target.value)} />
      </Field>
      <SubmitButton pending={mut.isPending} disabled={!fullName.trim() || !email.trim() || password.length < 6} label={rtl ? 'إضافة الموظف' : 'Add staff'} />
    </form>
  );
}

// ── 3. Manual check-in by phone ────────────────────────────────────
function CheckInForm({ onDone }: { onDone: () => void }) {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [phone, setPhone] = useState('');

  const mut = useMutation({
    mutationFn: () => manualCheckInByPhone(phone.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym', 'attendance', 'today'] });
      showToast(rtl ? 'تم تسجيل الحضور ✓' : 'Checked in ✓', 'success');
      setPhone('');
      onDone();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل تسجيل الحضور' : 'Check-in failed'), 'error'),
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label={rtl ? 'رقم هاتف العضو' : 'Member phone'} required>
        <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="01xxxxxxxxx" autoFocus />
      </Field>
      <p className="text-xs text-gray-500">
        {rtl
          ? 'يرفض السيرفر التسجيل إذا كان العضو غير موجود، أو بلا اشتراك نشط، أو على القائمة السوداء، أو حضر اليوم بالفعل — وستظهر رسالة السبب الحقيقية هنا.'
          : 'The server rejects unknown members, inactive/expired subscriptions, blacklisted profiles, and double check-ins — the real reason surfaces as a toast.'}
      </p>
      <SubmitButton pending={mut.isPending} disabled={phone.trim().length < 7} label={rtl ? 'تسجيل حضور' : 'Check in'} />
    </form>
  );
}

// ── Member picker (shared by payment form) ─────────────────────────
function MemberPicker({ value, onChange }: { value: { id: string; full_name: string; phone_number: string } | null; onChange: (m: { id: string; full_name: string; phone_number: string } | null) => void }) {
  const { language } = useApp();
  const rtl = language === 'ar';
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<{ id: string; full_name: string; phone_number: string }[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (term.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      searchMembers(term.trim())
        .then((res) => { if (!cancelled) setResults(res.data ?? []); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [term]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm">
        <span className="font-semibold text-gray-900">{value.full_name} <span className="text-gray-500 font-normal">· {value.phone_number}</span></span>
        <button type="button" onClick={() => onChange(null)} className="text-emerald-700 text-xs font-bold hover:underline">
          {rtl ? 'تغيير' : 'Change'}
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)} placeholder={rtl ? 'ابحث بالاسم أو الهاتف (حرفين على الأقل)' : 'Search by name or phone (2+ chars)'} />
      {searching && <span className="absolute end-3 top-2.5 text-gray-400"><Spinner size="sm" /></span>}
      {term.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-xs text-gray-400 mt-1">{rtl ? 'لا نتائج مطابقة' : 'No matches'}</p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
          {results.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => { onChange(m); setResults([]); setTerm(''); }} className="w-full text-start px-3 py-2 text-sm hover:bg-gray-50">
                <span className="font-medium text-gray-900">{m.full_name}</span>
                <span className="text-gray-500"> · {m.phone_number}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 4. Record payment ──────────────────────────────────────────────
function PaymentForm({ onDone, presetMember }: { onDone: () => void; presetMember?: { id: string; full_name: string; phone_number: string } | null }) {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [member, setMember] = useState(presetMember ?? null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [description, setDescription] = useState('');

  const mut = useMutation({
    mutationFn: () => createPayment({
      member_id: member!.id,
      amount: Number(amount),
      payment_method: method,
      description: description.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym', 'finance', 'summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'overdue-debts'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'revenue-breakdown'] });
      showToast(rtl ? `تم تسجيل دفعة ${formatMoney(Number(amount), gymProfile?.currency)}` : 'Payment recorded', 'success');
      onDone();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل تسجيل الدفعة' : 'Failed to record payment'), 'error'),
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label={rtl ? 'العضو' : 'Member'} required>
        <MemberPicker value={member} onChange={setMember} />
      </Field>
      <Field label={rtl ? `المبلغ (${gymProfile?.currency || 'EGP'})` : 'Amount'} required>
        <input className={inputCls} type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </Field>
      <Field label={rtl ? 'طريقة الدفع' : 'Payment method'}>
        <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">{rtl ? 'نقدًا' : 'Cash'}</option>
          <option value="card">{rtl ? 'بطاقة' : 'Card'}</option>
          <option value="bank">{rtl ? 'تحويل بنكي' : 'Bank'}</option>
          <option value="wallet">{rtl ? 'محفظة' : 'Wallet'}</option>
        </select>
      </Field>
      <Field label={rtl ? 'البيان (اختياري)' : 'Description (optional)'}>
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={rtl ? 'مثال: تجديد اشتراك ٣ شهور' : 'e.g. 3-month renewal'} />
      </Field>
      <SubmitButton pending={mut.isPending} disabled={!member || !Number(amount)} label={rtl ? 'تسجيل الدفعة' : 'Record payment'} />
    </form>
  );
}

// ── 5. Record expense ──────────────────────────────────────────────
function ExpenseForm({ onDone }: { onDone: () => void }) {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const catsQuery = useApiQuery(['expense-categories'], async () => ((await listExpenseCategories()).data ?? []), { staleTime: 5 * 60_000 });
  const cats = useMemo(() => catsQuery.data ?? [], [catsQuery.data]);

  const mut = useMutation({
    mutationFn: () => createExpense({
      amount: Number(amount),
      description: description.trim(),
      category_id: categoryId || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym', 'finance', 'summary'] });
      showToast(rtl ? 'تم تسجيل المصروف' : 'Expense recorded', 'success');
      onDone();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل تسجيل المصروف' : 'Failed to record expense'), 'error'),
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label={rtl ? `المبلغ (${gymProfile?.currency || 'EGP'})` : 'Amount'} required>
        <input className={inputCls} type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </Field>
      <Field label={rtl ? 'البيان' : 'Description'} required>
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} required placeholder={rtl ? 'مثال: فاتورة كهرباء' : 'e.g. electricity bill'} />
      </Field>
      <Field label={rtl ? 'التصنيف (من مصروفات الصالة)' : 'Category'}>
        {catsQuery.isLoading ? (
          <div className="text-xs text-gray-400">{rtl ? 'جارِ التحميل…' : 'Loading…'}</div>
        ) : cats.length === 0 ? (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-xl p-3">
            {rtl ? 'لا تصنيفات معرّفة — يمكنك التسجيل بدون تصنيف.' : 'No categories defined — you can record without one.'}
          </p>
        ) : (
          <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{rtl ? 'بدون تصنيف' : 'Uncategorized'}</option>
            {cats.map((c: { id: string; name?: string }) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </Field>
      <SubmitButton pending={mut.isPending} disabled={!Number(amount) || !description.trim()} label={rtl ? 'تسجيل المصروف' : 'Record expense'} />
    </form>
  );
}

// ── Action bar ─────────────────────────────────────────────────────
const ACTIONS: { key: ActionKey; icon: typeof UserPlus; ar: string; en: string; accent: string }[] = [
  { key: 'member', icon: UserPlus, ar: 'إضافة عضو', en: 'Add member', accent: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  { key: 'coach', icon: UserCog, ar: 'إضافة كابتن', en: 'Add coach', accent: 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50' },
  { key: 'reception', icon: UserCog, ar: 'إضافة ريسبشن', en: 'Add reception', accent: 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50' },
  { key: 'checkin', icon: Clock, ar: 'تسجيل حضور', en: 'Check in', accent: 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50' },
  { key: 'payment', icon: Banknote, ar: 'تسجيل دفعة', en: 'Record payment', accent: 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50' },
  { key: 'expense', icon: Receipt, ar: 'تسجيل مصروف', en: 'Record expense', accent: 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50' },
];

const TITLES: Record<ActionKey, [string, string]> = {
  member: ['إضافة عضو جديد', 'Add new member'],
  coach: ['إضافة كابتن / مدرب', 'Add coach'],
  reception: ['إضافة عامل ريسبشن', 'Add receptionist'],
  checkin: ['تسجيل حضور يدوي', 'Manual check-in'],
  payment: ['تسجيل دفعة عضو', 'Record member payment'],
  expense: ['تسجيل مصروف صالة', 'Record gym expense'],
};

export default function QuickActionCenter() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const [openKey, setOpenKey] = useState<ActionKey | null>(null);
  const close = () => setOpenKey(null);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="flex flex-wrap gap-2">
      {ACTIONS.map((a) => (
        <button
          key={a.key}
          onClick={() => setOpenKey(a.key)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition ${a.accent}`}
        >
          <a.icon size={16} />
          {rtl ? a.ar : a.en}
        </button>
      ))}

      <Drawer open={openKey !== null} onClose={close} title={openKey ? (rtl ? TITLES[openKey][0] : TITLES[openKey][1]) : ''}>
        {openKey === 'member' && <AddMemberForm key="m" onDone={close} />}
        {(openKey === 'coach' || openKey === 'reception') && (
          <AddStaffForm key={`s-${openKey}`} defaultRole={openKey === 'coach' ? 'coach' : 'receptionist'} onDone={close} />
        )}
        {openKey === 'checkin' && <CheckInForm onDone={close} />}
        {openKey === 'payment' && <PaymentForm onDone={close} />}
        {openKey === 'expense' && <ExpenseForm onDone={close} />}
      </Drawer>
    </div>
  );
}
