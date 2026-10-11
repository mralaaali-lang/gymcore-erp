import { useState, useEffect } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  listPlatformAdmins,
  createPlatformAdmin,
  updatePlatformAdmin,
  deletePlatformAdmin,
  type PlatformAdminUser,
  type PlatformAdminRole,
} from '../../services/api';
import {
  X, Shield, ShieldCheck, ShieldHalf, Eye,
  EyeOff, MoreVertical, UserPlus, Edit3, Trash2, ToggleLeft, ToggleRight,
} from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import FilterBar from '../../components/shared/FilterBar';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

const roleLabels: Record<string, Record<string, string>> = {
  super_admin: { ar: 'مشرف عام', en: 'Super Admin' },
  billing_admin: { ar: 'مسئول الفواتير', en: 'Billing Admin' },
  support_admin: { ar: 'مسئول الدعم', en: 'Support Admin' },
  readonly_admin: { ar: 'مشرف مشاهدة', en: 'Read-only Admin' },
};

const roleColors: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800 border-purple-200',
  billing_admin: 'bg-blue-100 text-blue-800 border-blue-200',
  support_admin: 'bg-green-100 text-green-800 border-green-200',
  readonly_admin: 'bg-gray-100 text-gray-800 border-gray-200',
};

const roleIcons: Record<string, React.ReactNode> = {
  super_admin: <ShieldCheck size={14} />,
  billing_admin: <ShieldHalf size={14} />,
  support_admin: <Shield size={14} />,
  readonly_admin: <Eye size={14} />,
};

function isStrongPlatformPassword(password: string): boolean {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password);
}

export default function PlatformAdmins() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';

  const [search, setSearch] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editAdmin, setEditAdmin] = useState<PlatformAdminUser | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formFullName, setFormFullName] = useState('');
  const [formRole, setFormRole] = useState<PlatformAdminRole>('support_admin');
  const [modalError, setModalError] = useState<string | null>(null);

  // Keep the centered actions dialog modal and keyboard accessible.
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

  const { data, isLoading, isError } = useApiQuery(['platform', 'admins'], listPlatformAdmins, { staleTime: 30_000 });
  const admins = data?.data ?? [];
  const actionAdmin = admins.find((admin) => admin.id === openDropdownId) ?? null;

  const filtered = admins.filter((a) =>
    a.full_name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase()) ||
    (a.phone_number ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: { email: string; phone_number?: string | null; password: string; full_name: string; role_type?: PlatformAdminRole }) =>
      createPlatformAdmin(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'admins'] });
      showToast(isRtl ? 'تم إضافة المشرف بنجاح' : 'Admin created successfully', 'success');
      closeModal();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setModalError(axiosErr?.response?.data?.error || (isRtl ? 'فشل إضافة المشرف' : 'Failed to create admin'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { email?: string; phone_number?: string | null; password?: string; full_name?: string; is_active?: boolean; role_type?: PlatformAdminRole } }) =>
      updatePlatformAdmin(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'admins'] });
      showToast(isRtl ? 'تم تحديث المشرف بنجاح' : 'Admin updated successfully', 'success');
      closeModal();
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setModalError(axiosErr?.response?.data?.error || (isRtl ? 'فشل تحديث المشرف' : 'Failed to update admin'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlatformAdmin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform', 'admins'] });
      showToast(isRtl ? 'تم تعطيل حساب المشرف' : 'Admin access deactivated', 'success');
    },
    onError: () => showToast(isRtl ? 'فشل حذف المشرف' : 'Failed to delete admin', 'error'),
  });

  const openCreateModal = () => {
    setModalMode('create');
    setEditAdmin(null);
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setShowPassword(false);
    setFormFullName('');
    setFormRole('support_admin');
    setModalError(null);
    setOpenDropdownId(null);
  };

  const openEditModal = (admin: PlatformAdminUser) => {
    setModalMode('edit');
    setEditAdmin(admin);
    setFormEmail(admin.email);
    setFormPhone(admin.phone_number ?? '');
    setFormPassword('');
    setShowPassword(false);
    setFormFullName(admin.full_name);
    setFormRole(admin.role_type);
    setModalError(null);
    setOpenDropdownId(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setEditAdmin(null);
    setFormPassword('');
    setShowPassword(false);
    setModalError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formFullName.trim()) {
      setModalError(isRtl ? 'الاسم مطلوب' : 'Full name is required');
      return;
    }

    if (!formEmail.trim()) {
      setModalError(isRtl ? 'البريد الإلكتروني مطلوب' : 'Email is required');
      return;
    }

    if (modalMode === 'create') {
      if (!isStrongPlatformPassword(formPassword)) {
        setModalError(isRtl
          ? 'استخدم 8 أحرف على الأقل، مع حرف كبير وصغير ورقم.'
          : 'Use at least 8 characters, including uppercase, lowercase, and a number.');
        return;
      }
      createMutation.mutate({
        email: formEmail.trim().toLowerCase(),
        phone_number: formPhone.trim() || null,
        password: formPassword,
        full_name: formFullName.trim(),
        role_type: formRole,
      });
    } else if (modalMode === 'edit' && editAdmin) {
      const payload: { email?: string; phone_number?: string | null; password?: string; full_name?: string; role_type?: PlatformAdminRole } = {};
      if (formEmail.trim().toLowerCase() !== editAdmin.email.toLowerCase()) payload.email = formEmail.trim();
      const nextPhone = formPhone.trim() || null;
      if (nextPhone !== (editAdmin.phone_number ?? null)) payload.phone_number = nextPhone;
      if (formPassword) {
        if (!isStrongPlatformPassword(formPassword)) {
          setModalError(isRtl
            ? 'استخدم 8 أحرف على الأقل، مع حرف كبير وصغير ورقم.'
            : 'Use at least 8 characters, including uppercase, lowercase, and a number.');
          return;
        }
        payload.password = formPassword;
      }
      if (formFullName.trim() !== editAdmin.full_name) payload.full_name = formFullName.trim();
      if (formRole !== editAdmin.role_type) payload.role_type = formRole;
      if (Object.keys(payload).length === 0) {
        setModalError(isRtl ? 'لم يتم تغيير أي بيانات' : 'No data changed');
        return;
      }
      updateMutation.mutate({ id: editAdmin.id, payload });
    }
  };
  const toggleActive = (admin: PlatformAdminUser) => {
    updateMutation.mutate({ id: admin.id, payload: { is_active: !admin.is_active } });
    setOpenDropdownId(null);
  };

  const handleDelete = (admin: PlatformAdminUser) => {
    const confirmed = confirm(isRtl
      ? `هل تريد إزالة وصول "${admin.full_name}"؟ سيتم تعطيل الحساب مع الاحتفاظ بسجلاته.`
      : `Deactivate access for "${admin.full_name}"? The account history will be preserved.`);
    if (confirmed) {
      deleteMutation.mutate(admin.id);
      setOpenDropdownId(null);
    }
  };
  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <PageHeader
        title={isRtl ? 'إدارة المشرفين العامين' : 'Platform Admins'}
        subtitle={isRtl
          ? 'إدارة صلاحيات المشرفين على المنصة — صلاحيات كاملة، فواتير، دعم، أو مشاهدة فقط'
          : 'Manage platform-level administrators — full access, billing, support, or read-only'}
        icon="shield_person"
        actions={
          <Button type="button" onClick={openCreateModal} variant="primary">
            <UserPlus size={18} />
            <span>{isRtl ? 'إضافة مشرف' : 'Add Admin'}</span>
          </Button>
        }
      />

      {/* Search */}
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={isRtl ? 'بحث بالاسم أو البريد الإلكتروني...' : 'Search by name or email...'}
      />

      {/* Admins Table */}
      <Card>
        {isLoading ? (
          <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
        ) : isError ? (
          <div className="p-8 text-center text-tertiary">{isRtl ? 'تعذّر تحميل قائمة المشرفين' : 'Failed to load admins'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 text-gray-900 text-sm">
                  <th className="text-right p-4">{isRtl ? 'الاسم' : 'Name'}</th>
                  <th className="text-right p-4">{isRtl ? 'البريد الإلكتروني' : 'Email'}</th>
                  <th className="text-right p-4">{isRtl ? 'رقم الهاتف' : 'Phone'}</th>
                  <th className="text-right p-4">{isRtl ? 'الدور' : 'Role'}</th>
                  <th className="text-right p-4">{isRtl ? 'الحالة' : 'Status'}</th>
                  <th className="text-right p-4">{isRtl ? 'آخر دخول' : 'Last Login'}</th>
                  <th className="text-right p-4">{isRtl ? 'تاريخ الإنشاء' : 'Created'}</th>
                  <th className="text-right p-4">{isRtl ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((admin: PlatformAdminUser) => (
                  <tr key={admin.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-900 font-medium">{admin.full_name}</td>
                    <td className="p-4 text-gray-500" dir="ltr">{admin.email}</td>
                    <td className="p-4 text-gray-500" dir="ltr">{admin.phone_number || '—'}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${roleColors[admin.role_type] || roleColors.readonly_admin}`}>
                        {roleIcons[admin.role_type] || roleIcons.readonly_admin}
                        {roleLabels[admin.role_type]?.[isRtl ? 'ar' : 'en'] || admin.role_type}
                      </span>
                    </td>
                    <td className="p-4">
                      <StatusBadge
                        status={admin.is_active ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'غير نشط' : 'Inactive')}
                        variant={admin.is_active ? 'success' : 'error'}
                      />
                    </td>
                    <td className="p-4 text-gray-500 text-sm">
                      {admin.last_login_at
                        ? new Date(admin.last_login_at).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
                            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })
                        : '-'}
                    </td>
                    <td className="p-4 text-gray-500 text-sm">
                      {new Date(admin.created_at).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US')}
                    </td>
                    <td className="p-4 relative">
                      <button
                        type="button"
                        aria-label={isRtl ? `إجراءات ${admin.full_name}` : `Actions for ${admin.full_name}`}
                        aria-haspopup="dialog"
                        aria-expanded={openDropdownId === admin.id}
                        onClick={() => setOpenDropdownId(openDropdownId === admin.id ? null : admin.id)}
                        className="p-2 rounded-lg hover:bg-gray-50 text-gray-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-500">{isRtl ? 'لا يوجد مشرفون' : 'No admins found'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-4 text-sm text-gray-500 border-t border-gray-100">
          {isRtl ? `إجمالي ${filtered.length} مشرف` : `Total ${filtered.length} admin(s)`}
        </div>
      </Card>

      {/* Centered actions dialog, detached from the table so it cannot be clipped. */}
      {actionAdmin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[3px]"
          onClick={() => setOpenDropdownId(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-admin-actions-title"
            className="w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl shadow-slate-950/20 ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 bg-gradient-to-br from-gray-50 via-white to-gray-100 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2 id="platform-admin-actions-title" className="text-lg font-bold text-gray-900">
                    {isRtl ? 'إجراءات المشرف' : 'Admin actions'}
                  </h2>
                  <p className="mt-1 text-sm text-[#64748b]">{actionAdmin.full_name}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label={isRtl ? 'إغلاق' : 'Close'}
                onClick={() => setOpenDropdownId(null)}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => openEditModal(actionAdmin)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-start transition hover:border-primary/30 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Edit3 size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{isRtl ? 'تعديل البيانات' : 'Edit details'}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{isRtl ? 'الاسم والهاتف وكلمة المرور والدور' : 'Name, phone, password, and role'}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleActive(actionAdmin)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 p-4 text-start transition hover:border-emerald-300 hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${actionAdmin.is_active ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {actionAdmin.is_active ? <ToggleLeft size={19} /> : <ToggleRight size={19} />}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">
                    {actionAdmin.is_active
                      ? (isRtl ? 'تعطيل الحساب' : 'Deactivate account')
                      : (isRtl ? 'تفعيل الحساب' : 'Activate account')}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {actionAdmin.is_active
                      ? (isRtl ? 'إيقاف وصول المشرف مؤقتًا' : 'Temporarily stop this admin’s access')
                      : (isRtl ? 'السماح للمشرف بتسجيل الدخول' : 'Allow this admin to sign in')}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleDelete(actionAdmin)}
                className="flex w-full items-center gap-3 rounded-2xl border border-red-100 p-4 text-start transition hover:border-red-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
                  <Trash2 size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-red-800">{isRtl ? 'إزالة الوصول' : 'Remove access'}</span>
                  <span className="mt-0.5 block text-xs text-red-700/75">{isRtl ? 'تعطيل الحساب مع الاحتفاظ بسجلاته' : 'Deactivate the account and keep its history'}</span>
                </span>
              </button>
            </div>

            <div className="border-t border-slate-100 px-4 py-3 text-end sm:px-5">
              <button
                type="button"
                onClick={() => setOpenDropdownId(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-primary" />
                <h2 className="text-lg font-bold text-gray-900">
                  {modalMode === 'create'
                    ? (isRtl ? 'إضافة مشرف جديد' : 'New Platform Admin')
                    : (isRtl ? 'تعديل بيانات المشرف' : 'Edit Platform Admin')
                  }
                </h2>
              </div>
              <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">
                  {isRtl ? 'الاسم الكامل' : 'Full Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder={isRtl ? 'مثال: أحمد علي' : 'e.g. Ahmed Ali'}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">
                  {isRtl ? 'البريد الإلكتروني' : 'Email'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="admin@example.com"
                  required
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">
                  {isRtl ? 'تعيين كلمة مرور جديدة' : 'Set a new password'}
                  {modalMode === 'create' && <span className="text-red-500"> *</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2 pl-12 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                    placeholder={modalMode === 'create'
                      ? (isRtl ? '8 أحرف على الأقل' : 'At least 8 characters')
                      : (isRtl ? 'اتركه فارغًا دون تغيير كلمة المرور' : 'Leave blank to keep the current password')}
                    required={modalMode === 'create'}
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? (isRtl ? 'إخفاء كلمة المرور الجديدة' : 'Hide new password') : (isRtl ? 'إظهار كلمة المرور الجديدة' : 'Show new password')}
                    title={showPassword ? (isRtl ? 'إخفاء كلمة المرور الجديدة' : 'Hide new password') : (isRtl ? 'إظهار كلمة المرور الجديدة' : 'Show new password')}
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-primary"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {modalMode === 'create'
                    ? (isRtl ? '8 أحرف على الأقل، مع حرف كبير وصغير ورقم.' : 'At least 8 characters with uppercase, lowercase, and a number.')
                    : (isRtl ? 'لا يمكن عرض كلمة المرور الحالية. اكتب كلمة جديدة لإعادة تعيينها؛ ترك الحقل فارغًا يبقيها كما هي.' : 'The current password cannot be displayed. Enter a new one to reset it; leave blank to keep it unchanged.')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">
                  {isRtl ? 'رقم الهاتف (اختياري)' : 'Phone number (optional)'}
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder={isRtl ? 'مثال: +20 10 1234 5678' : 'e.g. +20 10 1234 5678'}
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-500 mb-1.5">
                  {isRtl ? 'الصلاحية / الدور' : 'Role / Permission'}
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as PlatformAdminRole)}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="super_admin">{isRtl ? 'مشرف عام — صلاحية كاملة' : 'Super Admin — Full Access'}</option>
                  <option value="billing_admin">{isRtl ? 'مسئول فواتير — إدارة الباقات والفواتير' : 'Billing Admin — Plans & Invoices'}</option>
                  <option value="support_admin">{isRtl ? 'مسئول دعم — إدارة التذاكر والصالات' : 'Support Admin — Tickets & Gyms'}</option>
                  <option value="readonly_admin">{isRtl ? 'مشرف مشاهدة — قراءة فقط' : 'Read-only Admin — View Only'}</option>
                </select>
              </div>

              {modalError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{modalError}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-bold hover:bg-petrol-light transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>}
                  {modalMode === 'create'
                    ? (isRtl ? 'إضافة المشرف' : 'Create Admin')
                    : (isRtl ? 'حفظ التغييرات' : 'Save Changes')
                  }
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-3 border border-gray-100 rounded-xl text-gray-500 font-medium hover:bg-gray-50 transition-colors"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
