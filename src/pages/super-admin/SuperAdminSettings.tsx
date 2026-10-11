// â”€â”€ Super Admin Settings Page â”€â”€
// Shows a gym selector dropdown at the top, then renders the 11-tab SettingsPage
// for the selected gym. Also has a link to access platform-level settings.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { listPlatformGyms, type PlatformGym } from '../../services/api';
import { SettingsGymProvider } from '../../context/SettingsGymContext';
import SettingsPage from '../settings/SettingsPage';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Gear, Buildings, ArrowSquareOut } from '@phosphor-icons/react';

export default function SuperAdminSettings() {
  const { language } = useApp();
  const navigate = useNavigate();
  const isRtl = language === 'ar';

  const { data: gymsData, isLoading: gymsLoading } = useQuery({
    queryKey: ['platform', 'gyms'],
    queryFn: listPlatformGyms,
  });

  // Try to load previously selected gym from localStorage
  const [selectedGymId, setSelectedGymId] = useState<string>(() => {
    return localStorage.getItem('super-admin-selected-gym') || '';
  });

  const gyms: PlatformGym[] = gymsData?.data || [];

  const handleGymChange = (gymId: string) => {
    setSelectedGymId(gymId);
    if (gymId) {
      localStorage.setItem('super-admin-selected-gym', gymId);
    } else {
      localStorage.removeItem('super-admin-selected-gym');
    }
  };

  const selectedGym = gyms.find((g) => g.id === selectedGymId);

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <PageHeader
        title={isRtl ? 'إعدادات الصالات' : 'Gym Settings'}
        subtitle={isRtl
          ? 'اختر صالة رياضية لإدارة إعداداتها'
          : 'Select a gym to manage its settings'}
        icon="fitness_center"
        actions={
          <Button
            onClick={() => navigate('/super-admin/settings')}
            variant="outline"
          >
            <Gear className="w-4 h-4" />
            {isRtl ? 'العودة لإعدادات المنصة' : 'Back to Platform Settings'}
            <ArrowSquareOut className="w-3 h-3" />
          </Button>
        }
      />

      {/* Gym Selector */}
      <Card>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-emerald-500 flex items-center justify-center shrink-0">
            <Buildings className="w-5 h-5 text-white flex-shrink-0" />
          </span>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {isRtl ? 'اختر الصالة الرياضية' : 'Select Gym'}
            </label>
            {gymsLoading ? (
              <PageLoader message={isRtl ? 'جاري تحميل الصالات...' : 'Loading gyms...'} />
            ) : (
              <select
                value={selectedGymId}
                onChange={(e) => handleGymChange(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                <option value="">
                  {isRtl ? '-- اختر صالة رياضية --' : '-- Select a gym --'}
                </option>
                {gyms.map((gym) => (
                  <option key={gym.id} value={gym.id}>
                    {gym.name}
                    {gym.plan_tier ? ` (${gym.plan_tier})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </Card>

      {/* Settings Content */}
      {!selectedGymId ? (
        <Card>
          <div className="p-12 text-center">
            <Buildings className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400">
              {isRtl ? 'يرجى اختيار صالة رياضية من القائمة أعلاه' : 'Please select a gym from the dropdown above'}
            </h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              {isRtl
                ? 'سيتم عرض إعدادات الصالة بعد اختيارها'
                : 'Gym settings will appear after selection'}
            </p>
          </div>
        </Card>
      ) : selectedGym ? (
        <Card className="overflow-hidden">
          {/* Gym info bar */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-900 dark:text-white">
              {selectedGym.name}
            </span>
            {selectedGym.phone && (
              <span className="text-gray-400">|</span>
            )}
            {selectedGym.phone && (
              <span dir="ltr">{selectedGym.phone}</span>
            )}
            {selectedGym.email && (
              <>
                <span className="text-gray-400">|</span>
                <span>{selectedGym.email}</span>
              </>
            )}
            {selectedGym.plan_tier && (
              <>
                <span className="text-gray-400">|</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                  {selectedGym.plan_tier}
                </span>
              </>
            )}
          </div>
          {/* Settings tabs */}
          <SettingsGymProvider value={{ gymId: selectedGymId }}>
            <SettingsPage />
          </SettingsGymProvider>
        </Card>
      ) : null}
    </div>
  );
}
