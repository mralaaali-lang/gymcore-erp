import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, CheckCircle2, XCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/GymBrandContext';
import Spinner from '../../components/ui/Spinner';
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

  const accent = isPlatform ? '#06b6d4' : '#f97316';
  const bg = isPlatform ? '#081b23' : '#0f0f1a';
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
      <div className="relative min-h-screen flex items-center justify-center p-margin-mobile" style={{ backgroundColor: bg }} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="relative w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl p-8 text-center">
          <XCircle size={40} className="text-red-400 mx-auto mb-4" />
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
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-margin-mobile" style={{ backgroundColor: bg }} dir={isRtl ? 'rtl' : 'ltr'}>
      <div
        className="absolute inset-0 opacity-40"
        style={{ background: `radial-gradient(ellipse at top center, ${accent}20 0%, transparent 60%)` }}
      />

      <div className="relative w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl p-8">
        {!success ? (
          <>
            <div className="text-center mb-8">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border"
                style={{ backgroundColor: `${accent}22`, borderColor: `${accent}4d` }}
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
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5">
                  <Lock size={18} className="text-white/30" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
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
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5">
                  <Lock size={18} className="text-white/30" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="flex-1 bg-transparent text-white text-base outline-none placeholder-white/30"
                    placeholder="********"
                    dir="ltr"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-base transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ backgroundColor: accent }}
              >
                {loading && <Spinner size="sm" />}
                {loading ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ كلمة المرور' : 'Save password')}
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
              {isRtl ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully'}
            </h1>
            <p className="text-sm text-white/50 mt-2">
              {isRtl ? 'جاري تحويلك لصفحة تسجيل الدخول...' : 'Redirecting you to sign in...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
