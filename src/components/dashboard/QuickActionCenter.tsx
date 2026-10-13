import { useEffect, useMemo, useRef, useState } from 'react';
import { formatTime } from '../../utils/date';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useToast } from '../../context/ToastContext';
import { formatMoney } from '../../utils/currency';
import {
  createMember, createStaff, manualCheckInByPhone, qrCheckIn, createPayment, createExpense,
  listOffers, listExpenseCategories, searchMembers, getTodayAttendance,
} from '../../services/api';
import Spinner from '../../components/ui/Spinner';
import { UserPlus, UserCog, QrCode, Banknote, Receipt, X } from 'lucide-react';

// ====================================================================
// §33 دفعة 1 — Quick Action Center for the manager dashboard.
//
// Every day-1 gym admin action starts HERE (competitor pattern: Mindbody/
// Gym Engine dashboards put the whole front desk in the dashboard header),
// and every action calls a REAL existing endpoint — no navigation to a
// half-wired page, no placeholder buttons:
//   إضافة عضو          → POST /api/members          (+ live offers from /api/membership-offers)
//   إضافة كابتن/ريسبشن  → POST /api/staff            (bcrypt + role allowlist server-side)
//   تسجيل حضور          → POST /api/attendance/qr (camera scan or pasted code)
//                        POST /api/attendance/manual (phone)
//   حضور اليوم          → GET  /api/attendance/today (count + who's in: last 3h window)
//   تسجيل دفعة          → POST /api/finance/payments (member via /api/customer360/search)
//   تسجيل مصروف         → POST /api/finance/expenses (categories from the DB)
// On success the relevant dashboard queries are invalidated so the KPI
// cards and action lists reflect the change immediately.
//
// UI feedback (2026-10-13): popups open CENTERED (not side drawers), and
// the check-in popup stays open in continuous mode — each success resets
// the input so the receptionist can scan the next member immediately.
// ====================================================================

export type ActionKey = 'member' | 'coach' | 'reception' | 'checkin' | 'today' | 'payment' | 'expense';

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
  'w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';
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

/** Centered modal dialog (user feedback 2026-10-13: popups in the middle of the screen). */
function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { language } = useApp();
  const rtl = language === 'ar';
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        dir={rtl ? 'rtl' : 'ltr'}
        className="relative w-full max-w-md max-h-[88vh] overflow-y-auto bg-white rounded-3xl shadow-2xl"
      >
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
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
      className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
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

// ── 3. Check-in: QR camera scan / pasted code / phone ──────────────
// Continuous mode by design: a success resets the input and keeps the
// modal open so the receptionist can process the next member immediately.
interface CheckInResult { ok: boolean; text: string }

function CheckInForm() {
  const { language } = useApp();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';
  const [tab, setTab] = useState<'qr' | 'phone'>('qr');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<CheckInResult | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastTokenRef = useRef<{ token: string; at: number }>({ token: '', at: 0 });

  const supportsBarcode = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const stopCamera = () => {
    if (loopRef.current !== null) { window.clearTimeout(loopRef.current); loopRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => stopCamera, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab !== 'qr') stopCamera(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitToken = async (raw: string, source: 'scan' | 'paste') => {
    const token = raw.trim();
    if (!token || busyRef.current) return;
    // The member pass rotates every 30s server-side; a camera frame can fire
    // many times per second — dedupe the same token for 3s.
    const now = Date.now();
    if (lastTokenRef.current.token === token && now - lastTokenRef.current.at < 3000) return;
    lastTokenRef.current = { token, at: now };
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await qrCheckIn(token);
      if (res?.success) {
        setLast({ ok: true, text: source === 'scan' ? (rtl ? '✓ تم المسح وتسجيل الحضور' : '✓ Scanned — checked in') : (rtl ? '✓ تم تسجيل الحضور' : '✓ Checked in') });
        setSessionCount((c) => c + 1);
        setCode('');
        queryClient.invalidateQueries({ queryKey: ['gym', 'attendance', 'today'] });
      } else {
        setLast({ ok: false, text: res?.error || (rtl ? 'رفض السيرفر التسجيل' : 'Server rejected check-in') });
      }
    } catch (e) {
      setLast({ ok: false, text: apiError(e, rtl ? 'فشل تسجيل الحضور' : 'Check-in failed') });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!supportsBarcode) {
      setCameraError(rtl ? 'متصفحك لا يدعم قراءة الباركود — استخدم الإدخال اليدوي للكود أو الهاتف.' : 'This browser cannot decode barcodes — use manual code/phone entry.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setCameraOn(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Detector = (window as any).BarcodeDetector;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new Detector({ formats: ['qr_code', 'code_128', 'ean_13'] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) await submitToken(codes[0].rawValue, 'scan');
        } catch { /* transient frame errors are expected */ }
        loopRef.current = window.setTimeout(tick, 350);
      };
      loopRef.current = window.setTimeout(tick, 350);
    } catch {
      setCameraError(rtl ? 'تعذر فتح الكاميرا — تحقق من إذن الكاميرا، أو استخدم الإدخال اليدوي.' : 'Camera unavailable — check permission, or use manual entry.');
    }
  };

  const phoneMut = useMutation({
    mutationFn: () => manualCheckInByPhone(phone.trim()),
    onSuccess: () => {
      setLast({ ok: true, text: rtl ? '✓ تم تسجيل الحضور' : '✓ Checked in' });
      setSessionCount((c) => c + 1);
      setPhone('');
      queryClient.invalidateQueries({ queryKey: ['gym', 'attendance', 'today'] });
    },
    onError: (e) => setLast({ ok: false, text: apiError(e, rtl ? 'فشل تسجيل الحضور' : 'Check-in failed') }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['qr', 'phone'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 min-h-[48px] rounded-xl px-3 py-2 text-base font-bold ${tab === k ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {k === 'qr' ? (rtl ? 'مسح باركود / كود' : 'Scan / code') : (rtl ? 'بالهاتف' : 'By phone')}
          </button>
        ))}
      </div>

      {tab === 'qr' ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className={`w-full ${cameraOn ? 'block aspect-square object-cover' : 'hidden'}`} />
            {!cameraOn && (
              <div className="p-6 text-center">
                <QrCode size={36} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs text-gray-500 mb-3">
                  {rtl ? 'وجّه الكاميرا إلى رمز الدخول في تطبيق العضو (الرمز يتجدد كل ٣٠ ثانية)' : 'Point the camera at the member app pass (rotates every 30s)'}
                </p>
                <button onClick={startCamera} className="min-h-[58px] rounded-xl bg-gray-900 text-white px-5 py-2 text-base font-bold hover:bg-gray-700">
                  {rtl ? 'تشغيل الكاميرا' : 'Start camera'}
                </button>
              </div>
            )}
            {cameraOn && (
              <div className="p-2 text-center">
                <button onClick={stopCamera} className="text-xs font-semibold text-rose-600 hover:underline">
                  {rtl ? 'إيقاف الكاميرا' : 'Stop camera'}
                </button>
              </div>
            )}
          </div>
          {cameraError && <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3">{cameraError}</p>}
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); submitToken(code, 'paste'); }}
          >
            <input
              className={`${inputCls} !min-h-[49px] !text-[17px]`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={rtl ? 'أو الصق كود البطاقة هنا' : 'Or paste the pass code here'}
              dir="ltr"
            />
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="shrink-0 min-h-[48px] rounded-xl bg-emerald-600 text-white px-4 text-base font-bold disabled:opacity-50"
            >
              {rtl ? 'تسجيل' : 'Check in'}
            </button>
          </form>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); phoneMut.mutate(); }}>
          <Field label={rtl ? 'رقم هاتف العضو' : 'Member phone'} required>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" placeholder="01xxxxxxxxx" autoFocus />
          </Field>
          <SubmitButton pending={phoneMut.isPending} disabled={phone.trim().length < 7} label={rtl ? 'تسجيل حضور' : 'Check in'} />
        </form>
      )}

      {last && (
        <p className={`text-sm font-bold rounded-xl px-3 py-2 ${last.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {last.text}
        </p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{rtl ? 'نافذة الحضور مفتوحة — سجّل التالي مباشرة' : 'Window stays open — scan the next member'}</span>
        <span className="font-bold text-gray-900">{rtl ? `تم في هذه الجلسة: ${sessionCount}` : `This session: ${sessionCount}`}</span>
      </div>
    </div>
  );
}

// ── 4. Today's attendance + who's in ───────────────────────────────
interface AttendanceRow {
  id: string;
  check_in_time: string;
  entry_method: string;
  full_name: string;
  verified_by_name?: string | null;
}

export const PRESENT_WINDOW_HOURS = 3;

function TodayAttendance() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const { data, isLoading } = useApiQuery(
    ['gym', 'attendance', 'today'],
    getTodayAttendance,
    { staleTime: 15_000 },
  );
  const records = (data?.records ?? []) as unknown as AttendanceRow[];

  const present = useMemo(() => {
    const cutoff = Date.now() - PRESENT_WINDOW_HOURS * 3600_000;
    return records.filter((r) => new Date(r.check_in_time).getTime() >= cutoff);
  }, [records]);

  const methodLabel = (m: string) => (m === 'qr_code' ? (rtl ? 'باركود' : 'QR') : m === 'manual_phone' ? (rtl ? 'هاتف' : 'Phone') : m);

  if (isLoading) return <div className="py-8 text-center"><Spinner size="md" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-center">
          <p className="text-3xl font-black text-emerald-700">{records.length}</p>
          <p className="text-xs font-semibold text-gray-600 mt-1">{rtl ? 'حضور اليوم' : 'Check-ins today'}</p>
        </div>
        <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4 text-center">
          <p className="text-3xl font-black text-violet-700">{present.length}</p>
          <p className="text-xs font-semibold text-gray-600 mt-1">
            {rtl ? `متواجدون الآن (آخر ${PRESENT_WINDOW_HOURS} ساعات)` : `In now (last ${PRESENT_WINDOW_HOURS}h)`}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-gray-400">
        {rtl
          ? 'ملاحظة: الصالة لا تسجّل خروجًا بعد — «متواجدون الآن» = من حضروا خلال آخر ٣ ساعات.'
          : `Note: no check-out is recorded yet — "in now" = checked in within the last ${PRESENT_WINDOW_HOURS} hours.`}
      </p>
      {records.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">{rtl ? 'لا حضور مسجّل اليوم بعد' : 'No check-ins recorded today'}</p>
      ) : (
        <ul className="divide-y divide-gray-50 max-h-72 overflow-y-auto rounded-2xl border border-gray-100">
          {records.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium text-gray-900 truncate">{r.full_name}</span>
              <span className="text-gray-500 shrink-0 text-xs">
                {formatTime(r.check_in_time)}
                {' · '}{methodLabel(r.entry_method)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
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

// ── 5. Record payment ──────────────────────────────────────────────
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

// ── 6. Record expense ──────────────────────────────────────────────
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
// §33أ-تنظيف: the bar only carries the forms; check-in and today's
// attendance are rendered as Panel cards by the dashboard itself, and
// "add member" is the dashboard header's primary action — no duplicates.
const BAR_ACTIONS: { key: ActionKey; icon: typeof UserPlus; ar: string; en: string }[] = [
  { key: 'coach', icon: UserCog, ar: 'إضافة كابتن', en: 'Add coach' },
  { key: 'reception', icon: UserCog, ar: 'إضافة ريسبشن', en: 'Add reception' },
  { key: 'payment', icon: Banknote, ar: 'تسجيل دفعة', en: 'Record payment' },
  { key: 'expense', icon: Receipt, ar: 'تسجيل مصروف', en: 'Record expense' },
];

export function QuickActionBar({ onOpen }: { onOpen: (k: ActionKey) => void }) {
  const { language } = useApp();
  const rtl = language === 'ar';
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="flex flex-wrap gap-2">
      {BAR_ACTIONS.map((a) => (
        <button
          key={a.key}
          onClick={() => onOpen(a.key)}
          className="inline-flex items-center gap-2 rounded-xl bg-white text-gray-800 border border-gray-200 px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-gray-50 transition"
        >
          <a.icon size={16} />
          {rtl ? a.ar : a.en}
        </button>
      ))}
    </div>
  );
}

const TITLES: Record<ActionKey, [string, string]> = {
  member: ['إضافة عضو جديد', 'Add new member'],
  coach: ['إضافة كابتن / مدرب', 'Add coach'],
  reception: ['إضافة عامل ريسبشن', 'Add receptionist'],
  checkin: ['تسجيل حضور — مسح أو كود أو هاتف', 'Check-in — scan, code or phone'],
  today: ['حضور اليوم والمتواجدون', "Today's attendance"],
  payment: ['تسجيل دفعة عضو', 'Record member payment'],
  expense: ['تسجيل مصروف صالة', 'Record gym expense'],
};

export function QuickActionModals({ action, onClose }: { action: ActionKey | null; onClose: () => void }) {
  const { language } = useApp();
  const rtl = language === 'ar';
  return (
    <Modal open={action !== null} onClose={onClose} title={action ? (rtl ? TITLES[action][0] : TITLES[action][1]) : ''}>
      {action === 'member' && <AddMemberForm key="m" onDone={onClose} />}
      {(action === 'coach' || action === 'reception') && (
        <AddStaffForm key={`s-${action}`} defaultRole={action === 'coach' ? 'coach' : 'receptionist'} onDone={onClose} />
      )}
      {action === 'checkin' && <CheckInForm key="ci" />}
      {action === 'today' && <TodayAttendance key="td" />}
      {action === 'payment' && <PaymentForm onDone={onClose} />}
      {action === 'expense' && <ExpenseForm onDone={onClose} />}
    </Modal>
  );
}
