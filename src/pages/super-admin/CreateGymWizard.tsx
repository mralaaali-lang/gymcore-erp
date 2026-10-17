import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import {
  createPlatformGym,
  updateGymFull,
  getPlatformGym,
  uploadGymLogo,
  type CreateGymWizardPayload,
  type PlatformGymDetail,
} from '../../services/api';
import { ArrowRight, Upload, Image as ImageIcon, X, CheckCircle as CheckCircle2 } from '@phosphor-icons/react';

interface WizardForm {
  // Hero
  gym_name: string;
  dba_name: string;
  // General info
  owner_full_name: string;
  owner_email: string;
  owner_password: string;
  phone: string;
  gym_email: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country: string;
  // SaaS Subscription & Billing
  plan_tier: string;
  subscription_expires_at: string;
  is_active: boolean;
  // Localization
  currency: string;
  timezone: string;
  date_format: string;
  time_format: string;
  first_day_of_week: string;
  language: string;
  units_system: string;
  // Branding
  logo_url: string;
  logoFile: File | null;
  logoPreview: string;
}

const TIMEZONES = [
  { value: 'Africa/Cairo', label: 'GMT+02:00 Cairo Time' },
  { value: 'Asia/Riyadh', label: 'GMT+03:00 Riyadh Time' },
  { value: 'Asia/Dubai', label: 'GMT+04:00 Dubai Time' },
  { value: 'Europe/London', label: 'GMT+00:00 London Time' },
  { value: 'America/New_York', label: 'GMT-05:00 New York Time' },
];

const COUNTRIES = ['Egypt', 'Saudi Arabia', 'UAE', 'Kuwait', 'Jordan', 'Morocco', 'Tunisia', 'Iraq'];

const STATES_EG = ['Cairo', 'Alexandria', 'Giza', 'Luxor', 'Aswan', 'Port Said', 'Suez', 'Ismailia', 'Sharqia', 'Monufia', 'Beheira', 'Dakahlia', 'Other'];

export default function CreateGymWizard() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const isEditMode = Boolean(editId);
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<WizardForm>({
    gym_name: '',
    dba_name: '',
    owner_full_name: '',
    owner_email: '',
    owner_password: '',
    phone: '',
    gym_email: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_zip: '',
    address_country: 'Egypt',
    // SaaS Subscription & Billing
    plan_tier: 'basic',
    subscription_expires_at: '',
    is_active: true,
    // Localization
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    date_format: 'DD/MM/YYYY',
    time_format: '12h',
    first_day_of_week: 'Sunday',
    language: 'ar',
    units_system: 'metric',
    logo_url: '',
    logoFile: null,
    logoPreview: '',
  });

  // Load gym data in edit mode
  const { data: gymDetail } = useQuery({
    queryKey: ['platform', 'gym', editId],
    queryFn: () => getPlatformGym(editId!),
    enabled: isEditMode,
  });

  useEffect(() => {
    if (isEditMode && gymDetail?.data) {
      const g: PlatformGymDetail = gymDetail.data;
      setForm((prev) => ({
        ...prev,
        gym_name: g.name || '',
        dba_name: g.dba_name || '',
        phone: g.phone || '',
        gym_email: g.email || '',
        address_city: g.address_city || '',
        address_country: g.address_country || 'Egypt',
        timezone: g.timezone || 'Africa/Cairo',
        language: g.language || 'ar',
        logo_url: g.logo_url || '',
        logoPreview: g.logo_url || '',
        plan_tier: g.plan_tier || 'basic',
        subscription_expires_at: g.subscription_expires_at ? g.subscription_expires_at.split('T')[0] : '',
        is_active: g.is_active ?? true,
      }));
    }
  }, [isEditMode, gymDetail]);

  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof WizardForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Logo preview
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast(isRtl ? 'حجم الملف يتجاوز 2 ميجا' : 'File exceeds 2 MB limit', 'error');
      return;
    }
    setForm((prev) => ({ ...prev, logoFile: file, logoPreview: URL.createObjectURL(file) }));
  };

  const removeLogo = () => {
    setForm((prev) => ({ ...prev, logoFile: null, logoPreview: '', logo_url: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [, setCreatedGymId] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: CreateGymWizardPayload) => {
      if (isEditMode && editId) {
        return updateGymFull(editId, {
          gym_name: payload.gym_name,
          phone: payload.phone,
          gym_email: payload.gym_email,
          address_street: payload.address_street,
          address_city: payload.address_city,
          address_state: payload.address_state,
          address_zip: payload.address_zip,
          address_country: payload.address_country,
          timezone: payload.timezone,
          date_format: payload.date_format,
          time_format: payload.time_format,
          first_day_of_week: payload.first_day_of_week,
          language: payload.language,
          units_system: payload.units_system,
          logo_url: payload.logo_url,
          currency: payload.currency,
          plan_tier: payload.plan_tier,
          subscription_expires_at: payload.subscription_expires_at,
          is_active: payload.is_active,
        });
      }
      return createPlatformGym(payload);
    },
    onSuccess: (result) => {
      const gymId = isEditMode ? editId! : (result as { data: { gym: { id: string } } }).data.gym.id;
      setCreatedGymId(gymId);
      showToast(
        isEditMode
          ? (isRtl ? 'تم تحديث بيانات النادي بنجاح' : 'Gym updated successfully')
          : (isRtl ? 'تم إنشاء الصالة بنجاح' : 'Gym created successfully'),
        'success'
      );
      navigate('/super-admin/tenants');
    },
    onError: (err: unknown) => {
      // middleware/validate.ts بيرجع { error, details: [{field, message}] } —
      // بدون details كانت رسالة المستخدم بتفضل «Validation failed» غامضة.
      const axiosErr = err as {
        response?: { data?: { error?: string; details?: Array<{ field?: string; message?: string }> } };
      };
      const raw = axiosErr?.response?.data;
      const details = Array.isArray(raw?.details)
        ? (raw!.details as Array<{ field?: string; message?: string }>)
            .filter((d) => d && (d.field || d.message))
            .map((d) => `${d.field || ''}${d.field ? ': ' : ''}${d.message || ''}`)
            .join(' · ')
        : '';
      setError(details || raw?.error || (isRtl ? 'فشل حفظ بيانات النادي' : 'Failed to save gym'));
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.gym_name || form.gym_name.trim().length < 2) {
      setError(isRtl ? 'يجب إدخال اسم الصالة' : 'Gym name is required');
      return;
    }

    // In edit mode, manager credentials are NOT required (gym already has a manager)
    if (!isEditMode) {
      if (!form.owner_full_name || !form.owner_email || !form.owner_password) {
        setError(isRtl ? 'يجب إدخال بيانات المدير' : 'Manager name, email, and password are required');
        return;
      }
    }

    let logoUrl = form.logo_url;
    if (form.logoFile) {
      try {
        const uploadRes = await uploadGymLogo(form.logoFile);
        logoUrl = uploadRes.data.url;
      } catch {
        setError(isRtl ? 'فشل رفع الشعار' : 'Logo upload failed');
        return;
      }
    }

    // Subdomains must be ASCII ([a-z0-9-]) for URL use (.gymcore.app).
    // Fallback chain: ASCII name slug → DBA slug → email domain slug → random suffix.
    const slugifyAscii = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    const nameSlug = slugifyAscii(form.gym_name);
    const dbaSlug = slugifyAscii(form.dba_name || '');
    const domainSlug = slugifyAscii((form.owner_email.split('@')[1] || '').replace(/\./g, '-'));
    const subdomain = nameSlug.length >= 3
      ? nameSlug.slice(0, 50)
      : dbaSlug.length >= 3
        ? dbaSlug.slice(0, 50)
        : domainSlug.length >= 3
          ? domainSlug.slice(0, 50)
          : `gym-${Date.now().toString(36)}`;

    saveMutation.mutate({
      gym_name: form.gym_name,
      subdomain,
      owner_email: form.owner_email,
      owner_password: form.owner_password,
      owner_full_name: form.owner_full_name,
      plan_tier: form.plan_tier || 'basic',
      subscription_expires_at: form.subscription_expires_at || undefined,
      is_active: form.is_active,
      dba_name: form.dba_name || undefined,
      phone: form.phone,
      // حقل اختياري بـ z.string().email() على السيرفر: سلسلة فاضية = 400
      // «Validation failed» (و.optional() بيقبل undefined بس)، فالفاضي
      // يتبعت undefined مش ''. الكونترولر كذا بيحوّله لبريد المدير أو null.
      gym_email: form.gym_email || undefined,
      address_street: form.address_street,
      address_city: form.address_city,
      address_state: form.address_state,
      address_zip: form.address_zip,
      address_country: form.address_country,
      timezone: form.timezone,
      date_format: form.date_format,
      time_format: form.time_format,
      first_day_of_week: form.first_day_of_week,
      language: form.language,
      units_system: form.units_system,
      currency: form.currency,
      logo_url: logoUrl || undefined,
    });
  };

  const inputCls = 'w-full px-4 py-3 border border-gray-100 rounded-xl text-gray-900 placeholder-gray-400/50 focus:outline-none focus:ring-2 focus:ring-accent bg-white transition-colors';
  const selectCls = 'w-full px-4 py-3 border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent bg-white transition-colors appearance-none';
  const labelCls = 'block text-sm font-bold text-gray-500 mb-2';

  return (
    <div className="min-h-screen bg-gray-50" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Back link */}
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => navigate('/super-admin/tenants')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors"
        >
          <ArrowRight size={16} className={isRtl ? 'rotate-0' : 'rotate-180'} />
          {isRtl ? 'العودة إلى دليل الصالات' : 'Back to Tenant Directory'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-6 pb-32">
        {/* ===== 1. HERO SECTION ===== */}
        <div className="mt-6 rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 p-8 md:p-12 text-white">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">
            {isEditMode
              ? (isRtl ? `تعديل نادي "${form.gym_name}"` : `Edit "${form.gym_name}"`)
              : (isRtl ? 'ما اسم صالتك الرياضية؟' : 'What is the name of your gym?')}
          </h1>
          <p className="text-white/60 mb-6 text-sm">
            {isRtl ? 'هذا الاسم سيظهر في لوحة التحكم ولفواتيرك' : 'This name will appear on your dashboard and invoices'}
          </p>
          <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2">
            {isRtl ? 'اسم الصالة' : 'LOCATION NAME'}
          </label>
          <input
            type="text"
            value={form.gym_name}
            onChange={(e) => update('gym_name', e.target.value)}
            placeholder={isRtl ? 'أدخل اسم الصالة هنا' : 'Enter location name here'}
            className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 text-lg focus:outline-none focus:ring-2 focus:ring-accent focus:bg-white/15 transition-all"
            required
          />
        </div>

        {/* ===== 2. GENERAL INFORMATION ===== */}
        <section className="mt-8 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">2</span>
            {isRtl ? 'معلومات عامة' : 'General Information'}
          </h2>

          {/* Manager info — only in create mode (edit mode keeps existing manager) */}
          {!isEditMode && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div>
              <label className={labelCls}>{isRtl ? 'اسم المدير الكامل' : "Manager's Full Name"} *</label>
              <input
                type="text"
                value={form.owner_full_name}
                onChange={(e) => update('owner_full_name', e.target.value)}
                placeholder={isRtl ? 'محمد أحمد' : 'John Smith'}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'بريد المدير الإلكتروني' : "Manager's Email"} *</label>
              <input
                type="email"
                dir="ltr"
                value={form.owner_email}
                onChange={(e) => update('owner_email', e.target.value)}
                placeholder="manager@gym.com"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'كلمة المرور المؤقتة' : 'Temporary Password'} *</label>
              <input
                type="password"
                dir="ltr"
                value={form.owner_password}
                onChange={(e) => update('owner_password', e.target.value)}
                placeholder="••••••••"
                minLength={8}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'رقم الهاتف' : 'Phone Number'}</label>
              <input
                type="tel"
                dir="ltr"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+20 100 000 0000"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'البريد الإلكتروني للصالة' : 'Email (Gym)'}</label>
              <input
                type="email"
                dir="ltr"
                value={form.gym_email}
                onChange={(e) => update('gym_email', e.target.value)}
                placeholder="info@gym.com"
                className={inputCls}
              />
            </div>
          </div>
          )}

          <hr className="border-gray-100 mb-6" />

          {/* Address */}
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
            {isRtl ? 'العنوان' : 'Address'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className={labelCls}>{isRtl ? 'الشارع والعنوان' : 'Street Address'}</label>
              <input
                type="text"
                value={form.address_street}
                onChange={(e) => update('address_street', e.target.value)}
                placeholder={isRtl ? 'شارع النزهة، المعادي' : '123 Main Street'}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'المدينة' : 'City'}</label>
              <input
                type="text"
                value={form.address_city}
                onChange={(e) => update('address_city', e.target.value)}
                placeholder={isRtl ? 'القاهرة' : 'Cairo'}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'المنطقة / المحافظة' : 'State / Region'}</label>
              {form.address_country === 'Egypt' ? (
                <select
                  value={form.address_state}
                  onChange={(e) => update('address_state', e.target.value)}
                  className={selectCls}
                >
                  <option value="">{isRtl ? '— اختر —' : '— Select —'}</option>
                  {STATES_EG.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.address_state}
                  onChange={(e) => update('address_state', e.target.value)}
                  className={inputCls}
                />
              )}
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'الرمز البريدي' : 'Zip / Postal Code'}</label>
              <input
                type="text"
                dir="ltr"
                value={form.address_zip}
                onChange={(e) => update('address_zip', e.target.value)}
                placeholder="11999"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'الدولة' : 'Country'}</label>
              <select
                value={form.address_country}
                onChange={(e) => update('address_country', e.target.value)}
                className={selectCls}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5">
            <label className={labelCls}>{isRtl ? 'الاسم التجاري (اختياري)' : 'DOING BUSINESS AS (DBA)'}</label>
            <input
              type="text"
              value={form.dba_name}
              onChange={(e) => update('dba_name', e.target.value)}
              placeholder={isRtl ? 'يظهر في الفواتير بدلاً من اسم الصالة' : 'Appears on invoices instead of the location name (optional)'}
              className={inputCls}
            />
            <p className="text-xs text-gray-500/60 mt-1.5">
              {isRtl ? 'يظهر على الفواتير بدلاً من اسم الصالة (اختياري)' : 'Appears on invoices instead of the location name (optional)'}
            </p>
          </div>
        </section>

        {/* ===== 3. SAAS SUBSCRIPTION & BILLING SETTINGS ===== */}
        <section className="mt-6 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">3</span>
            {isRtl ? 'إعدادات الباقات والاشتراك والفواتير' : 'SaaS Subscription & Billing Settings'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Plan Selection */}
            <div>
              <label className={labelCls}>{isRtl ? 'الباقة الحالية / الخطة' : 'Current Plan / Package'}</label>
              <select
                value={form.plan_tier}
                onChange={(e) => update('plan_tier', e.target.value)}
                className={selectCls}
              >
                <option value="basic">{isRtl ? 'الانطلاق' : 'Starter'}</option>
                <option value="premium">{isRtl ? 'الاحترافية' : 'Professional'}</option>
                <option value="enterprise">{isRtl ? 'الشركات' : 'Enterprise'}</option>
              </select>
            </div>

            {/* Subscription Expiry Date */}
            <div>
              <label className={labelCls}>{isRtl ? 'تاريخ انتهاء الاشتراك' : 'Subscription Expiry Date'}</label>
              <input
                type="date"
                value={form.subscription_expires_at}
                onChange={(e) => update('subscription_expires_at', e.target.value)}
                className={inputCls}
                dir="ltr"
              />
            </div>

            {/* Subscription Status */}
            <div>
              <label className={labelCls}>{isRtl ? 'حالة الحساب' : 'Account Status'}</label>
              <select
                value={form.is_active ? 'active' : 'suspended'}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.value === 'active' }))}
                className={selectCls}
              >
                <option value="active">{isRtl ? 'نشط' : 'Active'}</option>
                <option value="suspended">{isRtl ? 'معلق' : 'Suspended'}</option>
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className={labelCls}>{isRtl ? 'عملة الصالة' : 'Gym Currency'}</label>
              <select
                value={form.currency}
                onChange={(e) => update('currency', e.target.value)}
                className={selectCls}
              >
                <option value="EGP">{isRtl ? 'جنيه مصري (EGP)' : 'Egyptian Pound (EGP)'}</option>
                <option value="SAR">{isRtl ? 'ريال سعودي (SAR)' : 'Saudi Riyal (SAR)'}</option>
                <option value="AED">{isRtl ? 'درهم إماراتي (AED)' : 'UAE Dirham (AED)'}</option>
                <option value="KWD">{isRtl ? 'دينار كويتي (KWD)' : 'Kuwaiti Dinar (KWD)'}</option>
                <option value="JOD">{isRtl ? 'دينار أردني (JOD)' : 'Jordanian Dinar (JOD)'}</option>
                <option value="MAD">{isRtl ? 'درهم مغربي (MAD)' : 'Moroccan Dirham (MAD)'}</option>
                <option value="USD">{isRtl ? 'دولار أمريكي (USD)' : 'US Dollar (USD)'}</option>
              </select>
              <p className="text-xs text-gray-500/60 mt-1.5">
                {isRtl ? 'تظهر العملة في جميع الفواتير والمعاملات المالية' : 'Currency used for all invoices and financial transactions'}
              </p>
            </div>
          </div>

          {/* Linked Invoices Quick View — only meaningful for an existing gym */}
          {isEditMode && editId && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <button
                type="button"
                onClick={() => navigate(`/super-admin/billing?gym=${editId}`)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-xl font-medium hover:bg-primary/20 transition-colors"
              >
                <span className="material-symbols-outlined">receipt_long</span>
                {isRtl ? 'عرض فواتير الصالة' : 'View Gym Invoices'}
              </button>
            </div>
          )}
        </section>

        {/* ===== 4. LANGUAGE, UNITS, DATE & TIME ===== */}
        <section className="mt-6 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">4</span>
            {isRtl ? 'اللغة والوحدات والتوقيت' : 'Language, Units, Date & Time Settings'}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label className={labelCls}>{isRtl ? 'المنطقة الزمنية' : 'Timezone'}</label>
              <select
                value={form.timezone}
                onChange={(e) => update('timezone', e.target.value)}
                className={selectCls}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'تنسيق التاريخ' : 'Date Format'}</label>
              <select
                value={form.date_format}
                onChange={(e) => update('date_format', e.target.value)}
                className={selectCls}
              >
                <option value="DD/MM/YYYY">DD / MM / YYYY</option>
                <option value="MM/DD/YYYY">MM / DD / YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'تنسيق الوقت' : 'Time Format'}</label>
              <select
                value={form.time_format}
                onChange={(e) => update('time_format', e.target.value)}
                className={selectCls}
              >
                <option value="12h">{isRtl ? '12 ساعة (صباحاً/مساءً)' : '12-hour (AM / PM)'}</option>
                <option value="24h">{isRtl ? '24 ساعة' : '24-hour'}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'أول أيام الأسبوع' : 'First Day of Week'}</label>
              <select
                value={form.first_day_of_week}
                onChange={(e) => update('first_day_of_week', e.target.value)}
                className={selectCls}
              >
                <option value="Sunday">{isRtl ? 'الأحد' : 'Sunday'}</option>
                <option value="Saturday">{isRtl ? 'السبت' : 'Saturday'}</option>
                <option value="Monday">{isRtl ? 'الاثنين' : 'Monday'}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'اللغة الافتراضية' : 'Default Language'}</label>
              <select
                value={form.language}
                onChange={(e) => update('language', e.target.value)}
                className={selectCls}
              >
                <option value="ar">العربية (Arabic)</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{isRtl ? 'نظام الوحدات' : 'Units System'}</label>
              <select
                value={form.units_system}
                onChange={(e) => update('units_system', e.target.value)}
                className={selectCls}
              >
                <option value="metric">{isRtl ? 'متري (كجم / كم)' : 'Metric (kg / km)'}</option>
                <option value="imperial">{isRtl ? 'إمبراطوري (رطل / ميل)' : 'Imperial (lb / mi)'}</option>
              </select>
            </div>
          </div>
        </section>

        {/* ===== 5. ADD YOUR LOGO ===== */}
        <section className="mt-6 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">5</span>
            {isRtl ? 'أضف شعار صالتك' : 'Add Your Logo'}
          </h2>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.svg,.webp"
            onChange={handleLogoSelect}
            className="hidden"
          />

          {form.logoPreview ? (
            <div className="relative inline-block">
              <img
                src={form.logoPreview}
                alt="Logo preview"
                className="w-40 h-40 object-contain rounded-3xl border border-gray-100 shadow-sm bg-gray-50 p-2"
              />
              <button
                type="button"
                onClick={removeLogo}
                className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-sm border-2 border-dashed border-gray-100 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-gray-500 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
            >
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                <ImageIcon size={28} className="text-gray-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">
                  {isRtl ? 'اضغط لرفع شعار الصالة' : 'Click to upload gym logo'}
                </p>
                <p className="text-xs text-gray-500/50 mt-1">
                  {isRtl ? 'PNG, JPG, SVG — بحد أقصى 2 ميجا' : 'PNG, JPG, SVG — Max 2 MB'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                <Upload size={14} />
                {isRtl ? 'رفع ملف' : 'Upload File'}
              </div>
            </button>
          )}
        </section>

        {/* ===== 5. ERROR & SUBMIT ===== */}
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-6 py-4 z-40">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/super-admin/tenants')}
              className="px-5 py-3 border border-gray-100 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors"
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending || !form.gym_name || (!isEditMode && (!form.owner_full_name || !form.owner_email || !form.owner_password))}
              className="flex items-center gap-2.5 px-8 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/25"
            >
              {saveMutation.isPending ? (
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              ) : (
                <CheckCircle2 size={18} />
              )}
              {isEditMode
                ? (isRtl ? 'حفظ التغييرات' : 'SAVE CHANGES')
                : (isRtl ? 'إنشاء الصالة' : 'CREATE LOCATION')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}


