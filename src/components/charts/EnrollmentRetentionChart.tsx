import { useTranslation } from 'react-i18next';
import Chart from './Chart';
import type { EnrollmentTrendRow } from '../../services/analytics';

interface Props {
  data: EnrollmentTrendRow[];
}

export default function EnrollmentRetentionChart({ data }: Props) {
  const { t } = useTranslation();
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-sm font-bold text-gray-900 mb-4">{t('dashboard.enrollmentRetentionTitle')}</h3>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-gray-400">{t('dashboard.noData')}</div>
      ) : (
        <Chart
          type="bar"
          height={280}
          categories={data.map(d => d.month?.slice(0, 7))}
          series={[{ name: t('dashboard.newMembers'), data: data.map(d => d.new_members) }]}
          colors={['#114b5f']}
          barRadius={4}
        />
      )}
    </div>
  );
}