
import { useApp } from '../../context/GymBrandContext';

export interface StatItem {
  /** Unique key */
  key: string;
  /** Display label */
  label: string;
  /** Display value (formatted as string) */
  value: string | number;
  /** Material Symbol icon name */
  icon?: string;
  /** Optional trend indicator */
  trend?: { value: string; positive: boolean };
  /** Color variant */
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info';
  /** Optional click handler */
  onClick?: () => void;
}

interface StatsGridProps {
  /** Array of stat items to display */
  stats: StatItem[];
  /** Number of columns (responsive: 1-4) */
  columns?: 1 | 2 | 3 | 4;
  /** Extra CSS classes */
  className?: string;
}

const colorMap: Record<string, { bg: string; icon: string }> = {
  primary: { bg: '#d1fae5', icon: '#10b981' },
  secondary: { bg: '#d1fae5', icon: '#059669' },
  error: { bg: '#ffe4e6', icon: '#f43f5e' },
  warning: { bg: '#fef3c7', icon: '#f59e0b' },
  info: { bg: '#e0f2fe', icon: '#0ea5e9' },
};

const gridCols: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * StatsGrid — Responsive grid of stat/metric cards.
 *
 * Usage:
 * ```tsx
 * const stats = [
 *   { key: 'members', label: t('الأعضاء', 'Members'), value: '1,234', icon: 'groups', color: 'primary' },
 *   { key: 'revenue', label: t('الإيرادات', 'Revenue'), value: '12.5k EGP', icon: 'payments', color: 'secondary', trend: { value: '+12%', positive: true } },
 * ];
 *
 * <StatsGrid stats={stats} columns={4} />
 * ```
 */
export default function StatsGrid({
  stats,
  columns = 4,
  className = '',
}: StatsGridProps) {
  const { language } = useApp();
  const isRtl = language === 'ar';

  return (
    <div
      className={`grid ${gridCols[columns]} gap-4 ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {stats.map((stat) => {
        const c = colorMap[stat.color || 'primary'];
        return (
          <div
            key={stat.key}
            onClick={stat.onClick}
            className={`bg-white border border-gray-100 rounded-3xl p-5 md:p-6 flex flex-col gap-3 shadow-sm ${
              stat.onClick ? 'hover:shadow-md transition-shadow duration-300 cursor-pointer' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              {stat.icon && (
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: c.bg }}>
                  <span className="material-symbols-outlined text-2xl" style={{ color: c.icon }}>
                    {stat.icon}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium text-gray-500">{stat.label}</span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-2xl md:text-3xl text-gray-900 font-bold tracking-tight">{stat.value}</span>
              {stat.trend && (
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${stat.trend.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                  <span className="material-symbols-outlined text-base">
                    {stat.trend.positive ? 'trending_up' : 'trending_down'}
                  </span>
                  {stat.trend.value}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
