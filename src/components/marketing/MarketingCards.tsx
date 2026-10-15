import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getMarketingFunnel, type MarketingFunnel, type FunnelSeriesPoint } from '../../services/analytics';
import Card from '../ui/Card';
import PageLoader from '../shared/PageLoader';

// §34ت: the dropdown filters by the REAL gym_leads.source codes (what LeadForm
// writes), not decorative labels that matched nothing in the DB.
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

// The three marketing cards (lead generation, new signups, acquisition
// funnel) — ONE component rendered on the dashboard after the new-leads
// action card (owner request). Same real endpoint, same truth.
export default function MarketingCards() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const [leadTimeToggle, setLeadTimeToggle] = useState<TimeMode>('Week');
  const [signupTimeToggle, setSignupTimeToggle] = useState<TimeMode>('Week');
  const [funnelSource, setFunnelSource] = useState('all');

  const { data: funnelRes, isLoading: funnelLoading } = useApiQuery<{ data: MarketingFunnel }>(
    ['marketing-funnel', funnelSource],
    () => getMarketingFunnel(funnelSource),
  );
  const funnelData = funnelRes?.data;
  const leadBuckets = bucketSeries(funnelData?.series || [], leadTimeToggle);
  const signupBuckets = bucketSeries(funnelData?.series || [], signupTimeToggle);

  return (
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
          <p className="text-[11px] text-gray-500 mt-2">
            {rtl ? 'أعضاء جدد — من members (آخر 90 يومًا)' : 'New members — from members (last 90 days)'}
          </p>
        </Card>
      </div>

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
  );
}
