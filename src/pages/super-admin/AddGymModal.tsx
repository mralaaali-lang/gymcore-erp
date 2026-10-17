import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  createPlatformGym,
  uploadGymLogo,
  listBillingPlans,
  type BillingPlan,
  type CreateGymWizardPayload,
} from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useApp } from '../../context/GymBrandContext';
import { X, Upload, Image as ImageIcon, CheckCircle } from '@phosphor-icons/react';

interface AddGymModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormData {
  gym_name: string;
  subdomain: string;
  owner_full_name: string;
  owner_email: string;
  owner_password: string;
  phone: string;
  address_country: string;
  currency: string;
  plan_id: string;
  billing_cycle: 'monthly' | 'yearly';
  is_active: boolean;
  logoFile: File | null;
  logoPreview: string;
}

const COUNTRIES = ['Egypt', 'Saudi Arabia', 'UAE', 'Kuwait', 'Jordan', 'Morocco', 'Tunisia', 'Iraq'];

// Arabic â†’ Latin transliteration map for subdomain generation
const AR2EN: Record<string, string> = {
  'ا':'a','أ':'a','إ':'a','آ':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
  'د':'d','ذ':'dh','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'zh',
  'ع':'aa','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
  'ي':'y','ء':'a','ئ':'y','ة':'t','ى':'a','پ':'p','ع†':'ch','عک':'zh','ع¯':'g',
};
function transliterate(text: string): string {
  return text.replace(/[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويةىءئپچژگ]/g, (ch) => AR2EN[ch] || ch);
}

export default function AddGymModal({ open, onClose, onSuccess }: AddGymModalProps) {
  const { language } = useApp();
  const { showToast } = useToast();
  const isRtl = language === 'ar';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: plansData } = useQuery({
    queryKey: ['platform', 'billing', 'plans'],
    queryFn: () => listBillingPlans(),
    staleTime: 60_000,
    enabled: open,
  });
  const plans: BillingPlan[] = plansData?.data ?? [];

  const [form, setForm] = useState<FormData>({
    gym_name: '',
    subdomain: '',
    owner_full_name: '',
    owner_email: '',
    owner_password: '',
    phone: '',
    address_country: 'Egypt',
    currency: 'EGP',
    plan_id: '',
    billing_cycle: 'monthly',
    is_active: true,
    logoFile: null,
    logoPreview: '',
  });

  const [subdomainStatus, setSubdomainStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [subdomainMsg, setSubdomainMsg] = useState<string>('');
  const [subdomainAutoGen, setSubdomainAutoGen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: async () => {
      let logoUrl = '';
      if (form.logoFile) {
        try {
          const uploadRes = await uploadGymLogo(form.logoFile);
          logoUrl = uploadRes.data.url;
        } catch {
          throw new Error(isRtl ? 'فشل رفع الشعار' : 'Logo upload failed');
        }
      }

      const resolvedPlanId = form.plan_id || plans[0]?.id;

      const now = new Date();
      if (form.billing_cycle === 'yearly') {
        now.setFullYear(now.getFullYear() + 1);
      } else {
        now.setMonth(now.getMonth() + 1);
      }
      const subscriptionExpiresAt = now.toISOString();

      const base: CreateGymWizardPayload & { owner_password?: string } = {
        gym_name: form.gym_name,
        subdomain: form.subdomain || transliterate(form.gym_name).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'gym-' + Date.now().toString(36).slice(-4),
        owner_full_name: form.owner_full_name,
        owner_email: form.owner_email,
        owner_password: form.owner_password,
        phone: form.phone,
        gym_email: form.owner_email,
        address_country: form.address_country,
        currency: form.currency,
        plan_id: resolvedPlanId,
        billing_cycle: form.billing_cycle,
        subscription_expires_at: subscriptionExpiresAt,
        is_active: form.is_active,
        logo_url: logoUrl || undefined,
      };

      return createPlatformGym(base);
    },
    onSuccess: () => {
      showToast(
        isRtl ? 'تم إنشاء الصالة بنجاح' : 'Gym created successfully',
        'success'
      );
      onClose();
      onSuccess?.();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string; details?: Array<{ field: string; message: string }> } } };
      const serverMsg = axiosErr?.response?.data?.error;
      const details = axiosErr?.response?.data?.details;
      if (details && details.length > 0) {
        setError(serverMsg + ': ' + details.map(d => d.field + ' ' + d.message).join(' | '));
      } else if (serverMsg) {
        setError(serverMsg);
      } else {
        setError(isRtl ? 'فشل حفظ بيانات النادي' : 'Failed to save gym');
      }
      console.error('Create gym error:', axiosErr?.response?.data);
    },
  });

  useEffect(() => {
    if (!open) {
      setForm({
        gym_name: '',
        subdomain: '',
        owner_full_name: '',
        owner_email: '',
        owner_password: '',
        phone: '',
        address_country: 'Egypt',
        currency: 'EGP',
        plan_id: '',
        billing_cycle: 'monthly',
        is_active: true,
        logoFile: null,
        logoPreview: '',
      });
      setSubdomainStatus('idle');
      setSubdomainMsg('');
      setSubdomainAutoGen(true);
      setError(null);
      saveMutation.reset();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(async () => {
      const raw = form.subdomain.trim();
      if (!raw) {
        setSubdomainStatus('idle');
        setSubdomainMsg('');
        return;
      }
      setSubdomainStatus('checking');
      setSubdomainMsg('');
      try {
        const res = await fetch(`/platform/gyms/check-subdomain?subdomain=${encodeURIComponent(raw)}`);
        if (!res.ok) {
          setSubdomainStatus('idle');
          setSubdomainMsg('');
          return;
        }
        const json = await res.json();
        if (json?.data?.available) {
          setSubdomainStatus('available');
          setSubdomainMsg(isRtl ? 'هذا النطاق متاح' : 'Subdomain is available');
        } else {
          setSubdomainStatus('taken');
          setSubdomainMsg(isRtl ? 'هذا النطاق مسجل مسبقاً' : 'Subdomain is already registered');
        }
      } catch {
        setSubdomainStatus('idle');
      }
    }, 600);
    return () => clearTimeout(timeout);
  }, [form.subdomain, open, isRtl]);

  // Auto-generate subdomain from gym name
  useEffect(() => {
    if (!open || !subdomainAutoGen) return;
    let gen = transliterate(form.gym_name)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    // Fallback if name is all non-ASCII (rare edge case)
    if (!gen || gen.length < 3) {
      gen = 'gym-' + Date.now().toString(36).slice(-4);
    }
    if (gen !== form.subdomain) {
      update('subdomain', gen);
    }
  }, [form.gym_name, open, subdomainAutoGen]);

  const update = (field: keyof FormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubdomainFocus = () => {
    setSubdomainAutoGen(false);
  };

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
    setForm((prev) => ({ ...prev, logoFile: null, logoPreview: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    saveMutation.mutate();
  };

  const isSubmitting = saveMutation.isPending;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {isRtl ? 'إضافة صالة جديدة' : 'Add New Gym'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {isRtl ? 'أدخل البيانات الأساسية لإنشاء الصالة والاشتراك' : 'Enter the essential details to create the gym and subscription'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors" disabled={isSubmitting}>
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'اسم الصالة' : 'Gym Name'} *
                </label>
                <input
                  type="text"
                  value={form.gym_name}
                  onChange={(e) => update('gym_name', e.target.value)}
                  placeholder={isRtl ? 'أدخل اسم الصالة' : 'Enter gym name'}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'النطاق الفرعي (Subdomain)' : 'Subdomain'} *
                </label>
                <input
                  type="text"
                  value={form.subdomain}
                  onFocus={handleSubdomainFocus}
                  onChange={(e) => update('subdomain', e.target.value)}
                  placeholder={isRtl ? 'يُولد تلقائياً' : 'Auto-generated'}
                  className={`w-full px-4 py-3 border rounded-xl text-gray-900 focus:outline-none focus:ring-2 bg-white transition-colors disabled:opacity-60 ${
                    subdomainStatus === 'taken' ? 'border-red-300 focus:ring-red-400' : 'border-gray-200 focus:ring-emerald-500'
                  }`}
                  required
                  disabled={isSubmitting}
                />
                {subdomainMsg && (
                  <p className={`text-xs mt-1.5 ${subdomainStatus === 'available' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {subdomainMsg}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              {isRtl ? 'بيانات المالك' : 'Manager Credentials'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'اسم المالك الكامل' : "Manager's Full Name"} *
                </label>
                <input
                  type="text"
                  value={form.owner_full_name}
                  onChange={(e) => update('owner_full_name', e.target.value)}
                  placeholder={isRtl ? 'محمد أحمد' : 'John Smith'}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'رقم الهاتف' : 'Phone Number'} *
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="+20 100 000 0000"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'بريد المالك الإلكتروني' : "Owner's Email"} *
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={form.owner_email}
                  onChange={(e) => update('owner_email', e.target.value)}
                  placeholder="owner@gym.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'كلمة المرور المؤقتة' : 'Temporary Password'} *
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={form.owner_password}
                  onChange={(e) => update('owner_password', e.target.value)}
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  minLength={8}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors"
                  required
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {isRtl ? 'يجب أن تحتوي على حرف كبير وحرف صغير ورقم (مثال: Gym@2024)' : 'Must include uppercase, lowercase & number (e.g. Gym@2024)'}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              {isRtl ? 'إعدادات الاشتراك' : 'Subscription Settings'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'الخطة / الباقة' : 'Subscription Plan'} *
                </label>
                <select
                  value={form.plan_id}
                  onChange={(e) => update('plan_id', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors appearance-none"
                  required
                  disabled={isSubmitting || !plans.length}
                >
                  <option value="">{isRtl ? '— اختر الباقة —' : '— Select Plan —'}</option>
                  {plans.map((p) => {
                    // §46: نفس منطق الإبرام — السعر المعروض هو المحمَّل في الدورة
                    // المختارة، والسعر الكامل يُذكر صراحة وهو الخصم سارٍ.
                    const yearly = form.billing_cycle === 'yearly';
                    const charged = Number(yearly ? p.price_yearly : p.price_monthly);
                    const full = yearly ? p.list_price_yearly : p.list_price_monthly;
                    const struck = Boolean(p.discount_active) && full != null && Number(full) > charged;
                    const money = (v: number | string | null | undefined) => Number(v ?? 0).toLocaleString('en-US');
                    return (
                      <option key={p.id} value={p.id}>
                        {(isRtl ? p.name_ar || p.name : p.name)} — {yearly ? (isRtl ? 'سنوي' : 'Yearly') : (isRtl ? 'شهري' : 'Monthly')}: {money(charged)} {isRtl ? 'ج.م' : 'EGP'}
                        {struck ? ` — ${isRtl ? `بدلاً من ${money(full)}` : `instead of ${money(full)}`}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'دورة الفوترة' : 'Billing Cycle'}
                </label>
                <select
                  value={form.billing_cycle}
                  onChange={(e) => update('billing_cycle', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors appearance-none"
                  disabled={isSubmitting}
                >
                  <option value="monthly">{isRtl ? 'شهري' : 'Monthly'}</option>
                  <option value="yearly">{isRtl ? 'سنوي' : 'Yearly'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'الدولة' : 'Country'}
                </label>
                <select
                  value={form.address_country}
                  onChange={(e) => update('address_country', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors appearance-none"
                  disabled={isSubmitting}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {isRtl ? 'العملة الافتراضية' : 'Default Currency'}
                </label>
                <select
                  value={form.currency}
                  onChange={(e) => update('currency', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white transition-colors appearance-none"
                  disabled={isSubmitting}
                >
                  <option value="EGP">{isRtl ? 'جنيه مصري (EGP)' : 'Egyptian Pound (EGP)'}</option>
                  <option value="SAR">{isRtl ? 'ريال سعودي (SAR)' : 'Saudi Riyal (SAR)'}</option>
                  <option value="AED">{isRtl ? 'درهم إماراتي (AED)' : 'UAE Dirham (AED)'}</option>
                  <option value="KWD">{isRtl ? 'دينار كويتي (KWD)' : 'Kuwaiti Dinar (KWD)'}</option>
                  <option value="JOD">{isRtl ? 'دينار أردني (JOD)' : 'Jordanian Dinar (JOD)'}</option>
                  <option value="MAD">{isRtl ? 'درهم مغربي (MAD)' : 'Moroccan Dirham (MAD)'}</option>
                  <option value="USD">{isRtl ? 'دولار أمريكي (USD)' : 'US Dollar (USD)'}</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              {isRtl ? 'شعار الصالة' : 'Gym Logo'}
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.svg,.webp,image/*"
              onChange={handleLogoSelect}
              className="hidden"
            />
            {form.logoPreview ? (
              <div className="relative inline-block">
                <img
                  src={form.logoPreview}
                  alt="Logo preview"
                  className="w-24 h-24 object-contain rounded-xl border border-gray-200 bg-gray-50 p-1.5"
                />
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={isSubmitting}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md disabled:opacity-60"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting}
                className="max-w-[200px] border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 text-gray-600 hover:border-emerald-500 hover:bg-emerald-50 transition-all disabled:opacity-60"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <ImageIcon size={20} className="text-gray-500" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-xs">
                    {isRtl ? 'شعار الصالة' : 'Gym Logo'}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {isRtl ? '2 ميجا كحد أقصى' : 'Max 2 MB'}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                  <Upload size={12} />
                  {isRtl ? 'رفع' : 'Upload'}
                </div>
              </button>
            )}
          </section>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !form.gym_name ||
                !form.subdomain ||
                !form.owner_full_name ||
                !form.owner_email ||
                !form.owner_password ||
                !form.phone ||
                subdomainStatus === 'taken'
              }
              className="flex items-center gap-2.5 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25"
            >
              {isSubmitting ? (
                <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
              ) : (
                <CheckCircle size={18} />
              )}
              {isRtl ? 'إنشاء الصالة' : 'CREATE GYM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

