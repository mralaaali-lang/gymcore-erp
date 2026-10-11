import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { listMembers, type MemberResponse } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import FilterBar from '../../components/shared/FilterBar';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import PageLoader from '../../components/shared/PageLoader';
import ExportButton from '../../components/shared/ExportButton';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import Card from '../../components/ui/Card';

const statusLabelsEn: Record<string, string> = { active: 'Active', expired: 'Expired', suspended: 'Suspended', inactive: 'Inactive' };
const statusLabelsAr: Record<string, string> = { active: 'نشط', expired: 'منتهي', suspended: 'موقوف', inactive: 'غير نشط' };

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'error';
  return 'neutral';
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBillingAlert, setShowBillingAlert] = useState(() => {
    return localStorage.getItem('gymcore_billing_alert_dismissed') !== '1';
  });
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

  const toggleSelectAll = () => {
    if (selected.size === members.length) { setSelected(new Set()); }
    else { setSelected(new Set(members.map((m) => m.id))); }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const sectionTabs = [
    { id: 'members', labelEn: 'Members', labelAr: 'المشتركين', route: '/admin/members' },
    { id: 'checkin', labelEn: 'Check-in', labelAr: 'تسجيل الدخول', route: '/admin/attendance' },
    { id: 'attendance', labelEn: 'Attendance', labelAr: 'الحضور', route: '/admin/attendance' },
    { id: 'memberships', labelEn: 'Memberships', labelAr: 'الباقات', route: '/admin/subscriptions' },
    { id: 'rosters', labelEn: 'Rosters', labelAr: 'القوائم', route: null },
    { id: 'documents', labelEn: 'Documents', labelAr: 'المستندات', route: null },
    { id: 'content', labelEn: 'Content', labelAr: 'المحتوى', route: '/admin/announcements' },
    { id: 'growth', labelEn: 'Growth', labelAr: 'النمو', route: '/admin/analytics' },
    { id: 'settings', labelEn: 'Settings', labelAr: 'الإعدادات', route: '/admin/settings' },
  ];

  const navigateTab = (tab: typeof sectionTabs[0]) => {
    if (tab.route) {
      navigate(tab.route);
    } else {
      showToast(rtl ? 'هذه الميزة قادمة قريباً' : 'This feature is coming soon', 'success');
    }
  };

  const activeTabKey = sectionTabs.find((t) => t.route && (location.pathname === t.route || location.pathname.startsWith(t.route + '/')))?.id ?? 'members';

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      <PageHeader
        title={rtl ? 'إدارة المشتركين' : 'Members'}
        subtitle={rtl ? 'إدارة مشتركي الصالة الرياضية' : 'Manage gym members'}
        icon="groups"
        actions={
          <>
            <Button variant="primary" onClick={() => navigate('/admin/members/add')}>
              <span className="material-symbols-outlined text-lg">add</span>
              {rtl ? 'إضافة مشترك' : '+ ADD MEMBER'}
            </Button>
            <Button variant="outline" onClick={() => showToast(rtl ? 'ميزة الدعوة قادمة قريباً' : 'Invite feature coming soon', 'success')}>
              {rtl ? 'دعوة' : 'INVITE'}
            </Button>
          </>
        }
      />

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
            ],
          },
        ]}
        onFilterChange={(_key, val) => { setFilter(val || 'all'); setPage(1); }}
        onRefresh={fetchMembers}
        extraActions={
          <>
            <Button variant="outline" className="h-10 px-3 text-sm font-medium">
              <span className="material-symbols-outlined text-lg">print</span>
              {rtl ? 'طباعة' : 'PRINT'}
            </Button>
            <ExportButton
              columns={[
                { key: 'full_name', label: rtl ? 'المشترك' : 'Member' },
                { key: 'phone_number', label: rtl ? 'جهة الاتصال' : 'Contact' },
                { key: 'plan_name', label: rtl ? 'المستوى' : 'Plan' },
                { key: 'status', label: rtl ? 'الحالة' : 'Status' },
                { key: 'join_date', label: rtl ? 'تاريخ الانضمام' : 'Joined' },
              ]}
              data={members as unknown as Record<string, unknown>[]}
              filename="members"
            />
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

      {/* Billing Setup Alert */}
      {showBillingAlert && members.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl px-4 py-3 flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-600">info</span>
            {rtl ? 'أكمل الإعدادات: قم بإعداد الفواتير لبدء تحصيل المدفوعات' : 'Continue Setup: Set up billing to start collecting payments'}
          </div>
          <button
            onClick={() => {
              navigate('/admin/settings?tab=billing');
              localStorage.setItem('gymcore_billing_alert_dismissed', '1');
              setShowBillingAlert(false);
            }}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition shrink-0"
          >
            {rtl ? 'إعداد الفواتير' : 'SET UP BILLING'}
          </button>
          <button
            onClick={() => {
              localStorage.setItem('gymcore_billing_alert_dismissed', '1');
              setShowBillingAlert(false);
            }}
            className="p-1 text-amber-600 hover:text-amber-800 transition"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <PageLoader variant="skeleton" rows={5} />
        </Card>
      )}

      {/* Empty State — How To Add Members */}
      {isEmpty && !loading && (
        <Card className="p-8 md:p-12">
          <div className="text-center mb-10">
            <span className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-4xl">group_add</span>
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {rtl ? 'كيفية إضافة مشتركين' : 'How To Add Members'}
            </h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              {rtl ? 'اختر الطريقة المناسبة لإضافة أعضاء إلى صالتك الرياضية' : 'Choose the method that works best to add members to your gym'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {/* Card 1 */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col items-center text-center">
              <span className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-2xl">person_add</span>
              </span>
              <p className="text-sm font-semibold text-gray-900 mb-1">{rtl ? 'إدخال بيانات المشترك يدوياً' : 'Enter member information through your account'}</p>
              <p className="text-xs text-gray-500 mb-4">{rtl ? 'أضف العضو من خلال لوحة التحكم' : 'Manually create a new member profile'}</p>
              <Button
                variant="primary"
                className="mt-auto px-4 py-2 text-xs"
                onClick={() => navigate('/admin/members/add')}
              >
                {rtl ? '+ إضافة مشترك' : '+ ADD A MEMBER'}
              </Button>
            </div>
            {/* Card 2 */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col items-center text-center">
              <span className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-2xl">desktop_mac</span>
              </span>
              <p className="text-sm font-semibold text-gray-900 mb-1">{rtl ? 'ملء البيانات في الاستقبال' : 'Have them fill out their information at your front desk'}</p>
              <p className="text-xs text-gray-500 mb-4">{rtl ? 'دع العضو يملأ بياناته من شاشة الاستقبال' : 'Let members fill in their details at the reception screen'}</p>
              <Button
                variant="outline"
                className="mt-auto px-4 py-2 text-xs"
                onClick={() => showToast(rtl ? 'ميزة الاستقبال قادمة قريباً' : 'Reception sign-up coming soon', 'success')}
              >
                {rtl ? 'اعرف المزيد' : 'LEARN MORE'}
              </Button>
            </div>
            {/* Card 3 */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col items-center text-center">
              <span className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-2xl">upload_file</span>
              </span>
              <p className="text-sm font-semibold text-gray-900 mb-1">{rtl ? 'استيراد مشتركين من ملف Excel' : 'Import existing members using a spreadsheet file'}</p>
              <p className="text-xs text-gray-500 mb-4">{rtl ? 'استورد قائمة الأعضاء من ملف CSV أو Excel' : 'Upload a CSV or Excel file with your member data'}</p>
              <Button
                variant="outline"
                className="mt-auto px-4 py-2 text-xs"
                onClick={() => showToast(rtl ? 'ميزة الاستيراد قادمة قريباً' : 'Import feature coming soon', 'success')}
              >
                {rtl ? 'استيراد...' : 'IMPORT...'}
              </Button>
            </div>
            {/* Card 4 */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col items-center text-center">
              <span className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-2xl">mail</span>
              </span>
              <p className="text-sm font-semibold text-gray-900 mb-1">{rtl ? 'دعوة عبر البريد الإلكتروني' : 'Invite members via Email to sign-up online'}</p>
              <p className="text-xs text-gray-500 mb-4">{rtl ? 'أرسل رابط تسجيل للعضو عبر البريد الإلكتروني' : 'Send an online sign-up link to prospective members'}</p>
              <Button
                variant="outline"
                className="mt-auto px-4 py-2 text-xs"
                onClick={() => showToast(rtl ? 'ميزة الدعوة قادمة قريباً' : 'Invite feature coming soon', 'success')}
              >
                {rtl ? 'دعوة مشتركين' : 'INVITE MEMBERS'}
              </Button>
            </div>
          </div>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-900">
              <thead>
                <tr className="bg-gray-50">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === members.length && members.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 accent-emerald-500"
                    />
                  </th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'المشترك' : 'MEMBER'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'جهة الاتصال' : 'CONTACT'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'العمر / تاريخ الميلاد' : 'AGE / DOB'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'المستوى' : 'RANK / LEVEL'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'تاريخ الانضمام' : 'JOINED'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'آخر زيارة' : 'LAST VISIT'}</th>
                  <th className="p-3 text-start font-semibold text-gray-500 uppercase text-xs tracking-wider">{rtl ? 'حالة الفوترة' : 'BILLING STATUS'}</th>
                  <th className="p-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const initials = m.full_name ? m.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : '??';
                  const subStatus = m.subscription_status || 'inactive';
                  const subLabel = subStatus === 'active' ? (rtl ? 'نشط' : 'Active') : subStatus === 'expired' ? (rtl ? 'منتهي' : 'Expired') : (rtl ? 'غير نشط' : 'Inactive');
                  return (
                    <tr
                      key={m.id}
                      className="border-t border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/admin/members/${m.id}`)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(m.id)}
                          onChange={() => toggleSelect(m.id)}
                          className="w-4 h-4 rounded border-gray-300 accent-emerald-500"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-bold text-white shrink-0 ${m.status === 'active' ? 'bg-emerald-500' : m.status === 'suspended' ? 'bg-red-500' : 'bg-gray-300 text-gray-600'}`}>
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 leading-tight">{m.full_name}</p>
                            <span className="mt-0.5 inline-block">
                              <StatusBadge status={rtl ? statusLabelsAr[m.status || 'inactive'] : statusLabelsEn[m.status || 'inactive']} variant={statusVariant(m.status || 'inactive')} />
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-gray-500" dir="ltr">{m.phone_number || '-'}</td>
                      <td className="p-3 text-gray-500">{m.birth_date ? calcAge(m.birth_date) : '-'}</td>
                      <td className="p-3 text-gray-500">{m.plan_name || '-'}</td>
                      <td className="p-3 text-gray-500">{m.join_date || m.created_at?.split('T')[0] || '-'}</td>
                      <td className="p-3 text-gray-500">{m.last_checkin || '-'}</td>
                      <td className="p-3">
                        <StatusBadge status={subLabel} variant={subStatus === 'active' ? 'success' : 'neutral'} />
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => navigate(`/admin/members/${m.id}`)}
                            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-emerald-600 transition"
                            title={rtl ? 'تعديل' : 'Edit'}
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/admin/members/${m.id}`); }}
                            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-red-500 transition"
                            title={rtl ? 'عرض الملف الشخصي' : 'View profile'}
                          >
                            <span className="material-symbols-outlined text-lg">logout</span>
                          </button>
                        </div>
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
    </div>
  );
}

