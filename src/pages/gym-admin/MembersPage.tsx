import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { listMembers, getMemberStats, type MemberResponse, type MemberStats } from '../../services/api';
import FilterBar from '../../components/shared/FilterBar';
import PageLoader from '../../components/shared/PageLoader';
import StatusBadge from '../../components/ui/StatusBadge';
import Card from '../../components/ui/Card';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
import { formatDate, daysUntil } from '../../utils/date';
import { buildExportMatrix, downloadMatrixXlsx } from '../../utils/csv';
import { Plus } from '@phosphor-icons/react';
import { DashboardPage, PrimaryAction } from '../../components/dashboard';
import EditMemberModal from './EditMemberModal';
import ImportMembersModal from './ImportMembersModal';
import BulkLoginCodesDialog from '../../components/staff/BulkLoginCodesDialog';

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
  if (status === 'frozen') return { label: rtl ? 'مجمّد' : 'Frozen', variant: 'neutral' };
  if (status === 'cancelled') return { label: rtl ? 'ملغي' : 'Cancelled', variant: 'neutral' };
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

// الأعمدة القابلة للترتيب هي مفاتيح الـwhitelist في `/api/members` بالظبط
// (member_name · end_date · remaining · visits · last_visit)، والاتجاه الافتراضي
// الذكي لكل عمود بيتعمل بـ sortDescFirst جوّه العقد مش بماكينة ترتيب هنا.

export default function MembersPage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
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
  // إضافة مشترك = صفحة onboarding الكاملة (/admin/members/add: عضو +
  // اشتراك أول + دفعة أولى) — لا مودال مختصر هنا.
  const [limit, setLimit] = useState(10);
  // الترتيب: العمود + الاتجاه — الافتراضي الأحدث انضمامًا (نفس ترتيب السيرفر القديم).
  const [sort, setSort] = useState('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [editing, setEditing] = useState<MemberResponse | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
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

  // الضغط على رأس مرتّب يعكس الاتجاه ويصفّح من الأول — الماكينة دي كلها بقت
  // جوّه `ui/DataTable`، والصفحة بتبعت المفتاح للسيرفر بس (manualSorting).
  const remainingText = (m: MemberResponse, endDays: number | null): string => {
    if (!m.subscription_end_date) return '—';
    if (m.subscription_status === 'cancelled') return rtl ? 'ملغي' : 'Cancelled';
    if (m.subscription_status === 'frozen') return rtl ? 'مجمّد' : 'Frozen';
    if (m.subscription_status === 'suspended') return rtl ? 'موقوف' : 'Suspended';
    if (endDays === null || endDays < 0 || m.subscription_status === 'expired') return rtl ? 'منتهي' : 'Expired';
    return rtl ? `${endDays} يوم` : `${endDays}d`;
  };

  const isEndingSoon = (m: MemberResponse, endDays: number | null): boolean =>
    m.subscription_status === 'active' && endDays !== null && endDays <= 7;

  const columns: TableColumn<MemberResponse>[] = [
    {
      id: '__n',
      label: rtl ? 'م' : '#',
      width: '2.5rem',
      cell: (_m, i) => (
        <span className="text-xs text-ink-faint tabular-nums">{(page - 1) * limit + i + 1}</span>
      ),
    },
    {
      id: 'status',
      label: rtl ? 'الحالة' : 'Status',
      width: '8rem',
      cell: (m) => {
        const meta = subMeta(m.subscription_status, m.is_blacklisted, rtl);
        return <StatusBadge status={meta.label} variant={meta.variant} />;
      },
    },
    {
      // المتبقي = الأيام لحد الانتهاء؛ السيرفر بيرتّبه بنفس عمود end_date.
      id: 'remaining',
      label: rtl ? 'المتبقي' : 'Left',
      sortable: true,
      numeric: true,
      width: '6.5rem',
      value: (m) => m.subscription_end_date,
      cell: (m) => {
        const endDays = daysUntil(m.subscription_end_date);
        return (
          <span className={isEndingSoon(m, endDays) ? 'font-bold text-destructive' : 'whitespace-nowrap'}>
            {remainingText(m, endDays)}
          </span>
        );
      },
    },
    {
      id: 'member_name',
      key: 'full_name',
      label: rtl ? 'المشترك' : 'Member',
      sortable: true,
      cell: (m) => (
        <div>
          <p className="font-semibold text-foreground leading-tight whitespace-nowrap">{m.full_name}</p>
          <p className="text-xs text-ink-faint whitespace-nowrap">{rtl ? 'كود' : 'Code'} {m.code ?? '—'}</p>
        </div>
      ),
    },
    {
      id: 'contact',
      label: rtl ? 'جهة الاتصال' : 'Contact',
      cell: (m) =>
        m.email || m.phone_number ? (
          // الأرقام والإيميلات LTR بطبيعتها: الاتجاه جوه الخلية، مش اتجاه الجدول.
          <div dir="ltr" className="space-y-0.5 text-ink-faint">
            {m.email && <p className="leading-tight">{m.email}</p>}
            {m.phone_number && <p className="leading-tight">{m.phone_number}</p>}
          </div>
        ) : (
          '—'
        ),
    },
    { id: 'plan', key: 'plan_name', label: rtl ? 'الاشتراك' : 'Plan' },
    {
      id: 'end_date',
      label: rtl ? 'ينتهي في' : 'Ends',
      sortable: true,
      width: '8.5rem',
      value: (m) => m.subscription_end_date,
      cell: (m) => {
        const endDays = daysUntil(m.subscription_end_date);
        return (
          <span className={isEndingSoon(m, endDays) ? 'font-bold text-destructive whitespace-nowrap' : 'whitespace-nowrap'}>
            {m.subscription_end_date ? formatDate(m.subscription_end_date) : '—'}
          </span>
        );
      },
    },
    {
      id: 'age',
      label: rtl ? 'العمر / تاريخ الميلاد' : 'Age / DOB',
      cell: (m) => (m.birth_date ? `${calcAge(m.birth_date)} · ${formatDate(m.birth_date)}` : '—'),
    },
    {
      id: 'last_visit',
      label: rtl ? 'آخر زيارة' : 'Last visit',
      sortable: true,
      sortDescFirst: true,
      cell: (m) => (m.last_checkin ? formatDate(m.last_checkin) : '—'),
    },
    {
      id: 'visits',
      label: rtl ? 'الزيارات' : 'Visits',
      sortable: true,
      sortDescFirst: true,
      numeric: true,
      value: (m) => Number(m.visit_count ?? 0),
      cell: (m) => (m.visit_count != null ? Number(m.visit_count) : '—'),
    },
  ];

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
        <PrimaryAction onClick={() => navigate('/admin/members/add')}>
          <Plus size={16} />
          {rtl ? 'إضافة مشترك' : 'Add member'}
        </PrimaryAction>
      }
    >

      {/* §34ح — five live stat cards (big colored number, small caption) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(statCards || [0, 1, 2, 3, 4].map(() => null)).map((c, i) => (
          <div key={i} className="bg-white rounded-3xl border border-gray-100 shadow-sm px-4 py-5 text-center [container-type:inline-size]">
            <div className={`font-extrabold leading-none tabular-nums whitespace-nowrap text-[clamp(20px,10cqw,30px)] ${c ? c.color : 'text-gray-300'}`}>
              {c ? c.value : '—'}
            </div>
            <div className="mt-2 text-gray-500 font-medium whitespace-nowrap text-[clamp(10px,4cqw,12px)]">
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
            {/* The cut-over: 2 463 of the members here still have no login code.
                Opens the chunked generator (and its one-time CSV). */}
            <button
              type="button"
              onClick={() => setShowCodes(true)}
              className="flex items-center gap-1.5 h-10 px-3 border rounded-lg text-label-sm transition-colors bg-surface-container-low text-on-surface-variant border-outline-variant hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-lg">key</span>
              <span>{rtl ? 'أكواد الدخول' : 'Login codes'}</span>
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
          Adding the first member opens the full onboarding page. */}
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
          <PrimaryAction onClick={() => navigate('/admin/members/add')}>
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

      {/* Members Directory Table — صدفة ui/DataTable الواحدة: الحبر من التوكنات،
          والرؤوس القابلة للضغط هي مفاتيح الـwhitelist في السيرفر بالظبط. */}
      {!loading && members.length > 0 && (
        <DataTable
          columns={columns}
          data={members}
          manualSorting
          sorting={[{ id: sort, desc: order === 'desc' }]}
          onSortingChange={(next) => {
            const picked = next[0];
            if (!picked) return;
            setSort(picked.id);
            setOrder(picked.desc ? 'desc' : 'asc');
            setPage(1);
          }}
          onRowClick={(m) => setEditing(m)}
          rowTitle={() => (rtl ? 'اضغط للتعديل السريع' : 'Click for quick edit')}
          // نفس أرضية العرض القديمة (min-w-[880px] + 16px على الموبايل) من غير
          // غلاف .members-table: الصدفة والصندوق المتحرك بقوا ملك المكوّن.
          minWidth="880px"
          className="max-md:text-base"
          footer={
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {rtl ? `${total} مشترك` : `${total} member${total !== 1 ? 's' : ''}`}
                </span>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {rtl ? 'عرض' : 'Show'}
                  <select
                    className="rounded-shell border border-hairline bg-card px-2 py-1.5 text-sm min-h-[40px]"
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
                        type="button"
                        onClick={() => setPage(p)}
                        aria-label={rtl ? `الصفحة ${p}` : `Page ${p}`}
                        aria-current={page === p ? 'page' : undefined}
                        className={`w-9 h-9 rounded-shell text-sm font-medium transition min-w-[44px] ${
                          page === p
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-hairline text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          }
        />
      )}

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
      {showCodes && (
        <BulkLoginCodesDialog open onClose={() => setShowCodes(false)} scope="members" />
      )}
    </DashboardPage>
  );
}

