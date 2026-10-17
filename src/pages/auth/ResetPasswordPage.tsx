import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle as CheckCircle2, XCircle, ArrowLeft, ArrowRight } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import Spinner from '../../components/ui/Spinner';
import AuthAmbience, { AUTH_ACCENT, AUTH_ROOT_BG } from '../../components/auth/AuthAmbience';
import { resetPassword, type AccountType } from '../../services/api';

export default function ResetPasswordPage() {
  const { language } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isRtl = language === 'ar';
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

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
  const accent = AUTH_ACCENT;
  const loginLink = isPlatform ? '/login' : '/team-login';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(isRtl ? 'رابط إعادة التعيين غير صالح.' : 'Invalid reset link.');
      return;
    }
    if (password.length < 8) {
      setError(isRtl ? 'يجب أن تكون كلمة المرور 8 أحرف على الأقل.' : 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError(isRtl ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password, type);
      setSuccess(true);
      setTimeout(() => navigate(loginLink), 2500);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr?.response?.data?.error || (isRtl ? 'رابط إعادة التعيين غير صالح أو منتهي الصلاحية.' : 'Invalid or expired reset link.'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-fx relative min-h-[100dvh] flex items-center justify-center overflow-hidden p-margin-mobile" style={{ background: AUTH_ROOT_BG }} dir={isRtl ? 'rtl' : 'ltr'}>
        <AuthAmbience />
        <div className="relative w-full max-w-md z-10 backdrop-blur-2xl rounded-3xl border border-white/10 p-8 text-center"
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
            boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}>
          <XCircle size={40} className="text-rose-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white">{isRtl ? 'رابط غير صالح' : 'Invalid link'}</h1>
          <p className="text-sm text-white/50 mt-2">
            {isRtl ? 'رابط إعادة تعيين كلمة المرور غير صالح أو ناقص.' : 'This password reset link is invalid or incomplete.'}
          </p>
          <Link to={loginLink} className="inline-flex items-center gap-1.5 text-sm mt-6" style={{ color: accent }}>
            <ArrowIcon size={14} />
            {isRtl ? 'العودة لتسجيل الدخول' : 'Back to sign in'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-fx relative min-h-[100dvh] flex items-center justify-center overflow-hidden p-margin-mobile" style={{ background: AUTH_ROOT_BG }} dir={isRtl ? 'rtl' : 'ltr'}>
      <AuthAmbience />

      <div className="relative w-full max-w-md z-10">
        {/* Animated border glow behind card */}
        <div className="absolute -inset-[2px] rounded-3xl bg-gradient-to-br from-auth-accent/40 via-auth-amber/20 to-auth-accent/40 blur-sm" />

        <div
          className="relative backdrop-blur-2xl rounded-3xl border border-white/10 p-8"
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
            boxShadow: '0 25px 60px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
        {!success ? (
          <>
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
                style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(245,158,11,0.1) 100%)', border: '1px solid rgba(6,182,212,0.25)' }}
              >
                <Lock size={28} style={{ color: accent }} strokeWidth={1.75} />
              </div>
              <h1 className="text-2xl font-bold text-white">
                {isRtl ? 'كلمة مرور جديدة' : 'Set a new password'}
              </h1>
              <p className="text-sm text-white/50 mt-2">
                {isRtl ? 'اختر كلمة مرور قوية لحسابك' : 'Choose a strong password for your account'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-stack-md">
              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  {isRtl ? 'كلمة المرور الجديدة' : 'New password'}
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
                  {isRtl ? 'تأكيد كلمة المرور' : 'Confirm password'}
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
                  {loading ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ كلمة المرور' : 'Save password')}
                </span>
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
              style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(245,158,11,0.1) 100%)', border: '1px solid rgba(6,182,212,0.25)' }}
            >
              <CheckCircle2 size={28} style={{ color: accent }} strokeWidth={1.75} />
            </div>
            <h1 className="text-xl font-bold text-white">
              {isRtl ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully'}
            </h1>
            <p className="text-sm text-white/50 mt-2">
              {isRtl ? 'جاري تحويلك لصفحة تسجيل الدخول...' : 'Redirecting you to sign in...'}
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
