import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, QrCode, User, Briefcase, X, Download, Share2, Eye, EyeOff, Check, Lock } from 'lucide-react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import Spinner from '../../components/ui/Spinner';
import { login as apiLogin, memberLogin as apiMemberLogin } from '../../services/api';
import { ROLE_MAP } from '../../types';

type LoginType = 'member' | 'trainer';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { language, login, setLanguage } = useApp();
  const { showToast } = useToast();

  const [loginType, setLoginType] = useState<LoginType>('member');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showCard, setShowCard] = useState(false);

  const ROLE_ROUTE: Record<string, string> = {
    'super-admin': '/super-admin/dashboard',
    'gym-admin': '/admin/dashboard',
    'trainer': '/trainer/dashboard',
    'reception': '/reception/dashboard',
    'player': '/player/dashboard',
  };

  // PWA state
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);

  // === Load saved email from localStorage on mount ===
  useEffect(() => {
    const saved = localStorage.getItem('gymcore_trainer_email');
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
    // Card entrance animation
    const timer = setTimeout(() => setShowCard(true), 80);
    return () => clearTimeout(timer);
  }, []);

  // --- PWA Detection ---
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    setIsStandalone(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsStandalone(e.matches);
    mq.addEventListener('change', handler);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    window.addEventListener('appinstalled', () => {
      setShowInstallBanner(false);
      setShowIOSModal(false);
      setIsStandalone(true);
    });

    return () => {
      mq.removeEventListener('change', handler);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const result = await deferredPrompt.current.userChoice;
      if (result.outcome === 'accepted') {
        setShowInstallBanner(false);
      }
      deferredPrompt.current = null;
    }
  }, [isIOS]);

  // --- Submit ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Save/remove email based on rememberMe
    if (rememberMe && email) {
      localStorage.setItem('gymcore_trainer_email', email);
    } else if (!rememberMe) {
      localStorage.removeItem('gymcore_trainer_email');
    }

    try {
      if (loginType === 'member') {
        const data = await apiMemberLogin(phone.trim(), code.trim(), loginType);
        const gymId = data.member?.gym_id || '';
        login('player', gymId);
        showToast(language === 'ar' ? 'تم تسجيل دخول العضو بنجاح' : 'Member login successful', 'success');
        navigate('/player/dashboard');
      } else {
        const data = await apiLogin(email, password);
        const backendRole = data.user?.role || '';
        const mappedRole = ROLE_MAP[backendRole] || 'gym-admin';
        login(mappedRole, data.user?.gym_id || '');
        showToast(language === 'ar' ? 'تم تسجيل دخول المدرب بنجاح' : 'Trainer login successful', 'success');
        navigate(ROLE_ROUTE[mappedRole] || '/admin/dashboard');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const fallbackMsg = loginType === 'member'
        ? (language === 'ar' ? 'فشل تسجيل الدخول. تحقق من رقم الهاتف والرمز' : 'Login failed. Check phone and PIN')
        : (language === 'ar' ? 'فشل تسجيل دخول المدرب. تحقق من البريد وكلمة المرور' : 'Trainer login failed. Check email and password');
      const msg = axiosErr?.response?.data?.error || fallbackMsg;
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const isRtl = language === 'ar';

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0f0f1a] p-margin-mobile" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* === AMBIENT BACKGROUND === */}
      {/* Radial gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,#f9731620_0%,#f9731608_40%,transparent_70%)]" />

      {/* Geometric grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(#f97316 1px, transparent 1px), linear-gradient(90deg, #f97316 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Animated orbs */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#f97316]/10 blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full bg-[#f97316]/5 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-[#f97316]/8 blur-[80px] animate-pulse" style={{ animationDelay: '4s' }} />

      {/* === LOGIN CARD (glassmorphism) with entrance animation === */}
      <div className={`relative w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl p-8 transition-all duration-700 ease-out ${
        showCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold text-2xl mx-auto mb-4 border border-[#f97316]/30">
            ج
          </div>
          <h1 className="text-3xl font-bold text-white">
            {isRtl ? 'GymCore' : 'GymCore'}
          </h1>
          <p className="text-sm text-white/50 mt-2">
            {isRtl ? 'نظام إدارة المنشآت الرياضية' : 'Sports Facility Management'}
          </p>
        </div>

        {/* === TOGGLE MEMBER / TRAINER === */}
        <div className="flex bg-white/5 rounded-xl p-1 mb-6 border border-white/5">
          <button
            type="button"
            onClick={() => setLoginType('member')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              loginType === 'member'
                ? 'bg-[#f97316] text-white shadow-lg shadow-[#f97316]/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <User size={16} />
            {isRtl ? 'عضو' : 'Member'}
          </button>
          <button
            type="button"
            onClick={() => setLoginType('trainer')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              loginType === 'trainer'
                ? 'bg-[#f97316] text-white shadow-lg shadow-[#f97316]/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Briefcase size={16} />
            {isRtl ? 'مدرب' : 'Trainer'}
          </button>
        </div>

        {/* === FORM === */}
        <form onSubmit={handleSubmit} className="space-y-stack-md">

          {/* MEMBER FIELDS */}
          {loginType === 'member' && (
            <>
              {/* Phone */}
              <div className="group">
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'رقم الهاتف' : 'Phone Number'}
                </label>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  focusedField === 'phone'
                    ? 'border-[#f97316] bg-[#f97316]/5 ring-1 ring-[#f97316]/30'
                    : 'border-white/10 bg-white/5'
                }`}>
                  <Phone size={18} className={`transition-colors ${
                    focusedField === 'phone' ? 'text-[#f97316]' : 'text-white/30'
                  }`} />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
                    placeholder="05xxxxxxxx"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              {/* PIN Code */}
              <div className="group">
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'الرمز السري' : 'PIN Code'}
                </label>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  focusedField === 'code'
                    ? 'border-[#f97316] bg-[#f97316]/5 ring-1 ring-[#f97316]/30'
                    : 'border-white/10 bg-white/5'
                }`}>
                  <QrCode size={18} className={`transition-colors ${
                    focusedField === 'code' ? 'text-[#f97316]' : 'text-white/30'
                  }`} />
                  <input
                    type={showCode ? 'text' : 'password'}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
                    placeholder="****"
                    dir="ltr"
                    required
                  />
                  {/* PIN visibility toggle */}
                  <button
                    type="button"
                    onClick={() => setShowCode(!showCode)}
                    className="text-white/40 hover:text-white/70 transition-colors p-1 focus:outline-none"
                    tabIndex={-1}
                    aria-label={showCode ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TRAINER FIELDS */}
          {loginType === 'trainer' && (
            <>
              {/* Email */}
              <div className="group">
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  focusedField === 'email'
                    ? 'border-[#f97316] bg-[#f97316]/5 ring-1 ring-[#f97316]/30'
                    : 'border-white/10 bg-white/5'
                }`}>
                  <User size={18} className={`transition-colors ${
                    focusedField === 'email' ? 'text-[#f97316]' : 'text-white/30'
                  }`} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
                    placeholder="admin@gymcore.app"
                    dir="ltr"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="group">
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'كلمة المرور' : 'Password'}
                </label>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  focusedField === 'password'
                    ? 'border-[#f97316] bg-[#f97316]/5 ring-1 ring-[#f97316]/30'
                    : 'border-white/10 bg-white/5'
                }`}>
                  <Lock size={18} className={`transition-colors ${
                    focusedField === 'password' ? 'text-[#f97316]' : 'text-white/30'
                  }`} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
                    placeholder="********"
                    dir="ltr"
                    required
                  />
                  {/* Password visibility toggle */}
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-white/40 hover:text-white/70 transition-colors p-1 focus:outline-none"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      rememberMe
                        ? 'bg-[#f97316] border-[#f97316]'
                        : 'border-white/20 group-hover:border-white/40'
                    }`}
                  >
                    {rememberMe && <Check size={14} className="text-white" strokeWidth={3} />}
                  </div>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="hidden"
                  />
                  <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors cursor-pointer">
                    {isRtl ? 'تذكرني' : 'Remember me'}
                  </span>
                </label>
              </div>
            </>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-[#f97316] text-white font-bold text-base hover:bg-[#e0660e] transition-all shadow-lg shadow-[#f97316]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Spinner size="sm" />}
            {loading
              ? (isRtl ? 'جاري تسجيل الدخول...' : 'Signing in...')
              : (loginType === 'member'
                  ? (isRtl ? 'تسجيل دخول العضو' : 'Member Login')
                  : (isRtl ? 'تسجيل دخول المدرب' : 'Trainer Login')
                )}
          </button>
        </form>

        {/* Language toggle */}
        <div className="mt-6 text-center">
          <button
            onClick={() => setLanguage(isRtl ? 'en' : 'ar')}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {isRtl ? 'English' : 'العربية'}
          </button>
        </div>
      </div>

      {/* === PWA INSTALL BANNER (non-standalone, non-iOS) === */}
      {!isStandalone && showInstallBanner && !isIOS && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md animate-slide-up">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-4 shadow-2xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold shrink-0">
              ج
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">
                {isRtl ? 'ثبّت تطبيق GymCore' : 'Install GymCore App'}
              </p>
              <p className="text-white/50 text-xs mt-0.5">
                {isRtl ? 'للوصول السريع من شاشتك الرئيسية' : 'Quick access from your home screen'}
              </p>
            </div>
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f97316] text-white text-sm font-semibold hover:bg-[#e0660e] transition-colors shrink-0"
            >
              <Download size={16} />
              {isRtl ? 'تثبيت' : 'Install'}
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0"
            >
              <X size={16} className="text-white/50" />
            </button>
          </div>
        </div>
      )}

      {/* === iOS INSTALL MODAL === */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-margin-mobile bg-black/60 backdrop-blur-sm"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="relative w-full max-w-sm backdrop-blur-2xl bg-white/10 border border-white/20 rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 left-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={18} className="text-white/50" />
            </button>

            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] font-bold text-xl mx-auto mb-3 border border-[#f97316]/30">
                ج
              </div>
              <h3 className="text-white text-lg font-bold">
                {isRtl ? 'تثبيت التطبيق على iPhone' : 'Install on iPhone'}
              </h3>
              <p className="text-white/50 text-sm mt-1">
                {isRtl ? 'اتبع هذه الخطوات لتثبيت التطبيق على شاشتك الرئيسية' : 'Follow these steps to add to your home screen'}
              </p>
            </div>

            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] text-sm font-bold shrink-0">1</div>
                <div className="flex-1">
                  <p className="text-white text-sm font-semibold">{isRtl ? 'اضغط على زر المشاركة' : 'Tap the Share button'}</p>
                  <p className="text-white/40 text-xs mt-0.5">{isRtl ? 'في شريط العنوان السفلي في Safari' : 'In the bottom Safari toolbar'}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Share2 size={16} className="text-white/60" />
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] text-sm font-bold shrink-0">2</div>
                <div className="flex-1">
                  <p className="text-white text-sm font-semibold">{isRtl ? 'اختر "إضافة إلى الشاشة الرئيسية"' : 'Choose "Add to Home Screen"'}</p>
                  <p className="text-white/40 text-xs mt-0.5">{isRtl ? 'مرر لأسفل في قائمة المشاركة' : 'Scroll down in the share sheet'}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Download size={16} className="text-white/60" />
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] text-sm font-bold shrink-0">3</div>
                <div className="flex-1">
                  <p className="text-white text-sm font-semibold">{isRtl ? 'اضغط على "إضافة" في الأعلى' : 'Tap "Add" in the top right'}</p>
                  <p className="text-white/40 text-xs mt-0.5">{isRtl ? 'سيظهر التطبيق على شاشتك الرئيسية' : 'The app will appear on your home screen'}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <span className="text-white/60 text-lg font-bold">+</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full mt-6 py-3 rounded-2xl bg-[#f97316] text-white font-bold text-base hover:bg-[#e0660e] transition-colors shadow-lg shadow-[#f97316]/30"
            >
              {isRtl ? 'فهمت' : 'Got it'}
            </button>
          </div>
        </div>
      )}

      {/* === INLINE STYLES FOR ANIMATIONS === */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%) translateX(-50%); opacity: 0; }
          to { transform: translateY(0) translateX(-50%); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}



