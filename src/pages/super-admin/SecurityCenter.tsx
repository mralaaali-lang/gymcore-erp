import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  getSecurityOverview,
  listPlatformAdminSessions,
  revokePlatformAdminSession,
  getSecuritySettings,
  updateSecuritySettings,
  listPlatformAudit,
  type SecurityOverview,
  type PlatformAdminSession,
  type SecuritySettings,
} from '../../services/api';
import { FloppyDisk, GlobeSimple, Users, X } from '@phosphor-icons/react';
import PageLoader from '../../components/shared/PageLoader';
import PageHeader from '../../components/shared/PageHeader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import BreachLogTab from './security/BreachLogTab';

type Tab = 'overview' | 'sessions' | 'password' | 'twofactor' | 'breach-log';

export default function SecurityCenter() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const t = (en: string, ar: string) => isRtl ? ar : en;

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // ── Data Queries ──────────────────────────────────────
  const overviewQuery = useApiQuery(['security', 'overview'], getSecurityOverview, { staleTime: 30_000 });
  const sessionsQuery = useApiQuery(['security', 'sessions'], listPlatformAdminSessions, { staleTime: 15_000 });
  const settingsQuery = useApiQuery(['security', 'settings'], getSecuritySettings, { staleTime: 30_000 });
  // §40 — سجل تدقيق المنصة الحقيقي (platform_audit_logs)
  const auditQuery = useApiQuery(
    ['platform', 'audit', 'recent'],
    () => listPlatformAudit({ limit: 8 }),
    { staleTime: 20_000 },
  );
  const auditEntries = auditQuery.data?.data ?? [];

  const overview: SecurityOverview | null = overviewQuery.data?.data ?? null;
  const sessions: PlatformAdminSession[] = sessionsQuery.data?.data ?? [];
  const settings: SecuritySettings | null = settingsQuery.data?.data ?? null;

  // ── Mutations ─────────────────────────────────────────
  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokePlatformAdminSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', 'sessions'] });
      queryClient.invalidateQueries({ queryKey: ['security', 'overview'] });
      showToast(t('Session revoked', 'تم إنهاء الجلسة'), 'success');
    },
    onError: () => showToast(t('Failed to revoke session', 'فشل إنهاء الجلسة'), 'error'),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (payload: Partial<SecuritySettings>) => updateSecuritySettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security', 'settings'] });
      queryClient.invalidateQueries({ queryKey: ['security', 'overview'] });
      showToast(t('Settings saved', 'تم حفظ الإعدادات'), 'success');
    },
    onError: () => showToast(t('Failed to save settings', 'فشل حفظ الإعدادات'), 'error'),
  });

  // ── Local form state ──────────────────────────────────
  const [pwForm, setPwForm] = useState<Partial<SecuritySettings> | null>(null);
  const [tfForm, setTfForm] = useState<Partial<SecuritySettings> | null>(null);

  if (settings && !pwForm) setPwForm({ ...settings });
  if (settings && !tfForm) setTfForm({ ...settings });

  // ── KPI Stats ─────────────────────────────────────────
  const stats = overview ? [
    { label: t('Active Admins', 'المدراء النشطون'), value: overview.active_admins?.toString() || '0', color: 'bg-blue-500' },
    { label: t('Active Sessions', 'الجلسات النشطة'), value: overview.active_sessions?.toString() || '0', color: 'bg-green-500' },
    { label: t('2FA Enabled', 'مفعلة 2FA'), value: overview.two_factor_enabled ? t('Yes', 'نعم') : t('No', 'لا'), color: overview.two_factor_enabled ? 'bg-amber-500' : 'bg-gray-400' },
    { label: t('Failed Logins', 'محاولات فاشلة'), value: overview.failed_logins?.toString() || '0', color: overview.failed_logins > 0 ? 'bg-red-500' : 'bg-green-500' },
  ] : [];

  // ── Tab Definitions ───────────────────────────────────
  const tabs = [
    { key: 'overview' as Tab, labelAr: 'نظرة عامة', labelEn: 'Overview', icon: 'shield' },
    { key: 'sessions' as Tab, labelAr: 'الجلسات النشطة', labelEn: 'Active Sessions', icon: 'globe' },
    { key: 'password' as Tab, labelAr: 'سياسة كلمة المرور', labelEn: 'Password Policy', icon: 'lock' },
    { key: 'twofactor' as Tab, labelAr: '2FA والحماية', labelEn: '2FA & Protection', icon: 'key' },
    { key: 'breach-log' as Tab, labelAr: 'سجل الاختراقات', labelEn: 'Breach Log', icon: 'warning' },
  ];

  // ── Render: Overview ──────────────────────────────────
  const renderOverview = () => (
    <div className="space-y-6">
      {overviewQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 animate-pulse">
              <div className="h-4 w-24 bg-gray-100 rounded mb-3" />
              <div className="h-8 w-16 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-3 h-3 rounded-full ${stat.color}`} />
                <span className="text-sm text-gray-600">{stat.label}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {overview && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            {t('Security Overview', 'نظرة عامة على الأمان')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-600">{t('Active Sessions', 'الجلسات النشطة')}</span>
                <span className="font-semibold text-gray-900">{overview.active_sessions}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-600">{t('Total Logins', 'إجمالي تسجيلات الدخول')}</span>
                <span className="font-semibold text-gray-900">{overview.total_logins}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-600">{t('Failed Logins', 'محاولات فاشلة')}</span>
                <span className={`font-semibold ${overview.failed_logins > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {overview.failed_logins}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-600">{t('2FA Enabled', 'المصادقة الثنائية')}</span>
                <span className={`font-semibold ${overview.two_factor_enabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {overview.two_factor_enabled ? t('Yes', 'نعم') : t('No', 'لا')}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-600">{t('Password Expiry', 'انتهاء صلاحية كلمة المرور')}</span>
                <span className="font-semibold text-gray-900">{overview.password_expiry_days} {t('days', 'أيام')}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-600">{t('IP Whitelist', 'القائمة البيضاء IP')}</span>
                <span className={`font-semibold ${overview.ip_whitelist_enabled ? 'text-blue-600' : 'text-gray-400'}`}>
                  {overview.ip_whitelist_enabled ? t('Enabled', 'مفعلة') : t('Disabled', 'معطلة')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* §40 — آخر أحداث تدقيق المنصة الحقيقية */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{t('Recent platform audit', 'آخر أحداث تدقيق المنصة')}</h3>
          <Link to="/super-admin/audit" className="text-sm font-semibold text-primary hover:underline">
            {t('All logs', 'كل السجلات')}
          </Link>
        </div>
        {auditQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-9 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : auditEntries.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">{t('No platform audit entries yet', 'لا توجد أحداث تدقيق على المنصة بعد')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-600">
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Time', 'الوقت')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Action', 'الإجراء')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Actor', 'المنفّذ')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">{t('Table', 'الجدول')}</th>
                  <th className="text-right px-4 py-2.5 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-semibold" dir="ltr">{e.action_type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-900" dir="ltr">{e.actor_email || t('System', 'النظام')}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs font-mono" dir="ltr">{e.table_name}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs font-mono">{e.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── Render: Sessions ──────────────────────────────────
  const renderSessions = () => (
    <div className="space-y-4">
      {sessionsQuery.isLoading ? (
        <PageLoader variant="skeleton" />
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
          <GlobeSimple size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-700 font-medium">{t('No active sessions', 'لا توجد جلسات نشطة')}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Admin', 'المدير')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Device', 'الجهاز')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('IP Address', 'عنوان IP')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Last Active', 'آخر نشاط')}</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-600">{t('Actions', 'الإجراءات')}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-2xl flex items-center justify-center text-white text-xs font-bold bg-gray-400">
                          <Users size={14} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{s.full_name}</p>
                          <span className="text-xs text-gray-500">{s.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-600 text-xs">{s.device_name || s.user_agent || '-'}</td>
                    <td className="px-5 py-4 text-gray-600 font-mono text-xs">{s.ip_address || '-'}</td>
                    <td className="px-5 py-4 text-gray-500">{formatDateTime(s.last_active_at)}</td>
                    <td className="px-5 py-4">
                      {!s.revoked_at && (
                        <button
                          onClick={() => revokeMutation.mutate(s.id)}
                          className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium transition-colors flex items-center gap-1.5"
                        >
                          <X size={12} />{t('Revoke', 'إنهاء')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ── Render: Password Policy ───────────────────────────
  const renderPasswordPolicy = () => {
    if (!pwForm) return <PageLoader />;
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm max-w-2xl">
        <h3 className="text-lg font-bold text-gray-900 mb-4">{t('Password Policy Settings', 'إعدادات سياسة كلمة المرور')}</h3>
        <div className="space-y-5">
          {[
            { key: 'password_min_length' as const, label: t('Minimum Length', 'الحد الأدنى للطول'), type: 'number', value: pwForm.password_min_length ?? 8 },
            { key: 'password_require_uppercase' as const, label: t('Require Uppercase', 'يتطلب حرف كبير'), type: 'checkbox', value: pwForm.password_require_uppercase ?? true },
            { key: 'password_require_lowercase' as const, label: t('Require Lowercase', 'يتطلب حرف صغير'), type: 'checkbox', value: pwForm.password_require_lowercase ?? true },
            { key: 'password_require_numbers' as const, label: t('Require Numbers', 'يتطلب أرقام'), type: 'checkbox', value: pwForm.password_require_numbers ?? true },
            { key: 'password_require_symbols' as const, label: t('Require Symbols', 'يتطلب رموز'), type: 'checkbox', value: pwForm.password_require_symbols ?? false },
            { key: 'max_login_attempts' as const, label: t('Max Login Attempts', 'محاولات تسجيل الدخول القصوى'), type: 'number', value: pwForm.max_login_attempts ?? 5 },
            { key: 'lockout_duration_minutes' as const, label: t('Lockout Duration (min)', 'مدة الإغلاق (دقيقة)'), type: 'number', value: pwForm.lockout_duration_minutes ?? 15 },
            { key: 'password_expiry_days' as const, label: t('Password Expiry (days)', 'انتهاء صلاحية كلمة المرور (يوم)'), type: 'number', value: pwForm.password_expiry_days ?? 90 },
          ].map((field) => (
            <div key={field.key} className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">{field.label}</label>
              {field.type === 'checkbox' ? (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={() => setPwForm({ ...pwForm, [field.key]: !field.value })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                </label>
              ) : (
                <input
                  type="number"
                  value={field.value as number}
                  onChange={(e) => setPwForm({ ...pwForm, [field.key]: Number(e.target.value) })}
                  className="w-24 text-center bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => updateSettingsMutation.mutate(pwForm)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            <FloppyDisk size={16} />{t('Save Policy', 'حفظ السياسة')}
          </button>
        </div>
      </div>
    );
  };

  // ── Render: Two-Factor ────────────────────────────────
  const renderTwoFactor = () => {
    if (!tfForm) return <PageLoader />;
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm max-w-2xl">
        <h3 className="text-lg font-bold text-gray-900 mb-4">{t('Two-Factor Authentication', 'المصادقة الثنائية')}</h3>
        <div className="space-y-5">
          <div className="flex items-center justify-between py-3 border-b border-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-900">{t('Require 2FA', 'طلب المصادقة الثنائية')}</p>
              <p className="text-xs text-gray-500">{t('Enforce TOTP-based two-factor authentication', 'فرض المصادقة الثنائية القائمة على TOTP')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!tfForm.two_factor_enabled}
                onChange={() => setTfForm({ ...tfForm, two_factor_enabled: !tfForm.two_factor_enabled })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>
          {[
            { key: 'two_factor_method' as const, label: t('2FA Method', 'طريقة 2FA'), value: tfForm.two_factor_method || 'totp', type: 'select', options: ['totp', 'sms', 'email'] },
            { key: 'session_timeout_minutes' as const, label: t('Session Timeout (min)', 'مهلة الجلسة (دقيقة)'), value: tfForm.session_timeout_minutes ?? 30, type: 'number' },
            { key: 'ip_whitelist_enabled' as const, label: t('IP Whitelist', 'القائمة البيضاء IP'), value: tfForm.ip_whitelist_enabled ?? false, type: 'checkbox' },
          ].map((field) => (
            <div key={field.key} className="flex items-center justify-between py-2">
              <label className="text-sm font-medium text-gray-700">{field.label}</label>
              {field.type === 'checkbox' ? (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={() => setTfForm({ ...tfForm, [field.key]: !field.value })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                </label>
              ) : field.type === 'select' ? (
                <select
                  value={field.value as string}
                  onChange={(e) => setTfForm({ ...tfForm, [field.key]: e.target.value })}
                  className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                >
                  {(field.options as string[]).map((opt) => (
                    <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  value={field.value as number}
                  onChange={(e) => setTfForm({ ...tfForm, [field.key]: Number(e.target.value) })}
                  className="w-32 text-center bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => updateSettingsMutation.mutate(tfForm)}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            <FloppyDisk size={16} />{t('Save 2FA Settings', 'حفظ إعدادات 2FA')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('Security Center', 'مركز الأمان')}
        subtitle={t('Manage security settings, sessions, and access control', 'إدارة إعدادات الأمان والجلسات والتحكم في الوصول')}
        icon="shield"
      />

      <UnifiedTabs
        tabs={tabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as Tab)}
        variant="pills"
        className="mb-6"
      />

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'sessions' && renderSessions()}
      {activeTab === 'password' && renderPasswordPolicy()}
      {activeTab === 'twofactor' && renderTwoFactor()}
      {activeTab === 'breach-log' && <BreachLogTab />}
    </div>
  );
}

