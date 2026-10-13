import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { getStaffRole } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import GymTab from './tabs/GymTab';
import BookingsTab from './tabs/BookingsTab';
import MembersTab from './tabs/MembersTab';
import AttendanceTab from './tabs/AttendanceTab';
import ScheduleTab from './tabs/ScheduleTab';
import MarketingTab from './tabs/MarketingTab';
import BillingTab from './tabs/BillingTab';
import SalesTab from './tabs/SalesTab';
import EmailTab from './tabs/EmailTab';
import IntegrationsTab from './tabs/IntegrationsTab';
import SessionsTab from './tabs/SessionsTab';
import BackupTab from './tabs/BackupTab';
import MigrationTab from './tabs/MigrationTab';

interface TabDef {
  id: string;
  icon: string;
  labelEn: string;
  labelAr: string;
  roles: ('manager')[];
}

const ALL_TABS: TabDef[] = [
  { id: 'gym', icon: 'store', labelEn: 'Gym', labelAr: 'الصالة', roles: ['manager'] },
  { id: 'bookings', icon: 'calendar_month', labelEn: 'Bookings', labelAr: 'الحجوزات', roles: ['manager'] },
  { id: 'members', icon: 'group', labelEn: 'Members', labelAr: 'الأعضاء', roles: ['manager'] },
  { id: 'attendance', icon: 'qr_code_scanner', labelEn: 'Attendance', labelAr: 'الحضور', roles: ['manager'] },
  { id: 'schedule', icon: 'schedule', labelEn: 'Schedule', labelAr: 'الجدول', roles: ['manager'] },
  { id: 'marketing', icon: 'campaign', labelEn: 'Marketing', labelAr: 'التسويق', roles: ['manager'] },
  { id: 'billing', icon: 'payments', labelEn: 'Billing', labelAr: 'الفواتير', roles: ['manager'] },
  { id: 'sales', icon: 'point_of_sale', labelEn: 'Sales', labelAr: 'المبيعات', roles: ['manager'] },
  { id: 'email', icon: 'mail', labelEn: 'Email', labelAr: 'البريد', roles: ['manager'] },
  { id: 'sessions', icon: 'devices', labelEn: 'Sessions', labelAr: 'الجلسات', roles: ['manager'] },
  { id: 'integrations', icon: 'link', labelEn: 'Integrations', labelAr: 'التكامل', roles: ['manager'] },
  // §27 — merged standalone pages (was /admin/backup and /admin/settings/migration)
  { id: 'backup', icon: 'backup', labelEn: 'Backup', labelAr: 'النسخ الاحتياطي', roles: ['manager'] },
  { id: 'migration', icon: 'move_to_inbox', labelEn: 'Migration', labelAr: 'الترحيل', roles: ['manager'] },
];

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  gym: GymTab,
  bookings: BookingsTab,
  members: MembersTab,
  attendance: AttendanceTab,
  schedule: ScheduleTab,
  marketing: MarketingTab,
  billing: BillingTab,
  sales: SalesTab,
  email: EmailTab,
  sessions: SessionsTab,
  integrations: IntegrationsTab,
  backup: BackupTab,
  migration: MigrationTab,
};

export default function SettingsPage() {
  const { language, setLanguage, role } = useApp();
  const rtl = language === 'ar';

  // §27 fix — getStaffRole() decodes the localStorage JWT, which staff cookie
  // sessions don't have; fall back to the mapped session role from context.
  const staffRole = getStaffRole() ?? (role === 'gym-admin' ? 'manager' : null);

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => (t.roles as string[]).includes(staffRole ?? '')),
    [staffRole]
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState(
    () => (visibleTabs.find((t) => t.id === urlTab)?.id) || visibleTabs[0]?.id || 'gym'
  );

  // Keep in sync when arriving via /admin/backup or /admin/settings/migration
  // redirect (or a ?tab= deep link like MembersPage's) with the page already mounted.
  useEffect(() => {
    if (urlTab && visibleTabs.some((t) => t.id === urlTab) && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [urlTab, visibleTabs, activeTab]);

  // Reset active tab if the current selection is no longer visible (e.g. role changed)
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [visibleTabs, activeTab]);

  const selectTab = (id: string) => {
    setActiveTab(id);
    // Reflect selection in the URL (?tab=) — §27 hub deep-link convention
    setSearchParams({ tab: id }, { replace: true });
  };

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        actions={
          <Button variant="outline" onClick={() => setLanguage(rtl ? 'en' : 'ar')}>
            <span className="material-symbols-outlined text-lg">translate</span>
            {rtl ? 'English' : 'العربية'}
          </Button>
        }
      />

      <div className={`flex flex-col ${rtl ? 'lg:flex-row' : 'lg:flex-row'} gap-6`}>
        {/* ===== SIDEBAR TABS ===== */}
        <aside className="lg:w-56 shrink-0">
          <Card className="p-2 overflow-hidden">
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-2xl transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">{tab.icon}</span>
                  <span>{rtl ? tab.labelAr : tab.labelEn}</span>
                </button>
              );
            })}
          </Card>
        </aside>

        {/* ===== CONTENT AREA ===== */}
        <div className="flex-1 min-w-0">
          <Card>
            {ActiveComponent ? <ActiveComponent /> : (
              <div className="text-center py-12 text-gray-500">
                {rtl ? 'يرجى اختيار تبويب' : 'Select a tab'}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
