import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';

const STORAGE_KEY = 'gymcore-trial-banner-dismissed';

export default function TrialBanner() {
  const { language, role, gymProfile } = useApp();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  // §29 — real trial data only: show when gym_trials says days remain
  // (from /auth/me). No trial record / expired → no banner.
  const days = gymProfile?.trial_days_remaining;
  if (dismissed || !days || days <= 0) return null;

  const roleBase = role === 'super-admin' ? '/super-admin' : '/admin';

  return (
    <div className="bg-[#0a0a0f] text-white/85 text-caption md:text-label-md px-4 py-1.5 flex items-center justify-center gap-3 shrink-0 z-50">
      <span className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] inline-block animate-pulse shrink-0" />
        {language === 'ar'
          ? `تبقّى ${days} يوماً على الفترة التجريبية المجانية — `
          : `${days} days left on your free trial — `}
        <button
          type="button"
          onClick={() => navigate(`${roleBase}/settings?tab=billing`)}
          className="text-[#4ade80] hover:text-[#86efac] underline underline-offset-2 font-semibold transition-colors"
        >
          {language === 'ar' ? 'ترقية الآن' : 'Upgrade now'}
        </button>
      </span>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, '1');
          setDismissed(true);
        }}
        className="text-white/40 hover:text-white/70 p-0.5 transition-colors"
        aria-label={language === 'ar' ? 'إغلاق' : 'Dismiss'}
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  );
}

