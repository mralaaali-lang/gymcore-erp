// ── Tenant Directory — Refactored with Shared Components & Phosphor Icons ──
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listPlatformGyms, setPlatformGymActive, updateGymSubscription,
  impersonateGym, deleteGym, type PlatformGym,
} from '../../services/api';
import {
  Plus, X, DotsThreeVertical, Users, CreditCard, ArrowSquareOut,
  Prohibit, CheckCircle, SignIn, ClipboardText, Pencil, Trash,
  WarningCircle, ArrowsClockwise, SquaresFour, List as ListIcon,
  MagnifyingGlass, Warning,
} from '@phosphor-icons/react';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import { tr, formatDate, planLabel, daysRemaining } from './superAdminUtils';

// ── Plan Badge Colors ──
const planBadge: Record<string, string> = {
  basic: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  professional: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  premium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  enterprise: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function TenantDirectory() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isRtl = language === 'ar';
  const T = (en: string, ar: string) => tr(isRtl, en, ar);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Subscription modal
  const [subModalGym, setSubModalGym] = useState<PlatformGym | null>(null);
  const [subPlanTier, setSubPlanTier] = useState('basic');
  const [subExpiry, setSubExpiry] = useState('');
  const [subError, setSubError] = useState<string | null>(null);

  // Actions dropdown
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Match the centered, keyboard-dismissable action dialog used by Platform Admins.
  useEffect(() => {
    if (!openDropdownId) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdownId(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdownId]);

  const { data, isLoading, isError } = useApiQuery(['platform', 'gyms'], listPlatformGyms, { staleTime: 30_000 });
  const gyms = data?.data ?? [];
  const actionGym = gyms.find((gym) => gym.id === openDropdownId) ?? null;

  const filtered = gyms.filter((g) => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.subdomain.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'active' ? g.is_active : !g.is_active);
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedGyms = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const statusCounts = useMemo(() => ({
    active: gyms.filter((g) => g.is_active).length,
    suspended: gyms.filter((g) => !g.is_active).length,
    expiring: gyms.filter((g) => {
      const d = daysRemaining(g.subscription_expires_at);
      return d !== null && d >= 0 && d <= 7;
    }).length,
    expired: gyms.filter((g) => {
      const d = daysRemaining(g.subscription_expires_at);
      return d !== null && d < 0;
    }).length,
  }), [gyms]);

  // ── Mutations ──
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      setPlatformGymActive(id, is_active),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] });
      showToast(variables.is_active ? T('Gym activated', 'تم تفعيل الصالة') : T('Gym suspended', 'تم تعليق الصالة'), 'success');
    },
    onError: () => showToast(T('Action failed', 'فشل تنفيذ العملية'), 'error'),
  });

  const updateSubMutation = useMutation({
    mutationFn: ({ id, plan_tier, subscription_expires_at }: {
      id: string; plan_tier?: string; subscription_expires_at?: string;
    }) => updateGymSubscription(id, { plan_tier, subscription_expires_at }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] });
      showToast(T('Subscription updated', 'تم تحديث الاشتراك'), 'success');
      setSubModalGym(null);
      setSubError(null);
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setSubError(axiosErr?.response?.data?.error || T('Failed to update', 'فشل التحديث'));
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (gymId: string) => impersonateGym(gymId),
    onSuccess: (res) => {
      const { access_token, gym_id, user } = res.data;
      localStorage.setItem('auth_token', access_token);
      localStorage.setItem('gym_id', gym_id);
      localStorage.setItem('user_role', 'gym-admin');
      localStorage.setItem('impersonated_by', 'super_admin');
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
      queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] });
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

  const handleSubSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubError(null);
    if (!subModalGym) return;
    updateSubMutation.mutate({
      id: subModalGym.id,
      plan_tier: subPlanTier,
      subscription_expires_at: subExpiry || undefined,
    });
  };

  const openSubModal = (gym: PlatformGym) => {
    setSubModalGym(gym);
    setSubPlanTier(gym.plan_tier);
    setSubExpiry(gym.subscription_expires_at ? gym.subscription_expires_at.split('T')[0] : '');
    setSubError(null);
    setOpenDropdownId(null);
  };

  const getStatusInfo = (gym: PlatformGym) => {
    const d = daysRemaining(gym.subscription_expires_at);
    if (!gym.is_active) return { label: T('Suspended', 'موقوف'), color: 'bg-red-500', dot: 'bg-red-500' };
    if (d !== null && d < 0) return { label: T('Expired', 'منتهي'), color: 'bg-yellow-400', dot: 'bg-yellow-400' };
    if (d !== null && d <= 7) return { label: T('Expiring', 'ينتهي قريباً'), color: 'bg-orange-500', dot: 'bg-orange-500' };
    return { label: T('Active', 'نشط'), color: 'bg-green-500', dot: 'bg-green-500' };
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
        subtitle={T('Manage gyms as entities — no visibility into internal data', 'إدارة الصالات كجهات — بدون رؤية أي بيانات تشغيلية داخلية')}
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

      {/* ── Status Indicator Bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: T('Active', 'نشط'), count: statusCounts.active, dot: 'bg-green-500' },
          { label: T('Expiring', 'ينتهي قريباً'), count: statusCounts.expiring, dot: 'bg-orange-500' },
          { label: T('Expired', 'منتهي'), count: statusCounts.expired, dot: 'bg-yellow-400' },
          { label: T('Suspended', 'موقوف'), count: statusCounts.suspended, dot: 'bg-red-500' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 bg-white border border-gray-100 rounded-3xl px-4 py-3 shadow-sm">
            <span className={`w-3 h-3 rounded-full ${s.dot}`} />
            <div>
              <p className="text-lg font-bold text-gray-900">{s.count}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlass size={18} className="absolute right-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={T('Search by name or subdomain...', 'بحث باسم الصالة أو النطاق...')}
            className="w-full pr-10 pl-4 py-2 bg-white border border-gray-100 rounded-xl text-gray-900 placeholder:text-gray-500/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value as typeof filterStatus); setPage(1); }}
          className="px-4 py-2 bg-white border border-gray-100 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="all">{T('All Status', 'جميع الحالات')}</option>
          <option value="active">{T('Active', 'نشط')}</option>
          <option value="suspended">{T('Suspended', 'موقوف')}</option>
        </select>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['platform', 'gyms'] })}
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
                  <th className="text-right p-4 font-semibold">{T('#', '#')}</th>
                  <th className="text-center p-4 font-semibold">{T('Status', 'الحالة')}</th>
                  <th className="text-right p-4 font-semibold">{T('Name', 'الاسم')}</th>
                  <th className="text-right p-4 font-semibold">{T('Email', 'البريد')}</th>
                  <th className="text-right p-4 font-semibold">{T('Plan', 'الباقة')}</th>
                  <th className="text-right p-4 font-semibold">{T('Expiry', 'تاريخ الانتهاء')}</th>
                  <th className="text-center p-4 font-semibold">{T('Members', 'المشتركين')}</th>
                  <th className="text-center p-4 font-semibold">{T('Actions', 'عمليات')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedGyms.map((gym: PlatformGym, idx: number) => {
                  const status = getStatusInfo(gym);
                  const email = gym.email || '-';
                  return (
                    <tr key={gym.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-gray-500 text-xs font-mono w-8">{(safePage - 1) * pageSize + idx + 1}</td>
                      <td className="p-4 text-center"><span className={`inline-block w-2.5 h-2.5 rounded-full ${status.dot}`} title={status.label} /></td>
                      <td className="p-4 text-gray-900 font-medium whitespace-nowrap">{gym.name}</td>
                      <td className="p-4 text-gray-500 text-sm truncate max-w-[160px]" dir="ltr">{email}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${planBadge[gym.plan_tier] || planBadge.basic}`}>
                          {planLabel(gym.plan_tier, isRtl)}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {gym.subscription_expires_at ? (
                          <span className={`text-sm ${new Date(gym.subscription_expires_at) < new Date() ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            {formatDate(gym.subscription_expires_at)}
                          </span>
                        ) : <span className="text-gray-500/40 text-sm">-</span>}
                      </td>
                      <td className="p-4 text-center"><span className="text-sm text-gray-900 font-medium">{gym.active_members_count ?? 0}</span></td>
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
                {pagedGyms.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-500">{T('No matching gyms', 'لا توجد صالات مطابقة')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {pagedGyms.map((gym: PlatformGym) => {
              const status = getStatusInfo(gym);
              const email = gym.email || '-';
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
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${planBadge[gym.plan_tier] || planBadge.basic}`}>
                        {planLabel(gym.plan_tier, isRtl)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Email', 'البريد')}</span>
                      <span className="text-gray-900 text-xs truncate" dir="ltr">{email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Members', 'الأعضاء')}</span>
                      <span className="text-gray-900 font-medium flex items-center gap-1.5"><Users size={13} className="text-gray-500" />{gym.active_members_count ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{T('Expiry', 'تاريخ الانتهاء')}</span>
                      <span className="text-gray-900">{formatDate(gym.subscription_expires_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {pagedGyms.length === 0 && (
              <div className="col-span-full p-8 text-center text-gray-500">{T('No matching gyms', 'لا توجد صالات مطابقة')}</div>
            )}
          </div>
        )}

        {/* ── Pagination ── */}
        <div className="p-4 text-sm text-gray-500 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span>{T('Rows:', 'عدد الصفوف:')}</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 bg-white border border-gray-100 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={300}>300</option>
            </select>
          </div>
          <span>{T(`Showing ${pagedGyms.length} of ${filtered.length}`, `إجمالي ${filtered.length} صالة`)}</span>
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

      {/* Centered row actions dialog shared visually with Platform Admins. */}
      {actionGym && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[3px]"
          onClick={() => setOpenDropdownId(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-actions-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/60 bg-white shadow-2xl shadow-slate-950/20 ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-br from-gray-50 via-white to-gray-100 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <SquaresFour size={22} />
                </div>
                <div className="min-w-0">
                  <h2 id="tenant-actions-title" className="text-lg font-bold text-gray-900">
                    {T('Gym actions', 'إجراءات الصالة')}
                  </h2>
                  <p className="mt-1 truncate text-sm text-[#64748b]">{actionGym.name}</p>
                  <p className="mt-0.5 text-xs text-slate-400" dir="ltr">{actionGym.subdomain}.gymcore.app</p>
                </div>
              </div>
              <button
                type="button"
                aria-label={T('Close', 'إغلاق')}
                onClick={() => setOpenDropdownId(null)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => openSubModal(actionGym)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-start transition hover:border-primary/30 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><CreditCard size={18} /></span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{T('Plan / Subscription', 'الباقة والاشتراك')}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{T('Change the gym plan and expiry date', 'تغيير الباقة وتاريخ انتهاء الاشتراك')}</span>
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

            <div className="border-t border-slate-100 px-4 py-3 text-end sm:px-5">
              <button
                type="button"
                onClick={() => setOpenDropdownId(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {T('Cancel', 'إلغاء')}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* === Subscription Modal === */}
      {subModalGym && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSubModalGym(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <CreditCard size={20} className="text-primary" />
                <h2 className="text-lg font-bold text-gray-900">{T('Update Subscription', 'تعديل الاشتراك')}</h2>
              </div>
              <button onClick={() => setSubModalGym(null)} className="p-1.5 hover:bg-gray-50 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{T(`Update subscription for "${subModalGym.name}"`, `تحديث اشتراك صالة "${subModalGym.name}"`)}</p>
            <form onSubmit={handleSubSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">{T('Plan Tier', 'الباقة')}</label>
                <select value={subPlanTier} onChange={(e) => setSubPlanTier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {['basic', 'professional', 'enterprise'].map((p) => (
                    <option key={p} value={p}>{planLabel(p, isRtl)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">{T('Expiry Date', 'تاريخ الانتهاء')}</label>
                <input type="date" value={subExpiry} onChange={(e) => setSubExpiry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30" dir="ltr" />
              </div>
              {subError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{subError}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={updateSubMutation.isPending}
                  className="flex-1 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {updateSubMutation.isPending && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                  {T('Save Changes', 'حفظ التغييرات')}
                </button>
                <button type="button" onClick={() => setSubModalGym(null)}
                  className="px-5 py-3 border border-gray-100 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors">
                  {T('Cancel', 'إلغاء')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === Delete Confirmation Modal === */}
      {deleteModalGym && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setDeleteModalGym(null); setDeleteConfirmText(''); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
<WarningCircle size={22} className="text-red-600" />
              <h2 className="text-lg font-bold text-gray-900">{T('Delete Gym', 'حذف النادي')}</h2>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-red-800 font-medium mb-1">{T(`Are you sure you want to delete "${deleteModalGym.name}"?`, `هل أنت متأكد من حذف نادي "${deleteModalGym.name}"؟`)}</p>
              <p className="text-xs text-red-600">{T('All data will be permanently deleted.', 'سيتم حذف جميع البيانات بشكل نهائي.')}</p>
            </div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">{T('Type "DELETE" to confirm:', 'اكتب "DELETE" للتأكيد:')}</label>
            <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE" className="w-full px-3 py-2 border border-gray-100 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 font-mono" dir="ltr" autoFocus />
            <div className="flex gap-3 mt-5">
              <button type="button" disabled={deleteMutation.isPending || deleteConfirmText !== 'DELETE'}
                onClick={() => deleteMutation.mutate(deleteModalGym.id)}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {deleteMutation.isPending && <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />}
                {T('Delete Permanently', 'حذف نهائي')}
              </button>
              <button type="button" onClick={() => { setDeleteModalGym(null); setDeleteConfirmText(''); }}
                className="px-5 py-3 border border-gray-100 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors">
                {T('Cancel', 'إلغاء')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


