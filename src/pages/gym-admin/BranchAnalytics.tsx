import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import api from '../../services/api';

export default function BranchAnalytics() {
  const { language } = useApp();

  const { data: retentionData, isLoading: retentionLoading } = useQuery({
    queryKey: ['retention-rate'],
    queryFn: () => api.get('/api/analytics/retention-rate').then((r) => r.data),
  });

  const { data: peakHoursData, isLoading: peakLoading } = useQuery({
    queryKey: ['peak-hours'],
    queryFn: () => api.get('/api/analytics/peak-hours').then((r) => r.data),
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: ['revenue-forecast'],
    queryFn: () => api.get('/api/analytics/revenue-forecast').then((r) => r.data),
  });

  const retention = retentionData?.data || {};
  const peakHours = peakHoursData?.data || [];
  const forecast = forecastData?.data || [];

  const maxForecast = Array.isArray(forecast) ? Math.max(...forecast.map((m: any) => m.value || 0), 1) : 1;

  const isLoading = retentionLoading || peakLoading || forecastLoading;

  if (isLoading) {
    return (
      <div dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">التحليلات</h1>
        <div className="text-center py-12 text-gray-500">جاري التحميل...</div>
      </div>
    );
  }

  const statCards = [
    { label: 'معدل الاحتفاظ', value: retention.rate ? `${retention.rate}%` : '-', icon: 'group', color: 'primary', trend: retention.trend },
    { label: 'أوقات الذروة', value: Array.isArray(peakHours) ? `${peakHours.length} فترات` : '-', icon: 'schedule', color: '#006c49', trend: null },
    { label: 'توقعات الإيرادات', value: forecast.current_month ? `${forecast.current_month.toLocaleString()} ر.س` : '-', icon: 'trending_up', color: '#8b5cf6', trend: null },
  ];

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">التحليلات</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-surface-variant p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.color}15` }}>
                <span className="material-symbols-outlined" style={{ color: s.color }}>{s.icon}</span>
              </div>
              {s.trend && (
                <span className={`text-xs font-medium ${s.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {s.trend > 0 ? '+' : ''}{s.trend}%
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
          </div>
        ))}
      </div>

      {Array.isArray(forecast) && forecast.length > 0 && (
        <div className="bg-white rounded-2xl border border-surface-variant p-5 mb-6">
          <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">trending_up</span>
            توقعات الإيرادات
          </h2>
          <div className="flex items-end gap-3 h-40">
            {forecast.map((m: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg transition-all hover:opacity-80" style={{ height: `${(m.value / maxForecast) * 100}%`, backgroundColor: 'primary', minHeight: '12px' }} />
                <span className="text-xs text-gray-500 mt-1">{m.month || m.label || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(peakHours) && peakHours.length > 0 && (
        <div className="bg-white rounded-2xl border border-surface-variant p-5">
          <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#006c49]">schedule</span>
            أوقات الذروة
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-variant">
                  <th className="text-right p-3 font-medium text-gray-500">#</th>
                  <th className="text-right p-3 font-medium text-gray-500">الفترة</th>
                  <th className="text-right p-3 font-medium text-gray-500">عدد الزوار</th>
                </tr>
              </thead>
              <tbody>
                {peakHours.map((ph: any, i: number) => (
                  <tr key={i} className="border-b border-surface-variant last:border-0">
                    <td className="p-3 text-gray-500">{i + 1}</td>
                    <td className="p-3 font-medium text-gray-800">{ph.hour || ph.time || ph.label || '-'}</td>
                    <td className="p-3 text-gray-600">{ph.count || ph.visitors || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!Array.isArray(forecast) && !Array.isArray(peakHours) && !retention.rate && (
        <div className="text-center py-12 text-gray-400">لا توجد بيانات تحليلات متاحة</div>
      )}
    </div>
  );
}
