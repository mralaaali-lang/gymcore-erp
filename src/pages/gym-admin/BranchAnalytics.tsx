import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { DashboardPage, StatCard, Panel, EmptyState } from '../../components/dashboard';
import { formatMoney } from '../../utils/currency';
import { formatDate, formatDateTime, fmtNum } from '../../utils/date';
import {
  getPeakHours, getRetentionRate, getRevenueForecast, getEngagement,
} from '../../services/analytics';
import { Users, Calendar, Percent, DollarSign, Clock } from 'lucide-react';

/**
 * §34ب — Analytics page rebuilt on the real server contracts.
 * The old version read fields that never existed (retention.rate, forecast
 * as an array, peak-hours .count) so every card was silently '-' or 0.
 * Every figure below comes from a typed endpoint; nulls render as '—'.
 */
export default function BranchAnalytics() {
  const { t } = useTranslation();
  const { gymProfile } = useApp();
  const currency = gymProfile?.currency;

  const { data: eng } = useApiQuery(
    ['analytics', 'engagement'],
    async () => (await getEngagement()).data,
    { staleTime: 5 * 60_000 }
  );
  const { data: retentionRows } = useApiQuery(
    ['analytics', 'retention-rate'],
    async () => (await getRetentionRate()).data,
    { staleTime: 5 * 60_000 }
  );
  const { data: forecast } = useApiQuery(
    ['analytics', 'revenue-forecast'],
    async () => (await getRevenueForecast()).data,
    { staleTime: 5 * 60_000 }
  );
  const { data: peakRows } = useApiQuery(
    ['analytics', 'peak-hours'],
    async () => (await getPeakHours()).data,
    { staleTime: 5 * 60_000 }
  );

  // 12-month retention = total renewals / total new members (null = no base).
  const rows = retentionRows ?? [];
  const totalNew = rows.reduce((s, r) => s + Number(r.new_members), 0);
  const totalRenewals = rows.reduce((s, r) => s + Number(r.renewals), 0);
  const retentionPct = totalNew > 0 ? Math.round((totalRenewals / totalNew) * 1000) / 10 : null;

  // Peak hours: fill all 24 buckets so the chart shape is honest.
  const peakByHour = new Map<number, number>();
  (peakRows ?? []).forEach((h) => peakByHour.set(Number(h.hour), Number(h.check_ins)));
  const peakBars = Array.from({ length: 24 }, (_, hour) => ({ hour, n: peakByHour.get(hour) ?? 0 }));
  const peakMax = Math.max(...peakBars.map((b) => b.n), 1);
  const hasPeakData = peakBars.some((b) => b.n > 0);

  const visits = eng?.visits;
  const classes = eng?.classes;

  return (
    <div className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        title={t('analytics.title', 'التحليلات')}
        subtitle={t('analytics.subtitle', 'زيارات الأعضاء وإشغال الكلاسات والاحتفاظ — كلها من بيانات الصالة الفعلية')}
      >
        {/* KPI row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard
            icon={Users}
            accent="emerald"
            label={t('analytics.visitRate', 'معدل الزيارات')}
            value={visits?.avg_per_member != null
              ? `${fmtNum(visits.avg_per_member, { max: 1 })} ${t('analytics.visitsPerMonth', 'زيارة/شهر')}`
              : '—'}
            trend={visits ? `${fmtNum(visits.checkins_30d)} ${t('analytics.checkins30', 'حضور/30ي')} · ${fmtNum(visits.active_members)} ${t('analytics.activeShort', 'نشط')}` : undefined}
            trendPositive
          />
          <StatCard
            icon={Calendar}
            accent="violet"
            label={t('analytics.classOccupancy', 'إشغال الكلاسات')}
            value={classes?.avg_occupancy_pct != null ? `${fmtNum(classes.avg_occupancy_pct, { max: 1 })}%` : '—'}
            trend={classes ? `${fmtNum(classes.count)} ${t('analytics.classes30d', 'كلاس (30 يوم)')}` : undefined}
            trendPositive={(classes?.avg_occupancy_pct ?? 0) >= 70}
          />
          <StatCard
            icon={Percent}
            accent="sky"
            label={t('analytics.retention12', 'الاحتفاظ (12 شهر)')}
            value={retentionPct != null ? `${fmtNum(retentionPct, { max: 1 })}%` : '—'}
            trend={totalNew > 0 ? `${fmtNum(totalRenewals)}/${fmtNum(totalNew)}` : undefined}
            trendPositive={(retentionPct ?? 0) >= 70}
          />
          <StatCard
            icon={DollarSign}
            accent="amber"
            label={t('analytics.forecast30', 'توقع إيراد 30 يوم')}
            value={forecast ? formatMoney(Number(forecast.forecast_revenue_30d), currency) : '—'}
            trend={forecast ? `${fmtNum(forecast.renewing_next_30d)} ${t('analytics.renewNext30', 'يجدد خلال 30 يوم')}` : undefined}
            trendPositive
          />
        </div>

        {/* Peak hours bar chart (last 30 days) */}
        <Panel
          icon={Clock}
          accent="rose"
          title={t('analytics.peakHours', 'أوقات الذروة')}
          subtitle={t('analytics.peakHoursSub', 'تسجيلات الحضور لكل ساعة — آخر 30 يوم')}
        >
          {hasPeakData ? (
            <div className="flex items-end gap-1.5 h-40" dir="ltr">
              {peakBars.map((b) => (
                <div key={b.hour} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${b.n}`}>
                  <div
                    className="w-full rounded-t-md bg-rose-400/80 hover:bg-rose-500 transition-colors"
                    style={{ height: `${Math.max((b.n / peakMax) * 100, b.n > 0 ? 4 : 1)}%` }}
                  />
                  <span className="text-[10px] text-gray-400 tabular-nums">{String(b.hour).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Clock}
              title={t('analytics.noPeakData', 'لا توجد تسجيلات حضور في آخر 30 يومًا')}
              description={t('analytics.noPeakDataDesc', 'سيظهر توزيع الساعات فور تسجيل أول حضور.')}
            />
          )}
        </Panel>

        {/* Class occupancy (last 30 days + upcoming) */}
        <Panel
          icon={Calendar}
          accent="violet"
          title={t('analytics.classOccupancyTitle', 'إشغال الكلاسات')}
          subtitle={t('analytics.classOccupancySub', 'محجوز ÷ سعة — آخر 30 يومًا والجدول القادم')}
        >
          {classes && classes.items.length > 0 ? (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-start p-3 font-semibold text-gray-500">{t('analytics.class', 'الكلاس')}</th>
                    <th className="text-start p-3 font-semibold text-gray-500">{t('analytics.when', 'الموعد')}</th>
                    <th className="text-start p-3 font-semibold text-gray-500">{t('analytics.bookedOfCap', 'محجوز / سعة')}</th>
                    <th className="text-start p-3 font-semibold text-gray-500 w-40">{t('analytics.occupancy', 'الإشغال')}</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.items.map((c) => {
                    const pct = c.occupancy_pct ?? 0;
                    return (
                      <tr key={c.id} className="border-b border-gray-50 last:border-0">
                        <td className="p-3 font-semibold text-gray-900">{c.title}</td>
                        <td className="p-3 text-gray-500 whitespace-nowrap">{formatDateTime(c.start_time)}</td>
                        <td className="p-3 text-gray-600 tabular-nums">{fmtNum(c.booked)} / {fmtNum(c.capacity)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-400' : 'bg-gray-300'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-600 tabular-nums w-12 text-end">{fmtNum(pct, { max: 1 })}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Calendar}
              title={t('analytics.noClasses', 'لا توجد كلاسات في آخر 30 يومًا')}
              description={t('analytics.noClassesDesc', 'أنشئ كلاسات جماعية من الجدول وسيظهر إشغالها هنا.')}
            />
          )}
        </Panel>

        {/* Monthly retention table */}
        <Panel
          icon={Percent}
          accent="sky"
          title={t('analytics.retentionMonthly', 'الاحتفاظ الشهري')}
          subtitle={t('analytics.retentionMonthlySub', 'تجديدات مقابل أعضاء جدد لكل شهر — 12 شهرًا')}
        >
          {rows.length > 0 ? (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-start p-3 font-semibold text-gray-500">{t('analytics.month', 'الشهر')}</th>
                    <th className="text-start p-3 font-semibold text-gray-500">{t('analytics.newMembers', 'أعضاء جدد')}</th>
                    <th className="text-start p-3 font-semibold text-gray-500">{t('analytics.renewals', 'تجديدات')}</th>
                    <th className="text-start p-3 font-semibold text-gray-500">{t('analytics.rate', 'النسبة')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.month} className="border-b border-gray-50 last:border-0">
                      <td className="p-3 text-gray-900 font-medium tabular-nums">{formatDate(r.month)}</td>
                      <td className="p-3 text-gray-600 tabular-nums">{fmtNum(r.new_members)}</td>
                      <td className="p-3 text-gray-600 tabular-nums">{fmtNum(r.renewals)}</td>
                      <td className="p-3 tabular-nums">
                        <span className={`font-bold ${Number(r.retention_rate) >= 70 ? 'text-emerald-600' : 'text-gray-600'}`}>
                          {fmtNum(Number(r.retention_rate), { max: 1 })}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Percent}
              title={t('analytics.noRetention', 'لا توجد اشتراكات بعد')}
              description={t('analytics.noRetentionDesc', 'يُقاس الاحتفاظ عندما يبدأ تجدد الاشتراكات الشهرية.')}
            />
          )}
        </Panel>
      </DashboardPage>
    </div>
  );
}
