import { useMemo } from 'react';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

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
  /** Colour palette – defaults to platform palette */
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

const DEFAULT_COLORS = ['#10b981', '#059669', '#f97316', '#22c55e', '#8b5cf6', '#ef4444', '#eab308', '#ec4899'];

export default function Chart({
  type = 'bar',
  series,
  categories,
  colors = DEFAULT_COLORS,
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
        foreColor: '#584237',
        sparkline: { enabled: false },
        stacked,
      },
      colors,
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
            return val.toLocaleString() + suffix;
          },
        },
      },
    };
    if (!isPie) {
      base.grid = { borderColor: '#f0f0f0', strokeDashArray: 3 };
      base.plotOptions = { bar: { borderRadius: barRadius, columnWidth: '60%', distributed: false } };
      base.xaxis = {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { fontSize: '11px' } },
      };
      base.yaxis = {
        labels: {
          formatter: yFormatter ?? ((v) => v.toLocaleString()),
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
  }, [type, categories, colors, barRadius, legendVisible, currency, suffix, stacked, yFormatter, isPie, extraOptions]);

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
