import { useMemo } from 'react';
import Chart from '../../../components/charts/Chart';
import { Users, UserMinus, TrendDown } from '@phosphor-icons/react';
import PageLoader from '../../../components/shared/PageLoader';
import type { ChurnAnalysisResponse } from '../../../services/api';


interface Props {
  data: ChurnAnalysisResponse | undefined;
  isLoading: boolean;
  t: (ar: string, en: string) => string;
  formatCurrency: (n: number) => string;
}

export default function ChurnReport({ data, isLoading, t }: Props) {
  const churn = data;

  const churnRateData = useMemo(() => {
    if (!churn?.monthly_churn) return [];
    return churn.monthly_churn.map((r: any) => ({
      month: r.month,
      churned: r.churned,
      rate: r.total_members > 0 ? ((r.churned / r.total_members) * 100).toFixed(2) : 0,
    }));
  }, [churn]);

  if (isLoading) {
    return (
      <PageLoader />
    );
  }

  if (!churn) {
    return <p className="text-center text-gray-500/50 py-10">{t('لا توجد بيانات', 'No data available')}</p>;
  }

  const stats = churn.stats;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-blue-600" />
            <span className="text-[10px] text-gray-500/60">{t('إجمالي الأعضاء', 'Total Members')}</span>
          </div>
          <p className="text-lg font-bold text-gray-900">{stats?.total_members?.toLocaleString('en-US') || 0}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <UserMinus size={14} className="text-red-600" />
            <span className="text-[10px] text-gray-500/60">{t('إجمالي المتبعدين', 'Total Churned')}</span>
          </div>
          <p className="text-lg font-bold text-red-600">{stats?.total_churned?.toLocaleString('en-US') || 0}</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendDown size={14} className="text-orange-600" />
            <span className="text-[10px] text-gray-500/60">{t('معدل التخلي', 'Churn Rate')}</span>
          </div>
          <p className="text-lg font-bold text-orange-600">{stats?.overall_churn_rate || 0}%</p>
        </div>
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <UserMinus size={14} className="text-amber-600" />
            <span className="text-[10px] text-gray-500/60">{t('متتبعدين هذا الشهر', 'Churned This Month')}</span>
          </div>
          <p className="text-lg font-bold text-amber-600">{stats?.churned_this_month || 0}</p>
        </div>
      </div>

      {/* Monthly Churn Chart */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-3">{t('اتجاه التخلي الشهري', 'Monthly Churn Trend')}</h3>
        <div className="h-72">
          <Chart
            type="bar"
            height={288}
            categories={churnRateData.map(d => d.month)}
            series={[{ name: t('المتبعدين', 'Churned'), data: churnRateData.map(d => d.churned) }]}
            colors={['#ef4444']}
            barRadius={3}
          />
        </div>
      </div>

      {/* Churn by Gym & Reasons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Gym */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-2">{t('التخلي حسب الصالة', 'Churn by Gym')}</h3>
          <div className="space-y-1.5">
            {churn.churn_by_gym?.slice(0, 10).map((g: any) => (
              <div key={g.id} className="bg-white border border-gray-100 rounded-lg p-2.5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-gray-900">{g.name}</span>
                  <span className="text-xs font-bold text-red-600">{g.churn_rate}%</span>
                </div>
                <div className="flex gap-3 text-[10px] text-gray-500/60">
                  <span>{t('متبعدين', 'Churned')}: {g.churned}</span>
                  <span>{t('إجمالي', 'Total')}: {g.total_members}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(g.churn_rate, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reasons */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-2">{t('أسباب التخلي', 'Churn Reasons')}</h3>
          {churn.churn_reasons?.length > 0 ? (
            <div className="h-72">
              <Chart
                type="donut"
                height={288}
                series={churn.churn_reasons.map((r: any) => r.count)}
                categories={churn.churn_reasons.map((r: any) => r.reason)}
                colors={['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']}
                showLegend
                extraOptions={{
                  plotOptions: {
                    pie: {
                      donut: { labels: { show: false } },
                      expandOnClick: true,
                    },
                  },
                  dataLabels: {
                    enabled: true,
                    formatter: (_val: number, opts: any) => `${opts.w.globals.labels[opts.seriesIndex]} ${opts.w.globals.seriesPercent[opts.seriesIndex]?.toFixed(0) || 0}%`,
                    style: { fontSize: '10px' },
                  },
                }}
              />
            </div>
          ) : (
            <p className="text-xs text-gray-500/50 text-center py-10">{t('لا توجد أسباب مسجلة', 'No reasons recorded')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
