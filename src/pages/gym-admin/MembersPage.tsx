import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { listMembers, getMemberStats, type MemberResponse, type MemberStats } from '../../services/api';
import FilterBar from '../../components/shared/FilterBar';
import PageLoader from '../../components/shared/PageLoader';
import StatusBadge from '../../components/ui/StatusBadge';
import Card from '../../components/ui/Card';
import { formatDate, daysUntil } from '../../utils/date';
import { buildExportMatrix, downloadMatrixXlsx } from '../../utils/csv';
import { Plus } from 'lucide-react';
import { DashboardPage, PrimaryAction } from '../../components/dashboard';
import { QuickActionModals, type ActionKey } from '../../components/dashboard/QuickActionCenter';
import EditMemberModal from './EditMemberModal';
import ImportMembersModal from './ImportMembersModal';

// §34د-1 — ONE truth per member: the subscription status from the server
// (`subscription_status`, LEFT JOIN on the latest member_subscriptions row).
// The old `m.status` badge was reading a field the API never returns, so it
// rendered "غير نشط" for everyone and contradicted the billing column.
type SubMeta = { label: string; variant: 'success' | 'warning' | 'error' | 'neutral' };

function subMeta(status: string | undefined, blacklisted: boolean | undefined, rtl: boolean): SubMeta {
  if (blacklisted) return { label: rtl ? 'موقوف (أسود)' : 'Blacklisted', variant: 'error' };
  if (status === 'active') return { label: rtl ? 'نشط' : 'Active', variant: 'success' };
  if (status === 'expired') return { label: rtl ? 'منتهي' : 'Expired', variant: 'warning' };
  if (status === 'suspended') return { label: rtl ? 'موقوف' : 'Suspended', variant: 'error' };
  if (status) return { label: status, variant: 'neutral' };
  return { label: rtl ? 'لا اشتراك' : 'No subscription', variant: 'neutral' };
}

function calcAge(dob: string): string {
  if (!dob) return '-';
  const birth = new Date(dob);
  const now = new Date();
  if (isNaN(birth.getTime())) return '-';
  let years = now.getFullYear() - birth.getFullYear();
  const mDiff = now.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < birth.getDate())) {
    years--;
  }
  if (years < 0 || years > 150) return '-';
  return `${years}`;
}

// الأعمدة القابلة للترتيب + الاتجاه الافتراضي الذكي لكل عمود
// (ينتهي في: الأقرب أولاً؛ الزيارات/آخر زيارة: الأعلى/الأحدث أولاً).
const SORTABLE: Record<string, { labelAr: string; labelEn: string; def: 'asc' | 'desc' }> = {
  member_name: { labelAr: 'المشترك', labelEn: 'MEMBER', def: 'asc' },
  created_at: { labelAr: 'تاريخ الانضمام', labelEn: 'JOINED', def: 'desc' },
  end_date: { labelAr: 'ينتهي في', labelEn: 'ENDS IN', def: 'asc' },
  remaining: { labelAr: 'المتبقي', labelEn: 'LEFT', def: 'asc' },
  last_visit: { labelAr: 'آخر زيارة', labelEn: 'LAST VISIT', def: 'desc' },
  visits: { labelAr: 'الزيارات', labelEn: 'VISITS', def: 'desc' },
};

export default function MembersPage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // §34ح — the five stat cards; every number comes from /api/members/stats.
  const [stats, setStats] = useState<MemberStats | null>(null);
  // §34د-5 — adding a member starts right here, with the SAME centered modal
  // the dashboard uses (real offers + PIN shown once), not a page detour.
  const [action, setAction] = useState<ActionKey | null>(null);
  const [limit, setLimit] = useState(10);
  // الترتيب: العمود + الاتجاه — الافتراضي الأحدث انضمامًا (نفس ترتيب السيرفر القديم).
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState('desc');
  const [editing, setEditing] = useState<MemberResponse | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Check for success banner flag
  const justAdded = sessionStorage.getItem('member_just_added') === 'true';

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [data, statsRes] = await Promise.all([
        listMembers({
          search: debouncedSearch || undefined,
          status: filter !== 'all' ? filter : undefined,
          page,
          limit,
          sort,
          order,
        }),
        // §34ح — cards refresh alongside the list (and the manual refresh
        // button), so "متواجدون الآن" never lags behind reality.
        getMemberStats().catch(() => null),
      ]);
      const list = data.members || [];
      setMembers(list);
      setTotal(data.total || 0);
      if (statsRes) setStats(statsRes);
    } catch {
      showToast(rtl ? 'فشل تحميل القائمة' : 'Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, page, limit, sort, order, rtl, showToast]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // Clear success banner after 5 seconds
  useEffect(() => {
    if (justAdded) {
      const timer = setTimeout(() => {
        sessionStorage.removeItem('member_just_added');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [justAdded]);

  const pages = Math.ceil(total / limit);
  const isEmpty = !loading && total === 0 && !search && filter === 'all';
  const isEmptySearch = !loading && members.length === 0 && (search || filter !== 'all');

  // تصدير كل الصفوف المطابقة للفلاتر (كل الصفحات)، لا الصفحة المعروضة فقط.
  const exportColumns = [
    { key: '__n', label: rtl ? 'م' : '#' },
    { key: 'full_name', label: rtl ? 'المشترك' : 'Member' },
    { key: 'code', label: rtl ? 'الكود' : 'Code' },
    { key: 'phone_number', label: rtl ? 'التليفون' : 'Phone' },
    { key: 'email', label: rtl ? 'الإيميل' : 'Email' },
    { key: 'gender', label: rtl ? 'الجنس' : 'Gender' },
    { key: 'plan_name', label: rtl ? 'الاشتراك' : 'Plan' },
    { key: 'subscription_status', label: rtl ? 'الحالة' : 'Status' },
    { key: 'subscription_end_date', label: rtl ? 'تاريخ الانتهاء' : 'Ends' },
    { key: 'join_date', label: rtl ? 'تاريخ الانضمام' : 'Joined' },
    { key: 'visit_count', label: rtl ? 'الزيارات' : 'Visits' },
  ];
  const doExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const all: MemberResponse[] = [];
      let pg = 1;
      for (;;) {
        const res = await listMembers({
          search: debouncedSearch || undefined,
          status: filter !== 'all' ? filter : undefined,
          page: pg,
          limit: 300,
          sort,
          order,
        });
        all.push(...(res.members || []));
        if (all.length >= (res.total || 0) || (res.members || []).length < 300) break;
        pg += 1;
      }
      if (all.length === 0) {
        showToast(rtl ? 'لا توجد بيانات للتصدير' : 'No data to export', 'warning');
        return;
      }
      const rows = all.map((m, i) => ({
        ...m,
        __n: i + 1,
        gender: m.gender === 'male' ? (rtl ? 'ذكر' : 'Male') : m.gender === 'female' ? (rtl ? 'أنثى' : 'Female') : '',
        subscription_status: subMeta(m.subscription_status, m.is_blacklisted, rtl).label,
        join_date: m.join_date || m.created_at || '',
      }));
      const matrix = buildExportMatrix(
        exportColumns,
        rows as unknown as Record<string, unknown>[],
        (key, value) => {
          if (key === 'join_date' || key === 'subscription_end_date') {
            return value ? formatDate(String(value)) : '';
          }
          return value === null || value === undefined ? '' : String(value);
        },
      );
      downloadMatrixXlsx('members.xlsx', matrix);
      showToast(rtl ? `تم تصدير ${all.length} سجل` : `Exported ${all.length} records`, 'success');
    } catch {
      showToast(rtl ? 'فشل التصدير' : 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  // الضغط على عمود مرتّب يعكس الاتجاه، والضغط على عمود جديد يبدأ باتجاهه الذكي.
  const toggleSort = (key: string) => {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder(SORTABLE[key].def);
    }
    setPage(1);
  };

  const sortTh = (key: string) => {
    const cfg = SORTABLE[key];
    const active = sort === key;
    return (
      <th key={key} className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          title={rtl ? 'اضغط للترتيب' : 'Click to sort'}
          className={`inline-flex items-center gap-1 hover:text-gray-900 uppercase ${active ? 'text-emerald-700' : ''}`}
        >
          {rtl ? cfg.labelAr : cfg.labelEn}
          <span className="material-symbols-outlined text-base">
            {active ? (order === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
          </span>
        </button>
      </th>
    );
  };

  // §34ح — the old six-tab strip (المشتركين/الحضور/الباقات/المحتوى/النمو/
  // الإعدادات) is gone by design: every one of those pages has its own
  // sidebar entry now (النمو was added to the sidebar in the same batch),
  // and this slot shows the five live member numbers instead.

  const statCards = stats
    ? [
        { value: stats.total_members, labelAr: 'إجمالي المشتركين', labelEn: 'Total members', color: 'text-slate-900' },
        { value: stats.active_members, labelAr: 'أعضاء نشطون', labelEn: 'Active', color: 'text-emerald-600' },
        { value: stats.ever_subscribed, labelAr: 'لديهم اشتراك', labelEn: 'Ever subscribed', color: 'text-violet-600' },
        { value: stats.new_this_month, labelAr: 'جديد الشهر', labelEn: 'New this month', color: 'text-amber-600' },
        { value: stats.present_now, labelAr: 'متواجدون الآن', labelEn: 'Present now', color: 'text-sky-600' },
      ]
    : null;

  return (
    <DashboardPage
      className="bg-gray-50 min-h-screen -m-6 p-6"
      actions={
        <PrimaryAction onClick={() => setAction('member')}>
          <Plus size={16} />
          {rtl ? 'إضافة مشترك' : 'Add member'}
        </PrimaryAction>
      }
    >

      {/* §34ح — five live stat cards (big colored number, small caption) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(statCards || [0, 1, 2, 3, 4].map(() => null)).map((c, i) => (
          <div key={i} className="bg-white rounded-3xl border border-gray-100 shadow-sm px-4 py-5 text-center">
            <div className={`text-3xl font-extrabold leading-none ${c ? c.color : 'text-gray-300'}`}>
              {c ? c.value : '—'}
            </div>
            <div className="mt-2 text-xs text-gray-500 font-medium">
              {c ? (rtl ? c.labelAr : c.labelEn) : rtl ? 'جارٍ التحميل…' : 'Loading…'}
            </div>
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder={rtl ? 'بحث: اسم / تليفون / كود…' : 'Search: name / phone / code…'}
        filters={[
          {
            key: 'status',
            value: filter === 'all' ? '' : filter,
            placeholder: rtl ? 'الكل' : 'All',
            options: [
              { value: 'active', labelAr: 'نشط', labelEn: 'Active' },
              { value: 'expired', labelAr: 'منتهي', labelEn: 'Expired' },
              { value: 'suspended', labelAr: 'موقوف', labelEn: 'Suspended' },
              { value: 'none', labelAr: 'بلا اشتراك', labelEn: 'No subscription' },
              { value: 'expiring7', labelAr: 'ينتهي خلال 7 أيام', labelEn: 'Ending within 7 days' },
              { value: 'blacklisted', labelAr: 'موقوف (أسود)', labelEn: 'Blacklisted' },
            ],
          },
        ]}
        onFilterChange={(_key, val) => { setFilter(val || 'all'); setPage(1); }}
        onRefresh={fetchMembers}
        extraActions={
          <>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 h-10 px-3 border rounded-lg text-label-sm transition-colors bg-surface-container-low text-on-surface-variant border-outline-variant hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-lg">upload_file</span>
              <span>{rtl ? 'استيراد' : 'Import'}</span>
            </button>
            <button
              type="button"
              onClick={() => doExport()}
              disabled={exporting}
              className="flex items-center gap-1.5 h-10 px-3 border rounded-lg text-label-sm transition-colors bg-surface-container-low text-on-surface-variant border-outline-variant hover:bg-surface-container-high disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-lg">grid_on</span>
              <span>{exporting ? '…' : 'Excel'}</span>
            </button>
          </>
        }
      />

      {/* Success Banner */}
      {justAdded && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm">
          <span className="material-symbols-outlined text-emerald-600">check_circle</span>
          {rtl ? 'تم إضافة المشترك بنجاح!' : 'Member added successfully!'}
        </div>
      )}

      {/* §34د-3 — the fake "set up billing" localStorage banner is gone:
          setup truth belongs in الإعدادات, not as a permanent nag here. */}

      {/* Loading */}
      {loading && (
        <Card>
          <PageLoader variant="skeleton" rows={5} />
        </Card>
      )}

      {/* §34د-4 — one honest empty state: the three "coming soon" toast cards
          (reception sign-up / Excel import / email invite) were fake options.
          The only real way to add a member today is the same centered modal
          the dashboard uses. */}
      {isEmpty && !loading && (
        <Card className="p-12 text-center">
          <span className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl">group_add</span>
          </span>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {rtl ? 'لا يوجد مشتركون بعد' : 'No members yet'}
          </h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            {rtl ? 'ابدأ بإضافة أول مشترك — ستظهر قائمتهم هنا مباشرة' : 'Add your first member — the directory will appear here'}
          </p>
          <PrimaryAction onClick={() => setAction('member')}>
            <Plus size={16} />
            {rtl ? 'إضافة مشترك' : 'Add member'}
          </PrimaryAction>
        </Card>
      )}

      {/* Empty search results */}
      {isEmptySearch && !loading && (
        <Card className="p-12 text-center">
          <span className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <span className="material-symbols-outlined text-3xl text-gray-400">search_off</span>
          </span>
          <p className="text-gray-500">{rtl ? 'لا توجد نتائج مطابقة' : 'No matching results found'}</p>
        </Card>
      )}

      {/* Members Directory Table */}
      {!loading && members.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="members-table">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider w-10">#</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'الحالة' : 'STATUS'}</th>
                  {sortTh('remaining')}
                  {sortTh('member_name')}
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'جهة الاتصال' : 'CONTACT'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'الاشتراك' : 'PLAN'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'ينتهي في' : 'ENDS IN'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'العمر / تاريخ الميلاد' : 'AGE / DOB'}</th>
                  {sortTh('last_visit')}
                  {sortTh('visits')}
                </tr>
              </thead>
              <tbody>
                {members.map((m, idx) => {
                  const meta = subMeta(m.subscription_status, m.is_blacklisted, rtl);
                  const endDays = daysUntil(m.subscription_end_date);
                  const endSoon = m.subscription_status === 'active' && endDays !== null && endDays <= 7;
                  return (
                    <tr
                      key={m.id}
                      className="border-t border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setEditing(m)}
                      title={rtl ? 'اضغط للتعديل السريع' : 'Click for quick edit'}
                    >
                      <td className="p-3 text-start text-gray-400 tabular-nums text-xs">
                        {(page - 1) * limit + idx + 1}
                      </td>
                      <td className="p-3 text-start">
                        <StatusBadge status={meta.label} variant={meta.variant} />
                      </td>
                      <td className={`p-3 text-start whitespace-nowrap tabular-nums ${endSoon ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                        {(() => {
                          if (!m.subscription_end_date) return '—';
                          if (m.subscription_status === 'cancelled') return rtl ? 'ملغي' : 'Cancelled';
                          if (m.subscription_status === 'frozen') return rtl ? 'مجمّد' : 'Frozen';
                          if (m.subscription_status === 'suspended') return rtl ? 'موقوف' : 'Suspended';
                          if (endDays === null || endDays < 0 || m.subscription_status === 'expired') return rtl ? 'منتهي' : 'Expired';
                          return rtl ? `${endDays} يوم` : `${endDays}d`;
                        })()}
                      </td>
                      <td className="p-3 text-start">
                        <p className="font-semibold text-gray-900 leading-tight whitespace-nowrap">{m.full_name}</p>
                        <p className="text-xs text-gray-500 whitespace-nowrap">{rtl ? 'كود' : 'Code'} {m.code ?? '—'}</p>
                      </td>
                      <td className={`p-3 text-gray-500 ${rtl ? 'text-right' : 'text-left'}`}>
                        <div dir="ltr">
                          {m.email && <p className="leading-tight">{m.email}</p>}
                          {m.phone_number && <p className="leading-tight">{m.phone_number}</p>}
                          {!m.email && !m.phone_number && <span>-</span>}
                        </div>
                      </td>
                      <td className="p-3 text-start text-gray-500">{m.plan_name || '-'}</td>
                      <td className={`p-3 text-start whitespace-nowrap ${endSoon ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                        {m.subscription_end_date ? formatDate(m.subscription_end_date) : '-'}
                      </td>
                      <td className="p-3 text-start text-gray-500 whitespace-nowrap">
                        {m.birth_date ? `${calcAge(m.birth_date)} · ${formatDate(m.birth_date)}` : '-'}
                      </td>
                      <td className="p-3 text-start text-gray-500 whitespace-nowrap">{formatDate(m.last_checkin)}</td>
                      <td className="p-3 text-start text-gray-500 tabular-nums">{m.visit_count != null ? Number(m.visit_count) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-100 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {rtl ? `${total} مشترك` : `${total} member${total !== 1 ? 's' : ''}`}
              </span>
              <label className="flex items-center gap-1.5 text-sm text-gray-500">
                {rtl ? 'عرض' : 'Show'}
                <select
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm min-h-[40px]"
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                >
                  <option value={10}>10</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={300}>300</option>
                </select>
              </label>
            </div>
            {pages > 1 && (
              <div className="flex items-center gap-2" dir={rtl ? 'rtl' : 'ltr'}>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                  const start = pages <= 5 ? 1 : Math.max(1, Math.min(page - 2, pages - 4));
                  const p = start + i;
                  if (p > pages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      aria-label={rtl ? `الصفحة ${p}` : `Page ${p}`}
                      className={`w-9 h-9 rounded-xl text-sm font-medium transition min-w-[44px] ${page === p ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* §33أ/§34د-5 — the same centered member modal the dashboard uses */}
      <QuickActionModals action={action} onClose={() => setAction(null)} />
      {editing && (
        <EditMemberModal
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => fetchMembers()}
        />
      )}
      {showImport && (
        <ImportMembersModal
          onClose={() => setShowImport(false)}
          onImported={() => fetchMembers()}
        />
      )}
    </DashboardPage>
  );
}

