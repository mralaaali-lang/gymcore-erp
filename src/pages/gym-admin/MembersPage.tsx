import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { listMembers, type MemberResponse } from '../../services/api';
import FilterBar from '../../components/shared/FilterBar';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import ExportButton from '../../components/shared/ExportButton';
import StatusBadge from '../../components/ui/StatusBadge';
import Card from '../../components/ui/Card';
import { formatDate, daysUntil } from '../../utils/date';
import { Plus } from 'lucide-react';
import { DashboardPage, PrimaryAction } from '../../components/dashboard';
import { QuickActionModals, type ActionKey } from '../../components/dashboard/QuickActionCenter';

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

function subAvatarClass(meta: SubMeta): string {
  if (meta.variant === 'success') return 'bg-emerald-500';
  if (meta.variant === 'error') return 'bg-red-500';
  if (meta.variant === 'warning') return 'bg-amber-500';
  return 'bg-gray-300 text-gray-600';
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

export default function MembersPage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const rtl = language === 'ar';

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // §34د-5 — adding a member starts right here, with the SAME centered modal
  // the dashboard uses (real offers + PIN shown once), not a page detour.
  const [action, setAction] = useState<ActionKey | null>(null);
  const perPage = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Check for success banner flag
  const justAdded = sessionStorage.getItem('member_just_added') === 'true';

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMembers({
        search: debouncedSearch || undefined,
        status: filter !== 'all' ? filter : undefined,
        page,
        limit: perPage,
      });
      const list = data.members || [];
      setMembers(list);
      setTotal(data.total || 0);
    } catch {
      showToast(rtl ? 'فشل تحميل القائمة' : 'Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filter, page, rtl, showToast]);

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

  const pages = Math.ceil(total / perPage);
  const isEmpty = !loading && total === 0 && !search && filter === 'all';
  const isEmptySearch = !loading && members.length === 0 && (search || filter !== 'all');

  // §34د-3 — tabs that exist: the duplicate "check-in" (same route as
  // attendance) and the route-less "rosters"/"documents" (toast-only) are gone.
  const sectionTabs = [
    { id: 'members', labelEn: 'Members', labelAr: 'المشتركين', route: '/admin/members' },
    { id: 'attendance', labelEn: 'Attendance', labelAr: 'الحضور', route: '/admin/attendance' },
    { id: 'memberships', labelEn: 'Memberships', labelAr: 'الباقات', route: '/admin/plans' },
    { id: 'content', labelEn: 'Content', labelAr: 'المحتوى', route: '/admin/marketing?tab=Announcements' },
    { id: 'growth', labelEn: 'Growth', labelAr: 'النمو', route: '/admin/analytics' },
    { id: 'settings', labelEn: 'Settings', labelAr: 'الإعدادات', route: '/admin/settings' },
  ];

  const navigateTab = (tab: typeof sectionTabs[0]) => {
    navigate(tab.route);
  };

  const activeTabKey = sectionTabs.find((t) => location.pathname === t.route || location.pathname.startsWith(t.route.split('?')[0] + '/'))?.id ?? 'members';

  return (
    <DashboardPage
      className="bg-gray-50 min-h-screen -m-6 p-6"
      title={rtl ? 'إدارة المشتركين' : 'Members'}
      subtitle={rtl ? 'إدارة مشتركي الصالة الرياضية' : 'Manage gym members'}
      actions={
        <PrimaryAction onClick={() => setAction('member')}>
          <Plus size={16} />
          {rtl ? 'إضافة مشترك' : 'Add member'}
        </PrimaryAction>
      }
    >

      {/* Section Tabs Navigation */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-4 pt-2 overflow-x-auto">
        <UnifiedTabs
          variant="underline"
          tabs={sectionTabs.map((t) => ({ key: t.id, labelAr: t.labelAr, labelEn: t.labelEn }))}
          activeKey={activeTabKey}
          onChange={(key) => {
            const tab = sectionTabs.find((t) => t.id === key);
            if (tab) navigateTab(tab);
          }}
        />
      </div>

      {/* Action Bar */}
      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder={rtl ? 'بحث بالاسم الأول أو الأخير...' : 'Search first or last name...'}
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
          <ExportButton
              columns={[
                { key: 'full_name', label: rtl ? 'المشترك' : 'Member' },
                { key: 'phone_number', label: rtl ? 'جهة الاتصال' : 'Contact' },
                { key: 'plan_name', label: rtl ? 'المستوى' : 'Plan' },
                { key: 'subscription_status', label: rtl ? 'الحالة' : 'Status' },
                { key: 'subscription_end_date', label: rtl ? 'تاريخ الانتهاء' : 'Ends' },
                { key: 'join_date', label: rtl ? 'تاريخ الانضمام' : 'Joined' },
                { key: 'visit_count', label: rtl ? 'الزيارات' : 'Visits' },
              ]}
              data={members as unknown as Record<string, unknown>[]}
              filename="members"
          />
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
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'المشترك' : 'MEMBER'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'جهة الاتصال' : 'CONTACT'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'العمر / تاريخ الميلاد' : 'AGE / DOB'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'المستوى' : 'RANK / LEVEL'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'تاريخ الانضمام' : 'JOINED'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'ينتهي في' : 'ENDS IN'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'آخر زيارة' : 'LAST VISIT'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'الزيارات' : 'VISITS'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'الحالة' : 'STATUS'}</th>
                  <th className="p-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const initials = m.full_name ? m.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '??';
                  const meta = subMeta(m.subscription_status, m.is_blacklisted, rtl);
                  const endDays = daysUntil(m.subscription_end_date);
                  const endSoon = m.subscription_status === 'active' && endDays !== null && endDays <= 7;
                  return (
                    <tr
                      key={m.id}
                      className="border-t border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/admin/members/${m.id}`)}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-bold text-white shrink-0 ${subAvatarClass(meta)}`}>
                            {initials}
                          </div>
                          <p className="font-semibold text-gray-900 leading-tight">{m.full_name}</p>
                        </div>
                      </td>
                      <td className="p-3 text-gray-500" dir="ltr">{m.phone_number || '-'}</td>
                      <td className="p-3 text-gray-500">
                        {m.birth_date ? `${calcAge(m.birth_date)} · ${formatDate(m.birth_date)}` : '-'}
                      </td>
                      <td className="p-3 text-gray-500">{m.plan_name || '-'}</td>
                      <td className="p-3 text-gray-500">{formatDate(m.join_date || m.created_at)}</td>
                      <td className={`p-3 ${endSoon ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                        {m.subscription_end_date ? (
                          <span title={formatDate(m.subscription_end_date)}>
                            {formatDate(m.subscription_end_date)}
                            {endDays !== null && endDays >= 0 && ` (${rtl ? `${endDays} يوم` : `${endDays}d`})`}
                            {endDays !== null && endDays < 0 && (rtl ? ` (متأخر ${-endDays} يوم)` : ` (overdue ${-endDays}d)`)}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3 text-gray-500">{formatDate(m.last_checkin)}</td>
                      <td className="p-3 text-gray-500 tabular-nums">{m.visit_count != null ? Number(m.visit_count) : '-'}</td>
                      <td className="p-3">
                        <StatusBadge status={meta.label} variant={meta.variant} />
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/admin/members/${m.id}`)}
                          className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-emerald-600 transition touch-auto"
                          title={rtl ? 'ملف العضو' : 'Member profile'}
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between p-4 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              {rtl ? `${total} مشترك` : `${total} member${total !== 1 ? 's' : ''}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-xl border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                const start = pages <= 5 ? 1 : Math.max(1, Math.min(page - 2, pages - 4));
                const p = start + i;
                if (p > pages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-xl text-sm font-medium transition ${page === p ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(Math.min(pages, page + 1))}
                disabled={page === pages}
                className="p-1.5 rounded-xl border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* §33أ/§34د-5 — the same centered member modal the dashboard uses */}
      <QuickActionModals action={action} onClose={() => setAction(null)} />
    </DashboardPage>
  );
}

