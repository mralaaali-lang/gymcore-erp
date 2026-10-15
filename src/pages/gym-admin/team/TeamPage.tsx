import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../../context/GymBrandContext';
import StaffDirectory from './StaffDirectory';
import ShiftsLog from './ShiftsLog';
import HrOverview from './HrOverview';

// Team hub — merged staff/shifts/hr tabs (§18 IA cleanup follow-up).
// /admin/trainers is a standalone cards page again (TrainersPage);
// /admin/shifts|hr still redirect here with ?tab= deep links.
const TABS = [
  { key: 'staff', icon: 'badge', ar: 'الموظفون', en: 'Staff' },
  { key: 'shifts', icon: 'schedule', ar: 'سجل الدوام', en: 'Attendance log' },
  { key: 'hr', icon: 'payments', ar: 'الموارد البشرية', en: 'HR & payroll' },
] as const;

export default function TeamPage() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') || 'staff';
  const activeKey = TABS.some((t) => t.key === requested) ? requested : 'staff';

  const switchTab = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', key);
    next.delete('role');
    setParams(next, { replace: true });
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* §35ث — heading moved to the top bar */}

      <div className="flex gap-2 bg-white border border-gray-100 rounded-2xl p-1.5 shadow-sm w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              activeKey === t.key
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="material-symbols-outlined text-lg">{t.icon}</span>
            {rtl ? t.ar : t.en}
          </button>
        ))}
      </div>

      {activeKey === 'staff' && <StaffDirectory />}
      {activeKey === 'shifts' && <ShiftsLog />}
      {activeKey === 'hr' && <HrOverview />}
    </div>
  );
}
