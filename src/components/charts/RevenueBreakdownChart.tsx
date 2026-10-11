import { useTranslation } from 'react-i18next';
import Chart from './Chart';
import type { RevenueBreakdown } from '../../services/analytics';

const COLORS = ['#114b5f', '#f97316', '#22c55e', '#8b5cf6'];

interface Props {
  data: RevenueBreakdown;
  /** ISO code from the tenant's currency setting (§24). */
  currency?: string;
}

/**
 * Revenue sources pie. The aging-receivables pie that used to sit here was
 * removed in §24 — it duplicated the overdue card title and the real overdue
 * list now lives in its own action card (/api/dashboard/overdue-debts).
 */
export default function RevenueBreakdownChart({ data, currency }: Props) {
  const { t } = useTranslation();
  const pieData = [
    { name: t('dashboard.revenueMemberships'), value: data.memberships },
    { name: t('dashboard.revenuePos'), value: data.pos },
    { name: t('dashboard.revenuePt'), value: data.personal_training },
  ].filter((d) => d.value > 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-sm font-bold text-gray-900 mb-4">{t('dashboard.revenueTitle')}</h3>
      {pieData.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">{t('dashboard.noData')}</div>
      ) : (
        <Chart
          type="donut"
          height={260}
          series={pieData.map(d => d.value)}
          categories={pieData.map(d => d.name)}
          colors={COLORS}
          currency={currency}
          showLegend
        />
      )}
    </div>
  );
}
