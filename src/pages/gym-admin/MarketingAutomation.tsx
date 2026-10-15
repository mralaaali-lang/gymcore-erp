import { useEffect, useState } from 'react';
import { formatDate } from '../../utils/date';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listGymReferrals, type ReferralData } from '../../services/api';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import AnnouncementsPanel from './marketing/AnnouncementsPanel';

// §26: AnnouncementsPage merged in as the "Announcements" tab; the old
// /admin/announcements route redirects here with ?tab=Announcements.
// §34ج — Leads/Messaging/Automations/Settings tabs hidden: they only rendered
// a "قيد التطوير" card (real leads live in /admin/crm). They return when the
// real screens are built.
// الكروت الثلاثة (توليد العملاء المحتملين / الاشتراكات الجديدة / قمع
// الاستحواذ) انتقلت إلى لوحة القيادة بعد كارت «عملاء محتملون بحاجة
// لمتابعة» — نفس المكوّن MarketingCards ونفس endpoint، بلا ازدواج —
// فتاب «لوحة البيانات» اتشال من هنا وبقى الإحالات والإعلانات فقط.
const MARKETING_TABS = ['Referrals', 'Announcements'] as const;
type MarketingTab = typeof MARKETING_TABS[number];

const TAB_LABELS: Record<MarketingTab, { en: string; ar: string }> = {
  Referrals: { en: 'Referrals', ar: 'الإحالات' },
  Announcements: { en: 'Announcements', ar: 'الإعلانات' },
};

const TAB_ICONS: Record<MarketingTab, string> = {
  Referrals: 'group',
  Announcements: 'campaign',
};

// §34ج — ACTION_BLOCKS (dead Quick Actions buttons) deleted.

function referralStatusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  const s = (status || '').toLowerCase();
  if (s === 'converted' || s === 'rewarded' || s === 'completed' || s === 'active') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'expired' || s === 'cancelled' || s === 'rejected') return 'error';
  return 'neutral';
}

function referralName(r: ReferralData): string {
  const referrer = r.referrer_name || r.referral_code;
  const referred = r.referred_name || r.referred_member_name || '';
  return referred ? `${referrer} → ${referred}` : `${referrer}`;
}

export default function MarketingAutomation() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab');
  const [activeTab, setActiveTabState] = useState<MarketingTab>(
    requestedTab && (MARKETING_TABS as readonly string[]).includes(requestedTab)
      ? (requestedTab as MarketingTab)
      : 'Referrals',
  );
  useEffect(() => {
    if (requestedTab && (MARKETING_TABS as readonly string[]).includes(requestedTab)) {
      setActiveTabState(requestedTab as MarketingTab);
    } else if (requestedTab === 'Dashboard') {
      // legacy deep link — الكروت انتقلت للوحة القيادة
      setActiveTabState('Referrals');
    }
  }, [requestedTab]);
  const setActiveTab = (tab: MarketingTab) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };

  const { data: referralsRes, isLoading: referralsLoading } = useApiQuery<{ data: ReferralData[] }>(
    ['referrals'],
    () => listGymReferrals(),
  );
  const referrals = referralsRes?.data || [];

  const renderReferralRows = (rows: ReferralData[]) => (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <div>
            <p className="text-sm font-medium text-gray-900">{referralName(r)}</p>
            <p className="text-xs text-gray-500">{r.created_at ? formatDate(r.created_at) : ''}</p>
          </div>
          <StatusBadge status={r.status} variant={referralStatusVariant(r.status)} />
        </div>
      ))}
    </div>
  );

  const renderReferrals = () => (
    <Card>
      <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'الإحالات' : 'Referrals'}</h3>
      {referralsLoading ? (
        <PageLoader />
      ) : referrals.length > 0 ? (
        renderReferralRows(referrals)
      ) : (
        <div className="text-center py-8 text-gray-500">
          <span className="material-symbols-outlined text-4xl block mb-2">group</span>
          <p className="text-sm">{rtl ? 'لا توجد إحالات' : 'No referrals'}</p>
        </div>
      )}
    </Card>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      {/* §35ث — heading moved to the top bar */}

      <UnifiedTabs
        tabs={MARKETING_TABS.map((tab) => ({
          key: tab,
          labelAr: TAB_LABELS[tab].ar,
          labelEn: TAB_LABELS[tab].en,
          icon: TAB_ICONS[tab],
        }))}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as MarketingTab)}
      />

      {activeTab === 'Referrals' && renderReferrals()}
      {activeTab === 'Announcements' && <AnnouncementsPanel />}
    </div>
  );
}
