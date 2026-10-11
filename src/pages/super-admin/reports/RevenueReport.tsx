import { useMemo } from 'react';
import Chart from '../../../components/charts/Chart';
import { CurrencyDollar, Receipt, Warning } from '@phosphor-icons/react';
import PageLoader from '../../../components/shared/PageLoader';
import type { RevenueTrendResponse } from '../../../services/api';

interface Props {
  data: RevenueTrendResponse | undefined;
  isLoading: boolean;
  period: number;
  onPeriodChange: (p: number) => void;
  onRefresh: () => void;
  t: (ar: string, en: string) => string;
  formatCurrency: (n: number) => string;
}

export default function RevenueReport({ data, isLoading, period, onPeriodChange, t, formatCurrency }: Props) {
  const revenue = data;
  const summary = revenue?.summary;

  const comparisonData = useMemo(() => {
    if (!revenue?.current_period) return [];
    const map = new Map(revenue.previous_period?.map((r: any) => [r.month, r.revenue]) || []);
    return revenue.current_period.map((r: any) => ({
      month: r.month,
      current: r.revenue,
      previous: map.get(r.month) || 0,
    }));
  }, [revenue]);

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  if (!revenue) {
    return <p className="text-center text-gray-500/50 py-10">{t('لا توجد بيانات', 'No data available')}</p>;
  }

  return (
    <div className="space-y-5">
      {/* Period selector + KPIs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500/70">{t('الفترة:', 'Period:')}</span>
          {[3, 6, 12, 24].map(p => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-primary text-white'
                  : 'bg-gray-50 text-gray-500/70 hover:bg-gray-200'
              }`}
            >
              {p} {t('شهر', 'mo')}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CurrencyDollar size={14} className="text-green-600" />
            <span className="text-[10px] text-gray-500/60">{t('الإيرادات الحالية', 'Current Revenue')}</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(summary?.current_revenue || 0)}</p>
          {summary && summary.change_percentage !== 0 && (
            <p className={`text-[10px] mt-0.5 ${summary.change_percentage >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {summary.change_percentage >= 0 ? 'â†‘' : 'â†“'} {Math.abs(summary.change_percentage).toFixed(1)}% {t('مقارنة بالفترة السابقة', 'vs previous')}
            </p>
          )}
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CurrencyDollar size={14} className="text-blue-600" />
            <span className="text-[10px] text-gray-500/60">{t('الفترة السابقة', 'Previous Revenue')}</span>
          </div>
          <p className="text-lg font-bold text-gray-500/70">{formatCurrency(summary?.previous_revenue || 0)}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Receipt size={14} className="text-amber-600" />
            <span className="text-[10px] text-gray-500/60">{t('المدفوعات المعلقة', 'Pending')}</span>
          </div>
          <p className="text-lg font-bold text-gray-500">{formatCurrency(summary?.total_pending || 0)}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Warning size={14} className="text-red-600" />
            <span className="text-[10px] text-gray-500/60">{t('المتأخرات', 'Overdue')}</span>
          </div>
          <p className="text-lg font-bold text-red-600">{formatCurrency(summary?.total_overdue || 0)}</p>
        </div>
      </div>

      {/* Revenue Comparison Chart */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">{t('مقارنة الإيرادات', 'Revenue Comparison')}</h3>
        <div className="h-72">
          <Chart
            type="bar"
            height={288}
            categories={comparisonData.map(d => d.month)}
            series={[
              { name: t('الحالي', 'Current'), data: comparisonData.map(d => d.current) },
              { name: t('السابق', 'Previous'), data: comparisonData.map(d => d.previous) },
            ]}
            colors={['#114b5f', '#06b6d4']}
            barRadius={3}
            showLegend
          />
        </div>
      </div>

      {/* Monthly Trend Line */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">{t('اتجاه الإيرادات الشهرية', 'Monthly Revenue Trend')}</h3>
        <div className="h-64">
          <Chart
            type="line"
            height={256}
            categories={revenue.current_period.map((r: any) => r.month)}
            series={[
              { name: t('الإيرادات', 'Revenue'), data: revenue.current_period.map((r: any) => r.revenue) },
              { name: t('معلق', 'Pending'), data: revenue.current_period.map((r: any) => r.pending) },
            ]}
            colors={['#114b5f', '#f97316']}
            showLegend
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-right text-gray-500">{t('الشهر', 'Month')}</th>
              <th className="p-2 text-right text-gray-500">{t('الفواتير', 'Invoices')}</th>
              <th className="p-2 text-right text-gray-500">{t('الإيرادات', 'Revenue')}</th>
              <th className="p-2 text-right text-gray-500">{t('معلق', 'Pending')}</th>
              <th className="p-2 text-right text-gray-500">{t('متأخر', 'Overdue')}</th>
            </tr>
          </thead>
          <tbody>
            {revenue.current_period?.map((r: any, i: number) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="p-2 font-medium text-gray-900">{r.month}</td>
                <td className="p-2 text-gray-500/70">{r.invoice_count}</td>
                <td className="p-2 font-bold text-green-700">{formatCurrency(r.revenue)}</td>
                <td className="p-2 text-amber-600">{formatCurrency(r.pending)}</td>
                <td className="p-2 text-red-600">{formatCurrency(r.overdue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
