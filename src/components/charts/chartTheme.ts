/**
 * chartTheme — the bridge between `tokens.css` and apexcharts.
 *
 * apexcharts paints SVG by writing colour strings into presentation attributes,
 * and `fill="hsl(var(--series-1))"` does not resolve there — CSS variables are
 * not usable in attribute values. So the shell's variables are READ BACK once
 * per theme change and handed to apexcharts as resolved hex. Charts stay on the
 * single source of colour truth without hardcoding a second palette, and the
 * dark mode of Phase 3 retints every chart the moment `.dark` moves.
 */

import { useEffect, useState } from 'react';

const SERIES_VARS = [
  '--series-1', '--series-2', '--series-3', '--series-4',
  '--series-5', '--series-6', '--series-7', '--series-8',
] as const;

/** Fallbacks mirror tokens.css :root — only used if the variable is missing. */
const FALLBACK: Record<string, string> = {
  '--series-1': '#a67c2e', '--series-2': '#1f3a2e', '--series-3': '#2f7d5f', '--series-4': '#b4562f',
  '--series-5': '#7f8f76', '--series-6': '#8c2f3a', '--series-7': '#4a4239', '--series-8': '#56636f',
  '--muted-foreground': '#665f54', '--hairline': '#efe9dd', '--brass': '#a67c2e', '--pine': '#1f3a2e',
  '--turf': '#2f7d5f', '--clay': '#b4562f', '--oxblood': '#8c2f3a', '--sage': '#7f8f76',
  '--graphite': '#4a4239', '--slate': '#56636f',
  '--card': '#fffdf9', '--border': '#e2ddd2', '--foreground': '#2b2620',
};

/** The meanings a page is allowed to ask a chart for. */
export type ChartColorName =
  | 'brass' | 'pine' | 'turf' | 'clay' | 'sage' | 'oxblood' | 'graphite' | 'slate'
  | 'positive' | 'negative' | 'warning' | 'neutral';

/**
 * Resolves a bare HSL triplet (`39.0 56.6% 41.6%`) to `#rrggbb`.
 * Anything else the variable holds (a hex, an hsl() string) is returned as-is —
 * apexcharts accepts both, and getComputedStyle on an unparseable value gives
 * the authored text anyway.
 */
export function tokenHex(name: string): string {
  if (typeof document === 'undefined') return FALLBACK[name] ?? '#000000';
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = raw || FALLBACK[name];
  if (!value) return '#000000';
  const parts = value.split(/\s+/).map((p) => parseFloat(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return value;
  const [h, s, l] = [parts[0], parts[1] / 100, parts[2] / 100];
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return (
    '#' +
    [f(0), f(8), f(4)]
      .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

export interface ShellPalette {
  /** Eight hues, ordered by semantic weight — the default series for any chart. */
  series: string[];
  /** Axis and legend ink. */
  foreColor: string;
  /** Plot gridlines. */
  gridColor: string;
  /** Popups and hovers get the shell's own paper/court, not apexcharts' white. */
  surfaceColor: string;
  borderColor: string;
  textColor: string;
  /** Which shell is active, for the few apexcharts options that take a mode. */
  mode: 'light' | 'dark';
  /** Named single-series colours, so a page asks for a meaning, not a hex. */
  named: Record<string, string>;
}

function readPalette(): ShellPalette {
  const mode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
  return {
    series: SERIES_VARS.map((v) => tokenHex(v)),
    foreColor: tokenHex('--muted-foreground'),
    gridColor: tokenHex('--hairline'),
    surfaceColor: tokenHex('--card'),
    borderColor: tokenHex('--border'),
    textColor: tokenHex('--foreground'),
    mode,
    named: {
      brass: tokenHex('--brass'),
      pine: tokenHex('--pine'),
      turf: tokenHex('--series-3'),
      clay: tokenHex('--series-4'),
      sage: tokenHex('--series-5'),
      oxblood: tokenHex('--series-6'),
      graphite: tokenHex('--series-7'),
      slate: tokenHex('--series-8'),
      /** Growth / success marks. */
      positive: tokenHex('--series-3'),
      /** Loss / churn marks. */
      negative: tokenHex('--series-6'),
      /** Warning / pending marks. */
      warning: tokenHex('--series-4'),
      /** Neutral or capacity marks. */
      neutral: tokenHex('--series-5'),
    },
  };
}

/**
 * One subscriber list for the whole app: `.dark` toggling costs a single
 * MutationObserver, however many charts are mounted.
 */
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!observer && typeof document !== 'undefined') {
    observer = new MutationObserver(() => listeners.forEach((l) => l()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

/** Live palette hook — re-renders the chart when the shell theme changes. */
export function useShellPalette(): ShellPalette {
  const [palette, setPalette] = useState<ShellPalette>(readPalette);
  useEffect(() => {
    const sync = () => setPalette(readPalette());
    sync();
    return subscribe(sync);
  }, []);
  return palette;
}

/** Non-hook form for one-off option builders (print/PWA renderers). */
export function shellPalette(): ShellPalette {
  return readPalette();
}
