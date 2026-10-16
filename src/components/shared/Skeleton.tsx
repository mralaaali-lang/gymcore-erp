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

import type { CSSProperties } from 'react';

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

/** The KPI row, matching StatsGrid's column logic and card geometry. */
export function SkeletonStats({ columns = 4 }: { columns?: 1 | 2 | 3 | 4 }) {
  const cols =
    columns === 1 ? 'grid-cols-1'
      : columns === 2 ? 'grid-cols-1 sm:grid-cols-2'
        : columns === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';
  return (
    <div className={`grid ${cols} gap-4`} aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="bg-card rounded-shell border border-hairline p-5 md:p-6 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="w-11 h-11 rounded-2xl shrink-0" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-32" />
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

/** Table shell: header row + N body rows, matching DataTable's metrics. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-card rounded-shell border border-hairline overflow-hidden" aria-hidden="true">
      <div className="flex gap-4 px-4 py-3 bg-muted border-b border-hairline">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === 0 ? 'w-32' : 'flex-1'}`} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 items-center px-4 py-3.5 border-b border-hairline last:border-b-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-32' : 'flex-1'}`} />
          ))}
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
