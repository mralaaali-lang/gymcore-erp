import type { ElementType } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Sparkline from './Sparkline';
import { ACCENTS, CARD_HOVER_CLASS, type AccentName } from './tokens';

interface StatCardProps {
  icon: ElementType;
  label: string;
  value: string | number;
  trend?: string;
  trendPositive?: boolean;
  /** §35ت — small muted caption line under the value (e.g. monthly revenue under today's). */
  sub?: string;
  sparkData?: number[];
  accent?: AccentName;
  onClick?: () => void;
}

/** KPI card — pixel-identical to GymAdminDashboard KpiCard. */
export default function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendPositive,
  sub,
  sparkData,
  accent = 'emerald',
  onClick,
}: StatCardProps) {
  const a = ACCENTS[accent];
  const Tag = onClick ? 'button' : 'div';
  // pill أخضر مميز للزيادة (‎+2 جديد‎) — باقي الـ sub يفضل نص رمادي صغير
  const subIsHighlight = !!sub && /^\+/.test(sub.trim());
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${CARD_HOVER_CLASS} text-start w-full ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: a.soft }}
        >
          <Icon size={22} strokeWidth={1.75} style={{ color: a.solid }} />
        </div>
        {trend ? (
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
              trendPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
            }`}
          >
            {trendPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {trend}
          </span>
        ) : subIsHighlight ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 bg-emerald-50 text-emerald-600">
            {sub}
          </span>
        ) : null}
      </div>
      <p className="text-2xl md:text-3xl font-extrabold text-gray-900 mt-3 tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-sm font-medium text-gray-500 mt-1">{label}</p>
      {sub && !subIsHighlight && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {sparkData && <Sparkline data={sparkData} color={a.solid} />}
    </Tag>
  );
}
