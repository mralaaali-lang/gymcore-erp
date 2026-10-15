import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { getStaffRole } from '../../services/api';
import Card from '../../components/ui/Card';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import GymTab from './tabs/GymTab';
import SubscriptionsTab from './tabs/SubscriptionsTab';
import NotificationsTab from './tabs/NotificationsTab';
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
  { id: 'gym', icon: 'store', labelEn: 'Gym data', labelAr: 'بيانات الصالة', roles: ['manager'] },
  { id: 'subscriptions', icon: 'subscriptions', labelEn: 'Subscriptions', labelAr: 'الاشتراكات', roles: ['manager'] },
  { id: 'notifications', icon: 'notifications', labelEn: 'Notifications', labelAr: 'الإشعارات', roles: ['manager'] },
  { id: 'backup', icon: 'backup', labelEn: 'Backup', labelAr: 'النسخ الاحتياطي', roles: ['manager'] },
  { id: 'sessions', icon: 'devices', labelEn: 'Sessions', labelAr: 'الجلسات', roles: ['manager'] },
  { id: 'integrations', icon: 'link', labelEn: 'Integrations', labelAr: 'التكامل', roles: ['manager'] },
  // §27 — merged standalone pages (was /admin/backup and /admin/settings/migration)
  { id: 'backup', icon: 'backup', labelEn: 'Backup', labelAr: 'النسخ الاحتياطي', roles: ['manager'] },
  // §34ج — renamed: the tab no longer fakes provider migrations, it does real CSV import.
  { id: 'migration', icon: 'import_export', labelEn: 'Data Import', labelAr: 'استيراد البيانات', roles: ['manager'] },
];

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  gym: GymTab,
  subscriptions: SubscriptionsTab,
  notifications: NotificationsTab,
  sessions: SessionsTab,
  backup: BackupTab,
  migration: MigrationTab,
};

export default function SettingsPage() {
  const { language, role } = useApp();
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
    <div className="space-y-6">
      {/* ===== التبويبات بالعرض (فوق) بدل الطول (جنب) ===== */}
      <Card className="p-2 overflow-hidden">
        <div className="overflow-x-auto">
          <UnifiedTabs
            variant="pills"
            tabs={visibleTabs.map((tab) => ({
              key: tab.id,
              labelAr: tab.labelAr,
              labelEn: tab.labelEn,
              icon: tab.icon,
            }))}
            activeKey={activeTab}
            onChange={selectTab}
          />
        </div>
      </Card>

      {/* ===== CONTENT AREA ===== */}
      <div className="min-w-0">
        <Card>
          {ActiveComponent ? <ActiveComponent /> : (
            <div className="text-center py-12 text-gray-500">
              {rtl ? 'يرجى اختيار تبويب' : 'Select a tab'}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
