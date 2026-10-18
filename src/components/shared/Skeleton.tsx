/**
 * Skeleton — the shell's loading placeholder, in the shapes the product actually
 * renders. A page asks for the shape it is about to show (`SkeletonTable` where
 * a table will appear, `SkeletonStats` where the KPI row will land), so the
 * layout does not jump when data arrives.
 *
 * Rules:
 * - `bg-muted` + `animate-pulse` only. No spinner, no arbitrary gray — the fill
 *   is a shell token, so dark mode retints skeletons for free.
 * - `motion-reduce:animate-none`: with reduced motion the block is still there,
 *   it just stops pulsing.
 * - Heights are multiples of the 4px grid so a skeleton row aligns with the
 *   real row it replaces.
 */

import type { CSSProperties, ReactNode } from 'react';

export interface SkeletonProps {
  className?: string;
  /** For shapes whose size is data (a chart's bar height), not for colours. */
  style?: CSSProperties;
}

export default function Skeleton({ className = '', style }: SkeletonProps) {
  return <div style={style} className={`bg-muted rounded animate-pulse motion-reduce:animate-none ${className}`} />;
}

/** A strip of 3 shrinking text lines — subtitles, notes, member names. */
export function SkeletonText({ lines = 3, className = '' }: SkeletonProps & { lines?: number }) {
  const widths = ['w-full', 'w-5/6', 'w-2/3', 'w-3/4', 'w-1/2'];
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

/**
 * The KPI row, matching `dashboard/StatCard`'s card geometry:
 * `p-5 md:p-6` shell, then one `flex items-center gap-3` row of
 * `w-11 h-11 rounded-2xl` chip + the value and label bars stacked next to it
 * (StatCard draws the number *inside* the icon row, not under it).
 *
 * `gridClassName` lets a page pass the exact grid it renders — `FinancialReports`
 * uses `grid-cols-2 lg:grid-cols-4 gap-5`, `FinancialReport` uses
 * `grid-cols-1 sm:grid-cols-3 gap-4` — because the default mapping is
 * `StatsGrid`'s, and a ghost on different columns or a different gap jumps when
 * the cards replace it.
 */
export function SkeletonStats({ columns = 4, gridClassName }: { columns?: 1 | 2 | 3 | 4; gridClassName?: string }) {
  const cols =
    columns === 1 ? 'grid-cols-1'
      : columns === 2 ? 'grid-cols-1 sm:grid-cols-2'
        : columns === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
  // A caller-supplied grid owns the whole row layout, gap included, so passing
  // `grid-cols-2 lg:grid-cols-4 gap-5` cannot be half-overridden by our gap-4.
  const grid = gridClassName ? `grid ${gridClassName}` : `grid ${cols} gap-4`;
  return (
    <div className={grid} aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="bg-card rounded-shell border border-hairline p-5 md:p-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-11 h-11 rounded-2xl shrink-0" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Card + header + body — the panel shape used across the dashboards. */
export function SkeletonCard({ className = '' }: SkeletonProps) {
  return (
    <div className={`bg-card rounded-shell border border-hairline p-5 md:p-6 ${className}`} aria-hidden="true">
      <div className="flex items-center justify-between gap-4 mb-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <SkeletonText lines={4} />
    </div>
  );
}

/**
 * The `dashboard/Panel` shell with a loading body inside it — for the screens
 * whose loading state is a whole report page, not one table.
 *
 * The geometry is `Panel`'s own (`CARD_CLASS` = `bg-card rounded-shell border
 * border-hairline p-5 md:p-6`, header `flex … gap-3 mb-5`, chip `w-9 h-9
 * rounded-xl`), so the page does not jump when the real panel replaces it. The
 * body is the caller's: `<SkeletonTable bare/>` where a table lands,
 * `<SkeletonChart/>` where a plot lands — a `bare` child, because this shell
 * already owns the card.
 */
export function SkeletonPanel({ children }: { children?: ReactNode }) {
  return (
    <section className="bg-card rounded-shell border border-hairline p-5 md:p-6" aria-hidden="true">
      <div className="flex items-center gap-3 mb-5">
        <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
        <Skeleton className="h-5 w-40" />
      </div>
      {children}
    </section>
  );
}

/** Plot placeholder at the same height a chart will render at. */
export function SkeletonChart({ height = 280 }: { height?: number }) {
  const bars = [0.45, 0.7, 0.55, 0.9, 0.6, 0.8, 0.5, 0.68, 0.4, 0.75, 0.62, 0.85];
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex items-end gap-2" style={{ height: `${height - 40}px` }}>
        {bars.map((b, i) => (
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${b * 100}%` }} />
        ))}
      </div>
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** Table shell: header row + N body rows, matching DataTable's metrics.
 *
 * `rows`/`cols` come from the caller so the placeholder is the grid it replaces
 * (a 9-column debts table does not load into a 5-column ghost). `bare` is the
 * same contract as `DataTable.bare`: inside a `Panel` the panel already owns
 * the keyline, radius and surface, so the skeleton must not draw a second card
 * around the ghost rows.
 *
 * Row geometry is not per-page guesswork: the ghost uses the *same padding and
 * line box* as a real `DataTable` cell, so the floor is identical —
 * non-dense `px-4 py-3` + a 20px bar = 44px (+ the 1px hairline) and dense
 * `px-3 py-2` + 20px = 36px, which is exactly what `DataTable` draws for
 * `text-sm` rows. Headers keep `text-xs`'s 16px line box, so they are
 * 40px / 32px in the two modes.
 *
 * `rowHeight` is for the tables whose real rows carry two-line cells (a name
 * over a card code, an amount over a «rest» line). Those rows are
 * content-driven, so the 44px floor is wrong for them and the page jumps when
 * data lands. The value is a LIVE MEASUREMENT of that table's row, never a
 * guess — the waves' reports record where each number was measured. At or above
 * 52px the ghost also switches to a stacked pair of bars, so the inside of the
 * row reads like the two-line cell it stands in for. The pair is deliberately
 * short — `h-4` (16) + `gap-1.5` (6) + `h-3` (12) = 34px — so it still fits a
 * DENSE pinned row (dense padding is 16px, 16 + 34 = 50 ≤ 52) instead of
 * overflowing it.
 */
export function SkeletonTable({
  rows = 6,
  cols = 5,
  bare = false,
  dense = false,
  rowHeight,
}: {
  rows?: number;
  cols?: number;
  bare?: boolean;
  dense?: boolean;
  rowHeight?: number;
}) {
  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';
  const twoLine = (rowHeight ?? 0) >= 52;
  return (
    <div
      className={`${bare ? '' : 'bg-card rounded-shell border border-hairline '}overflow-hidden`}
      aria-hidden="true"
    >
      <div className={`flex gap-4 ${pad} bg-muted border-b border-hairline`}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === 0 ? 'w-32' : 'flex-1'}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={rowHeight ? { height: rowHeight } : undefined}
          className={`flex gap-4 items-center ${pad} border-b border-hairline last:border-b-0`}
        >
          {Array.from({ length: cols }).map((_, c) =>
            twoLine ? (
              <div key={c} className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ) : (
              <Skeleton key={c} className={`h-5 ${c === 0 ? 'w-32' : 'flex-1'}`} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

/** Announces nothing to screen readers: the shapes are decorative by design,
 *  and the page's real loading message (if any) belongs on the caller. */
export function SkeletonRows({ count = 3, className = '' }: SkeletonProps & { count?: number }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Two-line link/record list — the ghost for the `divide-y` lists the report
 * panels draw (`py-3` row + `w-10 h-10 rounded-xl` chip + a bold title over a
 * smaller description). Mirrors that recipe at 58px a row against the real
 * ~60px, with the shell's own `hairline` separators rather than `gray-100`.
 */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-hairline" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
