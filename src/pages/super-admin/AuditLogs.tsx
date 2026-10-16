import { Fragment, useState } from 'react';
import { formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listPlatformAudit, listPlatformGyms, type PlatformAuditEntry } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import Card from '../../components/ui/Card';
import PageLoader from '../../components/shared/PageLoader';
import { CaretDown as ChevronDown, CaretUp as ChevronUp, ClipboardText as ClipboardCheck } from '@phosphor-icons/react';

// §40-M3 — سجل تدقيق المنصة: platform_audit_logs الحقيقي (فلاتر خادمية + old/new فعلي).
// لا استنتاج للأفعال من نص الوصف — الفعل مخزَّن صريحًا في العمود.

const ACTION_OPTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'CANCEL', 'RENEW', 'ISSUE', 'MARK_PAID',
  'GRANT', 'REVOKE', 'ACTIVATE', 'DEACTIVATE', 'LOGIN', 'LOGOUT',
];

const ACTION_CLASS: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-sky-100 text-sky-700',
  RENEW: 'bg-violet-100 text-violet-700',
  ISSUE: 'bg-amber-100 text-amber-700',
  MARK_PAID: 'bg-emerald-100 text-emerald-700',
  CANCEL: 'bg-red-100 text-red-700',
  DELETE: 'bg-red-100 text-red-700',
  REVOKE: 'bg-red-100 text-red-700',
  GRANT: 'bg-teal-100 text-teal-700',
  ACTIVATE: 'bg-emerald-100 text-emerald-700',
  DEACTIVATE: 'bg-gray-200 text-gray-600',
  LOGIN: 'bg-gray-100 text-gray-500',
  LOGOUT: 'bg-gray-100 text-gray-500',
};

const PAGE_SIZE = 50;

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-gray-400 py-1">{label}: —</p>;
  }
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      <pre className="text-[11px] leading-relaxed text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3 overflow-x-auto max-h-64" dir="ltr">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditLogs() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const t = (en: string, ar: string) => (isRtl ? ar : en);

  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [gymId, setGymId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = {
    search: search.trim() || undefined,
    action: action || undefined,
    gym_id: gymId || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data, isLoading, error } = useApiQuery(
    ['platform', 'security', 'audit', JSON.stringify(params)],
    () => listPlatformAudit(params),
  );
  const { data: gymsRes } = useApiQuery(['platform', 'gyms'], listPlatformGyms, { staleTime: 60_000 });

  const logs: PlatformAuditEntry[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const gyms = gymsRes?.data ?? [];

  const inputCls = 'px-3 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-5" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('Platform Audit Log', 'سجل تدقيق المنصة')}
        subtitle={t('Every real platform-admin and system action with before/after values', 'كل فعل حقيقي لمشرفي المنصة والنظام بقيم قبل/بعد')}
        icon="fact_check"
      />

      {/* فلاتر خادمية حقيقية */}
      <Card>
        <div className="flex items-end gap-2.5 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500">{t('Action', 'الفعل')}</label>
            <select value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} className={inputCls}>
              <option value="">{t('All actions', 'كل الأفعال')}</option>
              {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500">{t('Gym', 'الصالة')}</label>
            <select value={gymId} onChange={(e) => { setGymId(e.target.value); setPage(0); }} className={`${inputCls} max-w-44`}>
              <option value="">{t('All gyms', 'كل الصالات')}</option>
              {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500">{t('From', 'من')}</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className={inputCls} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-gray-500">{t('To', 'إلى')}</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className={inputCls} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-[11px] font-semibold text-gray-500">{t('Search', 'بحث')}</label>
            <input
              value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder={t('email / action / table...', 'البريد/الفعل/الجدول...')}
              className={`${inputCls} w-full`}
            />
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <PageLoader variant="skeleton" message={t('Loading...', 'جارٍ التحميل...')} />
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{t('Failed to load audit log', 'فشل تحميل السجل')}</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <ClipboardCheck size={30} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">{t('No entries match these filters', 'لا سجلات تطابق هذه الفلاتر')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-600">
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Time', 'الوقت')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Action', 'الفعل')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Actor', 'الفاعل')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Table', 'الجدول')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">IP</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <tr
                      className="border-b border-gray-50 hover:bg-emerald-50/30 cursor-pointer transition-colors"
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap" dir="ltr">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ACTION_CLASS[log.action_type] || 'bg-gray-100 text-gray-600'}`} dir="ltr">
                          {log.action_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800" dir="ltr">{log.actor_email || t('System', 'النظام')}</td>
                      <td className="px-4 py-3 text-gray-600" dir="ltr">{log.table_name}</td>
                      <td className="px-4 py-3 text-gray-500" dir="ltr">{log.ip_address || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {expanded === log.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </td>
                    </tr>
                    {expanded === log.id && (
                      <tr className="bg-gray-50/70 border-b border-gray-100">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <JsonBlock label={t('Before (old values)', 'قبل (old_values)')} value={log.old_values} />
                            <JsonBlock label={t('After (new values)', 'بعد (new_values)')} value={log.new_values} />
                          </div>
                          <p className="text-[11px] text-gray-400 mt-3" dir="ltr">
                            record_id: {log.record_id || '—'} · user_agent: {log.user_agent || '—'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ترقيم حقيقي من total الخادم */}
        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-1 text-xs text-gray-500">
            <span dir="ltr">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white disabled:opacity-40 hover:border-emerald-300 transition-colors"
              >
                {t('Previous', 'السابق')}
              </button>
              <button
                onClick={() => setPage((p) => ((page + 1) * PAGE_SIZE < total ? p + 1 : p))}
                disabled={(page + 1) * PAGE_SIZE >= total}
                className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white disabled:opacity-40 hover:border-emerald-300 transition-colors"
              >
                {t('Next', 'التالي')}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
