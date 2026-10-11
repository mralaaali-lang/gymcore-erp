import React from 'react';
import { useApp } from '../../context/GymBrandContext';

interface PageHeaderProps {
  /** Page title displayed in large text */
  title: string;
  /** Optional subtitle/description below the title */
  subtitle?: string;
  /** Optional breadcrumbs for navigation context */
  breadcrumbs?: { label: string; onClick?: () => void }[];
  /** Action buttons rendered on the right (LTR) or left (RTL) side */
  actions?: React.ReactNode;
  /** Optional icon (Material Symbol name) displayed before the title */
  icon?: string;
  /** Optional icon color (Tailwind class, e.g., 'text-petrol') */
  iconColor?: string;
  /** Extra CSS classes */
  className?: string;
}

/**
 * PageHeader — Standardized page header with title, subtitle, breadcrumbs, and actions.
 *
 * Usage:
 * ```tsx
 * <PageHeader
 *   title={t('عنوان الصفحة', 'Page Title')}
 *   subtitle={t('وصف', 'Description')}
 *   icon='dashboard'
 *   actions={<Button variant='primary'>{t('إضافة', 'Add')}</Button>}
 * />
 * ```
 */
export default function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  icon,
  className = '',
}: PageHeaderProps) {
  const { language } = useApp();
  const isRtl = language === 'ar';

  return (
    <div
      className={`flex flex-col gap-3 mb-6 ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-gray-500">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span className="material-symbols-outlined text-base text-gray-400">
                  {isRtl ? 'chevron_left' : 'chevron_right'}
                </span>
              )}
              {crumb.onClick ? (
                <button
                  onClick={crumb.onClick}
                  className="hover:text-gray-900 transition-colors cursor-pointer"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-gray-900 font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Title Row */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {icon &&
            (typeof icon === 'string' ? (
              <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0">
                <span className={`material-symbols-outlined text-2xl text-white`}>
                  {icon}
                </span>
              </span>
            ) : (
              icon
            ))}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2" dir={isRtl ? 'rtl' : 'ltr'}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
