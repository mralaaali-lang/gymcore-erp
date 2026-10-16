import { useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { useShellPalette, type ChartColorName } from './chartTheme';

/* ------------------------------------------------------------------ */
/*  Unified Chart wrapper – replaces recharts with apexcharts         */
/* ------------------------------------------------------------------ */

interface ChartProps {
  /** Bar | Line | Pie | Donut */
  type?: 'bar' | 'line' | 'pie' | 'donut';
  /** Series array – apexcharts format [{ name, data }] */
  series: ApexOptions['series'];
  /** X-axis categories (bar/line) */
  categories?: string[];
  /**
   * Series colours BY MEANING — the Chalk & Brass ladder read from tokens.css,
   * so a chart retints itself with the shell and never ships a raw hex.
   * A string is used for every series; an array maps series by position.
   */
  palette?: ChartColorName | ChartColorName[];
  /** Raw hex override. Prefer `palette`; this exists for one-off experiments. */
  colors?: string[];
  /** Bar border radius (default 4) */
  barRadius?: number;
  /** Height px (default 280) */
  height?: number;
  /** Show legend (default true for pie, false for bar/line) */
  showLegend?: boolean;
  /** Currency formatter for tooltips */
  currency?: string;
  /** Suffix for values (e.g. '%') */
  suffix?: string;
  /** Stacked bar chart */
  stacked?: boolean;
  /** Custom Y-axis formatter */
  yFormatter?: (v: number) => string;
  /** Extra apex options override */
  extraOptions?: ApexOptions;
}

export default function Chart({
  type = 'bar',
  series,
  categories,
  palette,
  colors,
  barRadius = 4,
  height = 280,
  showLegend,
  currency,
  suffix = '',
  stacked = false,
  yFormatter,
  extraOptions,
}: ChartProps) {
  const isPie = type === 'pie' || type === 'donut';
  const legendVisible = showLegend ?? isPie;

  // Live shell palette: eight hues + ink + surfaces, re-read when `.dark` moves.
  const shell = useShellPalette();
  const resolvedColors = useMemo(() => {
    if (colors && colors.length) return colors;
    if (!palette) return shell.series;
    const names = Array.isArray(palette) ? palette : [palette];
    const mapped = names.map((name) => shell.named[name]);
    // A single meaning on a multi-series chart keeps one hue; a partial list
    // falls back to the ladder for the series it did not name.
    if (names.length === 1) return mapped;
    return [...mapped, ...shell.series.slice(mapped.length)];
  }, [colors, palette, shell]);

  const apexType = type === 'donut' ? 'donut' : type === 'pie' ? 'pie' : type === 'line' ? 'line' : 'bar';
  const options: ApexOptions = useMemo(() => {
    // NOTE: never pass explicit `undefined` values — apexcharts' internal
    // merge overwrites its defaults with them and crashes in globalVars
    // (Cannot read properties of undefined (reading 'line')).
    const base: ApexOptions = {
      chart: {
        type: apexType,
        toolbar: { show: false },
        fontFamily: 'inherit',
        foreColor: shell.foreColor,
        sparkline: { enabled: false },
        stacked,
      },
      colors: resolvedColors,
      dataLabels: { enabled: false },
      legend: {
        show: legendVisible,
        position: 'bottom',
        horizontalAlign: 'center',
        fontSize: '11px',
      },
      tooltip: {
        enabled: true,
        shared: false,
        intersect: true,
        // The popup is shell paper, not apexcharts' default white card. This
        // apexcharts build types `style` as { fontSize, fontFamily, background }
        // only, so the ink and border come from `theme` and the surface from us.
        theme: shell.mode,
        style: {
          background: shell.surfaceColor,
        },
        y: {
          formatter: (val: number) => {
            if (currency) {
              return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(val);
            }
            if (yFormatter) return yFormatter(val);
            return val.toLocaleString('en-US') + suffix;
          },
        },
      },
    };
    if (isPie && categories && categories.length > 0) {
      base.labels = categories;
    }
    if (!isPie) {
      base.grid = { borderColor: shell.gridColor, strokeDashArray: 3 };
      base.plotOptions = { bar: { borderRadius: barRadius, columnWidth: '60%', distributed: false } };
      base.xaxis = {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { fontSize: '11px' } },
      };
      base.yaxis = {
        // §24: counts on these dashboards are small integers — without this
        // apexcharts renders 0.5/1.5 ticks that look broken to an owner.
        forceNiceScale: true,
        labels: {
          formatter: yFormatter ?? ((v) => v.toLocaleString('en-US')),
          style: { fontSize: '11px' },
        },
      };
    }
    base.responsive = [{
      breakpoint: 768,
      options: {
        chart: { height: 220 },
        legend: { position: 'bottom', fontSize: '10px' },
      },
    }];

    // Merge extra options
    if (extraOptions) {
      return deepMerge(base, extraOptions);
    }
    return base;
  }, [type, categories, resolvedColors, shell, barRadius, legendVisible, currency, suffix, stacked, yFormatter, isPie, extraOptions, apexType]);

  return (
    <ReactApexChart
      options={options}
      series={series}
      type={apexType}
      height={height}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Simple deep merge helper                                          */
/* ------------------------------------------------------------------ */
function deepMerge<T extends Record<string, any>>(target: T, source: T): T {
  const output: Record<string, any> = { ...target };
  for (const key of Object.keys(source)) {
    if (isObject(source[key]) && isObject(target[key])) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output as T;
}

function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item);
}
