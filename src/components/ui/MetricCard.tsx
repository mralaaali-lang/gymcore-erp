import { useApp } from '../../context/GymBrandContext';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: string;
  trend?: { value: string; positive: boolean };
  color?: 'primary' | 'secondary' | 'error' | 'warning';
}

const colorMap: Record<string, { bg: string; icon: string; trend: string }> = {
  primary: { bg: '#d1fae5', icon: '#10b981', trend: 'text-emerald-600' },
  secondary: { bg: '#d1fae5', icon: '#059669', trend: 'text-emerald-600' },
  error: { bg: '#ffe4e6', icon: '#f43f5e', trend: 'text-rose-500' },
  warning: { bg: '#fef3c7', icon: '#f59e0b', trend: 'text-amber-600' },
};

export default function MetricCard({ label, value, icon, trend, color = 'primary' }: MetricCardProps) {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const c = colorMap[color];

  return (
    <div
      className="bg-white border border-gray-100 rounded-3xl p-5 md:p-6 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow duration-300"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: c.bg }}>
          <span className="material-symbols-outlined text-2xl" style={{ color: c.icon }}>{icon}</span>
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl md:text-3xl text-gray-900 font-bold tracking-tight">{value}</span>
        {trend && (
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${trend.positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            <span className="material-symbols-outlined text-base">
              {trend.positive ? 'trending_up' : 'trending_down'}
            </span>
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
