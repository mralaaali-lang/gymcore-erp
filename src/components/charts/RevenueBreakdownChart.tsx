import { useTranslation } from 'react-i18next';
import Chart from './Chart';
import type { RevenueBreakdown } from '../../services/analytics';

const COLORS = ['#114b5f', '#f97316', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6'];

interface Props {
  data: RevenueBreakdown;
}

export default function RevenueBreakdownChart({ data }: Props) {
  const { t } = useTranslation();
  const pieData = [
    { name: t('dashboard.revenueMemberships'), value: data.memberships },
    { name: t('dashboard.revenuePos'), value: data.pos },
    { name: t('dashboard.revenuePt'), value: data.personal_training },
  ].filter((d) => d.value > 0);

  const aging = data.aging_receivables;
  const agingData = [
    { name: t('dashboard.agingCurrent'), value: aging.current },
    { name: t('dashboard.aging30'), value: aging.aging_1_30 },
    { name: t('dashboard.aging60'), value: aging.aging_31_60 },
    { name: t('dashboard.aging90'), value: aging.aging_60_plus },
  ].filter((d) => d.value > 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-4">{t('dashboard.revenueTitle')}</h3>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">{t('dashboard.noData')}</div>
          ) : (
            <Chart
              type="pie"
              height={220}
              series={pieData.map(d => d.value)}
              categories={pieData.map(d => d.name)}
              colors={COLORS}
              currency="EGP"
              showLegend
            />
          )}
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-4">{t('dashboard.agingReceivablesTitle')}</h3>
          {agingData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">{t('dashboard.noOverduePayments')}</div>
          ) : (
            <Chart
              type="pie"
              height={220}
              series={agingData.map(d => d.value)}
              categories={agingData.map(d => d.name)}
              colors={COLORS.slice(3)}
              currency="EGP"
              showLegend
            />
          )}
        </div>
      </div>
    </div>
  );
}