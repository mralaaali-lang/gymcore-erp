
import { useApp } from '../../context/GymBrandContext';
import { CARD_CLASS, CARD_CLICKABLE_CLASS } from '../dashboard/tokens';

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

/**
 * KPI chip tints, named by MEANING and resolved from the Chalk & Brass series
 * ladder in `tokens.css` — no hex here. Every icon colour clears 3:1 on its own
 * wash (the ladder is measured at 3.39–12.14 against `--card`), which the old
 * `#10b981` on `#d1fae5` did not.
 */
const colorMap: Record<string, { bg: string; icon: string }> = {
  primary: { bg: 'bg-series-3/10', icon: 'text-series-3' },
  secondary: { bg: 'bg-series-2/10', icon: 'text-series-2' },
  error: { bg: 'bg-series-6/10', icon: 'text-series-6' },
  warning: { bg: 'bg-series-1/10', icon: 'text-series-1' },
  info: { bg: 'bg-series-8/10', icon: 'text-series-8' },
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
            className={`${stat.onClick ? CARD_CLICKABLE_CLASS : CARD_CLASS} flex flex-col gap-3`}
          >
            <div className="flex items-center gap-3">
              {stat.icon && (
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${c.bg}`}>
                  <span className={`material-symbols-outlined text-2xl ${c.icon}`}>
                    {stat.icon}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-2xl md:text-3xl text-foreground font-bold tracking-tight tabular-nums">{stat.value}</span>
              {stat.trend && (
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${stat.trend.positive ? 'bg-series-3/10 text-series-3' : 'bg-series-6/10 text-series-6'}`}>
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
