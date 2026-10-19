import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Envelope as Mail, ArrowLeft, ArrowRight, Key as KeyRound, CheckCircle as CheckCircle2 } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import Spinner from '../../components/ui/Spinner';
import AuthAmbience, { AUTH_ROOT_BG } from '../../components/auth/AuthAmbience';
import AuthCard from '../../components/auth/AuthCard';
import AuthBrandMark from '../../components/auth/AuthBrandMark';
import { forgotPassword } from '../../services/api';
import { useTranslation } from 'react-i18next';

export default function ForgotPasswordPage() {
  const { language } = useApp();
  const [searchParams] = useSearchParams();
  const isRtl = language === 'ar';
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;
  const { t } = useTranslation();

  // ?area=admin (Super Admin + Gym Manager screen) vs ?area=team (Trainer/
  // Reception screen). This only decides the THEME and which account
  // type(s) we attempt — the admin screen doesn't ask upfront whether the
  // person is a platform_admin or a gym manager (two separate
  // backend tables), so it tries BOTH silently; both endpoints already
  // answer with the same generic message either way, so this leaks nothing.
  const area = searchParams.get('area') === 'team' ? 'team' : 'admin';
  const isPlatform = area === 'admin';

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One identity for the whole unauthenticated area: the admin console's
  // navy + cyan. `area` only decides which endpoint we call and where the
  // back link goes — it no longer changes the theme.
  const backLink = isPlatform ? '/login' : '/team-login';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (area === 'admin') {
        // Try both credential spaces — whichever matches (or neither)
        // returns the same generic response, so there's nothing to branch on.
        await Promise.allSettled([
          forgotPassword(email.trim(), 'platform'),
          forgotPassword(email.trim(), 'staff'),
        ]);
      } else {
        await forgotPassword(email.trim(), 'staff');
      }
      setSubmitted(true);
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-fx relative min-h-[100dvh] flex items-center justify-center overflow-hidden p-margin-mobile" style={{ background: AUTH_ROOT_BG }} dir={isRtl ? 'rtl' : 'ltr'}>
      <AuthAmbience />

      <div className="relative w-full max-w-[440px] z-10">
        <AuthCard>
        {!submitted ? (
          <>
            <div className="text-center mb-7">
              <AuthBrandMark fallback={<KeyRound size={30} className="text-auth-accent" strokeWidth={1.5} />} />
              <h1 className="text-2xl sm:text-[28px] font-extrabold text-white leading-snug">
                {t('auth.forgotTitle')}
              </h1>
              <p className="text-sm text-white/50 mt-2">
                {t('auth.forgotSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-stack-md">
              <div className="group flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/10 bg-white/5 transition-all duration-200 focus-within:border-auth-accent focus-within:bg-auth-accent/5 focus-within:ring-1 focus-within:ring-auth-accent/30 hover:border-white/20">
                <Mail size={18} className="text-white/30 transition-colors duration-200 group-focus-within:text-auth-accent" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username email"
                  enterKeyHint="send"
                  className="flex-1 min-w-0 bg-transparent text-white text-base outline-none no-focus-floor placeholder-white/25"
                  placeholder={t('auth.yourEmail')}
                  dir="ltr"
                  required
                  autoFocus
                />
              </div>

              {error && <p aria-live="polite" className="text-sm text-rose-300">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="relative w-full py-3.5 rounded-2xl text-white font-bold text-base tracking-wide overflow-hidden transition-all duration-200 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-auth-accent"
                style={{
                  background: 'var(--auth-cta-bg)',
                  boxShadow: '0 4px 20px rgba(6,182,212,0.3)',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <span className="relative flex items-center justify-center gap-2">
                  {loading && <Spinner size="sm" />}
                  {loading ? t('auth.sending') : t('auth.sendResetLink')}
                </span>
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center border bg-white/[0.06] border-white/10">
              <CheckCircle2 size={30} className="text-auth-accent" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-bold text-white">
              {t('auth.checkYourEmail')}
            </h1>
            <p className="text-sm text-white/50 mt-2 leading-relaxed">
              {t('auth.checkYourEmailBody')}
            </p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-white/5 text-center">
          <Link to={backLink} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-auth-accent transition-colors">
            <ArrowIcon size={14} />
            {t('auth.backToSignIn')}
          </Link>
        </div>
        </AuthCard>
      </div>
    </div>
  );
}

