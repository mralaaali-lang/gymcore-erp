import type { ReactNode } from 'react';
import { useApp } from '../../context/GymBrandContext';

interface DashboardPageProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Standard page shell — dashboard header (title + subtitle + actions)
 * inside a `space-y-6` container. RTL-aware. Title/subtitle are optional:
 * the manager dashboard moved gym name/date/plan to the sidebar brand
 * block (§33أ-تنظيف), so it renders with an actions-only header.
 */
export default function DashboardPage({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: DashboardPageProps) {
  const { language } = useApp();
  const isRtl = language === 'ar';
  return (
    <div className={`space-y-6 ${className}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between flex-wrap gap-3">
          {title && (
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
              {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
            </div>
          )}
          {!title && subtitle && <div><p className="text-sm text-gray-500 mt-1">{subtitle}</p></div>}
          {actions && <div className="flex items-center gap-2 flex-wrap ms-auto">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Primary dark button (dashboard pattern: `+ Add new …`). */
export function PrimaryAction({
  children,
  onClick,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center gap-2 bg-emerald-500 text-white text-sm font-bold px-4 py-2.5 rounded-2xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-600 active:scale-[0.98] transition-all ${className}`}
    >
      {children}
    </button>
  );
}

/** Secondary white bordered button (dashboard pattern: `Select dates …`). */
export function SecondaryAction({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all ${className}`}
    >
      {children}
    </button>
  );
}

/** Accent emerald CTA (dashboard pattern: schedule/book buttons). */
export function AccentAction({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm shadow-emerald-500/25 active:scale-[0.98] transition-all ${className}`}
    >
      {children}
    </button>
  );
}
