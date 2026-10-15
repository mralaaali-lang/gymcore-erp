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
  /** Icon-only (or icon + trend text) up/down pill — used by the reports money row. */
  arrow?: 'up' | 'down';
  /** §35ت — small muted caption line under the value (e.g. monthly revenue under today's). */
  sub?: string;
  /** Red pill for warning subs (e.g. «5 تنتهي») — green stays for «+N جديد». */
  subTone?: 'red';
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
  arrow,
  sub,
  subTone,
  sparkData,
  accent = 'emerald',
  onClick,
}: StatCardProps) {
  const a = ACCENTS[accent];
  const Tag = onClick ? 'button' : 'div';
  // الزيادة (‎+2 جديد‎) pill أخضر تحت خالص — باقي الـ sub نص رمادي صغير
  const subIsHighlight = !!sub && /^\+/.test(sub.trim());
  const arrowDir = arrow ?? (trend ? (trendPositive ? 'up' : 'down') : undefined);
  const arrowPositive = arrowDir === 'up';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${CARD_HOVER_CLASS} text-start w-full [container-type:inline-size] ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* الأيقونة يمين في المنتصف (أول عنصر = يمين في RTL) والنص جنبها */}
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: a.soft }}
        >
          <Icon size={22} strokeWidth={1.75} style={{ color: a.solid }} />
        </div>
        <div className="min-w-0">
          <p className="font-extrabold text-gray-900 tracking-tight tabular-nums leading-tight whitespace-nowrap text-[clamp(15px,8cqw,20px)]">
            {value}
          </p>
          <p className="font-medium text-gray-500 mt-0.5 truncate whitespace-nowrap text-[clamp(11px,4.5cqw,14px)]">{label}</p>
          {arrowDir ? (
            <span
              className={`mt-1.5 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                arrowPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
              }`}
            >
              {arrowPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {trend}
            </span>
          ) : subIsHighlight ? (
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap bg-emerald-50 text-emerald-600">
              {sub}
            </span>
          ) : subTone === 'red' && sub ? (
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap bg-red-50 text-red-600">
              {sub}
            </span>
          ) : sub ? (
            <span className="mt-1.5 block text-xs text-gray-400">{sub}</span>
          ) : null}
        </div>
      </div>
      {sparkData && <Sparkline data={sparkData} color={a.solid} />}
    </Tag>
  );
}
