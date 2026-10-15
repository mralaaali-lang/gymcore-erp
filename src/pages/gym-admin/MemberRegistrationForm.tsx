import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import { todayIso } from '../../utils/subDates';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  createMember, listOffers, listTrainers, listStaff, uploadMemberPhoto,
  type MembershipOffer, type StaffData,
} from '../../services/api';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { PAYMENT_METHODS, WEEK_DAYS } from './subscriptions/shared';

// ====================================================================
// إضافة عضو (/admin/members/add) — onboarding كامل بضغطة حفظ واحدة:
// قسم أول بيانات العضو + قسم ثانٍ اشتراك أول اختياري (باقة/مدرب/بداية/
// خصم/مدفوع/طريقة) ينشئ العضو والاشتراك وسند الدفع (والباقي دينًا) في
// ترانزاكشن واحدة. دروس النسخة:
// 1) قسمان واضحان بدل الصفحة المهيبة.
// 2) الاسم حقل واحد (full_name — نموذج قاعدة البيانات وباقي الشاشات).
// 3) dropdown البائعين: نشطون فقط + بحث حي + شارة الدور — لا يوجد دور
//    «بائع» في السكيما (manager/coach/receptionist) فتقييد الدور كان
//    سيكون مزيفًا؛ التخزين يتحقق من نشاط الموظف في نفس الصالة.
// ملاحظة أمانة: تاريخ الدفع غير مطلوب كحقل — السند يُسجَّل بتاريخ الحفظ.
// ====================================================================

const inputCls = 'w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

const ROLE_AR: Record<string, string> = { manager: 'مدير', coach: 'مدرب', receptionist: 'استقبال' };

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
      <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-xl">{icon}</span>
      </span>
      {children}
    </h3>
  );
}

export default function MemberRegistrationForm() {
  const { language, gymProfile } = useApp();
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  // ── القسم الأول ──
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('male');
  const [salesId, setSalesId] = useState('');
  const [salesQuery, setSalesQuery] = useState('');
  const [salesOpen, setSalesOpen] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [emergency, setEmergency] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [allowedDays, setAllowedDays] = useState<string[]>([]);
  // ── القسم الثاني (اختياري) ──
  const [offerId, setOfferId] = useState('');
  const [coachId, setCoachId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('cash');

  const { data: offersRes } = useApiQuery(
    ['membership-offers', 'active'],
    async () => (await listOffers()).data as MembershipOffer[],
    { staleTime: 60_000 },
  );
  const offers = offersRes ?? [];
  const offer = useMemo(() => offers.find((o) => o.id === offerId) || null, [offers, offerId]);

  const { data: trainersRes } = useApiQuery(
    ['trainers', 'active'],
    async () => (await listTrainers()).data as StaffData[],
    { staleTime: 60_000 },
  );
  const trainers = trainersRes ?? [];

  const { data: staffRes } = useApiQuery(['staff'], listStaff, { staleTime: 60_000 });
  const sellers = useMemo(
    () => ((staffRes?.data ?? []) as StaffData[]).filter((s) => s.is_active),
    [staffRes],
  );
  const sellerHits = useMemo(() => {
    const q = salesQuery.trim().toLowerCase();
    const base = q
      ? sellers.filter((s) => s.full_name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))
      : sellers;
    return base.slice(0, 8);
  }, [sellers, salesQuery]);
  const sellerName = sellers.find((s) => s.id === salesId)?.full_name ?? '';

  const price = offer ? Number(offer.price) : 0;
  const disc = Math.max(0, Number(discount || 0));
  const due = Math.max(0, Math.round((price - disc) * 100) / 100);
  const paidNum = Math.max(0, Number(paid || 0));
  const remainder = Math.max(0, Math.round((due - paidNum) * 100) / 100);

  const subValid = !offerId || (
    disc <= price && paidNum <= due && !!startDate
  );
  const valid = name.trim().length >= 2 && phone.trim().length >= 7 && subValid;

  const toggleDay = (c: string) =>
    setAllowedDays((prev) => (prev.includes(c) ? prev.filter((d) => d !== c) : [...prev, c]));

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast(rtl ? 'حجم الملف يتجاوز 2 ميجا' : 'File exceeds 2 MB limit', 'error');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    try {
      let photo_url: string | undefined;
      if (photoFile) {
        const uploadRes = await uploadMemberPhoto(photoFile);
        photo_url = uploadRes.data.url;
      }
      const res = await createMember({
        full_name: name.trim(),
        phone_number: phone.trim(),
        email: email.trim() || undefined,
        birth_date: birthDate || undefined,
        gender,
        card_code: code.trim() || undefined,
        national_id: nationalId.trim() || undefined,
        emergency_phone: emergency.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        allowed_days: allowedDays.length ? allowedDays : undefined,
        sales_rep_id: salesId || undefined,
        photo_url,
        ...(offerId ? {
          offer_id: offerId,
          coach_id: coachId || null,
          sport: offer?.sport ?? null,
          start_date: startDate,
          discount: disc,
          amount_paid: paidNum,
          payment_method: method,
        } : {}),
      });
      const pin = res.generated_pin as string | undefined;
      showToast(
        rtl
          ? `تم التسجيل بنجاح${pin ? ` — رمز الدخول: ${pin}` : ''}${res.subscription ? ' — مع أول اشتراك' : ''}`
          : `Registered successfully${pin ? ` — PIN: ${pin}` : ''}`,
        'success'
      );
      sessionStorage.setItem('member_just_added', 'true');
      navigate('/admin/members');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل التسجيل' : 'Registration failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── القسم الأول: بيانات العضو ── */}
          <Card className="space-y-4">
            <SectionTitle icon="person">{rtl ? 'بيانات العضو' : 'Member details'}</SectionTitle>

            {/* الصورة */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title={rtl ? 'انقر لإضافة صورة شخصية' : 'Click to add a photo'}
                className="w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 hover:border-emerald-500 flex items-center justify-center overflow-hidden transition shrink-0"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-3xl text-gray-400">photo_camera</span>
                )}
              </button>
              <div className="text-sm text-gray-500">
                <p className="font-semibold text-gray-700">{rtl ? 'الصورة الشخصية' : 'Profile photo'}</p>
                <p className="text-xs mt-0.5">{rtl ? 'انقر على الدائرة لإضافة صورة (اختياري، حتى 2 ميجا)' : 'Click the circle to add a photo (optional, max 2 MB)'}</p>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
              </div>
            </div>

            <Field label={rtl ? 'اسم العضو' : 'Member name'} required>
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className={inputCls} placeholder={rtl ? 'مثال: أحمد محمد' : 'e.g. Ahmed Mohamed'} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={rtl ? 'رقم الهاتف' : 'Phone'} required>
                <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={7} className={inputCls} placeholder="01xxxxxxxxx" />
              </Field>
              <Field label={rtl ? 'كود العضوية' : 'Member code'}>
                <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} placeholder={rtl ? 'فارغ = يتولد تلقائي' : 'Empty = auto-generated'} />
              </Field>
              <Field label={rtl ? 'البريد الإلكتروني' : 'Email'}>
                <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="member@example.com" />
              </Field>
              <div>
                <label className={labelCls}>{rtl ? 'الجنس' : 'Gender'}</label>
                <div className="flex gap-4 min-h-[48px] items-center">
                  {(['male', 'female'] as const).map((g) => (
                    <label key={g} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="gender" checked={gender === g} onChange={() => setGender(g)} className="w-4 h-4 accent-emerald-500" />
                      <span className="text-sm font-medium text-gray-900">{g === 'male' ? (rtl ? 'ذكر' : 'Male') : (rtl ? 'أنثى' : 'Female')}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* موظف المبيعات — بحث حي في النشطين فقط */}
            <div className="relative">
              <Field label={rtl ? 'موظف المبيعات (المسؤول عن العضو)' : 'Sales rep'}>
                <input
                  value={salesOpen ? salesQuery : sellerName}
                  onChange={(e) => { setSalesQuery(e.target.value); setSalesOpen(true); if (salesId) setSalesId(''); }}
                  onFocus={() => { setSalesQuery(''); setSalesOpen(true); }}
                  onBlur={() => setTimeout(() => setSalesOpen(false), 150)}
                  className={inputCls}
                  placeholder={rtl ? 'ابحث بالاسم…' : 'Search by name…'}
                />
              </Field>
              {salesOpen && (
                <div className="absolute z-20 mt-1 w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden">
                  {sellerHits.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400">{rtl ? 'لا نتائج' : 'No matches'}</p>
                  )}
                  {sellerHits.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onMouseDown={() => { setSalesId(s.id); setSalesQuery(''); setSalesOpen(false); }}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-sm"
                    >
                      <span className="font-medium text-gray-900 truncate">{s.full_name}</span>
                      <span className="text-xs text-gray-500 shrink-0">{ROLE_AR[s.role] ?? s.role}</span>
                    </button>
                  ))}
                  <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
                    {rtl ? `النشطون فقط (${sellers.length}) — النشاط يُدار من الفريق` : `Active staff only (${sellers.length})`}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={rtl ? 'تاريخ الميلاد' : 'Birth date'}>
                <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label={rtl ? 'الرقم القومي' : 'National ID'}>
                <input dir="ltr" value={nationalId} onChange={(e) => setNationalId(e.target.value)} className={inputCls} />
              </Field>
              <Field label={rtl ? 'رقم الطوارئ' : 'Emergency phone'}>
                <input type="tel" dir="ltr" value={emergency} onChange={(e) => setEmergency(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <Field label={rtl ? 'العنوان' : 'Address'}>
              <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
            </Field>
            <Field label={rtl ? 'ملاحظات' : 'Notes'}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
            </Field>

            {/* أيام الحضور المسموحة */}
            <div>
              <label className={labelCls}>{rtl ? 'أيام الحضور المسموحة (بدون تحديد = كل الأيام)' : 'Allowed days (none = all days)'}</label>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS.map((d) => {
                  const on = allowedDays.includes(d.code);
                  return (
                    <label key={d.code} className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-bold cursor-pointer transition-all ${on ? 'bg-sky-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleDay(d.code)} className="accent-white w-4 h-4" />
                      {d.ar}
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                {rtl ? 'التحديد يمنع تسجيل الحضور (بصمة/يدوي) في باقي الأيام.' : 'Selected days restrict check-in (all methods) to those days.'}
              </p>
            </div>
          </Card>

          {/* ── القسم الثاني: الاشتراك (اختياري) ── */}
          <Card className="space-y-4">
            <SectionTitle icon="confirmation_number">{rtl ? 'الاشتراك (اختياري)' : 'Subscription (optional)'}</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={rtl ? 'الباقة' : 'Plan'}>
                <select value={offerId} onChange={(e) => { setOfferId(e.target.value); setPaid(''); setDiscount(''); }} className={`${inputCls} appearance-none`}>
                  <option value="">{rtl ? '— بدون اشتراك الآن —' : '— No subscription now —'}</option>
                  {offers.map((o) => (
                    <option key={o.id} value={o.id}>{o.title} — {money(o.price)}</option>
                  ))}
                </select>
              </Field>
              <Field label={rtl ? 'المدرب' : 'Coach'}>
                <select value={coachId} onChange={(e) => setCoachId(e.target.value)} disabled={!offerId} className={`${inputCls} appearance-none disabled:opacity-50`}>
                  <option value="">{rtl ? 'بدون مدرب' : 'No coach'}</option>
                  {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </Field>
              <Field label={rtl ? 'تاريخ البداية' : 'Start date'}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!offerId} className={`${inputCls} disabled:opacity-50`} />
              </Field>
              <div>
                <label className={labelCls}>{rtl ? 'طريقة الدفع' : 'Payment method'}</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={!offerId} className={`${inputCls} appearance-none disabled:opacity-50`}>
                  {PAYMENT_METHODS.map((m) => <option key={m.code} value={m.code}>{m.ar}</option>)}
                </select>
              </div>
              <Field label={rtl ? 'خصم' : 'Discount'}>
                <input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={!offerId} className={`${inputCls} disabled:opacity-50`} />
              </Field>
              <Field label={rtl ? 'مدفوع' : 'Paid'}>
                <input type="number" min={0} step="0.01" value={paid} onChange={(e) => setPaid(e.target.value)} disabled={!offerId} className={`${inputCls} disabled:opacity-50`} />
              </Field>
            </div>
            {offer && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-2.5">
                {rtl
                  ? `السعر ${money(price)} − خصم ${money(disc)} = مستحق ${money(due)} · مدفوع ${money(paidNum)}${remainder > 0 ? ` · متبقي ${money(remainder)} (دين)` : ' · خالص'}`
                  : `Due ${money(due)} · paid ${money(paidNum)} · rest ${money(remainder)}`}
              </p>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={loading || !valid} className="px-8">
              {loading ? <Spinner size="sm" /> : <span className="material-symbols-outlined text-lg">save</span>}
              {loading ? (rtl ? 'جاري الحفظ...' : 'Saving...') : (rtl ? 'حفظ العضو' : 'Save member')}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/admin/members')} className="px-6">
              {rtl ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
