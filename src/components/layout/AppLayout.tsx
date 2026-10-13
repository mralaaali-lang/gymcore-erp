import { useMemo } from 'react';
import { useApp } from '../../context/GymBrandContext';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import BottomNav from './BottomNav';
import TrialBanner from './TrialBanner';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getNavBadges } from '../../services/api';
import { ROLE_BASE, buildNavItems } from './navConfig';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, language } = useApp();

  // §35أ — live sidebar badges from /api/nav/badges (manager + reception
  // sessions only; every count is computed server-side from real tables).
  const { data: badges } = useApiQuery(
    ['nav', 'badges'],
    () => getNavBadges(),
    {
      staleTime: 30_000,
      refetchInterval: 60_000,
      retry: false,
      enabled: role === 'gym-admin' || role === 'reception',
    }
  );

  const navItems = useMemo(
    () => buildNavItems(ROLE_BASE[role], role, badges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, language, badges]
  );

  return (
    // dir changes based on language:
    // - Arabic (RTL) → sidebar appears on the RIGHT side
    // - English (LTR) → sidebar appears on the LEFT side
    <div className="flex min-h-screen bg-background text-on-background font-body-md antialiased" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar items={navItems} />
      <div className="flex-1 flex flex-col min-h-screen relative w-full overflow-x-hidden" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        {/* Trial/upgrade banner is a gym-level concept — never on platform ops screens */}
        {role !== 'super-admin' && <TrialBanner />}
        <TopNav navItems={navItems} />
        <main className="flex-1 p-margin-mobile md:p-margin-desktop bg-surface-container-low pb-24 md:pb-margin-desktop">
          <div className="max-w-container-max mx-auto space-y-stack-lg">
            {children}
          </div>
        </main>
        <BottomNav items={navItems.filter((i) => !i.premium && !i.path.includes('?') && i.path !== '/team-login').slice(0, 4)} />
      </div>
    </div>
  );
}
