import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOnboardingProgress,
  saveOnboardingStep,
  completeOnboarding,

  type OnboardingProgress,
} from '../../services/api';
import {
  Sparkles,
  Dumbbell,
  Shield,
  Settings,
  CheckCircle2,

  Check,
  Building2,
  UserPlus,
  Globe,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Star,
  BarChart3,
  Bell,
  Users,
  Wallet,
} from 'lucide-react';
import PageLoader from '../../components/shared/PageLoader';

const steps = [
  { key: 'welcome', icon: <Sparkles size={24} />, labelAr: 'ترحيب', labelEn: 'Welcome' },
  { key: 'gym', icon: <Building2 size={24} />, labelAr: 'أول صالة', labelEn: 'First Gym' },
  { key: 'admin', icon: <UserPlus size={24} />, labelAr: 'المشرفين', labelEn: 'Admins' },
  { key: 'config', icon: <Settings size={24} />, labelAr: 'الإعدادات', labelEn: 'Settings' },
  { key: 'done', icon: <CheckCircle2 size={24} />, labelAr: 'اكتمال', labelEn: 'Done' },
];

const features = [
  { icon: <Building2 size={20} />, labelAr: 'إدارة صالات متعددة', labelEn: 'Multi-Gym Management', descAr: 'أنشئ وصادر عدة صالات رياضية من لوحة تحكم واحدة', descEn: 'Create and manage multiple gyms from one dashboard' },
  { icon: <BarChart3 size={20} />, labelAr: 'تقارير متقدمة', labelEn: 'Advanced Reports', descAr: 'إحصائيات دقيقة عن الإيرادات والأعضاء والأداء', descEn: 'Accurate stats on revenue, members, and performance' },
  { icon: <Users size={20} />, labelAr: 'نظام أدوار متكامل', labelEn: 'Full RBAC System', descAr: 'صلاحيات دقيقة لكل من المشرفين والمدربين', descEn: 'Granular permissions for admins and trainers' },
  { icon: <Bell size={20} />, labelAr: 'إشعارات ذكية', labelEn: 'Smart Notifications', descAr: 'قنوات تواصل متعددة: بريد، رسائل، إشعارات', descEn: 'Multi-channel: email, SMS, push notifications' },
  { icon: <Wallet size={20} />, labelAr: 'فوترة متكاملة', labelEn: 'Integrated Billing', descAr: 'فواتير، كوبونات، ضريبة قيمة مضافة', descEn: 'Invoices, coupons, VAT management' },
  { icon: <Globe size={20} />, labelAr: 'عالمي ومحلي', labelEn: 'Global & Local', descAr: 'يدعم العربية واللغات الأخرى وعملات متعددة', descEn: 'Arabic + RTL support, multi-currency' },
];

const defaultCurrencies = [
  { code: 'EGP', nameAr: 'جنيه مصري', nameEn: 'Egyptian Pound', flag: '🇪🇬' },
  { code: 'SAR', nameAr: 'ريال سعودي', nameEn: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'AED', nameAr: 'درهم إماراتي', nameEn: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'KWD', nameAr: 'دينار كويتي', nameEn: 'Kuwaiti Dinar', flag: '🇰🇼' },
  { code: 'JOD', nameAr: 'دينار أردني', nameEn: 'Jordanian Dinar', flag: '🇯🇴' },
  { code: 'MAD', nameAr: 'درهم مغربي', nameEn: 'Moroccan Dirham', flag: '🇲🇦' },
  { code: 'USD', nameAr: 'دولار أمريكي', nameEn: 'US Dollar', flag: '🇺🇸' },
];

const timezones = [
  'Africa/Cairo',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Amman',
  'Africa/Casablanca',
  'America/New_York',
  'Europe/London',
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const t = (ar: string, en: string) => (isRtl ? ar : en);

  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);

  // Step 2: Gym form
  const [gymForm, setGymForm] = useState({
    name: '',
    name_en: '',
    subdomain: '',
    currency: 'EGP',
  });

  // Step 3: Admin form
  const [adminForm, setAdminForm] = useState({
    email: '',
    password: '',
    display_name: '',
    role: 'super_admin' as string,
  });

  // Step 4: Config form
  const [configForm, setConfigForm] = useState({
    default_currency: 'EGP',
    default_timezone: 'Africa/Cairo',
    vat_percentage: '14',
    platform_name: 'GymCore',
    support_email: 'support@gymcore.app',
  });

  // Load onboarding progress
  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-progress'],
    queryFn: getOnboardingProgress,
    retry: false,
  });

  useEffect(() => {
    if (data?.data) {
      const p = data.data;
      setProgress(p);
      // Restore saved progress
      if (p.onboarding_step > 0 && p.onboarding_step <= 5) {
        setCurrentStep(p.onboarding_step);
      }
      // Restore form data from saved progress
      const savedData = p.onboarding_data || {};
      if (savedData.step_1_data) {
        const g = savedData.step_1_data as typeof gymForm;
        if (g.name) setGymForm((prev) => ({ ...prev, ...g }));
      }
      if (savedData.step_2_data) {
        const a = savedData.step_2_data as typeof adminForm;
        if (a.email) setAdminForm((prev) => ({ ...prev, ...a }));
      }
      if (savedData.step_3_data) {
        const c = savedData.step_3_data as typeof configForm;
        if (c.default_currency) setConfigForm((prev) => ({ ...prev, ...c }));
      }
    }
  }, [data]);

  // Mutations
  const saveStepMutation = useMutation({
    mutationFn: ({ step, data: stepData }: { step: number; data: Record<string, unknown> }) =>
      saveOnboardingStep(step, stepData),
    onError: () => showToast(t('فشل حفظ الخطوة', 'Failed to save step'), 'error'),
  });

  const completeMutation = useMutation({
    mutationFn: (finalData?: Record<string, unknown>) => completeOnboarding(finalData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-progress'] });
      showToast(t('تم إعداد المنصة بنجاح!', 'Platform setup completed successfully!'), 'success');
    },
    onError: () => showToast(t('فشل إكمال الإعداد', 'Failed to complete setup'), 'error'),
  });

  const canProceed = () => {
    switch (currentStep) {
      case 0: return true; // Welcome - always can proceed
      case 1: return gymForm.name.length >= 2 && gymForm.subdomain.length >= 3;
      case 2: return adminForm.email.includes('@') && adminForm.password.length >= 6;
      case 3: return configForm.platform_name.length > 0;
      case 4: return true; // Done - no validation needed
      default: return false;
    }
  };

  const handleNext = async () => {
    if (!canProceed()) return;

    // Save current step data
    let stepData: Record<string, unknown> = {};
    switch (currentStep) {
      case 0:
        stepData = { welcome_viewed: true };
        break;
      case 1:
        stepData = gymForm;
        break;
      case 2:
        stepData = adminForm;
        break;
      case 3:
        stepData = configForm;
        break;
    }

    if (currentStep < 4) {
      await saveStepMutation.mutateAsync({ step: currentStep, data: stepData });
      setCurrentStep((prev) => prev + 1);
    } else {
      // Final step - complete onboarding
      const finalData = {
        gym: gymForm,
        admin: adminForm,
        config: configForm,
        completed_at: new Date().toISOString(),
      };
      await completeMutation.mutateAsync(finalData);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = async () => {
    if (currentStep < 4) {
      await saveStepMutation.mutateAsync({ step: currentStep, data: { skipped: true } });
      setCurrentStep((prev) => prev + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <PageLoader message={t('جاري تحميل الإعدادات...', 'Loading setup...')} />
      </div>
    );
  }

  // If already completed, redirect to dashboard
  if (progress?.onboarding_complete) {
    navigate('/super-admin/dashboard', { replace: true });
    return null;
  }

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => { if (i < currentStep) setCurrentStep(i); }}
            className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
              i === currentStep
                ? 'bg-primary text-white shadow-md'
                : i < currentStep
                ? 'bg-green-100 text-green-700'
                : 'bg-white text-gray-500 border border-gray-100'
            } ${i < currentStep ? 'cursor-pointer' : ''}`}
          >
            {i < currentStep ? <Check size={14} /> : step.icon}
            <span className="hidden sm:inline">{isRtl ? step.labelAr : step.labelEn}</span>
          </button>
          {i < steps.length - 1 && (
            <div className={`w-4 sm:w-8 h-0.5 ${i < currentStep ? 'bg-green-400' : 'bg-gray-100'}`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderNavigation = (showSkip = true) => (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
      <div>
        {currentStep > 0 ? (
          <button
            type="button"
            onClick={handlePrev}
            className="flex items-center gap-2 px-4 py-2.5 text-gray-500 hover:bg-white rounded-xl transition-colors text-sm font-medium"
          >
            {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            {t('السابق', 'Back')}
          </button>
        ) : (
          <div />
        )}
      </div>
      <div className="flex items-center gap-3">
        {showSkip && currentStep < 4 && (
          <button
            type="button"
            onClick={handleSkip}
            className="px-4 py-2.5 text-sm text-gray-500/60 hover:text-gray-500 transition-colors"
          >
            {t('تخطي', 'Skip')}
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed() || saveStepMutation.isPending || completeMutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-petrol-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saveStepMutation.isPending || completeMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : currentStep === 4 ? (
            <CheckCircle2 size={18} />
          ) : (
            (isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />)
          )}
          {currentStep === 4
            ? t('اكتمال الإعداد', 'Complete Setup')
            : t('التالي', 'Next')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="px-4 py-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Dumbbell size={22} className="text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900">GymCore</span>
        </div>
        <div className="text-xs text-gray-500/60">
          {t('الخطوة', 'Step')} {currentStep + 1} {t('من', 'of')} 5
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full px-4 py-6 sm:py-10">
        {renderStepIndicator()}

        {/* ===== STEP 0: WELCOME ===== */}
        {currentStep === 0 && (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-10 shadow-sm">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-6 shadow-lg">
                <Sparkles size={40} className="text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
                {t('مرحباً بك في GymCore', 'Welcome to GymCore')}
              </h1>
              <p className="text-gray-500 max-w-lg leading-relaxed">
                {t(
                  'منصة إدارة الصالات الرياضية المتكاملة. دعنا نساعدك في إعداد المنصة خلال بضع خطوات بسيطة.',
                  'The complete gym management platform. Let us help you set up in a few simple steps.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
              {features.map((f, i) => (
                <div key={i} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-9 h-9 rounded-lg bg-primary bg-opacity-10 flex items-center justify-center mb-2">
                    <div className="text-primary">{f.icon}</div>
                  </div>
                  <p className="font-semibold text-sm text-gray-900 mb-0.5">
                    {isRtl ? f.labelAr : f.labelEn}
                  </p>
                  <p className="text-xs text-gray-500/70">
                    {isRtl ? f.descAr : f.descEn}
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-[#f0f4ff] rounded-xl p-4 border border-blue-200">
              <p className="text-sm text-blue-800 font-medium flex items-center gap-2">
                <Star size={16} className="text-amber-500" />
                {t(
                  'سيستغرق الإعداد حوالي 5 دقائق فقط. يمكنك العودة وتعديل أي إعداد لاحقاً.',
                  'Setup takes about 5 minutes. You can change any setting later.'
                )}
              </p>
            </div>

            {renderNavigation(false)}
          </div>
        )}

        {/* ===== STEP 1: FIRST GYM ===== */}
        {currentStep === 1 && (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-10 shadow-sm">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-md">
                <Building2 size={32} className="text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                {t('إنشاء أول صالة رياضية', 'Create Your First Gym')}
              </h2>
              <p className="text-gray-500 text-sm">
                {t(
                  'أدخل بيانات الصالة الرياضية الأولى. يمكنك إضافة المزيد لاحقاً.',
                  'Enter the details for your first gym. You can add more later.'
                )}
              </p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('اسم الصالة (عربي)', 'Gym Name (Arabic)')}</label>
                <input
                  type="text"
                  value={gymForm.name}
                  onChange={(e) => setGymForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t('مثال: صالة الأبطال', 'Example: Champions Gym')}
                  dir="rtl"
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('اسم الصالة (إنجليزي)', 'Gym Name (English)')}</label>
                <input
                  type="text"
                  value={gymForm.name_en}
                  onChange={(e) => setGymForm((prev) => ({ ...prev, name_en: e.target.value }))}
                  placeholder="Champions Gym"
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('الرابط الفرعي', 'Subdomain')}</label>
                <div className="flex items-center border border-gray-100 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-accent bg-white">
                  <input
                    type="text"
                    value={gymForm.subdomain}
                    onChange={(e) => setGymForm((prev) => ({ ...prev, subdomain: e.target.value.replace(/[^a-z0-9-]/g, '').toLowerCase() }))}
                    placeholder="champions"
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-transparent"
                  />
                  <span className="px-3 py-2.5 text-xs text-gray-500/60 bg-gray-50 border-s border-gray-100">.gymcore.app</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('العملة', 'Currency')}</label>
                <select
                  value={gymForm.currency}
                  onChange={(e) => setGymForm((prev) => ({ ...prev, currency: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                >
                  {defaultCurrencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} - {isRtl ? c.nameAr : c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {renderNavigation(true)}
          </div>
        )}

        {/* ===== STEP 2: ADMIN ===== */}
        {currentStep === 2 && (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-10 shadow-sm">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-md">
                <UserPlus size={32} className="text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                {t('إضافة مشرف إضافي', 'Add Additional Admin')}
              </h2>
              <p className="text-gray-500 text-sm">
                {t(
                  'يمكنك إضافة مشرف إضافي للمنصة. يمكنك تخطي هذه الخطوة وإضافة مشرفين لاحقاً.',
                  'Add an additional platform admin. You can skip this and add admins later.'
                )}
              </p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('الاسم', 'Display Name')}</label>
                <input
                  type="text"
                  value={adminForm.display_name}
                  onChange={(e) => setAdminForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  placeholder={t('مثال: أحمد علي', 'Example: Ahmed Ali')}
                  dir={isRtl ? 'rtl' : 'ltr'}
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('البريد الإلكتروني', 'Email')}</label>
                <input
                  type="email"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="ahmed@gymcore.app"
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('كلمة المرور', 'Password')}</label>
                <input
                  type="password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
                <p className="text-xs text-gray-500/60 mt-1">
                  {t('يجب أن تكون 6 أحرف على الأقل', 'At least 6 characters')}
                </p>
              </div>
            </div>

            {renderNavigation(true)}
          </div>
        )}

        {/* ===== STEP 3: CONFIG ===== */}
        {currentStep === 3 && (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-10 shadow-sm">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mx-auto mb-4 shadow-md">
                <Settings size={32} className="text-white" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                {t('إعدادات المنصة', 'Platform Settings')}
              </h2>
              <p className="text-gray-500 text-sm">
                {t(
                  'قم بتخصيص الإعدادات الأساسية للمنصة.',
                  'Customize the basic platform settings.'
                )}
              </p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('اسم المنصة', 'Platform Name')}</label>
                <input
                  type="text"
                  value={configForm.platform_name}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, platform_name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('العملة الافتراضية', 'Default Currency')}</label>
                <select
                  value={configForm.default_currency}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, default_currency: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                >
                  {defaultCurrencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} - {isRtl ? c.nameAr : c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('المنطقة الزمنية', 'Timezone')}</label>
                <select
                  value={configForm.default_timezone}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, default_timezone: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                >
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">VAT (%)</label>
                <input
                  type="number"
                  value={configForm.vat_percentage}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, vat_percentage: e.target.value }))}
                  min="0"
                  max="100"
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">{t('بريد الدعم', 'Support Email')}</label>
                <input
                  type="email"
                  value={configForm.support_email}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, support_email: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
              </div>
            </div>

            {renderNavigation(true)}
          </div>
        )}

        {/* ===== STEP 4: DONE ===== */}
        {currentStep === 4 && (
          <div className="bg-white rounded-3xl border border-gray-100 p-6 sm:p-10 shadow-sm">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mb-6 shadow-lg animate-bounce">
                <CheckCircle2 size={52} className="text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
                {t('أهلاً بك! تم إعداد المنصة', 'Welcome! Platform is Ready')}
              </h1>
              <p className="text-gray-500 max-w-lg leading-relaxed">
                {t(
                  'لقد أكملت الإعدادات الأساسية. يمكنك الآن استكشاف لوحة التحكم والبدء في إدارة صالاتك الرياضية.',
                  'You have completed the basic setup. Start exploring the dashboard and managing your gyms.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-w-lg mx-auto">
              <button
                type="button"
                onClick={() => navigate('/super-admin/dashboard')}
                className="flex items-center gap-3 p-4 rounded-xl bg-primary text-white hover:bg-petrol-light transition-colors"
              >
                <BarChart3 size={20} />
                <div className="text-start">
                  <p className="font-bold text-sm">{t('لوحة التحكم', 'Dashboard')}</p>
                  <p className="text-xs text-white/70">{t('نظرة عامة على المنصة', 'Platform overview')}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin/tenants')}
                className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:bg-white transition-colors"
              >
                <Building2 size={20} className="text-primary" />
                <div className="text-start">
                  <p className="font-bold text-sm text-gray-900">{t('الصالات', 'Gyms')}</p>
                  <p className="text-xs text-gray-500/70">{t('إدارة الصالات', 'Manage gyms')}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin/admins')}
                className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:bg-white transition-colors"
              >
                <Shield size={20} className="text-primary" />
                <div className="text-start">
                  <p className="font-bold text-sm text-gray-900">{t('المشرفين', 'Admins')}</p>
                  <p className="text-xs text-gray-500/70">{t('إدارة الصلاحيات', 'Manage permissions')}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin/settings')}
                className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:bg-white transition-colors"
              >
                <Settings size={20} className="text-primary" />
                <div className="text-start">
                  <p className="font-bold text-sm text-gray-900">{t('الإعدادات', 'Settings')}</p>
                  <p className="text-xs text-gray-500/70">{t('تخصيص المنصة', 'Customize platform')}</p>
                </div>
              </button>
            </div>

            {renderNavigation(false)}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-4 text-center text-xs text-gray-500/40">
        GymCore &copy; {new Date().getFullYear()} - {t('منصة إدارة الصالات الرياضية', 'Gym Management Platform')}
      </div>
    </div>
  );
}

