import type { ElementType } from 'react';
import { TrendUp as TrendingUp, TrendDown as TrendingDown } from '@phosphor-icons/react';
import Sparkline from './Sparkline';
import { ACCENTS, CARD_HOVER_CLASS, type AccentName } from './tokens';
import CountUp from '../shared/CountUp';

interface StatCardProps {
  icon: ElementType;
  label: string;
  /**
   * A number counts up to its value; a string renders verbatim. Pass `format`
   * when the animated figure needs the page's own formatter (currency, units) —
   * every frame goes through it, so the last frame is exactly the string the
   * page would have printed.
   */
  value: string | number;
  format?: (n: number) => string;
  /** Opt a specific figure out of the animation. */
  countUp?: false;
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

/** KPI card — the owner dashboard's primary metric tile. */
export default function StatCard({
  icon: Icon,
  label,
  value,
  format,
  countUp,
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
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${a.chip}`}>
          <Icon size={22} strokeWidth={1.75} className={a.icon} />
        </div>
        <div className="min-w-0">
          <p className="font-extrabold text-foreground tracking-tight tabular-nums leading-tight whitespace-nowrap text-[clamp(15px,8cqw,20px)]">
            {typeof value === 'number' && countUp !== false ? (
              <CountUp value={value} format={format} />
            ) : (
              format && typeof value === 'number' ? format(value) : value
            )}
          </p>
          <p className="font-medium text-muted-foreground mt-0.5 truncate whitespace-nowrap text-[clamp(11px,4.5cqw,14px)]">{label}</p>
          {arrowDir ? (
            <span
              className={`mt-1.5 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                arrowPositive ? 'bg-series-3/10 text-series-3' : 'bg-series-6/10 text-series-6'
              }`}
            >
              {arrowPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {trend}
            </span>
          ) : subIsHighlight ? (
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap bg-series-3/10 text-series-3">
              {sub}
            </span>
          ) : subTone === 'red' && sub ? (
            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap bg-series-6/10 text-series-6">
              {sub}
            </span>
          ) : sub ? (
            <span className="mt-1.5 block text-xs text-muted-foreground">{sub}</span>
          ) : null}
        </div>
      </div>
      {sparkData && <Sparkline data={sparkData} colorVar={a.seriesVar} />}
    </Tag>
  );
}
