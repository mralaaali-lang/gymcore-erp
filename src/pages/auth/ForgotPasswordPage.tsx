import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, ArrowLeft, ArrowRight, KeyRound, CheckCircle2 } from 'lucide-react';
import { useApp } from '../../context/GymBrandContext';
import Spinner from '../../components/ui/Spinner';
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

  const accent = isPlatform ? '#06b6d4' : '#f97316';
  const bg = isPlatform ? '#081b23' : '#0f0f1a';
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-margin-mobile" style={{ backgroundColor: bg }} dir={isRtl ? 'rtl' : 'ltr'}>
      <div
        className="absolute inset-0 opacity-40"
        style={{ background: `radial-gradient(ellipse at top center, ${accent}20 0%, transparent 60%)` }}
      />

      <div className="relative w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl p-8">
        {!submitted ? (
          <>
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
                style={{ backgroundColor: `${accent}22`, borderColor: `${accent}4d` }}
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
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 focus-within:ring-1" style={{ borderColor: undefined }}>
                <Mail size={18} className="text-white/30" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
                  placeholder={isRtl ? 'بريدك الإلكتروني' : 'Your email'}
                  dir="ltr"
                  required
                  autoFocus
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-base transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: accent }}
              >
                {loading && <Spinner size="sm" />}
                {loading ? (isRtl ? 'جاري الإرسال...' : 'Sending...') : (isRtl ? 'إرسال رابط إعادة التعيين' : 'Send reset link')}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
              style={{ backgroundColor: `${accent}22`, borderColor: `${accent}4d` }}
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

        <div className="mt-6 pt-6 border-t border-white/10 text-center">
          <Link to={backLink} className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors">
            <ArrowIcon size={14} />
            {isRtl ? 'العودة لتسجيل الدخول' : 'Back to sign in'}
          </Link>
        </div>
      </div>
    </div>
  );
}

