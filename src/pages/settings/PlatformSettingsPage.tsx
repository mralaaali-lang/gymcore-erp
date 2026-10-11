// ── Platform Settings Page (Super Admin) ──
// Same layout/structure as the gym SettingsPage, but for platform-level settings.
// Uses getPlatformSettings / updatePlatformSettings API.
import { useState, useEffect } from 'react';
import { useApp } from '../../context/GymBrandContext';
import PlatformGeneralTab from './platform/PlatformGeneralTab';
import PlatformSecurityTab from './platform/PlatformSecurityTab';
import PlatformNotificationsTab from './platform/PlatformNotificationsTab';
import PlatformGymsTab from './platform/PlatformGymsTab';
import PlatformMembersTab from './platform/PlatformMembersTab';
import PlatformBookingsTab from './platform/PlatformBookingsTab';
import PlatformAttendanceTab from './platform/PlatformAttendanceTab';
import PlatformScheduleTab from './platform/PlatformScheduleTab';
import PlatformMarketingTab from './platform/PlatformMarketingTab';
import PlatformEmailTab from './platform/PlatformEmailTab';
import PlatformSessionsTab from './platform/PlatformSessionsTab';
import PlatformIntegrationsTab from './platform/PlatformIntegrationsTab';
import PageHeader from '../../components/shared/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

interface TabDef {
  id: string;
  icon: string;
  labelEn: string;
  labelAr: string;
}

const ALL_TABS: TabDef[] = [
  { id: 'general', icon: 'store', labelEn: 'General', labelAr: 'عام' },
  { id: 'security', icon: 'shield', labelEn: 'Security', labelAr: 'الأمان' },
  { id: 'notifications', icon: 'notifications', labelEn: 'Notifications', labelAr: 'الإشعارات' },
  { id: 'gyms', icon: 'fitness_center', labelEn: 'Gyms', labelAr: 'الصالات' },
  { id: 'members', icon: 'group', labelEn: 'Members', labelAr: 'الأعضاء' },
  { id: 'bookings', icon: 'calendar_month', labelEn: 'Bookings', labelAr: 'الحجوزات' },
  { id: 'attendance', icon: 'qr_code_scanner', labelEn: 'Attendance', labelAr: 'الحضور' },
  { id: 'schedule', icon: 'schedule', labelEn: 'Schedule', labelAr: 'الجدول' },
  { id: 'marketing', icon: 'campaign', labelEn: 'Marketing', labelAr: 'التسويق' },
  { id: 'email', icon: 'mail', labelEn: 'Email', labelAr: 'البريد' },
  { id: 'sessions', icon: 'devices', labelEn: 'Sessions', labelAr: 'الجلسات' },
  { id: 'integrations', icon: 'link', labelEn: 'Integrations', labelAr: 'التكامل' },
];

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  general: PlatformGeneralTab,
  security: PlatformSecurityTab,
  notifications: PlatformNotificationsTab,
  gyms: PlatformGymsTab,
  members: PlatformMembersTab,
  bookings: PlatformBookingsTab,
  attendance: PlatformAttendanceTab,
  schedule: PlatformScheduleTab,
  marketing: PlatformMarketingTab,
  email: PlatformEmailTab,
  sessions: PlatformSessionsTab,
  integrations: PlatformIntegrationsTab,
};

export default function PlatformSettingsPage() {
  const { language, setLanguage } = useApp();
  const rtl = language === 'ar';

  const [activeTab, setActiveTab] = useState(ALL_TABS[0]?.id || 'general');

  // Reset active tab if current one is no longer valid
  useEffect(() => {
    if (!ALL_TABS.find((t) => t.id === activeTab)) {
      setActiveTab(ALL_TABS[0].id);
    }
  }, [activeTab]);

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="max-w-[1440px] mx-auto space-y-6">
        {/* Header */}
        <PageHeader
          title={rtl ? 'إعدادات المنصة' : 'Platform Settings'}
          subtitle={rtl ? 'إدارة إعدادات المنصة الأساسية' : 'Manage core platform settings'}
          icon="settings"
          actions={
            <Button
              onClick={() => setLanguage(rtl ? 'en' : 'ar')}
              variant="outline"
            >
              <span className="material-symbols-outlined text-lg">translate</span>
              {rtl ? 'English' : 'العربية'}
            </Button>
          }
        />

        <div className={`flex flex-col ${rtl ? 'lg:flex-row-reverse' : 'lg:flex-row'} gap-6`}>
          {/* ===== LEFT SIDEBAR TABS ===== */}
          <aside className="lg:w-56 shrink-0">
            <nav className="bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm">
              {ALL_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-all border-b border-gray-100 last:border-b-0 ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-l-2 border-emerald-500'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    style={isActive && rtl ? { borderLeft: 'none', borderRight: '2px solid #10b981' } : {}}
                  >
                    <span className="material-symbols-outlined text-xl">{tab.icon}</span>
                    <span>{rtl ? tab.labelAr : tab.labelEn}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* ===== RIGHT CONTENT AREA ===== */}
          <div className="flex-1 min-w-0">
            {ActiveComponent ? <ActiveComponent /> : (
              <Card>
                <p className="text-gray-400 text-center">
                  {rtl ? 'يرجى اختيار تبويب' : 'Select a tab'}
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
