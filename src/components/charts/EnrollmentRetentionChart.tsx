import { useTranslation } from 'react-i18next';
import Chart from './Chart';
import type { EnrollmentTrendRow } from '../../services/analytics';

interface Props {
  data: EnrollmentTrendRow[];
}

export default function EnrollmentRetentionChart({ data }: Props) {
  const { t } = useTranslation();
  return (
    <div className="bg-card rounded-shell border border-hairline p-6">
      <h3 className="text-sm font-bold text-foreground mb-4">{t('dashboard.enrollmentRetentionTitle')}</h3>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">{t('dashboard.noData')}</div>
      ) : (
        <Chart
          type="bar"
          height={280}
          categories={data.map(d => d.month?.slice(0, 7))}
          series={[
            { name: t('dashboard.newMembers'), data: data.map(d => d.new_members) },
            // §24: second series from the extended enrollment-trend endpoint —
            // the chart title promised "vs cancellations" but only one series existed.
            { name: t('dashboard.cancellations'), data: data.map(d => d.cancellations ?? 0) },
          ]}
          palette={['positive', 'negative']}
          barRadius={4}
          showLegend
        />
      )}
    </div>
  );
}