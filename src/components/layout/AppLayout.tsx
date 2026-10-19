import { useMemo } from 'react';
import { useApp } from '../../context/GymBrandContext';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import TrialBanner from './TrialBanner';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getNavBadges, getPublicBranding } from '../../services/api';
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

  // سطر الحقوق العام من هوية المنصة (يُحرَّر من السوبر أدمن ← الهوية).
  const { data: branding } = useApiQuery(
    ['branding', 'public'],
    () => getPublicBranding(),
    { staleTime: 10 * 60_000, retry: false }
  );
  const footerText = branding?.data?.footer_text?.trim() || '';

  return (
    // dir changes based on language:
    // - Arabic (RTL) → sidebar appears on the RIGHT side
    // - English (LTR) → sidebar appears on the LEFT side
    <div className="flex min-h-screen bg-background text-on-background font-body-md antialiased shell-canvas" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* موجة 2 — skip link. Every screen sits behind the whole sidebar and top
          nav, so a keyboard user tabbed through all of those nav items before
          reaching the page. It is `sr-only` until focused, then a normal card at
          the start edge — the logical `start-*` keeps it on the right in Arabic
          and the left in English without a second rule. */}
      <a
        href="#main-content"
        className="sr-only rounded-shell border border-hairline bg-card px-4 py-2 text-sm font-bold text-foreground focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50"
      >
        {language === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to main content'}
      </a>
      <Sidebar items={navItems} />
      <div className="flex-1 flex flex-col min-h-screen relative w-full overflow-x-hidden" dir={language === 'ar' ? 'rtl' : 'ltr'}>
        {/* Trial/upgrade banner is a gym-level concept — never on platform ops screens */}
        {role !== 'super-admin' && <TrialBanner />}
        <TopNav navItems={navItems} />
        {/* §42 — mobile nav is the drawer (Sidebar) + top-bar menu button only.
            The legacy BottomNav strip (first 4 nav items as fixed icons) was
            removed along with BottomNav.tsx/navIcons.ts. */}
        {/* `tabIndex={-1}` is what makes the skip link land here: a `<main>` is
            not focusable by default, so the fragment jump would move the scroll
            but leave `document.activeElement` on the link. */}
        <main id="main-content" tabIndex={-1} className="flex-1 p-margin-mobile md:p-margin-desktop bg-surface-container-low">
          <div className="max-w-container-max mx-auto space-y-stack-lg">
            {children}
          </div>
        </main>
        {footerText !== '' && (
          <footer className="border-t border-gray-200/70 px-4 py-3 text-center no-print">
            <p className="text-xs text-gray-400">{footerText}</p>
          </footer>
        )}
      </div>
    </div>
  );
}
