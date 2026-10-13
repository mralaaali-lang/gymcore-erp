import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { formatMoney } from '../../utils/currency';
import { useToast } from '../../context/ToastContext';
import { createMember, listOffers, uploadMemberPhoto } from '../../services/api';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/shared/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

const RELATIONS = ['Parent', 'Spouse', 'Sibling', 'Child', 'Friend', 'Other'];

interface FormState {
  type: 'visitor' | 'member';
  firstName: string;
  lastName: string;
  gender: string;
  phone: string;
  email: string;
  sendAccess: boolean;
  birthDate: string;
  pin: string;
  joinDate: string;
  planId: string;
  street: string;
  city: string;
  zip: string;
  state: string;
  country: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  photoFile: File | null;
  photoPreview: string;
  howDidYouHear: string;
  interfaceLanguage: string;
  password: string;
  confirmPassword: string;
}

export default function MemberRegistrationForm() {
  const { language, gymProfile } = useApp();
  // §30: money() — gym currency symbol everywhere on this page
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<{ id: string; title: string; duration_days: number; price: number }[]>([]);

  const [form, setForm] = useState<FormState>({
    type: 'member',
    firstName: '',
    lastName: '',
    gender: '',
    phone: '',
    email: '',
    sendAccess: false,
    birthDate: '',
    pin: '',
    joinDate: new Date().toISOString().split('T')[0],
    planId: '',
    street: '',
    city: '',
    zip: '',
    state: '',
    country: 'Egypt',
    emergencyName: '',
    emergencyPhone: '',
    emergencyRelation: '',
    photoFile: null,
    photoPreview: '',
    howDidYouHear: '',
    interfaceLanguage: language === 'ar' ? 'ar' : 'en',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    listOffers()
      .then((res) => setOffers(res.data || []))
      .catch(() => {});
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handlePinInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setForm((prev) => ({ ...prev, pin: val }));
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast(rtl ? 'حجم الملف يتجاوز 2 ميجا' : 'File exceeds 2 MB limit', 'error');
      return;
    }
    setForm((prev) => ({ ...prev, photoFile: file, photoPreview: URL.createObjectURL(file) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password && form.password !== form.confirmPassword) {
      showToast(rtl ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match', 'error');
      return;
    }
    setLoading(true);
    try {
      let photo_url: string | undefined;
      if (form.photoFile) {
        const uploadRes = await uploadMemberPhoto(form.photoFile);
        photo_url = uploadRes.data.url;
      }
      const res = await createMember({
        full_name: `${form.firstName} ${form.lastName}`.trim(),
        phone_number: form.phone,
        email: form.email || undefined,
        birth_date: form.birthDate || undefined,
        plan_id: form.planId || undefined,
        photo_url,
        medical_notes: form.howDidYouHear ? `source: ${form.howDidYouHear}` : undefined,
      });
      const pin = (res as Record<string, unknown>).generated_pin as string | undefined;
      showToast(
        rtl
          ? `تم التسجيل بنجاح${pin ? ` — رمز الدخول: ${pin}` : ''}`
          : `Registered successfully${pin ? ` — PIN: ${pin}` : ''}`,
        'success'
      );
      // Set flag so the profile page shows success banner
      sessionStorage.setItem('member_just_added', 'true');
      navigate('/members');
    } catch {
      showToast(rtl ? 'فشل التسجيل' : 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );

  const inputCls = 'w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition';
  const selectCls = `${inputCls} appearance-none`;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="max-w-3xl space-y-6">
        <PageHeader
          title={rtl ? 'تسجيل مشترك جديد' : 'New Member Registration'}
          subtitle={rtl ? 'أدخل بيانات المشترك الجديد' : 'Enter the new member details'}
          icon="person_add"
          actions={
            <Button variant="ghost" onClick={() => navigate('/members')}>
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              {rtl ? 'العودة للقائمة' : 'BACK TO LIST'}
            </Button>
          }
        />

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Section 1: Personal Details */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">person</span>
              </span>
              {rtl ? 'البيانات الشخصية' : 'Personal Details'}
            </h3>
            <div className="flex gap-4">
              {(['member', 'visitor'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="type" value={t} checked={form.type === t} onChange={handleChange} className="w-4 h-4 accent-emerald-500" />
                  <span className="text-sm font-medium text-gray-900">{t === 'member' ? (rtl ? 'مشترك' : 'Member') : (rtl ? 'زائر' : 'Visitor')}</span>
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={rtl ? 'الاسم الأول' : 'First Name'} required>
                <input type="text" name="firstName" value={form.firstName} onChange={handleChange} required className={inputCls} dir="ltr" />
              </Field>
              <Field label={rtl ? 'اسم العائلة' : 'Last Name'} required>
                <input type="text" name="lastName" value={form.lastName} onChange={handleChange} required className={inputCls} dir="ltr" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={rtl ? 'الجنس' : 'Gender'}>
                <select name="gender" value={form.gender} onChange={handleChange} className={selectCls}>
                  <option value="">--</option>
                  <option value="male">{rtl ? 'ذكر' : 'Male'}</option>
                  <option value="female">{rtl ? 'أنثى' : 'Female'}</option>
                </select>
              </Field>
              <Field label={rtl ? 'رقم الهاتف' : 'Phone Number'} required>
                <input type="tel" name="phone" value={form.phone} onChange={handleChange} required className={inputCls} dir="ltr" placeholder="010xxxxxxxxx" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={rtl ? 'البريد الإلكتروني' : 'Email Address'}>
                <input type="email" name="email" value={form.email} onChange={handleChange} className={inputCls} dir="ltr" placeholder="email@example.com" />
              </Field>
              <div className="flex items-center gap-3 pt-6">
                <input type="checkbox" name="sendAccess" checked={form.sendAccess} onChange={handleChange} className="w-4 h-4 rounded accent-emerald-500" />
                <span className="text-sm text-gray-500">{rtl ? 'إرسال صلاحية الدخول' : 'SEND ACCOUNT ACCESS'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={rtl ? 'تاريخ الميلاد' : 'Date of Birth'}>
                <input type="date" name="birthDate" value={form.birthDate} onChange={handleChange} className={inputCls} />
              </Field>
              <Field label={rtl ? 'رمز الدخول (4 أرقام)' : 'Check-in Code (4 digits)'}>
                <input type="password" name="pin" value={form.pin} onChange={handlePinInput} maxLength={4} inputMode="numeric" pattern="[0-9]{4}" className={inputCls} dir="ltr" placeholder="····" />
              </Field>
              <Field label={rtl ? 'تاريخ الانضمام' : 'Join Date'}>
                <input type="date" name="joinDate" value={form.joinDate} onChange={handleChange} className={inputCls} />
              </Field>
            </div>

            {/* Plan Selection */}
            <Field label={rtl ? 'باقة الاشتراك' : 'Subscription Plan'}>
              <select name="planId" value={form.planId} onChange={handleChange} className={selectCls}>
                <option value="">{rtl ? '— بدون باقة —' : '— No Plan —'}</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>{o.title} — {o.duration_days} {rtl ? 'يوم' : 'days'} — {money(o.price)}</option>
                ))}
              </select>
            </Field>
          </Card>

          {/* Section 2: Address */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">location_on</span>
              </span>
              {rtl ? 'العنوان' : 'Address'}
            </h3>
            <Field label={rtl ? 'العنوان' : 'Street Address'}>
              <input type="text" name="street" value={form.street} onChange={handleChange} className={inputCls} dir="ltr" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={rtl ? 'المدينة' : 'City'}>
                <input type="text" name="city" value={form.city} onChange={handleChange} className={inputCls} dir="ltr" />
              </Field>
              <Field label={rtl ? 'الرمز البريدي' : 'Zip / Postal Code'}>
                <input type="text" name="zip" value={form.zip} onChange={handleChange} className={inputCls} dir="ltr" />
              </Field>
              <Field label={rtl ? 'المنطقة' : 'State'}>
                <input type="text" name="state" value={form.state} onChange={handleChange} className={inputCls} dir="ltr" />
              </Field>
            </div>
            <Field label={rtl ? 'الدولة' : 'Country'}>
              <select name="country" value={form.country} onChange={handleChange} className={selectCls}>
                <option value="Egypt">Egypt</option>
                <option value="Saudi Arabia">Saudi Arabia</option>
                <option value="UAE">UAE</option>
                <option value="Kuwait">Kuwait</option>
                <option value="Other">Other</option>
              </select>
            </Field>
          </Card>

          {/* Section 3: Contacts */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">contacts</span>
              </span>
              {rtl ? 'جهات الاتصال' : 'Emergency Contact'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={rtl ? 'اسم جهة الاتصال' : 'Emergency Contact Name'}>
                <input type="text" name="emergencyName" value={form.emergencyName} onChange={handleChange} className={inputCls} dir="ltr" />
              </Field>
              <Field label={rtl ? 'رقم الهاتف' : 'Phone Number'}>
                <input type="tel" name="emergencyPhone" value={form.emergencyPhone} onChange={handleChange} className={inputCls} dir="ltr" />
              </Field>
              <Field label={rtl ? 'صلة القرابة' : 'Relation'}>
                <select name="emergencyRelation" value={form.emergencyRelation} onChange={handleChange} className={selectCls}>
                  <option value="">--</option>
                  {RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            </div>
            <button type="button" className="text-emerald-600 text-sm font-medium flex items-center gap-1 hover:underline">
              <span className="material-symbols-outlined text-lg">add</span>
              {rtl ? 'إضافة جهة اتصال إضافية' : '+ ADDITIONAL CONTACT'}
            </button>
          </Card>

          {/* Section 4: Photo */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">photo_camera</span>
              </span>
              {rtl ? 'الصورة' : 'Photo'}
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-3xl bg-gray-100 border border-gray-100 flex items-center justify-center overflow-hidden">
                {form.photoPreview ? (
                  <img src={form.photoPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-3xl text-gray-400">person</span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button type="button" className="px-4 py-2 border border-gray-200 bg-white rounded-xl text-sm font-medium text-gray-900 hover:bg-gray-50 transition flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">photo_camera</span>
                  {rtl ? 'التقاط من الكاميرا' : 'CAPTURE FROM CAMERA'}
                </button>
                <label className="px-4 py-2 border border-gray-200 bg-white rounded-xl text-sm font-medium text-gray-900 hover:bg-gray-50 transition flex items-center gap-2 cursor-pointer">
                  <span className="material-symbols-outlined text-lg">upload</span>
                  {rtl ? 'رفع صورة' : 'UPLOAD PHOTO'}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                </label>
                {form.photoPreview && (
                  <button
                    type="button"
                    onClick={() => { setForm((prev) => ({ ...prev, photoFile: null, photoPreview: '' })); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="px-4 py-2 border border-red-200 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50 transition"
                  >
                    {rtl ? 'إزالة' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* Section 5: How did you hear */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">forum</span>
              </span>
              {rtl ? 'كيف عرفت عنّا؟' : 'How did you hear about us?'}
            </h3>
            <select name="howDidYouHear" value={form.howDidYouHear} onChange={handleChange} className={selectCls}>
              <option value="">--</option>
              <option value="social_media">Social Media</option>
              <option value="friend">Friend / Referral</option>
              <option value="walk_in">Walk-in</option>
              <option value="google">Google Search</option>
              <option value="ad">Advertisement</option>
              <option value="other">Other</option>
            </select>
          </Card>

          {/* Section 6: Interface Language */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">language</span>
              </span>
              {rtl ? 'لغة الواجهة' : 'Interface Language'}
            </h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="interfaceLanguage" value="ar" checked={form.interfaceLanguage === 'ar'} onChange={handleChange} className="w-4 h-4 accent-emerald-500" />
                <span className="text-sm font-medium text-gray-900">العربية</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="interfaceLanguage" value="en" checked={form.interfaceLanguage === 'en'} onChange={handleChange} className="w-4 h-4 accent-emerald-500" />
                <span className="text-sm font-medium text-gray-900">English</span>
              </label>
            </div>
          </Card>

          {/* Section 7: Account Password */}
          <Card className="space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">lock</span>
              </span>
              {rtl ? 'كلمة المرور' : 'Account Password'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={rtl ? 'كلمة المرور' : 'Password'}>
                <input type="password" name="password" value={form.password} onChange={handleChange} className={inputCls} dir="ltr" />
              </Field>
              <Field label={rtl ? 'تأكيد كلمة المرور' : 'Confirm Password'}>
                <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} className={inputCls} dir="ltr" />
              </Field>
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !form.firstName || !form.lastName || !form.phone}
              className="px-8"
            >
              {loading ? <Spinner size="sm" /> : <span className="material-symbols-outlined text-lg">save</span>}
              {loading ? (rtl ? 'جاري الحفظ...' : 'Saving...') : (rtl ? 'تسجيل المشترك' : 'REGISTER MEMBER')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/members')}
              className="px-6"
            >
              {rtl ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
