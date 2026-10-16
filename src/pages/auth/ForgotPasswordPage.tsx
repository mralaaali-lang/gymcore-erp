import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Envelope as Mail, ArrowLeft, ArrowRight, Key as KeyRound, CheckCircle as CheckCircle2 } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import Spinner from '../../components/ui/Spinner';
import AuthAmbience, { AUTH_ACCENT, AUTH_ROOT_BG } from '../../components/auth/AuthAmbience';
import { forgotPassword } from '../../services/api';

export default function ForgotPasswordPage() {
  const { language } = useApp();
  const [searchParams] = useSearchParams();
  const isRtl = language === 'ar';
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

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
  const accent = AUTH_ACCENT;
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
      setError(isRtl ? 'حدث خطأ، حاول مرة أخرى.' : 'Something went wrong, please try again.');
    } finally {
      setLoading(false);
    }
  };

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
        {!submitted ? (
          <>
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
                style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.2) 0%, rgba(245,158,11,0.1) 100%)', border: '1px solid rgba(6,182,212,0.25)' }}
              >
                <KeyRound size={28} style={{ color: accent }} strokeWidth={1.75} />
              </div>
              <h1 className="text-2xl font-bold text-white">
                {isRtl ? 'نسيت كلمة المرور؟' : 'Forgot your password?'}
              </h1>
              <p className="text-sm text-white/50 mt-2">
                {isRtl
                  ? 'أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور'
                  : "Enter your email and we'll send you a reset link"}
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
                  className="flex-1 min-w-0 bg-transparent text-white text-base outline-none placeholder-white/25"
                  placeholder={isRtl ? 'بريدك الإلكتروني' : 'Your email'}
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
                  {loading ? (isRtl ? 'جاري الإرسال...' : 'Sending...') : (isRtl ? 'إرسال رابط إعادة التعيين' : 'Send reset link')}
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
              {isRtl ? 'تحقق من بريدك الإلكتروني' : 'Check your email'}
            </h1>
            <p className="text-sm text-white/50 mt-2 leading-relaxed">
              {isRtl
                ? 'إذا كان البريد الإلكتروني مسجلاً لدينا، سيصلك رابط لإعادة تعيين كلمة المرور خلال دقائق.'
                : "If that email is registered, you'll receive a reset link within a few minutes."}
            </p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-white/5 text-center">
          <Link to={backLink} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-auth-accent transition-colors">
            <ArrowIcon size={14} />
            {isRtl ? 'العودة لتسجيل الدخول' : 'Back to sign in'}
          </Link>
        </div>
        </div>
      </div>
    </div>
  );
}

