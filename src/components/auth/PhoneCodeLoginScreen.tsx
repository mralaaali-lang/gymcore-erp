import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone,
  Key as KeyRound,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeSlash as EyeOff,
  Check,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import Spinner from '../ui/Spinner';
import AuthAmbience, { AUTH_ACCENT, AUTH_ROOT_BG } from './AuthAmbience';
import AuthCard from './AuthCard';
import AuthBrandMark from './AuthBrandMark';
import PwaInstallPrompts from './PwaInstallPrompts';
import { forgotLoginCode, type LoginCodeArea } from '../../services/api';

// ─── Phone + code, for members and for staff ──────────────────────
// Both portals ask for exactly the same two things, so the screen is written
// once. What differs is who the code belongs to (`area`), where the person
// lands after signing in, and the cross-links — all injected by the page.
//
// The old screen guessed the credential space from what you typed and silently
// switched between phone+PIN and email+password. Now the portal decides it, and
// the only secret anyone can hold is a 4-digit code.

const PHONE_RE = /^\+?[\d\s\-()]{7,}$/;

// Shared field chrome — identical to AdminLoginPage, so the auth family matches.
function fieldBox(active: boolean) {
  const base = 'group flex items-center gap-3 px-4 min-h-[54px] rounded-xl border transition-all duration-200 ';
  if (active) return base + 'border-auth-accent bg-auth-accent/5 ring-1 ring-auth-accent/30 shadow-sm shadow-auth-accent/10';
  return base + 'border-white/10 bg-white/5 hover:border-white/20';
}

/** Server error code → the message the person actually needs to read. */
function errorKeyFor(code: string | undefined, area: LoginCodeArea): string {
  switch (code) {
    case 'MANAGER_ACCOUNT': return 'staff.managementAccount';
    case 'INACTIVE_ACCOUNT': return 'auth.inactiveAccount';
    case 'GYM_SUSPENDED': return 'auth.gymSuspended';
    default: return area === 'member' ? 'staff.failedMember' : 'staff.failedCode';
  }
}

interface Props {
  /** Which credential space this screen talks to. */
  area: LoginCodeArea;
  title: string;
  tagline: string;
  pwaAppName: string;
  /** localStorage key for the "remember me" phone number (one per portal). */
  rememberKey: string;
  brandFallback: ReactNode;
  /** Cross-links to the other sign-in screens. */
  footer: ReactNode;
  /** Signs the person in. Throw to have the card show the failure. */
  onSubmit: (phone: string, code: string) => Promise<void>;
}

export default function PhoneCodeLoginScreen({
  area,
  title,
  tagline,
  pwaAppName,
  rememberKey,
  brandFallback,
  footer,
  onSubmit,
}: Props) {
  const { language, setLanguage } = useApp();
  const { showToast } = useToast();
  const { t } = useTranslation();

  const isRtl = language === 'ar';

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [showCard, setShowCard] = useState(false);

  const trimmedPhone = phone.trim();

  // Restore the remembered number on mount + trigger the entrance stagger.
  useEffect(() => {
    const saved = localStorage.getItem(rememberKey);
    if (saved) {
      setPhone(saved);
      setRememberMe(true);
    }
    const timer = setTimeout(() => setShowCard(true), 80);
    return () => clearTimeout(timer);
  }, [rememberKey]);

  const handleRememberMeChange = (val: boolean) => {
    setRememberMe(val);
    // Pass the new value explicitly: state has not re-rendered yet.
    if (val) {
      if (trimmedPhone) localStorage.setItem(rememberKey, trimmedPhone);
    } else {
      localStorage.removeItem(rememberKey);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedPhone) {
      showToast(t('auth.identifierRequired'), 'error');
      return;
    }
    if (!PHONE_RE.test(trimmedPhone)) {
      showToast(t('auth.identifierInvalid'), 'error');
      return;
    }
    if (code.trim().length < 4) {
      showToast(t('auth.codeRequired'), 'error');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(trimmedPhone, code.trim());
      if (rememberMe) localStorage.setItem(rememberKey, trimmedPhone);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      showToast(t(errorKeyFor(axiosErr?.response?.data?.error, area)), 'error');
    } finally {
      setLoading(false);
    }
  };

  // "نسيت الكود؟" — issues a NEW code (the old one dies) and sends it on
  // WhatsApp. The answer never says whether the number exists; the only thing
  // we can act on is `channel`, which tells us sending isn't configured at all.
  const handleSendCode = async () => {
    if (!trimmedPhone) {
      showToast(t('auth.codePhoneFirst'), 'error');
      return;
    }
    if (!PHONE_RE.test(trimmedPhone)) {
      showToast(t('auth.identifierInvalid'), 'error');
      return;
    }
    setSendingCode(true);
    try {
      const { channel } = await forgotLoginCode(trimmedPhone, area);
      if (channel === 'console') {
        // The backend only logged it — nobody is going to receive anything.
        showToast(t('auth.codeSendUnavailable'), 'error');
      } else {
        showToast(t('auth.codeSent'), 'success');
      }
    } catch {
      showToast(t('auth.codeSendFailed'), 'error');
    } finally {
      setSendingCode(false);
    }
  };

  const fadeDelay = (i: number) => ({ transitionDelay: `${120 + i * 80}ms` });

  return (
    <div
      className="auth-fx relative min-h-[100dvh] flex items-center justify-center overflow-hidden px-margin-mobile py-8 select-none"
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ background: AUTH_ROOT_BG }}
    >
      {/* Ambient layers — shared with the admin console and the password screens */}
      <AuthAmbience />

      {/* ═══════════ LOGIN CARD ═══════════ */}
      <div className="relative w-full max-w-[440px] z-10">
        <AuthCard wrapperClassName={`transition-all duration-700 ease-out ${showCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* ── HEADER ── */}
          <div className="text-center mb-7" style={fadeDelay(0)}>
            <AuthBrandMark fallback={brandFallback} />

            <h1 className="text-2xl sm:text-[28px] font-extrabold text-white leading-snug">
              {title}
            </h1>

            <div className="mx-auto mt-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-auth-accent to-auth-amber" />
          </div>

          {/* ── FORM ── */}
          <form onSubmit={handleSubmit} className="space-y-stack-md">

            {/* ── Phone ── */}
            <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
              style={{ transitionDelay: '200ms' }}>
              <label htmlFor={`${area}-phone`} className="block text-sm font-semibold text-white/70 mb-2">
                {t('auth.phoneNumber')}
              </label>
              <div className={fieldBox(focusedField === 'phone')}>
                <Phone size={18} className={`shrink-0 transition-colors duration-200 ${
                  focusedField === 'phone' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'
                }`} />
                <input
                  id={`${area}-phone`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  enterKeyHint="next"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                  className="flex-1 min-w-0 bg-transparent text-white text-base outline-none no-focus-floor placeholder-white/25"
                  placeholder={t('auth.teamIdentifierPlaceholder')}
                  dir="ltr"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* ── Login code ── */}
            <div className={`transition-all duration-400 ${showCard ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
              style={{ transitionDelay: '260ms' }}>
              <label htmlFor={`${area}-code`} className="block text-sm font-semibold text-white/70 mb-2">
                {t('auth.loginCode')}
              </label>
              <div className={fieldBox(focusedField === 'code')}>
                <KeyRound size={18} className={`shrink-0 transition-colors duration-200 ${
                  focusedField === 'code' ? 'text-auth-accent' : 'text-white/30 group-hover:text-white/50'
                }`} />
                <input
                  id={`${area}-code`}
                  type={showCode ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="current-password"
                  enterKeyHint="go"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onFocus={() => setFocusedField('code')}
                  onBlur={() => setFocusedField(null)}
                  className="flex-1 min-w-0 bg-transparent text-white text-base outline-none no-focus-floor placeholder-white/25 tracking-[0.3em]"
                  placeholder="••••"
                  dir="ltr"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="text-white/30 hover:text-white/60 transition-colors p-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-accent"
                  aria-pressed={showCode}
                  aria-label={showCode ? t('staff.hidePin') : t('staff.showPin')}
                >
                  {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-white/35">{t('auth.codeHint')}</p>
            </div>

            {/* ── Remember + forgot code ── */}
            <div className={`flex items-center justify-between gap-3 transition-all duration-400 ${showCard ? 'opacity-100' : 'opacity-0'}`}
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
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode}
                className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-auth-accent transition-colors disabled:opacity-50"
              >
                {sendingCode && <Spinner size="sm" />}
                {t('auth.forgotCode')}
              </button>
            </div>

            {/* ── Submit ── */}
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
                  {loading ? t('auth.signingIn') : t('auth.signIn')}
                </span>
              </button>
            </div>
          </form>

          {/* ── FOOTER ── */}
          <div className={`mt-8 pt-6 border-t border-white/5 flex items-center justify-between gap-3 transition-all duration-400 ${
            showCard ? 'opacity-100' : 'opacity-0'
          }`} style={{ transitionDelay: '500ms' }}>
            {footer}
            <button
              type="button"
              onClick={() => setLanguage(isRtl ? 'en' : 'ar')}
              className="shrink-0 text-xs text-white/30 hover:text-auth-accent/80 transition-colors"
            >
              {isRtl ? 'English' : 'العربية'}
            </button>
          </div>
        </AuthCard>

        {/* ── Watermark ── */}
        <div className={`text-center mt-6 transition-all duration-700 ${showCard ? 'opacity-40' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
          <p className="text-[10px] text-white/20 tracking-[0.2em] uppercase font-light">
            {tagline}
          </p>
        </div>
      </div>

      <PwaInstallPrompts isRtl={isRtl} appName={pwaAppName} accentColor={AUTH_ACCENT} logoInitial="ج" />
    </div>
  );
}

/** Footer link used by both portals to reach the other sign-in screens. */
export function PortalLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  const { language } = useApp();
  const ArrowIcon = language === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <Link
      to={to}
      className="group inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
    >
      {icon}
      {label}
      <ArrowIcon size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}
