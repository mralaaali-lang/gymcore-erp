import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle as CheckCircle2, XCircle, ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import Spinner from '../../components/ui/Spinner';
import AuthAmbience, { AUTH_ROOT_BG } from '../../components/auth/AuthAmbience';
import AuthCard from '../../components/auth/AuthCard';
import AuthBrandMark from '../../components/auth/AuthBrandMark';
import { resetPassword, type AccountType } from '../../services/api';
import { useTranslation } from 'react-i18next';

export default function ResetPasswordPage() {
  const { language } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isRtl = language === 'ar';
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;
  const { t } = useTranslation();

  const token = searchParams.get('token') || '';
  const type = (searchParams.get('type') as AccountType) || 'staff';
  const isPlatform = type === 'platform';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same identity as every other unauthenticated screen — `type` only picks
  // the endpoint and where to send the user afterwards.
  const loginLink = isPlatform ? '/login' : '/team-login';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(t('auth.invalidResetLink'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordsDontMatch'));
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password, type);
      setSuccess(true);
      setTimeout(() => navigate(loginLink), 2500);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr?.response?.data?.error || t('auth.invalidResetLinkExpired'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-fx relative min-h-[100dvh] flex items-center justify-center overflow-hidden p-margin-mobile" style={{ background: AUTH_ROOT_BG }} dir={isRtl ? 'rtl' : 'ltr'}>
        <AuthAmbience />
        <div className="relative w-full max-w-[440px] z-10">
          <AuthCard className="text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center border bg-white/[0.06] border-white/10">
              <XCircle size={30} className="text-rose-400" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-bold text-white">{t('auth.invalidLinkTitle')}</h1>
            <p className="text-sm text-white/50 mt-2">
              {t('auth.invalidLinkBody')}
            </p>
            <Link to={loginLink} className="inline-flex items-center gap-1.5 text-sm mt-6 text-auth-accent hover:text-auth-accent/80 transition-colors">
              <ArrowIcon size={14} />
              {t('auth.backToSignIn')}
            </Link>
          </AuthCard>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-fx relative min-h-[100dvh] flex items-center justify-center overflow-hidden p-margin-mobile" style={{ background: AUTH_ROOT_BG }} dir={isRtl ? 'rtl' : 'ltr'}>
      <AuthAmbience />

      <div className="relative w-full max-w-[440px] z-10">
        <AuthCard>
        {!success ? (
          <>
            <div className="text-center mb-7">
              <AuthBrandMark fallback={<Lock size={30} className="text-auth-accent" strokeWidth={1.5} />} />
              <h1 className="text-2xl sm:text-[28px] font-extrabold text-white leading-snug">
                {t('auth.setNewPasswordTitle')}
              </h1>
              <p className="text-sm text-white/50 mt-2">
                {t('auth.setNewPasswordSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-stack-md">
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {t('auth.newPassword')}
                </label>
                <div className="group flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/10 bg-white/5 transition-all duration-200 hover:border-white/20 focus-within:border-auth-accent focus-within:bg-auth-accent/5 focus-within:ring-1 focus-within:ring-auth-accent/30">
                  <Lock size={18} className="text-white/30 transition-colors duration-200 group-focus-within:text-auth-accent" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-white text-base outline-none no-focus-floor placeholder-white/25"
                    placeholder="********"
                    dir="ltr"
                    minLength={8}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {t('auth.confirmPassword')}
                </label>
                <div className="group flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/10 bg-white/5 transition-all duration-200 hover:border-white/20 focus-within:border-auth-accent focus-within:bg-auth-accent/5 focus-within:ring-1 focus-within:ring-auth-accent/30">
                  <Lock size={18} className="text-white/30 transition-colors duration-200 group-focus-within:text-auth-accent" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent text-white text-base outline-none no-focus-floor placeholder-white/25"
                    placeholder="********"
                    dir="ltr"
                    minLength={8}
                    required
                  />
                </div>
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
                  {loading ? t('auth.saving') : t('auth.savePassword')}
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
              {t('auth.passwordChangedTitle')}
            </h1>
            <p className="text-sm text-white/50 mt-2">
              {t('auth.passwordChangedBody')}
            </p>
          </div>
        )}
        </AuthCard>
      </div>
    </div>
  );
}
