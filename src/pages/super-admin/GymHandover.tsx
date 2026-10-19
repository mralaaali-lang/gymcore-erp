import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatDate } from '../../utils/date';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import {
  getPlatformGym,
  impersonateGym,
  markImpersonatedSession,
} from '../../services/api';
import {
  ArrowRight,
  CheckCircle as CheckCircle2,
  Clock,
  Envelope as Mail,
  Buildings as Building2,
  GlobeSimple as Globe,
  DeviceMobile as Smartphone,
  CreditCard,
  UserCheck,
  Users,
  Calendar,
  Spinner as Loader2,
  ArrowSquareOut as ExternalLink,
  SignIn as LogIn,
  Plus,
  Copy,
  Sparkle as Sparkles,
  MapPin,
  ShieldCheck,
  Gear as Settings
} from '@phosphor-icons/react';
import PageLoader from '../../components/shared/PageLoader';

interface ChecklistItem {
  key: string;
  labelAr: string;
  labelEn: string;
  icon: React.ReactNode;
  completed: boolean;
  /** §69 — بنود ملهاش مصدر حقيقة في السيرفر بتفضل معلّقة بوضوح (`unverified`)،
   *  مش بتتعلّم نفسها. `email_sent` مثال: مفيش بريد ترحيبي في الكود خالص
   *  (`services/email.ts` بيغزّي رابط إعادة تعيين الباسورد وبس)، فالعلامة كانت
   *  `completed: true` مكتوبة يدًا وبتكذب على اللي بيسلّم الصالة. */
  unverified?: boolean;
  descriptionAr: string;
  descriptionEn: string;
}

export default function GymHandover() {
  const { id } = useParams<{ id: string }>();
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isRtl = language === 'ar';
  const t = (ar: string, en: string) => (isRtl ? ar : en);

  const [copied, setCopied] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['platform', 'gym', id],
    queryFn: () => getPlatformGym(id!),
    enabled: !!id,
  });

  const gym = data?.data;

  /**
   * §69 — القائمة بتتشتق من بيانات السيرفر، مفيش بند بيتعلّم نفسه.
   * المصادر: `owner_email` (موجود فعلًا في `/platform/gyms/:id`) للتأكيد إن
   * المدير اتعمل، `is_active`، `subscription_expires_at` + `plan_id` للباقة،
   * و`website_enabled`/`mobile_app_enabled` من `gym_config`.
   */
  const checklist: ChecklistItem[] = useMemo(() => {
    const expiry = gym?.subscription_expires_at ? Date.parse(gym.subscription_expires_at) : null;
    const planActive = !!gym?.plan_id && (expiry === null || Number.isNaN(expiry) || expiry > Date.now());
    const managerEmail = gym?.owner_email || '';
    return [
      {
        key: 'account_created',
        labelAr: 'تم إنشاء الحساب',
        labelEn: 'Account Created',
        icon: <UserCheck size={20} />,
        completed: !!managerEmail,
        descriptionAr: managerEmail
          ? `حساب المدير: ${managerEmail}`
          : 'لا يوجد حساب مدير نشط لهذه الصالة',
        descriptionEn: managerEmail
          ? `Manager account: ${managerEmail}`
          : 'No manager account on this gym yet',
      },
      {
        key: 'gym_active',
        labelAr: 'الصالة نشطة',
        labelEn: 'Gym Active',
        icon: <Building2 size={20} />,
        completed: !!gym?.is_active,
        descriptionAr: 'حساب الصالة مفعل وجاهز للاستخدام',
        descriptionEn: 'Gym account is active and ready',
      },
      {
        key: 'plan_active',
        labelAr: 'الباقة مفعلة',
        labelEn: 'Plan Active',
        icon: <CreditCard size={20} />,
        completed: planActive,
        descriptionAr: planActive
          ? `${gym?.plan_name || gym?.plan_tier} — ${expiry ? formatDate(gym!.subscription_expires_at as string) : 'بلا تاريخ انتهاء'}`
          : 'اختر باقة من كتالوج الباقات لتتفعّل الحدود والسعر',
        descriptionEn: planActive
          ? `${gym?.plan_name || gym?.plan_tier} — ${expiry ? formatDate(gym!.subscription_expires_at as string) : 'no expiry'}`
          : 'Pick a plan from the catalogue to activate limits and pricing',
      },
      {
        key: 'email_sent',
        labelAr: 'تسليم بيانات الدخول',
        labelEn: 'Credentials Delivered',
        icon: <Mail size={20} />,
        completed: false,
        unverified: true,
        descriptionAr: 'مفيش بريد ترحيبي أوتوماتيكي — انسخ بطاقة التسليم تحت وابعتها للمدير',
        descriptionEn: 'No automated welcome email — copy the handover card below and send it',
      },
      {
        key: 'gym_data',
        labelAr: 'بيانات الصالة كاملة',
        labelEn: 'Gym Data Complete',
        icon: <Settings size={20} />,
        completed: !!(gym?.name && gym?.subdomain && gym?.currency),
        descriptionAr: 'اسم الصالة، العنوان، المنطقة الزمنية، العملة',
        descriptionEn: 'Gym name, address, timezone, currency configured',
      },
      {
        key: 'website',
        labelAr: 'الموقع الإلكتروني',
        labelEn: 'Website',
        icon: <Globe size={20} />,
        completed: !!gym?.website_enabled,
        descriptionAr: 'الموقع الإلكتروني التعريفي للصالة',
        descriptionEn: 'Gym website generator',
      },
      {
        key: 'mobile_app',
        labelAr: 'التطبيق الجوال',
        labelEn: 'Mobile App',
        icon: <Smartphone size={20} />,
        completed: !!gym?.mobile_app_enabled,
        descriptionAr: 'تطبيق الأعضاء للهواتف المحمولة',
        descriptionEn: 'Member mobile app',
      },
    ];
  }, [gym]);

  const completedCount = checklist.filter((c) => c.completed).length;
  const totalCount = checklist.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  // Impersonation — the server sets a staff HttpOnly cookie and returns no
  // token in the body (§69), so the handoff is `markImpersonatedSession`, not
  // copying `access_token` (which used to store the literal "undefined").
  const impersonateMutation = useMutation({
    mutationFn: () => impersonateGym(id!),
    onSuccess: (res) => {
      const { user } = res.data;
      markImpersonatedSession(user.role);
      showToast(
        t(`تم تسجيل الدخول كـ ${user.full_name}`, `Logged in as ${user.full_name}`),
        'success'
      );
      setTimeout(() => {
        window.location.href = '/admin/dashboard';
      }, 1000);
    },
    onError: () =>
      showToast(
        t('فشل تسجيل الدخول كمدير الصالة', 'Failed to impersonate gym manager'),
        'error'
      ),
  });

  /** §69 — النسخ مش مضمون: المتصفح بيرفض صلاحية الحافظة (صفحة مش focused، أو
   *  سياق بلا HTTPS). الصيغة القديمة كانت `.then()` بلا `.catch()` فالزر كان
   *  يضغط ويصمت من غير أي رد. البطاقة على الشاشة فالنص بيفضل مقروء — والمطلوب
   *  هو الإشارة الصادقة، مش آليّة نسخ بديلة. */
  const copyToClipboard = async (text: string, okAr: string, okEn: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t(okAr, okEn), 'success');
      return true;
    } catch {
      showToast(t('المتصفح مانع الوصول للحافظة — انسخ النص من الشاشة يدويًا', 'The browser blocked clipboard access — copy the text from the screen instead'), 'error');
      return false;
    }
  };

  const handleCopySubdomain = async () => {
    if (!gym?.subdomain) return;
    const domain = `${gym.subdomain}.gymcore.app`;
    if (await copyToClipboard(domain, 'تم النسخ', 'Copied!')) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /** عنوان الكونسول الحقيقي: الدومين المخصص لو موجود، وإلا السبادومين — و`/login`
   *  بتappend على الاتنين بعد إزالة الشرطة المائلة الزايدة، عشان الرابط يوصل
   *  لشاشة الدخول مباشرة بدل صفحة نائبة. */
  const consoleUrl = `${(gym?.custom_domain || `https://${gym?.subdomain ?? 'gym'}.gymcore.app`).replace(/\/+$/, '')}/login`;

  /** §69 — بطاقة التسليم: كل اللي المدير يحتاجه ليدخل، في نص واحد ينسخه.
   *  الباسورد مش هنا عمدًا: السيرفر بيخزّن hash فقط (bcrypt cost 12) فمفيش
   *  حاجة صحيحة نتلف عليها — والتعليق بيقول للمدير يفتح «نسيت كلمة المرور». */
  const handleCopyHandoverCard = async () => {
    if (!gym) return;
    const text = [
      t('بيانات دخول لوحة تحكم الصالة', 'Gym console sign-in'),
      `${t('الصالة', 'Gym')}: ${gym.name}`,
      `${t('المدير', 'Manager')}: ${gym.owner_full_name || '-'}`,
      `${t('البريد', 'Email')}: ${gym.owner_email || '-'}`,
      `${t('الرابط', 'URL')}: ${consoleUrl}`,
      t(
        'كلمة المرور: هي اللي اتكتبت وقت إنشاء الصالة. لو مش معروفة، افتح الرابط واضغط «نسيت كلمة المرور».',
        'Password: the one set while creating this gym. If it is unknown, open the URL and use "Forgot password".'
      ),
    ].join('\n');
    if (await copyToClipboard(text, 'تم نسخ بطاقة التسليم', 'Handover card copied')) {
      setCopiedCard(true);
      setTimeout(() => setCopiedCard(false), 2000);
    }
  };

  const getPlanLabel = (tier: string) => {
    const labels: Record<string, Record<string, string>> = {
      basic: { ar: 'أساسي', en: 'Basic' },
      professional: { ar: 'احترافي', en: 'Professional' },
      enterprise: { ar: 'مؤسسات', en: 'Enterprise' },
    };
    return labels[tier]?.[isRtl ? 'ar' : 'en'] || tier;
  };

    if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <PageLoader variant="skeleton" />
      </div>
    );
  }

  if (isError || !gym) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">
            {t('لم يتم العثور على الصالة', 'Gym not found')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/super-admin/tenants')}
            className="mt-4 px-6 py-2 bg-primary text-white rounded-xl hover:bg-petrol-light transition-colors"
          >
            {t('العودة إلى دليل الصالات', 'Back to Tenant Directory')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 text-white">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Back + actions */}
          <div className="flex items-center justify-between mb-8">
            <button
              type="button"
              onClick={() => navigate('/super-admin/tenants')}
              className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
            >
              <ArrowRight size={16} className={isRtl ? 'rotate-0' : 'rotate-180'} />
              {t('العودة إلى دليل الصالات', 'Back to Tenant Directory')}
            </button>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2">
              <Sparkles size={16} className="text-accent" />
              <span className="text-xs font-medium text-white/80">
                {t('مرحلة ما بعد الإنشاء', 'Post-Creation Handover')}
              </span>
            </div>
          </div>

          {/* Gym Hero */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Logo / Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {gym.logo_url ? (
                <img
                  src={gym.logo_url}
                  alt={gym.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <Building2 size={36} className="text-white/60" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold mb-2">{gym.name}</h1>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/70">
                <span className="flex items-center gap-1.5 font-mono" dir="ltr">
                  <Globe size={14} />
                  {gym.subdomain}.gymcore.app
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  {gym.address_city || '-'}
                  {gym.address_country ? `, ${gym.address_country}` : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {formatDate(gym.created_at)}
                </span>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex flex-col items-end gap-2">
              <span
                className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wide ${
                  gym.is_active
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-red-500/20 text-red-300'
                }`}
              >
                {gym.is_active
                  ? t('نشط', 'Active')
                  : t('موقوف', 'Suspended')}
              </span>
              <span className="text-xs text-white/50">
                {getPlanLabel(gym.plan_tier)} — {gym.currency || 'EGP'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-6 -mt-6 pb-16">
        {/* Progress Overview Card */}
        <div className="bg-white rounded-3xl border border-gray-100 p-6 md:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {t('حالة إعداد الصالة', 'Gym Setup Status')}
              </h2>
              <p className="text-sm text-gray-500/70 mt-1">
                {t(
                  `تم إكمال ${completedCount} من أصل ${totalCount} خطوة`,
                  `${completedCount} of ${totalCount} steps completed`
                )}
              </p>
            </div>

            {/* Progress Circle */}
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  style={{ stroke: 'hsl(var(--chart-track))' }}
                  strokeWidth="6"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${(progressPercent / 100) * 213.63} 213.63`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-900">
                  {progressPercent}%
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar (mobile) */}
          <div className="w-full bg-gray-100 rounded-full h-2 mb-8 md:hidden">
            <div
              className="bg-gradient-to-r from-accent to-primary h-2 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Checklist Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {checklist.map((item) => (
              <div
                key={item.key}
                className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all ${
                  item.completed
                    ? 'bg-green-50 border-green-200'
                    : item.unverified
                      ? 'bg-gray-50 border-dashed border-gray-200'
                      : 'bg-gray-50 border-gray-100'
                }`}
              >
                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                    item.completed
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {item.completed ? <CheckCircle2 size={20} /> : item.icon}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-semibold text-sm ${
                      item.completed ? 'text-green-800' : 'text-gray-900'
                    }`}
                  >
                    {isRtl ? item.labelAr : item.labelEn}
                  </p>
                  <p className="text-xs text-gray-500/70 mt-0.5 line-clamp-2">
                    {isRtl ? item.descriptionAr : item.descriptionEn}
                  </p>
                </div>

                {/* Status indicator — §69: بند ملوش مصدر حقيقة بيقول «يدوي» صراحة،
                    مش «قيد الانتظار» اللي بتوهم إن فيه حاجة هتخلص لوحدها. */}
                {item.completed ? (
                  <span className="text-green-600 text-xs font-medium whitespace-nowrap flex items-center gap-1">
                    <CheckCircle2 size={14} />
                    {t('تم', 'Done')}
                  </span>
                ) : item.unverified ? (
                  <span className="text-gray-500 text-xs font-medium whitespace-nowrap flex items-center gap-1">
                    <Copy size={14} />
                    {t('يدوي', 'Manual')}
                  </span>
                ) : (
                  <span className="text-gray-500/50 text-xs whitespace-nowrap flex items-center gap-1">
                    <Clock size={14} />
                    {t('قيد الانتظار', 'Pending')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* §69 — بطاقة تسليم بيانات الدخول. البند اللي فوقها في القائمة «يدوي»
            لأن مفيش بريد ترحيبي في المنتج؛ البطاقة دي هي التسليم الحقيقي.
            صدرت بتوكنات الصدفة (bg-card/border-hairline/rounded-shell) مش بألوان
            حرفية — باقي الملفات دي لسه في موجة 5. */}
        <div className="mt-6 bg-card border border-hairline rounded-shell p-6 md:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                {t('تسليم بيانات الدخول للمدير', 'Hand the manager their sign-in')}
              </h2>
              <p className="text-sm text-foreground/60 mt-1">
                {t(
                  'مفيش بريد ترحيبي أوتوماتيكي — انسخ البطاقة وابعتهها في القناة اللي بتتفق عليها مع المدير.',
                  'There is no automated welcome email — copy this card and send it over the channel you agree with the manager.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyHandoverCard}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-petrol-light transition-colors whitespace-nowrap"
            >
              {copiedCard ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              {copiedCard ? t('اتنسخ', 'Copied') : t('نسخ البطاقة', 'Copy card')}
            </button>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-xl border border-hairline bg-card">
              <dt className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                {t('المدير', 'Manager')}
              </dt>
              <dd className="mt-1 font-semibold text-foreground">
                {gym.owner_full_name || t('لا يوجد حساب مدير', 'No manager account')}
              </dd>
            </div>
            <div className="p-4 rounded-xl border border-hairline bg-card">
              <dt className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                {t('بريد الدخول', 'Sign-in email')}
              </dt>
              <dd className="mt-1 font-semibold text-foreground font-mono" dir="ltr">
                {gym.owner_email || '—'}
              </dd>
            </div>
            <div className="p-4 rounded-xl border border-hairline bg-card sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                {t('رابط لوحة التحكم', 'Console URL')}
              </dt>
              <dd className="mt-1 font-semibold text-foreground font-mono break-all" dir="ltr">
                {consoleUrl}
              </dd>
              <p className="mt-2 text-xs text-foreground/50">
                {t(
                  'كلمة المرور مش معروضة: السيرفر بيخزّن hash فقط. هي اللي كتبتها في معالج الإنشاء — ولو مش موجودة، «نسيت كلمة المرور» في الرابط ده هيولّيد واحدة جديدة.',
                  'The password is not shown: the server stores a hash only. It is the one you typed in the creation wizard — if it is lost, "Forgot password" at this URL issues a new one.'
                )}
              </p>
            </div>
          </dl>
        </div>

        {/* Actions Card */}
        <div className="mt-6 bg-white rounded-3xl border border-gray-100 p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6">
            {t('الإجراءات المتاحة', 'Available Actions')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Impersonate */}
            <button
              type="button"
              disabled={impersonateMutation.isPending}
              onClick={() => impersonateMutation.mutate()}
              className="flex flex-col items-center gap-3 p-6 rounded-3xl border border-gray-100 shadow-sm bg-gradient-to-br from-blue-50 to-white hover:from-blue-100 hover:to-blue-50 transition-all hover:shadow-md hover:border-blue-200 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-700 group-hover:scale-110 transition-transform">
                {impersonateMutation.isPending ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  <LogIn size={24} />
                )}
              </div>
              <div className="text-center">
                <p className="font-bold text-sm text-gray-900">
                  {t('تسجيل الدخول كمدير', 'Login as Manager')}
                </p>
                <p className="text-xs text-gray-500/60 mt-1">
                  {t('دعم ومساعدة بدون كلمة مرور', 'Support without password')}
                </p>
              </div>
            </button>

            {/* Copy Subdomain */}
            <button
              type="button"
              onClick={handleCopySubdomain}
              className="flex flex-col items-center gap-3 p-6 rounded-3xl border border-gray-100 shadow-sm bg-gradient-to-br from-purple-50 to-white hover:from-purple-100 hover:to-purple-50 transition-all hover:shadow-md hover:border-purple-200 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-700 group-hover:scale-110 transition-transform">
                {copied ? <CheckCircle2 size={24} /> : <Copy size={24} />}
              </div>
              <div className="text-center">
                <p className="font-bold text-sm text-gray-900">
                  {t('نسخ رابط الصالة', 'Copy Gym Link')}
                </p>
                <p className="text-xs text-gray-500/60 mt-1">
                  {gym.subdomain}.gymcore.app
                </p>
              </div>
            </button>

            {/* View Invoices */}
            <button
              type="button"
              onClick={() => navigate(`/super-admin/billing?gym=${gym.id}`)}
              className="flex flex-col items-center gap-3 p-6 rounded-3xl border border-gray-100 shadow-sm bg-gradient-to-br from-emerald-50 to-white hover:from-emerald-100 hover:to-emerald-50 transition-all hover:shadow-md hover:border-emerald-200 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 group-hover:scale-110 transition-transform">
                <CreditCard size={24} />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm text-gray-900">
                  {t('الفواتير', 'Invoices')}
                </p>
                <p className="text-xs text-gray-500/60 mt-1">
                  {t('عرض الفواتير والمدفوعات', 'View bills & payments')}
                </p>
              </div>
            </button>

            {/* Create Another Gym */}
            <button
              type="button"
              onClick={() => navigate('/super-admin/tenants/new')}
              className="flex flex-col items-center gap-3 p-6 rounded-3xl border border-gray-100 shadow-sm bg-gradient-to-br from-amber-50 to-white hover:from-amber-100 hover:to-amber-50 transition-all hover:shadow-md hover:border-amber-200 group"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 group-hover:scale-110 transition-transform">
                <Plus size={24} />
              </div>
              <div className="text-center">
                <p className="font-bold text-sm text-gray-900">
                  {t('إضافة صالة أخرى', 'Add Another Gym')}
                </p>
                <p className="text-xs text-gray-500/60 mt-1">
                  {t('إنشاء صالة جديدة', 'Create a new gym')}
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Quick Stats Card */}
        <div className="mt-6 bg-white rounded-3xl border border-gray-100 p-6 md:p-8 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-6">
            {t('نظرة سريعة', 'Quick Overview')}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Members */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Users size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t('المشتركين', 'Members')}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {gym.active_members_count ?? 0}
              </p>
            </div>

            {/* Staff */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Users size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t('الموظفين', 'Staff')}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {gym.active_staff_count ?? 0}
              </p>
            </div>

            {/* Plan */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <CreditCard size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t('الباقة', 'Plan')}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 capitalize">
                {getPlanLabel(gym.plan_tier)}
              </p>
            </div>

            {/* Currency */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <ShieldCheck size={16} />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t('العملة', 'Currency')}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {gym.currency || 'EGP'}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/super-admin/tenants')}
            className="flex items-center gap-2 px-6 py-3 border border-gray-100 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors"
          >
            <ArrowRight size={16} className={isRtl ? 'rotate-0' : 'rotate-180'} />
            {t('كل الصالات', 'All Tenants')}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/super-admin/tenants/${gym.id}`)}
              className="flex items-center gap-2 px-6 py-3 border border-gray-100 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors"
            >
              <ExternalLink size={16} />
              {t('تفاصيل الصالة', 'Gym Details')}
            </button>
            <button
              type="button"
              onClick={() =>
                impersonateMutation.mutate()
              }
              disabled={impersonateMutation.isPending}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-petrol-light transition-colors disabled:opacity-60"
            >
              {impersonateMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ExternalLink size={16} />
              )}
              {t('فتح لوحة التحكم', 'Open Dashboard')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


