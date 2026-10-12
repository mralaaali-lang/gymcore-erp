import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listReferrals, type ReferralData } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';
import AnnouncementsPanel from './marketing/AnnouncementsPanel';

// §26: AnnouncementsPage merged in as the "Announcements" tab; the old
// /admin/announcements route redirects here with ?tab=Announcements.
const MARKETING_TABS = ['Dashboard', 'Referrals', 'Announcements', 'Leads', 'Messaging', 'Automations', 'Settings'] as const;
type MarketingTab = typeof MARKETING_TABS[number];

const TAB_LABELS: Record<MarketingTab, { en: string; ar: string }> = {
  Dashboard: { en: 'Dashboard', ar: 'لوحة البيانات' },
  Referrals: { en: 'Referrals', ar: 'الإحالات' },
  Announcements: { en: 'Announcements', ar: 'الإعلانات' },
  Leads: { en: 'Leads', ar: 'العملاء المحتملين' },
  Messaging: { en: 'Messaging', ar: 'الرسائل' },
  Automations: { en: 'Automations', ar: 'الأتمتة' },
  Settings: { en: 'Settings', ar: 'الإعدادات' },
};

const TAB_ICONS: Record<MarketingTab, string> = {
  Dashboard: 'dashboard',
  Referrals: 'group',
  Announcements: 'campaign',
  Leads: 'leaderboard',
  Messaging: 'chat',
  Automations: 'settings_automation',
  Settings: 'settings',
};

const ACQUISITION_FUNNELS = ['All', 'Social Media', 'Referral', 'Walk-in', 'Google', 'Advertisement'];
const TIME_TOGGLES = ['Day', 'Week', 'Month'] as const;

const ACTION_BLOCKS = [
  { icon: 'settings_automation', labelEn: 'Create an automation', labelAr: 'إنشاء أتمتة', color: 'bg-purple-50 text-purple-600' },
  { icon: 'dynamic_form', labelEn: 'Create a lead capture form', labelAr: 'إنشاء نموذج التقاط العملاء', color: 'bg-blue-50 text-blue-600' },
  { icon: 'group_add', labelEn: 'Set up a referral program', labelAr: 'إعداد برنامج إحالة', color: 'bg-green-50 text-green-600' },
  { icon: 'settings', labelEn: 'More Marketing settings', labelAr: 'المزيد من إعدادات التسويق', color: 'bg-amber-50 text-amber-600' },
];

function referralStatusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  const s = (status || '').toLowerCase();
  if (s === 'converted' || s === 'rewarded' || s === 'completed' || s === 'active') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'expired' || s === 'cancelled' || s === 'rejected') return 'error';
  return 'neutral';
}

function referralName(r: ReferralData): string {
  const referrer = r.referrer_name || r.gym_name || r.referral_code;
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
      : 'Dashboard',
  );
  useEffect(() => {
    if (requestedTab && (MARKETING_TABS as readonly string[]).includes(requestedTab)) {
      setActiveTabState(requestedTab as MarketingTab);
    }
  }, [requestedTab]);
  const setActiveTab = (tab: MarketingTab) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(params);
    next.set('tab', tab);
    setParams(next, { replace: true });
  };
  const [leadTimeToggle, setLeadTimeToggle] = useState<typeof TIME_TOGGLES[number]>('Week');
  const [signupTimeToggle, setSignupTimeToggle] = useState<typeof TIME_TOGGLES[number]>('Week');
  const [funnel, setFunnel] = useState('All');

  const { data: referralsRes, isLoading: referralsLoading } = useApiQuery<{ data: ReferralData[] }>(
    ['referrals'],
    () => listReferrals(),
  );
  const referrals = referralsRes?.data || [];

  const renderReferralRows = (rows: ReferralData[]) => (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
          <div>
            <p className="text-sm font-medium text-gray-900">{referralName(r)}</p>
            <p className="text-xs text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</p>
          </div>
          <StatusBadge status={r.status} variant={referralStatusVariant(r.status)} />
        </div>
      ))}
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">{rtl ? 'توليد العملاء المحتملين' : 'Lead Generation'}</h3>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {TIME_TOGGLES.map((t) => (
                <button
                  key={t}
                  onClick={() => setLeadTimeToggle(t)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                    leadTimeToggle === t ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2 h-28">
            {Array.from({ length: 7 }).map((_, i) => {
              const h = Math.max(10, Math.round(Math.random() * 90 + 10));
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-blue-400/70 rounded-t-md" style={{ height: `${h}%` }} />
                  <span className="text-[10px] text-gray-500">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">{rtl ? 'الاشتراكات الجديدة' : 'New Signups'}</h3>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {TIME_TOGGLES.map((t) => (
                <button
                  key={t}
                  onClick={() => setSignupTimeToggle(t)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition ${
                    signupTimeToggle === t ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2 h-28">
            {Array.from({ length: 7 }).map((_, i) => {
              const h = Math.max(10, Math.round(Math.random() * 80 + 15));
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-emerald-400/70 rounded-t-md" style={{ height: `${h}%` }} />
                  <span className="text-[10px] text-gray-500">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i]}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">{rtl ? 'إجراءات سريعة' : 'Quick Actions'}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACTION_BLOCKS.map((block) => (
              <button
                key={block.labelEn}
                className={`${block.color} rounded-2xl p-4 text-right hover:shadow-sm transition text-sm font-medium flex items-center gap-3`}
              >
                <span className="material-symbols-outlined text-2xl">{block.icon}</span>
                <span>{rtl ? block.labelAr : block.labelEn}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900">
              <span className="material-symbols-outlined text-emerald-500 align-middle mr-1">filter_alt</span>
              {rtl ? 'قمع الاستحواذ' : 'Acquisition Funnel'}
              <select
                value={funnel}
                onChange={(e) => setFunnel(e.target.value)}
                className="mr-2 text-sm bg-gray-100 border border-gray-100 rounded-xl px-2 py-1 text-gray-900"
              >
                {ACQUISITION_FUNNELS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </h3>
          </div>
          <div className="space-y-2">
            {[
              { stage: rtl ? 'الوعي' : 'Awareness', pct: 100 },
              { stage: rtl ? 'الاهتمام' : 'Interest', pct: 65 },
              { stage: rtl ? 'القرار' : 'Decision', pct: 35 },
              { stage: rtl ? 'التحويل' : 'Conversion', pct: 18 },
            ].map((s) => (
              <div key={s.stage}>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{s.stage}</span>
                  <span>{s.pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-bold text-gray-900 mb-4">{rtl ? 'آخر الإحالات' : 'Latest Referrals'}</h3>
        {referralsLoading ? (
          <PageLoader />
        ) : referrals.length > 0 ? (
          renderReferralRows(referrals.slice(0, 5))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <span className="material-symbols-outlined text-4xl block mb-2">group</span>
            <p className="text-sm">{rtl ? 'لا توجد إحالات' : 'No referrals'}</p>
          </div>
        )}
      </Card>
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

  const renderPlaceholder = (tab: MarketingTab) => (
    <Card className="p-12 text-center">
      <span className="material-symbols-outlined text-5xl text-gray-500/30 block mb-3">
        {TAB_ICONS[tab]}
      </span>
      <p className="text-gray-500 font-medium">{rtl ? TAB_LABELS[tab].ar : TAB_LABELS[tab].en}</p>
      <p className="text-sm text-gray-500/60 mt-1">{rtl ? 'قيد التطوير' : 'Coming soon'}</p>
    </Card>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6">
      <PageHeader
        title={rtl ? 'التسويق' : 'Marketing'}
        subtitle={rtl ? 'أتمتة وإدارة الحملات التسويقية' : 'Marketing automation & campaigns'}
        icon="campaign"
      />

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

      {activeTab === 'Dashboard' && renderDashboard()}
      {activeTab === 'Referrals' && renderReferrals()}
      {activeTab === 'Announcements' && <AnnouncementsPanel />}
      {activeTab !== 'Dashboard' && activeTab !== 'Referrals' && activeTab !== 'Announcements' && renderPlaceholder(activeTab)}
    </div>
  );
}
