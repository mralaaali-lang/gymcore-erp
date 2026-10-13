import { useEffect, useState } from 'react';
import { formatDate } from '../../utils/date';
import { useSearchParams, Link } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listReferrals, type ReferralData } from '../../services/api';
import { getMarketingFunnel, type MarketingFunnel, type FunnelSeriesPoint } from '../../services/analytics';
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

// §34ت: the dropdown now filters by the REAL gym_leads.source codes (what LeadForm
// writes), not the old decorative labels that matched nothing in the DB.
const SOURCE_OPTIONS = [
  { value: 'all', ar: 'كل المصادر', en: 'All sources' },
  { value: 'facebook', ar: 'فيسبوك', en: 'Facebook' },
  { value: 'instagram', ar: 'انستغرام', en: 'Instagram' },
  { value: 'walk_in', ar: 'زيارة', en: 'Walk-in' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];
const STAGE_LABELS: Record<string, { ar: string; en: string }> = {
  leads: { ar: 'عميل محتمل', en: 'Lead' },
  interest: { ar: 'تم التواصل', en: 'Contacted' },
  decision: { ar: 'حصة تجريبية', en: 'Trial booked' },
  converted: { ar: 'اشترك فعليًا', en: 'Converted' },
};
const TIME_TOGGLES = ['Day', 'Week', 'Month'] as const;
type TimeMode = typeof TIME_TOGGLES[number];

interface Bucket { label: string; leads: number; signups: number }

/** Bucket the 90-day daily series into ≤7 bars for the chosen mode (§34ت). */
function bucketSeries(series: FunnelSeriesPoint[], mode: TimeMode): Bucket[] {
  if (series.length === 0) return [];
  if (mode === 'Day') {
    return series.slice(-7).map((p) => ({ label: p.date.slice(5), leads: p.leads, signups: p.signups }));
  }
  if (mode === 'Week') {
    const out: Bucket[] = [];
    for (let w = 7; w >= 1; w--) {
      const chunk = series.slice(Math.max(0, series.length - w * 7), series.length - (w - 1) * 7);
      if (chunk.length === 0) continue;
      out.push({
        label: chunk[0].date.slice(5),
        leads: chunk.reduce((s, p) => s + p.leads, 0),
        signups: chunk.reduce((s, p) => s + p.signups, 0),
      });
    }
    return out;
  }
  const byMonth = new Map<string, Bucket>();
  for (const p of series) {
    const k = p.date.slice(0, 7);
    const cur = byMonth.get(k) || { label: k, leads: 0, signups: 0 };
    cur.leads += p.leads;
    cur.signups += p.signups;
    byMonth.set(k, cur);
  }
  return Array.from(byMonth.values()).slice(-7);
}

function MiniBars({ buckets, field, colorClass, rtl, loading }: {
  buckets: Bucket[];
  field: 'leads' | 'signups';
  colorClass: string;
  rtl: boolean;
  loading: boolean;
}) {
  if (loading) return <div className="h-28 flex items-center justify-center"><PageLoader /></div>;
  const total = buckets.reduce((s, b) => s + b[field], 0);
  if (buckets.length === 0 || total === 0) {
    return (
      <div className="h-28 flex flex-col items-center justify-center text-gray-400">
        <span className="material-symbols-outlined text-3xl mb-1">bar_chart</span>
        <p className="text-xs">{rtl ? 'لا بيانات في آخر 90 يومًا' : 'No data in the last 90 days'}</p>
      </div>
    );
  }
  const max = Math.max(...buckets.map((b) => b[field]));
  return (
    <div className="flex items-end gap-2 h-28">
      {buckets.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-gray-500">{b[field]}</span>
          <div className="w-full flex items-end h-20">
            <div className={`w-full rounded-t-md ${colorClass}`} style={{ height: `${Math.max(4, (b[field] / max) * 100)}%` }} />
          </div>
          <span className="text-[10px] text-gray-500">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

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
  const [leadTimeToggle, setLeadTimeToggle] = useState<TimeMode>('Week');
  const [signupTimeToggle, setSignupTimeToggle] = useState<TimeMode>('Week');
  const [funnelSource, setFunnelSource] = useState('all');

  // §34ت — one real endpoint backs the two bar charts AND the funnel card.
  const { data: funnelRes, isLoading: funnelLoading } = useApiQuery<{ data: MarketingFunnel }>(
    ['marketing-funnel', funnelSource],
    () => getMarketingFunnel(funnelSource),
  );
  const funnelData = funnelRes?.data;
  const leadBuckets = bucketSeries(funnelData?.series || [], leadTimeToggle);
  const signupBuckets = bucketSeries(funnelData?.series || [], signupTimeToggle);

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
            <p className="text-xs text-gray-500">{r.created_at ? formatDate(r.created_at) : ''}</p>
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
          <MiniBars buckets={leadBuckets} field="leads" colorClass="bg-blue-400/70" rtl={rtl} loading={funnelLoading} />
          <p className="text-[11px] text-gray-400 mt-2">
            {rtl ? 'عملاء محتملون جدد — من gym_leads (آخر 90 يومًا)' : 'New leads — from gym_leads (last 90 days)'}
          </p>
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
          <MiniBars buckets={signupBuckets} field="signups" colorClass="bg-emerald-400/70" rtl={rtl} loading={funnelLoading} />
          <p className="text-[11px] text-gray-400 mt-2">
            {rtl ? 'أعضاء جدد — من members (آخر 90 يومًا)' : 'New members — from members (last 90 days)'}
          </p>
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
                value={funnelSource}
                onChange={(e) => setFunnelSource(e.target.value)}
                className="mr-2 text-sm bg-gray-100 border border-gray-100 rounded-xl px-2 py-1 text-gray-900"
              >
                {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{rtl ? o.ar : o.en}</option>)}
              </select>
            </h3>
          </div>
          {funnelLoading ? (
            <div className="h-28 flex items-center justify-center"><PageLoader /></div>
          ) : !funnelData || funnelData.funnel.total_leads === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <span className="material-symbols-outlined text-4xl block mb-2">filter_alt</span>
              {/* §34ت: links to the real leads UI (/admin/crm), not this page's placeholder tab */}
              <p className="text-sm">
                {rtl ? 'لا عملاء محتملين بعد — ' : 'No leads yet — '}
                <Link to="/admin/crm" className="text-emerald-600 font-medium hover:underline">
                  {rtl ? 'أضِفهم من إدارة العملاء المحتملين' : 'add them in CRM Lead Management'}
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {funnelData.funnel.stages.map((s) => {
                const label = STAGE_LABELS[s.key] || { ar: s.key, en: s.key };
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{rtl ? label.ar : label.en}</span>
                      <span>{s.count} · {s.pct == null ? '—' : `${s.pct}%`}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.pct ?? 0}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
                <span>
                  {rtl
                    ? `معدل التحويل ${funnelData.funnel.conversion_pct == null ? '—' : funnelData.funnel.conversion_pct + '%'} · ضائع: ${funnelData.funnel.lost}`
                    : `Conversion ${funnelData.funnel.conversion_pct == null ? '—' : funnelData.funnel.conversion_pct + '%'} · lost: ${funnelData.funnel.lost}`}
                </span>
              </div>
            </div>
          )}
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
