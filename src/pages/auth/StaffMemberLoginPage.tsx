import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, KeyRound, Mail, Lock, Users, ArrowLeft, ArrowRight, Flame, Eye, EyeOff, Check, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import Spinner from '../../components/ui/Spinner';
import PwaInstallPrompts from '../../components/auth/PwaInstallPrompts';
import { login as apiStaffLogin, memberLogin as apiMemberLogin, logout as apiLogout } from '../../services/api';
import { ROLE_MAP } from '../../types';

type LoginType = 'member' | 'staff';

const STAFF_ROLE_ROUTE: Record<string, string> = {
  trainer: '/trainer/dashboard',
  reception: '/reception/dashboard',
};

export default function StaffMemberLoginPage() {
  const navigate = useNavigate();
  const { language, login, setLanguage } = useApp();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [loginType, setLoginType] = useState<LoginType>('member');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const isRtl = language === 'ar';
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

  const handleRememberMeChange = (val: boolean) => {
    setRememberMe(val);
    if (val) {
      localStorage.setItem('team_email', email);
    } else {
      localStorage.removeItem('team_email');
    }
  };

  // Restore remembered email on mount
  useEffect(() => {
    const saved = localStorage.getItem('team_email');
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
  }, []);

  const [showMemberPin, setShowMemberPin] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (loginType === 'member') {
        const data = await apiMemberLogin(phone.trim(), code.trim(), loginType);
        const gymId = data.member?.gym_id || '';
        login('player', gymId);
        showToast(isRtl ? 'تم تسجيل دخول العضو بنجاح' : 'Member login successful', 'success');
        navigate('/player/dashboard');
        return;
      }

      // staff tab — covers both trainer (coach) and reception accounts
      const data = await apiStaffLogin(email.trim(), password);
      const backendRole = data.user?.role || '';

      if (backendRole === 'manager') {
        // Valid credentials, but this is a management account — wrong screen.
        apiLogout();
        setLoading(false);
        showToast(
          isRtl
            ? 'هذا الحساب خاص بالإدارة (مدير/سوبر أدمن) — من فضلك استخدم شاشة دخول الإدارة.'
            : 'This account is a management account — please use the Admin login screen.',
          'error'
        );
        return;
      }

      const mappedRole = ROLE_MAP[backendRole] || 'trainer';
      login(mappedRole, data.user?.gym_id || '');
      showToast(isRtl ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully', 'success');
      navigate(STAFF_ROLE_ROUTE[mappedRole] || '/trainer/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const fallbackMsg = loginType === 'member'
        ? (isRtl ? 'فشل تسجيل الدخول. تحقق من رقم الهاتف والرمز' : 'Login failed. Check phone and PIN')
        : (isRtl ? 'فشل تسجيل الدخول. تحقق من البريد وكلمة المرور' : 'Login failed. Check email and password');
      const msg = axiosErr?.response?.data?.error || fallbackMsg;
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0f0f1a] p-margin-mobile" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* === AMBIENT BACKGROUND — energetic athletic orange === */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,#f9731620_0%,#f9731608_40%,transparent_70%)]" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(#f97316 1px, transparent 1px), linear-gradient(90deg, #f97316 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />
      <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-[#f97316]/10 blur-[100px] animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-96 h-96 rounded-full bg-[#f97316]/5 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />

      <div className="relative w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl p-8">

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#f97316]/20 flex items-center justify-center text-[#f97316] mx-auto mb-4 border border-[#f97316]/30">
            <Flame size={26} strokeWidth={1.75} />
          </div>
          <h1 className="text-3xl font-bold text-white">
            {isRtl ? 'GymCore' : 'GymCore'}
          </h1>
          <p className="text-sm text-white/50 mt-2">
            {isRtl ? 'دخول المدربين وموظفي الاستقبال والمتدربين' : 'Trainer, reception & member sign-in'}
          </p>
        </div>

        {/* Toggle: Member / Team */}
        <div className="flex bg-white/5 rounded-xl p-1 mb-6 border border-white/5">
          <button
            type="button"
            onClick={() => setLoginType('member')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              loginType === 'member' ? 'bg-[#f97316] text-white shadow-lg shadow-[#f97316]/30' : 'text-white/60 hover:text-white'
            }`}
          >
            <Phone size={16} />
            {isRtl ? 'متدرب' : 'Member'}
          </button>
          <button
            type="button"
            onClick={() => setLoginType('staff')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              loginType === 'staff' ? 'bg-[#f97316] text-white shadow-lg shadow-[#f97316]/30' : 'text-white/60 hover:text-white'
            }`}
          >
            <Users size={16} />
            {isRtl ? 'مدرب / استقبال' : 'Trainer / Reception'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-stack-md">

          {loginType === 'member' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'رقم الهاتف' : 'Phone Number'}
                </label>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  focusedField === 'phone' ? 'border-[#f97316] bg-[#f97316]/5 ring-1 ring-[#f97316]/30' : 'border-white/10 bg-white/5'
                }`}>
                  <Phone size={18} className={focusedField === 'phone' ? 'text-[#f97316]' : 'text-white/30'} />
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
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'الرمز السري' : 'PIN Code'}
                </label>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  focusedField === 'code' ? 'border-[#f97316] bg-[#f97316]/5 ring-1 ring-[#f97316]/30' : 'border-white/10 bg-white/5'
                }`}>
                  <KeyRound size={18} className={focusedField === 'code' ? 'text-[#f97316]' : 'text-white/30'} />
                  <input
                    type={showMemberPin ? 'text' : 'password'}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onFocus={() => setFocusedField('code')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
                    placeholder="****"
                    dir="ltr"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowMemberPin(!showMemberPin)}
                    className="text-white/40 hover:text-white/70 transition-colors p-1 focus:outline-none"
                    tabIndex={-1}
                    aria-label={showMemberPin ? 'Hide PIN' : 'Show PIN'}
                  >
                    {showMemberPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {loginType === 'staff' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  focusedField === 'email' ? 'border-[#f97316] bg-[#f97316]/5 ring-1 ring-[#f97316]/30' : 'border-white/10 bg-white/5'
                }`}>
                  <Mail size={18} className={focusedField === 'email' ? 'text-[#f97316]' : 'text-white/30'} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
                    placeholder="coach@gymcore.app"
                    dir="ltr"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'كلمة المرور' : 'Password'}
                </label>
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                  focusedField === 'password' ? 'border-[#f97316] bg-[#f97316]/5 ring-1 ring-[#f97316]/30' : 'border-white/10 bg-white/5'
                }`}>
                  <Lock size={18} className={focusedField === 'password' ? 'text-[#f97316]' : 'text-white/30'} />
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

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div
                    onClick={() => handleRememberMeChange(!rememberMe)}
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
                    onChange={(e) => handleRememberMeChange(e.target.checked)}
                    className="hidden"
                  />
                  <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors cursor-pointer">
                    {t('auth.rememberMe')}
                  </span>
                </label>
                <Link to="/forgot-password?area=team" className="text-sm text-white/50 hover:text-white transition-colors">
                  {isRtl ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                </Link>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-[#f97316] text-white font-bold text-base hover:bg-[#e0660e] transition-all shadow-lg shadow-[#f97316]/30 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Spinner size="sm" />}
            {loading
              ? (isRtl ? 'جاري تسجيل الدخول...' : 'Signing in...')
              : (loginType === 'member' ? (isRtl ? 'دخول المتدرب' : 'Member Login') : (isRtl ? 'دخول الفريق' : 'Team Login'))}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors group"
          >
            <ShieldCheck size={14} className="group-hover:text-[#f97316] transition-colors" />
            <span>{t('auth.adminLinkFromTeam')}</span>
            <ArrowIcon size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <button
            onClick={() => setLanguage(isRtl ? 'en' : 'ar')}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            {isRtl ? 'English' : 'العربية'}
          </button>
        </div>
      </div>

      <PwaInstallPrompts isRtl={isRtl} appName={isRtl ? 'GymCore' : 'GymCore'} accentColor="#f97316" logoInitial="ج" />
    </div>
  );
}

