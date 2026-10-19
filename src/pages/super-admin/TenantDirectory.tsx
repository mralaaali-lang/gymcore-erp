// ── Tenant Directory — §40: دليل الصالات على حقائق العقود (فلاتر وترقيم من الخادم) ──
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listPlatformGymsFiltered, setPlatformGymActive, impersonateGym, deleteGym,
  listBillingPlans, markImpersonatedSession,
  type PlatformGym, type PlatformContract,
} from '../../services/api';
import {
  Plus, DotsThreeVertical, Users, ArrowSquareOut,
  Prohibit, CheckCircle, SignIn, ClipboardText, Pencil, Trash,
  WarningCircle, ArrowsClockwise, SquaresFour, List as ListIcon,
  MagnifyingGlass, Warning, FileText,
} from '@phosphor-icons/react';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import { tr, formatDate, planLabel, daysRemaining } from './superAdminUtils';
import { fmtMoney } from './contracts/contractsUtils';
import ContractDetailModal from './contracts/ContractDetailModal';
import ContractFormModal from './contracts/ContractFormModal';
import Modal from '../../components/shared/Modal';

type StatusFilter = 'all' | 'active' | 'suspended' | 'trial' | 'expired';
type SortKey = 'name' | 'created_at' | 'members' | 'renewal_date';

const STATUS_OPTIONS: { value: StatusFilter; en: string; ar: string }[] = [
  { value: 'all', en: 'All Status', ar: 'جميع الحالات' },
  { value: 'active', en: 'Active', ar: 'نشط' },
  { value: 'trial', en: 'Trial', ar: 'تجربة' },
  { value: 'expired', en: 'Expired', ar: 'منتهي' },
  { value: 'suspended', en: 'Suspended', ar: 'موقوف' },
];

const SORT_OPTIONS: { value: SortKey; en: string; ar: string }[] = [
  { value: 'name', en: 'Name', ar: 'الاسم' },
  { value: 'created_at', en: 'Newest', ar: 'الأحدث إضافة' },
  { value: 'members', en: 'Members', ar: 'عدد الأعضاء' },
  { value: 'renewal_date', en: 'Renewal date', ar: 'تاريخ التجديد' },
];

export default function TenantDirectory() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isRtl = language === 'ar';
  const T = (en: string, ar: string) => tr(isRtl, en, ar);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // البحث يُرسل للخادم بعد توقف الكتابة — بلا ضغط على كل حرف
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [search]);

  // مودالات §40: تفاصيل العقد + إبرام/تعديل
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formState, setFormState] = useState<
    null | { mode: 'create'; gym: PlatformGym } | { mode: 'edit'; contract: PlatformContract }
  >(null);

  // إجراء الصف (مودال وسطي)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // موجة 3 / دفعة 5: قفل السكرول ومعالِج Escape اليدوي اتحذفوا — `shared/Modal`
  // بيجيبهم مع Radix، ومعاهم حبس الفوكس وعزلة الخلفية واسترجاع الفاتح.

  const params = {
    search: debouncedSearch.trim() || undefined,
    status: filterStatus === 'all' ? undefined : filterStatus,
    sort,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  const { data, isLoading, isError } = useApiQuery(
    ['platform', 'gyms-page', JSON.stringify(params)],
    () => listPlatformGymsFiltered(params),
    { staleTime: 20_000 },
  );
  const gyms = data?.data ?? [];
  const total = data?.total ?? 0;
  const actionGym = gyms.find((gym) => gym.id === openDropdownId) ?? null;

  const { data: plansRes } = useApiQuery(['platform', 'plans'], () => listBillingPlans(), { staleTime: 60_000 });
  const plans = plansRes?.data ?? [];

  // ── عدّادات الحالة من الخادم (نفس فلتر الصفحة، limit=1 لقراءة total) ──
  const { data: activeRes } = useApiQuery(['platform', 'gyms-count', 'active'], () => listPlatformGymsFiltered({ status: 'active', limit: 1 }), { staleTime: 30_000 });
  const { data: trialRes } = useApiQuery(['platform', 'gyms-count', 'trial'], () => listPlatformGymsFiltered({ status: 'trial', limit: 1 }), { staleTime: 30_000 });
  const { data: expiredRes } = useApiQuery(['platform', 'gyms-count', 'expired'], () => listPlatformGymsFiltered({ status: 'expired', limit: 1 }), { staleTime: 30_000 });
  const { data: suspendedRes } = useApiQuery(['platform', 'gyms-count', 'suspended'], () => listPlatformGymsFiltered({ status: 'suspended', limit: 1 }), { staleTime: 30_000 });
  const activeCount = activeRes?.total ?? 0;
  const trialCount = trialRes?.total ?? 0;
  const expiredCount = expiredRes?.total ?? 0;
  const suspendedCount = suspendedRes?.total ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  // ── Mutations ──
  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ['platform'] });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setPlatformGymActive(id, is_active),
    onSuccess: (_res, variables) => {
      refreshAll();
      showToast(variables.is_active ? T('Gym activated', 'تم تفعيل الصالة') : T('Gym suspended', 'تم تعليق الصالة'), 'success');
    },
    onError: () => showToast(T('Action failed', 'فشل تنفيذ العملية'), 'error'),
  });

  const impersonateMutation = useMutation({
    mutationFn: (gymId: string) => impersonateGym(gymId),
    onSuccess: (res) => {
      // §69 — نفس العلة في `GymHandover`: التوكن كوكي HttpOnly ملهاش نسخة في
      // الـbody، فتحزين `access_token` كان بيحط حرفية "undefined" في
      // localStorage. اللي بيسلّم الجلسة فعلًا هو ماركر الدور (`app_role`).
      const { user } = res.data;
      markImpersonatedSession(user.role);
      showToast(T(`Logged in as ${user.full_name}`, `تم تسجيل الدخول كـ ${user.full_name}`), 'success');
      setTimeout(() => { window.location.href = '/admin/dashboard'; }, 1000);
    },
    onError: () => showToast(T('Failed to impersonate', 'فشل تسجيل الدخول'), 'error'),
  });

  const [deleteModalGym, setDeleteModalGym] = useState<PlatformGym | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const deleteMutation = useMutation({
    mutationFn: (gymId: string) => deleteGym(gymId),
    onSuccess: () => {
      refreshAll();
      showToast(T('Gym deleted', 'تم حذف الصالة'), 'success');
      setDeleteModalGym(null);
      setDeleteConfirmText('');
      setOpenDropdownId(null);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      showToast(axiosErr?.response?.data?.error || T('Failed to delete', 'فشل الحذف'), 'error');
    },
  });

  // ── الحالة من واقع العقد (وليس plan_tier اليدوي) ──
  const getStatusInfo = (gym: PlatformGym): { label: string; dot: string } => {
    if (!gym.is_active) return { label: T('Suspended', 'موقوف'), dot: 'bg-red-500' };
    if (!gym.contract_id) return { label: T('No contract', 'بلا عقد'), dot: 'bg-gray-400' };
    if (gym.on_trial) return { label: T('Trial', 'تجربة'), dot: 'bg-sky-500' };
    const d = daysRemaining(gym.contract_renewal_date ?? undefined);
    if (d !== null && d < 0) return { label: T('Expired', 'منتهي'), dot: 'bg-yellow-400' };
    if (d !== null && d <= 7) return { label: T('Expiring', 'ينتهي قريباً'), dot: 'bg-orange-500' };
    return { label: T('Active', 'نشط'), dot: 'bg-green-500' };
  };

  if (isLoading) {
    return <div className="p-6"><PageLoader variant="skeleton" rows={10} /></div>;
  }

  if (isError) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Warning size={48} className="mx-auto text-red-400 mb-4" />
        <p>{T('Failed to load gyms', 'تعذر تحميل الصالات')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-gray-50 min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={T('Tenant Directory', 'دليل الصالات')}
        subtitle={T('Contract-era facts — plan, price, renewal and live items come from each gym’s active contract', 'حقائق العقود — الباقة والسعر والتاريخ والبنود الحية من عقد كل صالة')}
        icon="buildings"
        actions={
          <button
            type="button"
            onClick={() => navigate('/super-admin/tenants/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 font-bold text-sm"
          >
            <Plus size={18} />
            <span>{T('Add New Gym', 'إضافة صالة جديدة')}</span>
          </button>
        }
      />

      {/* ── شريط الحالة — أرقام من الخادم، والنقر يُفعّل الفلتر ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { key: 'all' as StatusFilter, label: T('Total', 'الإجمالي'), count: total, dot: 'bg-gray-400' },
          { key: 'active' as StatusFilter, label: T('Active', 'نشط'), count: activeCount, dot: 'bg-green-500' },
          { key: 'trial' as StatusFilter, label: T('Trial', 'تجربة'), count: trialCount, dot: 'bg-sky-500' },
          { key: 'expired' as StatusFilter, label: T('Expired', 'منتهي'), count: expiredCount, dot: 'bg-yellow-400' },
          { key: 'suspended' as StatusFilter, label: T('Suspended', 'موقوف'), count: suspendedCount, dot: 'bg-red-500' },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => { setFilterStatus(s.key); setPage(1); }}
            className={`flex items-center gap-3 bg-white border rounded-3xl px-4 py-3 shadow-sm text-start transition-all hover:border-primary/40 ${filterStatus === s.key ? 'ring-2 ring-primary/30 border-primary/40' : 'border-gray-100'}`}
          >
            <span className={`w-3 h-3 rounded-full shrink-0 ${s.dot}`} />
            <div>
              <p className="text-lg font-bold text-gray-900">{s.count}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Toolbar: فلاتر حقيقية على الخادم ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlass size={18} className="absolute right-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={T('Search by name or subdomain...', 'بحث باسم الصالة أو النطاق...')}
            className="w-full pr-10 pl-4 py-2 bg-white border border-gray-100 rounded-xl text-gray-900 placeholder:text-gray-500/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value as StatusFilter); setPage(1); }}
          className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{T(o.en, o.ar)}</option>)}
        </select>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }}
          className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{T('Sort', 'ترتيب')}: {T(o.en, o.ar)}</option>)}
        </select>
        <button
          type="button"
          onClick={refreshAll}
          className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-500 hover:text-primary transition-colors"
          title={T('Refresh', 'تحديث')}
        >
          <ArrowsClockwise size={16} />
        </button>
        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-primary text-on-primary' : 'text-gray-500 hover:text-gray-900'}`}
            title={T('Table', 'جدول')}
          >
            <ListIcon size={16} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`p-2 rounded-lg transition-colors ${viewMode === 'cards' ? 'bg-primary text-on-primary' : 'text-gray-500 hover:text-gray-900'}`}
            title={T('Cards', 'بطاقات')}
          >
            <SquaresFour size={16} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
        {viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                  <th className="text-center p-4 font-semibold">{T('Status', 'الحالة')}</th>
                  <th className="text-right p-4 font-semibold">{T('Gym', 'الصالة')}</th>
                  <th className="text-right p-4 font-semibold">{T('Plan', 'الباقة')}</th>
                  <th className="text-right p-4 font-semibold">{T('Contract', 'العقد')}</th>
                  <th className="text-right p-4 font-semibold">{T('Renewal', 'التجديد')}</th>
                  <th className="text-center p-4 font-semibold">{T('Members', 'الأعضاء')}</th>
                  <th className="text-center p-4 font-semibold">{T('Items', 'البنود')}</th>
                  <th className="text-center p-4 font-semibold">{T('Actions', 'عمليات')}</th>
                </tr>
              </thead>
              <tbody>
                {gyms.map((gym: PlatformGym) => {
                  const status = getStatusInfo(gym);
                  const expired = (() => {
                    const d = daysRemaining(gym.contract_renewal_date ?? undefined);
                    return d !== null && d < 0;
                  })();
                  return (
                    <tr key={gym.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-center"><span className={`inline-block w-2.5 h-2.5 rounded-full ${status.dot}`} title={status.label} /></td>
                      <td className="p-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => gym.contract_id && setDetailId(gym.contract_id)}
                          className="text-start group"
                          disabled={!gym.contract_id}
                        >
                          <p className="text-gray-900 font-medium group-hover:text-primary transition-colors">{gym.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5" dir="ltr">{gym.subdomain}</p>
                        </button>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900 font-medium">{gym.plan_name || planLabel(gym.plan_tier, isRtl)}</span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-sm">
                        {gym.contract_id ? (
                          <span className="text-gray-700">
                            {fmtMoney(gym.contract_price, gym.contract_currency)}
                            <span className="text-gray-400"> / {gym.contract_cycle === 'yearly' ? T('year', 'سنة') : T('month', 'شهر')}</span>
                          </span>
                        ) : <span className="text-gray-500/40">—</span>}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {gym.contract_renewal_date ? (
                          <span className={`text-sm ${expired ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                            {formatDate(gym.contract_renewal_date)}
                            {gym.auto_renew && <span className="text-primary text-xs font-bold" title={T('Auto-renew', 'تجديد تلقائي')}> ↻</span>}
                          </span>
                        ) : <span className="text-gray-500/40 text-sm">—</span>}
                      </td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <span className="text-sm text-gray-900 font-medium inline-flex items-center gap-1">
                          <Users size={13} className="text-gray-400" />
                          {gym.active_members_count ?? 0}
                          {gym.effective_max_members != null && gym.effective_max_members > 0 && (
                            <span className="text-gray-400 text-xs">/ {gym.effective_max_members}</span>
                          )}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className="text-sm text-gray-900 font-medium"
                          title={(gym.effective_features ?? []).join(', ')}
                        >
                          {gym.live_addon_items ?? 0}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          aria-label={T(`Actions for ${gym.name}`, `إجراءات ${gym.name}`)}
                          aria-haspopup="dialog"
                          aria-expanded={openDropdownId === gym.id}
                          onClick={() => setOpenDropdownId(openDropdownId === gym.id ? null : gym.id)}
                          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <DotsThreeVertical size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {gyms.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-500">{T('No matching gyms', 'لا توجد صالات مطابقة')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {gyms.map((gym: PlatformGym) => {
              const status = getStatusInfo(gym);
              return (
                <div key={gym.id} className="bg-white border border-gray-100 rounded-3xl p-4 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${status.dot}`} title={status.label} />
                        <p className="font-semibold text-gray-900 truncate">{gym.name}</p>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5" dir="ltr">{gym.subdomain}.gymcore.app</p>
                    </div>
                    <button
                      type="button"
                      aria-label={T(`Actions for ${gym.name}`, `إجراءات ${gym.name}`)}
                      aria-haspopup="dialog"
                      aria-expanded={openDropdownId === gym.id}
                      onClick={() => setOpenDropdownId(openDropdownId === gym.id ? null : gym.id)}
                      className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <DotsThreeVertical size={16} />
                    </button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Status', 'الحالة')}</span>
                      <span className="text-gray-900 font-medium">{status.label}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Plan', 'الباقة')}</span>
                      <span className="text-gray-900 font-medium">{gym.plan_name || planLabel(gym.plan_tier, isRtl)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Contract', 'العقد')}</span>
                      <span className="text-gray-900">
                        {gym.contract_id ? `${fmtMoney(gym.contract_price, gym.contract_currency)} / ${gym.contract_cycle === 'yearly' ? T('year', 'سنة') : T('month', 'شهر')}` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Renewal', 'التجديد')}</span>
                      <span className="text-gray-900">
                        {gym.contract_renewal_date ? formatDate(gym.contract_renewal_date) : '—'}
                        {gym.auto_renew && <span className="text-primary font-bold" title={T('Auto-renew', 'تجديد تلقائي')}> ↻</span>}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Email', 'البريد')}</span>
                      <span className="text-gray-900 text-xs truncate" dir="ltr">{gym.email || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Members', 'الأعضاء')}</span>
                      <span className="text-gray-900 font-medium flex items-center gap-1.5">
                        <Users size={13} className="text-gray-500" />
                        {gym.active_members_count ?? 0}{gym.effective_max_members != null && gym.effective_max_members > 0 ? ` / ${gym.effective_max_members}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Live items', 'البنود الحية')}</span>
                      <span className="text-gray-900 font-medium">{gym.live_addon_items ?? 0}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {gyms.length === 0 && (
              <div className="col-span-full p-8 text-center text-gray-500">{T('No matching gyms', 'لا توجد صالات مطابقة')}</div>
            )}
          </div>
        )}

        {/* ── Pagination — ترقيم حقيقي من total الخادم ── */}
        <div className="p-4 text-sm text-gray-500 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span>{T('Rows:', 'عدد الصفوف:')}</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 bg-white border border-gray-100 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <span>{T(`Page ${safePage} of ${totalPages} — ${total} gyms`, `صفحة ${safePage} من ${totalPages} — ${total} صالة`)}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-lg border border-gray-100 text-gray-500 hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {T('Prev', 'السابق')}
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => (
              <button key={i} type="button" onClick={() => setPage(i + 1)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${safePage === i + 1 ? 'bg-primary text-on-primary' : 'border border-gray-100 text-gray-500 hover:text-primary hover:border-primary'}`}>
                {i + 1}
              </button>
            ))}
            {totalPages > 7 && <span className="px-1 text-gray-500">...</span>}
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-100 text-gray-500 hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {T('Next', 'التالي')}
            </button>
          </div>
        </div>
      </div>

      {/* موجة 3 / دفعة 5: نفس max-w-md (= size="md") ونفس الصفوف السبعة بنفس
          الـhandlers. سطر العقد نزل أول عنصر في المتّن لأن `description` بتاعة
          القشرة بتترجّع لـ`<p>` واحد، وتداخل `<p>` جوه `<p>` HTML غير صالح. */}
      {actionGym && (
        <Modal
          open
          onClose={() => setOpenDropdownId(null)}
          size="md"
          dir={isRtl ? 'rtl' : 'ltr'}
          title={(
            <span className="flex items-center gap-2">
              <SquaresFour size={20} className="text-primary" />
              {T('Gym actions', 'إجراءات الصالة')}
            </span>
          )}
          description={(
            <>
              {actionGym.name} · <span dir="ltr">{actionGym.subdomain}.gymcore.app</span>
            </>
          )}
          footer={(
            <button
              type="button"
              onClick={() => setOpenDropdownId(null)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              {T('Cancel', 'إلغاء')}
            </button>
          )}
        >
          <div className="space-y-2">
            {actionGym.contract_id && (
              <p className="text-xs text-gray-500">
                {actionGym.plan_name || planLabel(actionGym.plan_tier, isRtl)} · {fmtMoney(actionGym.contract_price, actionGym.contract_currency)}
                {actionGym.contract_renewal_date ? ` · ${T('renewal', 'تجديد')} ${formatDate(actionGym.contract_renewal_date)}` : ''}
              </p>
            )}
              <button
                type="button"
                onClick={() => {
                  setOpenDropdownId(null);
                  if (actionGym.contract_id) setDetailId(actionGym.contract_id);
                  else setFormState({ mode: 'create', gym: actionGym });
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-start transition hover:border-primary/30 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><FileText size={18} /></span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">
                    {actionGym.contract_id ? T('Contract file', 'ملف العقد') : T('Sign a contract', 'إبرام عقد')}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {actionGym.contract_id
                      ? T('Items, invoices, renewal and cancellation', 'البنود والفواتير والتجديد والإلغاء')
                      : T('This gym has no active contract — sign one now', 'هذه الصالة بلا عقد سارٍ — أبرم عقدها الآن')}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setOpenDropdownId(null); navigate(`/super-admin/tenants/${actionGym.id}/edit`); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-start transition hover:border-primary/30 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Pencil size={18} /></span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{T('Edit details', 'تعديل البيانات')}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{T('Update gym and contact information', 'تحديث بيانات الصالة والتواصل')}</span>
                </span>
              </button>

              <button
                type="button"
                disabled={impersonateMutation.isPending}
                onClick={() => { impersonateMutation.mutate(actionGym.id); setOpenDropdownId(null); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-start transition hover:border-primary/30 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><SignIn size={18} /></span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{T('Login as Admin', 'تسجيل الدخول كمدير')}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{T('Open this gym as its manager', 'فتح الصالة بصلاحية مديرها')}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setOpenDropdownId(null); navigate(`/super-admin/tenants/${actionGym.id}/handover`); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-start transition hover:border-primary/30 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><ClipboardText size={18} /></span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{T('Handover', 'التسليم')}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{T('Transfer ownership and access', 'نقل الملكية والصلاحيات')}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setOpenDropdownId(null); navigate(`/super-admin/billing?gym=${actionGym.id}`); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-start transition hover:border-primary/30 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ArrowSquareOut size={18} /></span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{T('Invoices', 'الفواتير')}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{T('View billing and payment history', 'عرض الفواتير وسجل المدفوعات')}</span>
                </span>
              </button>

              <button
                type="button"
                disabled={toggleActiveMutation.isPending}
                onClick={() => { toggleActiveMutation.mutate({ id: actionGym.id, is_active: !actionGym.is_active }); setOpenDropdownId(null); }}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 ${actionGym.is_active ? 'border-amber-100 hover:border-amber-300 hover:bg-amber-50/60' : 'border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/60'}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${actionGym.is_active ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {actionGym.is_active ? <Prohibit size={18} /> : <CheckCircle size={18} />}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{actionGym.is_active ? T('Suspend gym', 'تعليق الصالة') : T('Activate gym', 'تفعيل الصالة')}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{actionGym.is_active ? T('Pause access for this gym', 'إيقاف وصول الصالة مؤقتًا') : T('Restore access for this gym', 'إعادة تفعيل وصول الصالة')}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => { setDeleteModalGym(actionGym); setOpenDropdownId(null); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-red-100 p-4 text-start transition hover:border-red-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-700"><Trash size={18} /></span>
                <span>
                  <span className="block text-sm font-semibold text-red-800">{T('Delete gym', 'حذف الصالة')}</span>
                  <span className="mt-0.5 block text-xs text-red-700/75">{T('Permanently remove this gym', 'حذف هذه الصالة نهائيًا')}</span>
                </span>
              </button>
          </div>
        </Modal>
      )}

      {/* §40 — تفاصيل العقد من نفس الشاشة */}
      {detailId && (
        <ContractDetailModal
          contractId={detailId}
          isRtl={isRtl}
          t={T}
          onClose={() => setDetailId(null)}
          onEdit={(c) => { setDetailId(null); setFormState({ mode: 'edit', contract: c }); }}
        />
      )}

      {/* §40 — إبرام/تعديل عقد (وسطي، من كتالوج الخطط الحقيقي) */}
      {formState && (
        <ContractFormModal
          mode={formState.mode}
          contract={formState.mode === 'edit' ? formState.contract : undefined}
          gyms={formState.mode === 'create' ? [formState.gym] : gyms}
          plans={plans}
          isRtl={isRtl}
          t={T}
          onClose={() => setFormState(null)}
        />
      )}

      {/* موجة 3 / دفعة 5: تأكيد الحذف — نفس max-w-md (= size="md") ونفس حارس
          «اكتب DELETE» ونفس الـmutation. الـ`z-[70]` القديم كان تركة: الصف اللي
          بيفتح اللوحة دي بيقفل لوحة الإجراءات (`setOpenDropdownId(null)`) في نفس
          اللحظة، فمفيش تكديس نوافذ أصلًا وz-50 بتاعة القشرة كافية. */}
      {deleteModalGym && (
        <Modal
          open
          onClose={() => { setDeleteModalGym(null); setDeleteConfirmText(''); }}
          size="md"
          dir={isRtl ? 'rtl' : 'ltr'}
          disableDismiss={deleteMutation.isPending}
          title={(
            <span className="flex items-center gap-2">
              <WarningCircle size={20} className="text-red-600" />
              {T('Delete Gym', 'حذف النادي')}
            </span>
          )}
          footer={(
            <>
              <button
                type="button"
                onClick={() => { setDeleteModalGym(null); setDeleteConfirmText(''); }}
                className="px-5 py-3 border border-gray-100 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors"
              >
                {T('Cancel', 'إلغاء')}
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending || deleteConfirmText !== 'DELETE'}
                onClick={() => deleteMutation.mutate(deleteModalGym.id)}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleteMutation.isPending && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                {T('Delete Permanently', 'حذف نهائي')}
              </button>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800 font-medium mb-1">{T(`Are you sure you want to delete "${deleteModalGym.name}"?`, `هل أنت متأكد من حذف نادي "${deleteModalGym.name}"؟`)}</p>
              <p className="text-xs text-red-600">{T('All data will be permanently deleted.', 'سيتم حذف جميع البيانات بشكل نهائي.')}</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1.5">{T('Type "DELETE" to confirm:', 'اكتب "DELETE" للتأكيد:')}</label>
              <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE" className="w-full px-3 py-2 border border-gray-100 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 font-mono" dir="ltr" autoFocus />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
