import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listApiKeys, createApiKey, deleteApiKey, toggleApiKey, getApiUsage,
  listPlatformGyms, type ApiKey,
} from '../../services/api';
import {
  Key, Plus, Trash2, Copy, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle,
  Loader2, Globe, BookOpen, Shield, Activity, Clock, AlertTriangle, Code,
} from 'lucide-react';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

const permissionOptions = [
  { value: 'read', labelAr: 'قراءة', labelEn: 'Read' },
  { value: 'write', labelAr: 'كتابة', labelEn: 'Write' },
  { value: 'admin', labelAr: 'إدارة', labelEn: 'Admin' },
];

export default function DeveloperPortal() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const t = (ar: string, en: string) => (isRtl ? ar : en);

  const [showForm, setShowForm] = useState(false);
  const [newKey, setNewKey] = useState<ApiKey | null>(null);
  const [form, setForm] = useState({
    gym_id: '',
    name: '',
    permissions: ['read'] as string[],
    rate_limit_per_min: 60,
  });
  const [showRawKey, setShowRawKey] = useState<Record<string, boolean>>({});

  // Queries
  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ['developer-keys'],
    queryFn: () => listApiKeys(),
  });
  const { data: gymsData } = useQuery({
    queryKey: ['platform', 'gyms'],
    queryFn: listPlatformGyms,
    staleTime: 30000,
  });
  const { data: usageData } = useQuery({
    queryKey: ['developer-usage'],
    queryFn: () => getApiUsage(),
    refetchInterval: 60000,
  });

  const keys = keysData?.data ?? [];
  const gyms = gymsData?.data ?? [];
  const usage = usageData?.data;

  // Mutations
  const createMutation = useMutation({
    mutationFn: createApiKey,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['developer-keys'] });
      setNewKey(res.data);
      setShowForm(false);
      setForm({ gym_id: '', name: '', permissions: ['read'], rate_limit_per_min: 60 });
      showToast(t('تم إنشاء المفتاح', 'API key created'), 'success');
    },
    onError: () => showToast(t('فشل إنشاء المفتاح', 'Failed to create API key'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developer-keys'] });
      showToast(t('تم حذف المفتاح', 'API key deleted'), 'success');
    },
    onError: () => showToast(t('فشل حذف المفتاح', 'Failed to delete API key'), 'error'),
  });

  const toggleMutation = useMutation({
    mutationFn: toggleApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developer-keys'] });
      showToast(t('تم تغيير حالة المفتاح', 'API key status changed'), 'success');
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast(t('تم النسخ', 'Copied!'), 'success');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const togglePermission = (perm: string) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('بوابة المطورين', 'Developer Portal')}
        subtitle={t('إدارة مفاتيح API والوصول إلى واجهات التكامل', 'Manage API keys and integration access')}
        icon="key"
        actions={
          <Button
            type="button"
            onClick={() => { setShowForm(true); setNewKey(null); }}
            variant="primary"
          >
            <Plus size={16} />
            {t('مفتاح جديد', 'New API Key')}
          </Button>
        }
      />

      {/* Usage Summary */}
      {usage && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t('إجمالي الطلبات', 'Total Requests'), value: usage.total_requests.toLocaleString(), icon: <Activity size={20} />, color: 'bg-blue-500' },
            { label: t('طلبات ناجحة', 'Successful'), value: usage.success_count.toLocaleString(), icon: <CheckCircle2 size={20} />, color: 'bg-green-500' },
            { label: t('متوسط وقت الاستجابة', 'Avg Response'), value: `${usage.avg_response_time_ms}ms`, icon: <Clock size={20} />, color: 'bg-amber-500' },
            { label: t('طلبات آخر ساعة', 'Last Hour'), value: usage.requests_last_hour.toLocaleString(), icon: <Activity size={20} />, color: 'bg-purple-500' },
          ].map((card) => (
            <Card key={card.label}>
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${card.color} bg-opacity-20`}>
                  <div className="text-primary">{card.icon}</div>
                </div>
                <span className="text-gray-500 text-xs font-medium">{card.label}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{card.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* New Key Display */}
      {newKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={24} className="text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-green-800 text-sm mb-1">
                {t('تم إنشاء المفتاح بنجاح', 'API Key Created Successfully')}
              </h3>
              <p className="text-xs text-green-700 mb-3">
                {t('احفظ هذا المفتاح في مكان آمن. لن يظهر مرة أخرى.', 'Save this key in a secure place. It will not be shown again.')}
              </p>
              <div className="flex items-center gap-2 bg-white rounded-lg border border-green-300 p-3">
                <code className="flex-1 text-sm font-mono text-gray-900 break-all">
                  {newKey.raw_key}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(newKey.raw_key || '')}
                  className="p-1.5 rounded-lg hover:bg-green-100 text-green-700 flex-shrink-0"
                >
                  <Copy size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setNewKey(null)}
                className="mt-3 text-sm text-green-700 hover:underline"
              >
                {t('تم', 'Done')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5 mb-6">
          <h3 className="font-bold text-gray-900 mb-4">{t('إنشاء مفتاح API جديد', 'Create New API Key')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">{t('الصالة', 'Gym')}</label>
              <select
                value={form.gym_id}
                onChange={(e) => setForm((prev) => ({ ...prev, gym_id: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">{t('اختر صالة', 'Select a gym')}</option>
                {gyms.map((g) => (
                  <option key={g.id} value={g.id}>{g.name} ({g.subdomain})</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-gray-500">{t('اسم المفتاح', 'Key Name')}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('مثال: تكامل موقع الويب', 'Example: Website Integration')}
                className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 block mb-2">{t('الصلاحيات', 'Permissions')}</label>
            <div className="flex gap-3">
              {permissionOptions.map((p) => (
                <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(p.value)}
                    onChange={() => togglePermission(p.value)}
                    className="rounded border-gray-100 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-500">{isRtl ? p.labelAr : p.labelEn}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mb-4 max-w-xs">
            <label className="text-xs font-semibold text-gray-500">{t('حد الطلب (في الدقيقة)', 'Rate Limit (per minute)')}</label>
            <input
              type="number"
              value={form.rate_limit_per_min}
              onChange={(e) => setForm((prev) => ({ ...prev, rate_limit_per_min: parseInt(e.target.value) || 60 }))}
              min="1"
              max="10000"
              className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!form.gym_id || !form.name) {
                  showToast(t('يرجى إكمال الحقول المطلوبة', 'Please fill required fields'), 'error');
                  return;
                }
                createMutation.mutate(form);
              }}
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-petrol-light transition-colors disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {t('إنشاء', 'Create')}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); }}
              className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
            >
              {t('إلغاء', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {/* API Keys Table */}
      <div className="bg-white rounded-3xl border shadow-sm border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Key size={16} />
            {t('مفاتيح API', 'API Keys')}
            <span className="text-xs text-gray-500/60 font-normal">({keys.length})</span>
          </h3>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['developer-keys'] })}
            className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="overflow-x-auto">
          {keysLoading ? (
            <div><PageLoader /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-right p-3 font-semibold">{t('الاسم', 'Name')}</th>
                  <th className="text-right p-3 font-semibold">{t('المفتاح', 'Key')}</th>
                  <th className="text-right p-3 font-semibold">{t('الصالة', 'Gym')}</th>
                  <th className="text-right p-3 font-semibold">{t('الصلاحيات', 'Permissions')}</th>
                  <th className="text-right p-3 font-semibold">{t('الحد', 'Rate Limit')}</th>
                  <th className="text-right p-3 font-semibold">{t('الحالة', 'Status')}</th>
                  <th className="text-right p-3 font-semibold">{t('آخر استخدام', 'Last Used')}</th>
                  <th className="text-right p-3 font-semibold">{t('إجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-500">{t('لا توجد مفاتيح بعد', 'No API keys yet')}</td></tr>
                )}
                {keys.map((key: ApiKey) => {
                  const gym = gyms.find((g) => g.id === key.gym_id);
                  return (
                    <tr key={key.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-900">{key.name}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-gray-50 px-2 py-1 rounded font-mono">{key.key_prefix}...</code>
                          <button
                            type="button"
                            onClick={() => {
                              setShowRawKey((prev) => ({ ...prev, [key.id]: !prev[key.id] }));
                            }}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500"
                          >
                            {showRawKey[key.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </td>
                      <td className="p-3 text-gray-500 text-xs">{gym?.name || key.gym_id.slice(0, 8)}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {key.permissions.map((p) => (
                            <span key={p} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-500">{p}</span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-500">{key.rate_limit_per_min}/m</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => toggleMutation.mutate(key.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            key.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {key.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {key.is_active ? t('نشط', 'Active') : t('معطل', 'Disabled')}
                        </button>
                      </td>
                      <td className="p-3 text-xs text-gray-500">{formatDate(key.last_used_at)}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(t('تأكيد حذف المفتاح؟', 'Delete this API key?'))) {
                              deleteMutation.mutate(key.id);
                            }
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* API Documentation Links */}
      <div className="mt-6">
        <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
            <BookOpen size={16} />
            {t('توثيق API', 'API Documentation')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: t('مقدمة', 'Getting Started'), desc: t('كيفية البدء مع API', 'How to get started with the API'), icon: <BookOpen size={20} /> },
              { title: t('المصادقة', 'Authentication'), desc: t('استخدام مفاتيح API للمصادقة', 'Using API keys for authentication'), icon: <Shield size={20} /> },
              { title: t('المصادر', 'Resources'), desc: t('قائمة بجميع نقاط النهاية', 'List of all available endpoints'), icon: <Globe size={20} /> },
              { title: t('تحديد المعدل', 'Rate Limiting'), desc: t('سياسات تحديد المعدل والتعامل معها', 'Rate limit policies and handling'), icon: <Activity size={20} /> },
              { title: t('أخطاء', 'Errors'), desc: t('رموز الأخطاء ومعانيها', 'Error codes and their meanings'), icon: <AlertTriangle size={20} /> },
              { title: t('أمثلة', 'Examples'), desc: t('أمثلة عملية لاستخدام API', 'Practical API usage examples'), icon: <Code size={20} /> },
            ].map((item, i) => (
              <div key={i} className="p-4 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <div className="w-9 h-9 rounded-lg bg-primary bg-opacity-10 flex items-center justify-center mb-2">
                  <div className="text-primary">{item.icon}</div>
                </div>
                <p className="font-semibold text-sm text-gray-900 mb-0.5">{item.title}</p>
                <p className="text-xs text-gray-500/70">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


