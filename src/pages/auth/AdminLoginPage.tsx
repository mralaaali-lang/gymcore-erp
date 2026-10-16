import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ShieldCheck,
  Envelope as Mail,
  Lock,
  Barbell as Dumbbell,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeSlash as EyeOff,
  DeviceMobile as Smartphone,
  Check,
  ActivityIcon as Activity,
  Lightning as Zap,
  Target,
  Users
} from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { setPlatformCookieSession, setTokens } from '../../services/api';
import Spinner from '../../components/ui/Spinner';
import PwaInstallPrompts from '../../components/auth/PwaInstallPrompts';
import { AUTH_ACCENT } from '../../components/auth/AuthAmbience';
import { ROLE_MAP } from '../../types';

type LoginMethod = 'email' | 'phone';

const ADMIN_ROLE_ROUTE: Record<string, string> = {
  'super-admin': '/super-admin/dashboard',
  'gym-admin': '/admin/dashboard',
};

// ─── Floating background particles ────────────────────────────────
const BG_ICONS = [Dumbbell, Activity, Zap, Target];
const PARTICLE_COUNT = 8;

function randomBetween(min: number, max: number) { return Math.random() * (max - min) + min; }

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { language, login, setLanguage } = useApp();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const [loginMethod, setLoginMethod] = useState<LoginMethod>('email');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
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

  // ── Load saved credentials from localStorage ──────────────────
  useEffect(() => {
    const saved = localStorage.getItem('gymcore_admin_email');
    const savedPhone = localStorage.getItem('gymcore_admin_phone');
    // Previous builds stored passwords in plaintext. Clear any legacy value;
    // remember-me now keeps only the account identifier.
    localStorage.removeItem('gymcore_admin_pass');
    if (saved || savedPhone) {
      if (saved) setEmail(saved);
      if (savedPhone) {
        setPhoneNumber(savedPhone);
        setLoginMethod('phone');
      }
      setRememberMe(true);
    }
    const timer = setTimeout(() => setShowCard(true), 80);
    return () => clearTimeout(timer);
  }, []);

  // Save/remove credentials based on rememberMe state
  const persistCredentials = (checked: boolean) => {
    if (checked) {
      if (loginMethod === 'email' && email) {
        localStorage.setItem('gymcore_admin_email', email);
      } else if (loginMethod === 'phone' && phoneNumber) {
        localStorage.setItem('gymcore_admin_phone', phoneNumber);
      }
    } else {
      localStorage.removeItem('gymcore_admin_email');
      localStorage.removeItem('gymcore_admin_phone');
    }
  };

  const handleRememberMeChange = (checked: boolean) => {
    setRememberMe(checked);
    persistCredentials(checked);
  };

  // Keep the saved credentials in sync as the user types (only when rememberMe is on)
  const handleEmailChange = (val: string) => {
    setEmail(val);
    if (rememberMe && val) {
      localStorage.setItem('gymcore_admin_email', val);
      // clear phone if switching to email
      localStorage.removeItem('gymcore_admin_phone');
    }
  };

  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val);
    if (rememberMe && val) {
      localStorage.setItem('gymcore_admin_phone', val);
      localStorage.removeItem('gymcore_admin_email');
    }
  };

  const handlePasswordChange = (val: string) => {
    setPassword(val);
  };

  const fetchJson = async (url: string, body: object) => {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const loginPayload: Record<string, string> = { password };
    if (loginMethod === 'email') {
      loginPayload.email = email.trim();
    } else {
      loginPayload.phone_number = phoneNumber.trim();
    }

    // Persist credentials if rememberMe is on (covers both email & phone methods)
    if (rememberMe) {
      if (loginMethod === 'email' && email) {
        localStorage.setItem('gymcore_admin_email', email);
      } else if (loginMethod === 'phone' && phoneNumber) {
        localStorage.setItem('gymcore_admin_phone', phoneNumber);
      }
    }

    try {
      await fetchJson('/platform/auth/login', loginPayload);
      // The backend stores the platform token in an HttpOnly cookie; keep it
      // out of localStorage and let the API client use cookie authentication.
      setPlatformCookieSession();
      login('super-admin', '');
      showToast(t('auth.signInSuccess'), 'success');
      navigate('/super-admin/dashboard');
      return;
    } catch { /* fall through */ }

    try {
      const data = await fetchJson('/auth/login', loginPayload);
      setTokens(data.access_token, data.refresh_token);
      const backendRole = data.user?.role || '';

      if (backendRole !== 'manager') {
        setLoading(false);
        showToast(t('auth.wrongScreenStaffToAdmin'), 'error');
        return;
      }

      const mappedRole = ROLE_MAP[backendRole] || 'gym-admin';
      login(mappedRole, data.user?.gym_id || '');
      showToast(t('auth.signInSuccess'), 'success');
      navigate(ADMIN_ROLE_ROUTE[mappedRole] || '/admin/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.invalidCredentials');
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Transition classes for staggered children ────────────────
  const fadeDelay = (i: number) => ({ transitionDelay: `${120 + i * 80}ms` });

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden p-margin-mobile select-none"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        background: 'var(--auth-root-bg)',
      }}
    >
      {/* ═══════════════════════════════════════════════════════════
         AMBIENT BACKGROUND LAYERS
         ═══════════════════════════════════════════════════════════ */}

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

      {/* ═══════════════════════════════════════════════════════════
         MAIN LOGIN CARD
         ═══════════════════════════════════════════════════════════ */}
      <div className="relative w-full max-w-[440px] z-10">

        {/* Animated border glow behind card */}
        <div className={`absolute -inset-[2px] rounded-3xl bg-gradient-to-br from-auth-accent/40 via-auth-amber/20 to-auth-accent/40 opacity-0 blur-sm transition-all duration-1000 ${
          showCard ? 'opacity-100' : 'opacity-0'
        }`} />

        {/* Card */}
        <div
          className={`relative backdrop-blur-2xl rounded-3xl p-8 sm:p-10 border transition-all duration-800 ease-out ${
            showCard
              ? 'opacity-100 translate-y-0 border-white/10'
              : 'opacity-0 translate-y-8 border-transparent'
          }`}
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
            boxShadow: showCard
              ? '0 25px 60px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)'
              : 'none',
          }}
        >
          {/* ═══ HEADER ═══ */}
          <div className="text-center mb-8" style={fadeDelay(0)}>
            <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all duration-700 ${
              showCard ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
            }`}
              style={{
                background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(245,158,11,0.1) 100%)',
                border: '1px solid rgba(6,182,212,0.25)',
              }}
            >
              <ShieldCheck size={32} className="text-auth-accent" strokeWidth={1.5} />
            </div>

            <h1 className={`text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent transition-all duration-700 ${
              showCard ? 'opacity-100' : 'opacity-0'
            }`}>
              {t('auth.adminConsoleTitle')}
            </h1>
            <p className={`text-sm text-white/50 mt-2 transition-all duration-700 ${
              showCard ? 'opacity-100' : 'opacity-0'
            }`} style={{ transitionDelay: '100ms' }}>
              {t('auth.adminConsoleSubtitle')}
            </p>

            {/* Gym accent line */}
            <div className={`mx-auto mt-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-auth-accent to-auth-amber transition-all duration-700 ${
              showCard ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
            }`} style={{ transitionDelay: '150ms' }} />
          </div>

          {/* ═══ LOGIN METHOD TABS ═══ */}
          <div className={`flex rounded-xl p-1 mb-6 transition-all duration-500 ${showCard ? 'opacity-100' : 'opacity-0'}`}
            style={{
              ...fadeDelay(1),
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <button
              type="button"
              onClick={() => setLoginMethod('email')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                loginMethod === 'email'
                  ? 'bg-gradient-to-r from-auth-accent to-auth-accent-strong text-white shadow-lg shadow-auth-accent/25 scale-105'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Mail size={16} />
              {t('auth.loginViaEmail')}
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('phone')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${
                loginMethod === 'phone'
                  ? 'bg-gradient-to-r from-auth-accent to-auth-accent-strong text-white shadow-lg shadow-auth-accent/25 scale-105'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Smartphone size={16} />
              {t('auth.loginViaPhone')}
            </button>
          </div>

          {/* ═══ FORM ═══ */}
          <form onSubmit={handleSubmit} className="space-y-stack-md">

            {/* ── Email field ── */}
            {loginMethod === 'email' && (
              <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                style={{ transitionDelay: '200ms' }}>
                <label className="block text-sm font-semibold text-white/70 mb-2">{t('auth.email')}</label>
                <div className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 ${
                  focusedField === 'email'
                    ? 'border-auth-accent bg-auth-accent/5 ring-1 ring-auth-accent/30 shadow-sm shadow-auth-accent/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}>
                  <Mail size={18} className={`transition-colors duration-200 ${focusedField === 'email' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'}`} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/25"
                    placeholder="manager@yourgym.com"
                    dir="ltr"
                    required={loginMethod === 'email'}
                    autoFocus={loginMethod === 'email'}
                  />
                </div>
              </div>
            )}

            {/* ── Phone field ── */}
            {loginMethod === 'phone' && (
              <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                style={{ transitionDelay: '200ms' }}>
                <label className="block text-sm font-semibold text-white/70 mb-2">{t('auth.phone')}</label>
                <div className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 ${
                  focusedField === 'phone'
                    ? 'border-auth-accent bg-auth-accent/5 ring-1 ring-auth-accent/30 shadow-sm shadow-auth-accent/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}>
                  <Smartphone size={18} className={`transition-colors duration-200 ${focusedField === 'phone' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'}`} />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onFocus={() => setFocusedField('phone')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/25"
                    placeholder="05xxxxxxxx"
                    dir="ltr"
                    required={loginMethod === 'phone'}
                    autoFocus={loginMethod === 'phone'}
                  />
                </div>
              </div>
            )}

            {/* ── Password field ── */}
            <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
              style={{ transitionDelay: '280ms' }}>
              <label className="block text-sm font-semibold text-white/70 mb-2">{t('auth.password')}</label>
              <div className={`group flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 ${
                focusedField === 'password'
                  ? 'border-auth-accent bg-auth-accent/5 ring-1 ring-auth-accent/30 shadow-sm shadow-auth-accent/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}>
                <Lock size={18} className={`transition-colors duration-200 ${focusedField === 'password' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'}`} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => handlePasswordChange(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/25"
                  placeholder="········"
                  dir="ltr"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-white/30 hover:text-white/60 transition-colors p-1 focus:outline-none"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* ── Remember me + Forgot ── */}
            <div className={`flex items-center justify-between transition-all duration-400 ${showCard ? 'opacity-100' : 'opacity-0'}`}
              style={{ transitionDelay: '360ms' }}>
              <label className="flex items-center gap-2 cursor-pointer group">
                <div
                  onClick={() => handleRememberMeChange(!rememberMe)}
                  className={`w-[18px] h-[18px] rounded-md border-2 flex items-center justify-center transition-all duration-150 ${
                    rememberMe
                      ? 'bg-auth-accent border-auth-accent shadow-sm shadow-auth-accent/30'
                      : 'border-white/20 group-hover:border-white/40'
                  }`}
                >
                  {rememberMe && <Check size={12} className="text-white" strokeWidth={3} />}
                </div>
                <input type="checkbox" checked={rememberMe} onChange={(e) => handleRememberMeChange(e.target.checked)} className="hidden" />
                <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors cursor-pointer select-none">
                  {t('auth.rememberMe')}
                </span>
              </label>
              <Link
                to="/forgot-password?area=admin"
                className="text-xs text-white/40 hover:text-auth-accent transition-colors"
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>

            {/* ── Submit button ── */}
            <div className={`transition-all duration-400 ${showCard ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
              style={{ transitionDelay: '440ms' }}>
              <button
                type="submit"
                disabled={loading}
                className="relative w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide text-white overflow-hidden transition-all duration-200 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed group"
                style={{
                  background: 'var(--auth-cta-bg)',
                  boxShadow: '0 4px 20px rgba(6,182,212,0.3)',
                }}
              >
                {/* Shimmer overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center justify-center gap-2">
                  {loading && <Spinner size="sm" />}
                  {loading ? t('auth.signingIn') : (
                    <>
                      {t('auth.signIn')}
                      <ArrowIcon size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>

          {/* ═══ FOOTER ═══ */}
          <div className={`mt-8 pt-6 border-t border-white/5 flex items-center justify-between transition-all duration-400 ${
            showCard ? 'opacity-100' : 'opacity-0'
          }`} style={{ transitionDelay: '520ms' }}>
            <Link
              to="/team-login"
              className="group inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <Users size={14} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
              {t('auth.teamLinkFromAdmin')}
            </Link>
            <button
              onClick={() => setLanguage(isRtl ? 'en' : 'ar')}
              className="text-xs text-white/30 hover:text-auth-accent/70 transition-colors"
            >
              {isRtl ? 'English' : 'العربية'}
            </button>
          </div>
        </div>

        {/* ── Brand watermark ── */}
        <div className={`text-center mt-6 transition-all duration-700 ${showCard ? 'opacity-40' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
          <p className="text-[10px] text-white/20 tracking-[0.2em] uppercase font-light">
            {isRtl ? 'نظام إدارة المنشآت الرياضية' : 'Sports Facility Management'}
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
         INLINE KEYFRAMES
         ═══════════════════════════════════════════════════════════ */}
      <style>{`
        @keyframes floatIcon {
          0%   { transform: translateY(0px) rotate(var(--rotation, 0deg)); }
          50%  { transform: translateY(-18px) rotate(calc(var(--rotation, 0deg) + 5deg)); }
          100% { transform: translateY(0px) rotate(var(--rotation, 0deg)); }
        }
      `}</style>

      <PwaInstallPrompts isRtl={isRtl} appName={t('common.appName')} accentColor={AUTH_ACCENT} logoInitial="ج" />
    </div>
  );
}

