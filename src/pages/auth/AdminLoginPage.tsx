import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AtSign,
  Mail,
  Phone,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Check,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { setPlatformCookieSession, setTokens } from '../../services/api';
import Spinner from '../../components/ui/Spinner';
import PwaInstallPrompts from '../../components/auth/PwaInstallPrompts';
import AuthAmbience, { AUTH_ACCENT, AUTH_ROOT_BG } from '../../components/auth/AuthAmbience';
import AuthCard from '../../components/auth/AuthCard';
import AuthBrandMark from '../../components/auth/AuthBrandMark';
import useAuthBranding from '../../components/auth/useAuthBranding';
import { ROLE_MAP } from '../../types';

const ADMIN_ROLE_ROUTE: Record<string, string> = {
  'super-admin': '/super-admin/dashboard',
  'gym-admin': '/admin/dashboard',
};

type IconType = LucideIcon;

/** Sign-in is one field: whatever the manager types decides which key is sent. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{7,}$/;

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { language, login, setLanguage } = useApp();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  // Platform identity for the header mark. The heading itself stays the fixed
  // console title; the app name is still used for the logo alt text and for
  // the install prompt.
  const { appName } = useAuthBranding();

  // One identifier field for both email and phone (the backend accepts either
  // on /platform/auth/login and /auth/login — see loginSchema/ platformLoginSchema).
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const isRtl = language === 'ar';
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

  const trimmedId = identifier.trim();
  const isEmail = EMAIL_RE.test(trimmedId);
  const looksLikePhone = !isEmail && PHONE_RE.test(trimmedId);
  // Neutral glyph while the field is empty (or the text is not yet recognisable),
  // so the icon never claims "this is a phone number" before it actually is one.
  const IdentifierIcon: IconType = isEmail ? Mail : looksLikePhone ? Phone : AtSign;
  const identifierKind = isEmail ? t('auth.email') : looksLikePhone ? t('auth.phone') : '';

  // ── Load saved identifier from localStorage ───────────────────
  useEffect(() => {
    const saved = localStorage.getItem('gymcore_admin_email');
    const savedPhone = localStorage.getItem('gymcore_admin_phone');
    // Previous builds stored passwords in plaintext. Clear any legacy value;
    // remember-me now keeps only the account identifier.
    localStorage.removeItem('gymcore_admin_pass');
    if (saved || savedPhone) {
      setIdentifier(saved || savedPhone || '');
      setRememberMe(true);
    }
  }, []);

  // Keep the saved identifier in sync while typing (only when rememberMe is on).
  // Email and phone keep their own keys so existing installs stay compatible.
  const persistIdentifier = (value: string, remember: boolean) => {
    if (!remember || !value) return;
    if (EMAIL_RE.test(value)) {
      localStorage.setItem('gymcore_admin_email', value);
      localStorage.removeItem('gymcore_admin_phone');
    } else {
      localStorage.setItem('gymcore_admin_phone', value);
      localStorage.removeItem('gymcore_admin_email');
    }
  };

  const handleIdentifierChange = (val: string) => {
    setIdentifier(val);
    persistIdentifier(val.trim(), rememberMe);
  };

  const handleRememberMeChange = (checked: boolean) => {
    setRememberMe(checked);
    // Pass the new value explicitly: state has not re-rendered yet, so reading
    // `rememberMe` here would still see the previous one and never save.
    if (checked) {
      persistIdentifier(trimmedId, true);
    } else {
      localStorage.removeItem('gymcore_admin_email');
      localStorage.removeItem('gymcore_admin_phone');
    }
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

    if (!trimmedId) {
      showToast(t('auth.identifierRequired'), 'error');
      return;
    }
    // Neither an email nor a phone-shaped string: fail here instead of burning a
    // round trip that the backend would answer with a generic "invalid credentials".
    if (!isEmail && !looksLikePhone) {
      showToast(t('auth.identifierInvalid'), 'error');
      return;
    }

    setLoading(true);

    const loginPayload: Record<string, string> = { password };
    if (isEmail) loginPayload.email = trimmedId;
    else loginPayload.phone_number = trimmedId;

    if (rememberMe) persistIdentifier(trimmedId, true);

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

  // ── Shared entrance: staggered "rise", disabled under reduced motion ──
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduceMotion ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.5, ease: 'easeOut' as const },
  });

  const fieldShell = (name: string) =>
    `group flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 ${
      focusedField === name
        ? 'border-auth-accent bg-auth-accent/5 ring-1 ring-auth-accent/30 shadow-sm shadow-auth-accent/10'
        : 'border-white/10 bg-white/5 hover:border-white/20'
    }`;

  return (
    <div
      className="auth-fx relative min-h-screen flex items-center justify-center overflow-hidden p-margin-mobile select-none"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ background: AUTH_ROOT_BG }}
    >
      {/* Ambient layers — shared with the portal and the password screens */}
      <AuthAmbience />

      {/* ═══════════════════════════════════════════════════════════
         MAIN LOGIN CARD
         ═══════════════════════════════════════════════════════════ */}
      <div className="relative w-full max-w-[440px] z-10">

        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative"
        >
          <AuthCard>
            {/* ═══ HEADER ═══ */}
            <motion.div className="text-center mb-7" {...rise(0.1)}>
              {/* Configured logo when one exists, else the console shield. */}
              <AuthBrandMark
                fallback={<ShieldCheck size={30} className="text-auth-accent" strokeWidth={1.5} />}
              />

              <h1 className="text-2xl sm:text-[28px] font-extrabold text-white leading-snug">
                {t('auth.adminConsoleTitle')}
              </h1>

              {/* Gym accent line */}
              <div className="mx-auto mt-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-auth-accent to-auth-amber" />
            </motion.div>

            {/* ═══ FORM ═══ */}
            <form onSubmit={handleSubmit} className="space-y-stack-md">

              {/* ── Identifier: email OR phone ── */}
              <motion.div {...rise(0.18)}>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <label htmlFor="login-identifier" className="block text-sm font-semibold text-white/70">
                    {t('auth.identifier')}
                  </label>
                  {identifierKind && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-auth-accent/80 bg-auth-accent/10 border border-auth-accent/20 rounded-full px-2 py-0.5">
                      {identifierKind}
                    </span>
                  )}
                </div>
                <div className={fieldShell('identifier')}>
                  <IdentifierIcon
                    size={18}
                    className={`shrink-0 transition-colors duration-200 ${
                      focusedField === 'identifier' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'
                    }`}
                  />
                  <input
                    id="login-identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => handleIdentifierChange(e.target.value)}
                    onFocus={() => setFocusedField('identifier')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-sm outline-none no-focus-floor placeholder-white/25"
                    placeholder={t('auth.identifierPlaceholder')}
                    dir="ltr"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    autoFocus
                  />
                </div>
                {/* The "or a phone number" hint lives here, not in the field's
                    placeholder: the input is `dir="ltr"`, so Arabic inside it
                    got bidi-shuffled. Each Latin sample gets its own LTR run. */}
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-white/35">
                  <span>{t('auth.identifierHint')}</span>
                  <span dir="ltr" className="font-medium tracking-wide text-white/55">0101234567</span>
                </p>
              </motion.div>

              {/* ── Password ── */}
              <motion.div {...rise(0.26)}>
                <label htmlFor="login-password" className="block text-sm font-semibold text-white/70 mb-2">
                  {t('auth.password')}
                </label>
                <div className={fieldShell('password')}>
                  <Lock
                    size={18}
                    className={`shrink-0 transition-colors duration-200 ${
                      focusedField === 'password' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'
                    }`}
                  />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    className="flex-1 bg-transparent text-white text-sm outline-none no-focus-floor placeholder-white/25"
                    placeholder="········"
                    dir="ltr"
                    autoComplete="current-password"
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
              </motion.div>

              {/* ── Remember me + Forgot ── */}
              <motion.div className="flex items-center justify-between" {...rise(0.34)}>
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
              </motion.div>

              {/* ── Submit ── */}
              <motion.div {...rise(0.42)}>
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
              </motion.div>
            </form>

            {/* ═══ FOOTER ═══ */}
            <motion.div className="mt-7 pt-5 border-t border-white/5 flex items-center justify-between" {...rise(0.5)}>
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
            </motion.div>
          </AuthCard>
        </motion.div>

        {/* ── Brand watermark ── */}
        <motion.div className="text-center mt-6" {...rise(0.55)}>
          <p className="text-[10px] text-white/20 tracking-[0.2em] uppercase font-light">
            {t('auth.tagline')}
          </p>
        </motion.div>
      </div>

      <PwaInstallPrompts isRtl={isRtl} appName={appName || t('common.appName')} accentColor={AUTH_ACCENT} logoInitial="ج" />
    </div>
  );
}
