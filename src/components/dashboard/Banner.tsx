import type { ReactNode } from 'react';

type BannerTone = 'cyan' | 'dark' | 'emerald' | 'violet' | 'amber';

const tones: Record<BannerTone, string> = {
  cyan: 'bg-gradient-to-br from-cyan-500 to-cyan-600 shadow-cyan-500/20',
  dark: 'bg-gradient-to-br from-gray-800 to-gray-900 shadow-gray-900/20',
  emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20',
  violet: 'bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/20',
  amber: 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/20',
};

interface BannerProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: BannerTone;
  progress?: number;
  progressLabel?: string;
  className?: string;
}

/** Gradient banner — matches dashboard setup banner. */
export default function Banner({
  title,
  description,
  actions,
  tone = 'emerald',
  progress,
  progressLabel,
  className = '',
}: BannerProps) {
  return (
    <div className={`${tones[tone]} rounded-3xl p-6 md:p-8 text-white shadow-lg ${className}`}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h2>
          {description && <p className="text-sm text-white/80 mt-1 max-w-2xl">{description}</p>}
          {typeof progress === 'number' && (
            <div className="mt-4 max-w-md">
              <div className="h-2 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
              </div>
              {progressLabel && <p className="text-xs text-white/80 mt-1.5">{progressLabel}</p>}
            </div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
