import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Phone,
  Key as KeyRound,
  Envelope as Mail,
  Lock,
  Users,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeSlash as EyeOff,
  Check,
  ShieldCheck,
  Barbell as Dumbbell,
  ActivityIcon as Activity,
  Lightning as Zap,
  Target
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import Spinner from '../../components/ui/Spinner';
import PwaInstallPrompts from '../../components/auth/PwaInstallPrompts';
import { AUTH_ACCENT } from '../../components/auth/AuthAmbience';
import { login as apiStaffLogin, memberLogin as apiMemberLogin, logout as apiLogout } from '../../services/api';
import { ROLE_MAP } from '../../types';

type LoginType = 'member' | 'staff';

const STAFF_ROLE_ROUTE: Record<string, string> = {
  trainer: '/trainer/dashboard',
  reception: '/reception/dashboard',
};

// ─── Floating background particles — identical set to the admin console ───
const BG_ICONS = [Dumbbell, Activity, Zap, Target];
const PARTICLE_COUNT = 8;

function randomBetween(min: number, max: number) { return Math.random() * (max - min) + min; }

// Shared field chrome so every input on this screen behaves identically.
// Colours match AdminLoginPage; the height is a comfortable mobile touch target.
function fieldBox(active: boolean, bad: boolean) {
  const base = 'group flex items-center gap-3 px-4 min-h-[54px] rounded-xl border transition-all duration-200 ';
  if (bad) return base + 'border-rose-400/70 bg-rose-500/10 ring-1 ring-rose-400/30';
  if (active) return base + 'border-auth-accent bg-auth-accent/5 ring-1 ring-auth-accent/30 shadow-sm shadow-auth-accent/10';
  return base + 'border-white/10 bg-white/5 hover:border-white/20';
}

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
  const [showMemberPin, setShowMemberPin] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [touched, setTouched] = useState<{ phone: boolean; code: boolean }>({ phone: false, code: false });

  const isRtl = language === 'ar';
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

  // ── Random particles (stable across renders) ──────────────────
  const particles = useMemo(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      Icon: BG_ICONS[i % BG_ICONS.length],
      x: randomBetween(5, 95),
      y: randomBetween(5, 95),
      size: randomBetween(28, 64),
      delay: randomBetween(0, 8),
      duration: randomBetween(12, 20),
      opacity: randomBetween(0.03, 0.08),
      rotation: randomBetween(-20, 20),
    })), []);

  const handleRememberMeChange = (val: boolean) => {
    setRememberMe(val);
    if (val) {
      localStorage.setItem('team_email', email);
    } else {
      localStorage.removeItem('team_email');
    }
  };

  // Restore remembered email on mount + trigger the entrance stagger.
  useEffect(() => {
    const saved = localStorage.getItem('team_email');
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }
    const timer = setTimeout(() => setShowCard(true), 80);
    return () => clearTimeout(timer);
  }, []);

  // ── Non-blocking client hints (the server stays the source of truth) ──
  const digits = phone.replace(/\D/g, '');
  const phoneBad = touched.phone && digits.length > 0 && !/^05\d{8}$/.test(digits);
  const pinBad = touched.code && code.length > 0 && code.length < 4;

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

  // Keyboard support for the account-type control (radiogroup semantics).
  const handleTabsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: LoginType = loginType === 'member' ? 'staff' : 'member';
    setLoginType(next);
    const el = document.getElementById(`team-tab-${next}`);
    if (el) el.focus();
  };

  // ── Transition classes for staggered children ────────────────
  const fadeDelay = (i: number) => ({ transitionDelay: `${120 + i * 80}ms` });

  return (
    <div
      className="team-fx relative min-h-[100dvh] flex items-center justify-center overflow-hidden px-margin-mobile py-8 select-none"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        background: 'var(--auth-root-bg)',
      }}
    >
      {/* ═══════════ AMBIENT BACKGROUND LAYERS (identical to the admin console) ═══════════ */}

      {/* 1. Main gradient mesh */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 15% 20%, hsl(var(--auth-accent) / 0.12) 0%, transparent 55%),
            radial-gradient(ellipse at 85% 15%, hsl(var(--auth-amber) / 0.08) 0%, transparent 45%),
            radial-gradient(ellipse at 50% 80%, hsl(var(--auth-accent) / 0.06) 0%, transparent 50%)
          `,
        }}
      />

      {/* 2. Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--auth-grid-line) / 0.15) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--auth-grid-line) / 0.15) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* 3. Animated glow orbs */}
      <div className="absolute top-[15%] right-[20%] w-[500px] h-[500px] rounded-full bg-auth-accent/8 blur-[120px] animate-pulse" style={{ animationDuration: '6s' }} />
      <div className="absolute bottom-[20%] left-[10%] w-[400px] h-[400px] rounded-full bg-auth-amber/6 blur-[100px] animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }} />
      <div className="absolute top-[40%] left-[40%] w-[300px] h-[300px] rounded-full bg-auth-accent/5 blur-[90px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '4s' }} />

      {/* 4. Floating sport icons */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animation: `floatIcon ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
            opacity: p.opacity,
            transform: `rotate(${p.rotation}deg)`,
          }}
        >
          <p.Icon size={p.size} strokeWidth={1} className="text-white" />
        </div>
      ))}

      {/* 5. Subtle vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 50%, hsl(var(--auth-bg-1) / 0.6) 100%)',
      }} />

      {/* ═══════════ LOGIN CARD ═══════════ */}
      <div className="relative w-full max-w-[440px] z-10">

        {/* Animated border glow */}
        <div className={`absolute -inset-[2px] rounded-3xl bg-gradient-to-br from-auth-accent/40 via-auth-amber/20 to-auth-accent/40 blur-sm transition-all duration-1000 ${
          showCard ? 'opacity-100' : 'opacity-0'
        }`} />

        <div
          className={`relative backdrop-blur-2xl rounded-3xl p-8 sm:p-10 border transition-all duration-700 ease-out ${
            showCard ? 'opacity-100 translate-y-0 border-white/10' : 'opacity-0 translate-y-8 border-transparent'
          }`}
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
            boxShadow: showCard
              ? '0 25px 60px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)'
              : 'none',
          }}
        >
          {/* ── HEADER ── */}
          <div className="text-center mb-8" style={fadeDelay(0)}>
            <div
              className={`h-16 w-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all duration-700 ${
                showCard ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
              }`}
              style={{
                background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(245,158,11,0.1) 100%)',
                border: '1px solid rgba(6,182,212,0.25)',
              }}
            >
              <Users size={32} strokeWidth={1.5} className="text-auth-accent" />
            </div>

            <h1 className={`text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent transition-all duration-700 ${
              showCard ? 'opacity-100' : 'opacity-0'
            }`}>
              {t('auth.teamTitle')}
            </h1>
            <p className={`text-sm text-white/50 mt-2 transition-all duration-700 ${showCard ? 'opacity-100' : 'opacity-0'}`}
              style={{ transitionDelay: '100ms' }}>
              {t('auth.teamSubtitle')}
            </p>

            <div className={`mx-auto mt-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-auth-accent to-auth-amber transition-all duration-700 ${
              showCard ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
            }`} style={{ transitionDelay: '150ms' }} />
          </div>

          {/* ── ACCOUNT TYPE TABS ── */}
          <div
            role="radiogroup"
            aria-label={isRtl ? 'نوع الحساب' : 'Account type'}
            onKeyDown={handleTabsKeyDown}
            className={`flex rounded-xl p-1 mb-6 transition-all duration-500 ${showCard ? 'opacity-100' : 'opacity-0'}`}
            style={{ ...fadeDelay(1), background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <button
              id="team-tab-member"
              type="button"
              role="radio"
              aria-checked={loginType === 'member'}
              onClick={() => setLoginType('member')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all duration-300 ${
                loginType === 'member'
                  ? 'bg-gradient-to-r from-auth-accent to-auth-accent-strong text-white shadow-lg shadow-auth-accent/25 scale-105'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Phone size={16} />
              {t('auth.memberTab')}
            </button>
            <button
              id="team-tab-staff"
              type="button"
              role="radio"
              aria-checked={loginType === 'staff'}
              onClick={() => setLoginType('staff')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all duration-300 ${
                loginType === 'staff'
                  ? 'bg-gradient-to-r from-auth-accent to-auth-accent-strong text-white shadow-lg shadow-auth-accent/25 scale-105'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users size={16} />
              {t('auth.staffTab')}
            </button>
          </div>

          {/* ── FORM ── */}
          <form onSubmit={handleSubmit} className="space-y-stack-md">

            {loginType === 'member' && (
              <>
                {/* Phone */}
                <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                  style={{ transitionDelay: '200ms' }}>
                  <label htmlFor="member-phone" className="block text-sm font-semibold text-white/70 mb-2">
                    {t('auth.phoneNumber')}
                  </label>
                  <div className={fieldBox(focusedField === 'phone', phoneBad)}>
                    <Phone size={18} className={`transition-colors duration-200 ${
                      phoneBad ? 'text-rose-300' : focusedField === 'phone' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'
                    }`} />
                    <input
                      id="member-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      enterKeyHint="next"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onFocus={() => setFocusedField('phone')}
                      onBlur={() => { setFocusedField(null); setTouched((s) => ({ ...s, phone: true })); }}
                      aria-invalid={phoneBad || undefined}
                      aria-describedby="member-phone-hint"
                      className="flex-1 min-w-0 bg-transparent text-white text-base outline-none no-focus-floor placeholder-white/25"
                      placeholder="05xxxxxxxx"
                      dir="ltr"
                      required
                      autoFocus
                    />
                  </div>
                  <p id="member-phone-hint" aria-live="polite" className={`min-h-[18px] mt-1.5 text-xs transition-colors ${
                    phoneBad ? 'text-rose-300' : 'text-white/35'
                  }`}>
                    {phoneBad
                      ? (isRtl ? 'رقم الهاتف يبدأ بـ 05 ويتكوّن من ١٠ أرقام' : 'Phone must be 10 digits starting with 05')
                      : (digits.length > 0 && digits.length < 10 && isRtl ? `${digits.length}/١٠ أرقام` : '')}
                  </p>
                </div>

                {/* PIN */}
                <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                  style={{ transitionDelay: '260ms' }}>
                  <label htmlFor="member-pin" className="block text-sm font-semibold text-white/70 mb-2">
                    {t('auth.pinCode')}
                  </label>
                  <div className={fieldBox(focusedField === 'code', pinBad)}>
                    <KeyRound size={18} className={`transition-colors duration-200 ${
                      pinBad ? 'text-rose-300' : focusedField === 'code' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'
                    }`} />
                    <input
                      id="member-pin"
                      type={showMemberPin ? 'text' : 'password'}
                      inputMode="numeric"
                      autoComplete="current-password"
                      enterKeyHint="go"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onFocus={() => setFocusedField('code')}
                      onBlur={() => { setFocusedField(null); setTouched((s) => ({ ...s, code: true })); }}
                      aria-invalid={pinBad || undefined}
                      aria-describedby="member-pin-hint"
                      className="flex-1 min-w-0 bg-transparent text-white text-base tracking-[0.3em] outline-none no-focus-floor placeholder-white/25"
                      placeholder="••••"
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowMemberPin(!showMemberPin)}
                      className="text-white/30 hover:text-white/60 transition-colors p-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-accent"
                      aria-pressed={showMemberPin}
                      aria-label={showMemberPin ? 'Hide PIN' : 'Show PIN'}
                    >
                      {showMemberPin ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p id="member-pin-hint" aria-live="polite" className={`min-h-[18px] mt-1.5 text-xs transition-colors ${
                    pinBad ? 'text-rose-300' : 'text-white/35'
                  }`}>
                    {pinBad ? (isRtl ? 'الرمز ٤ خانات على الأقل' : 'PIN must be at least 4 characters') : ''}
                  </p>
                </div>
              </>
            )}

            {loginType === 'staff' && (
              <>
                {/* Email */}
                <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                  style={{ transitionDelay: '200ms' }}>
                  <label htmlFor="staff-email" className="block text-sm font-semibold text-white/70 mb-2">
                    {t('auth.email')}
                  </label>
                  <div className={fieldBox(focusedField === 'email', false)}>
                    <Mail size={18} className={`transition-colors duration-200 ${
                      focusedField === 'email' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'
                    }`} />
                    <input
                      id="staff-email"
                      type="email"
                      autoComplete="username email"
                      enterKeyHint="next"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      className="flex-1 min-w-0 bg-transparent text-white text-base outline-none no-focus-floor placeholder-white/25"
                      placeholder="coach@gymcore.app"
                      dir="ltr"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                {/* Password */}
                <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                  style={{ transitionDelay: '260ms' }}>
                  <label htmlFor="staff-password" className="block text-sm font-semibold text-white/70 mb-2">
                    {t('auth.password')}
                  </label>
                  <div className={fieldBox(focusedField === 'password', false)}>
                    <Lock size={18} className={`transition-colors duration-200 ${
                      focusedField === 'password' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'
                    }`} />
                    <input
                      id="staff-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      enterKeyHint="go"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      className="flex-1 min-w-0 bg-transparent text-white text-base outline-none no-focus-floor placeholder-white/25"
                      placeholder="••••••••"
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-white/30 hover:text-white/60 transition-colors p-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-accent"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Remember + forgot */}
                <div className={`flex items-center justify-between transition-all duration-400 ${showCard ? 'opacity-100' : 'opacity-0'}`}
                  style={{ transitionDelay: '340ms' }}>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div
                      onClick={() => handleRememberMeChange(!rememberMe)}
                      className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all duration-150 ${
                        rememberMe ? 'bg-auth-accent border-auth-accent shadow-sm shadow-auth-accent/30' : 'border-white/20 group-hover:border-white/40'
                      }`}
                    >
                      {rememberMe && <Check size={12} className="text-white" strokeWidth={3} />}
                    </div>
                    <input type="checkbox" checked={rememberMe} onChange={(e) => handleRememberMeChange(e.target.checked)} className="hidden" />
                    <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors select-none">
                      {t('auth.rememberMe')}
                    </span>
                  </label>
                  <Link to="/forgot-password?area=team" className="text-xs text-white/40 hover:text-auth-accent transition-colors">
                    {t('auth.forgotPassword')}
                  </Link>
                </div>
              </>
            )}

            {/* Submit */}
            <div className={`transition-all duration-400 ${showCard ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
              style={{ transitionDelay: '420ms' }}>
              <button
                type="submit"
                disabled={loading}
                className="relative w-full py-4 rounded-2xl font-bold text-base tracking-wide text-white overflow-hidden transition-all duration-200 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-accent"
                style={{
                  background: 'var(--auth-cta-bg)',
                  boxShadow: '0 4px 20px rgba(6,182,212,0.3)',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center justify-center gap-2">
                  {loading && <Spinner size="sm" />}
                  {loading
                    ? (isRtl ? 'جاري تسجيل الدخول...' : 'Signing in...')
                    : (loginType === 'member' ? t('auth.memberLoginButton') : t('auth.teamLoginButton'))}
                </span>
              </button>
            </div>
          </form>

          {/* ── FOOTER ── */}
          <div className={`mt-8 pt-6 border-t border-white/5 flex items-center justify-between gap-3 transition-all duration-400 ${
            showCard ? 'opacity-100' : 'opacity-0'
          }`} style={{ transitionDelay: '500ms' }}>
            <Link
              to="/login"
              className="group inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <ShieldCheck size={14} className="transition-colors group-hover:text-auth-accent" />
              {t('auth.adminLinkFromTeam')}
              <ArrowIcon size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={() => setLanguage(isRtl ? 'en' : 'ar')}
              className="text-xs text-white/30 hover:text-auth-accent/80 transition-colors"
            >
              {isRtl ? 'English' : 'العربية'}
            </button>
          </div>
        </div>

        {/* ── Watermark ── */}
        <div className={`text-center mt-6 transition-all duration-700 ${showCard ? 'opacity-40' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
          <p className="text-[10px] text-white/20 tracking-[0.2em] uppercase font-light">
            {isRtl ? 'بوابة الأعضاء وفريق الصالة' : 'Member & Team Portal'}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes floatIcon {
          0%   { transform: translateY(0px) rotate(var(--rotation, 0deg)); }
          50%  { transform: translateY(-18px) rotate(calc(var(--rotation, 0deg) + 5deg)); }
          100% { transform: translateY(0px) rotate(var(--rotation, 0deg)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .team-fx *, .team-fx *::before, .team-fx *::after {
            animation-duration: .001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .001ms !important;
          }
        }
      `}</style>

      <PwaInstallPrompts isRtl={isRtl} appName={t('auth.teamTitle')} accentColor={AUTH_ACCENT} logoInitial="ج" />
    </div>
  );
}
