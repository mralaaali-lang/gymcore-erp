import { useTranslation } from 'react-i18next';
import Chart from './Chart';
import type { PeakHourRow } from '../../services/analytics';

interface Props {
  data: PeakHourRow[];
}

export default function PeakHoursChart({ data }: Props) {
  const { t } = useTranslation();
  const chartData = Array.from({ length: 24 }, (_, h) => {
    const found = data.find((d) => d.hour === h);
    return { hour: `${h}:00`, check_ins: found?.check_ins || 0 };
  });

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-sm font-bold text-gray-900 mb-1">{t('dashboard.peakHoursTitle')}</h3>
      <p className="text-xs text-gray-400 mb-4">{t('dashboard.peakHoursSubtitle')}</p>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-gray-400">{t('dashboard.noData')}</div>
      ) : (
        <Chart
          type="bar"
          height={280}
          categories={chartData.map(d => d.hour)}
          series={[{ name: t('dashboard.attendanceCount'), data: chartData.map(d => d.check_ins) }]}
          colors={['#f97316']}
          barRadius={4}
        />
      )}
    </div>
  );
}