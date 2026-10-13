import { useState } from 'react';
import { formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotificationSettings,
  getNotificationHistory,
  getNotificationSummary,
  type NotificationHistoryItem,
} from '../../services/api';
import { FloppyDisk, Bell, Envelope, ChatText, DeviceMobile, WebhooksLogo, ArrowsClockwise, CheckCircle, XCircle, Warning, Clock, PaperPlaneRight, FileText, ClockCounterClockwise, Plus, Power, Eye, EyeSlash } from '@phosphor-icons/react';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';

type TabKey = 'overview' | 'email' | 'sms' | 'push' | 'webhook' | 'inapp' | 'history' | 'templates';

// ── Helpers ────────────────────────────────────────────
function formatDate(dateStr: string): string {
  try {
    return formatDateTime(dateStr);
  } catch { return dateStr; }
}

const channelColors: Record<string, string> = {
  email: 'bg-blue-500',
  sms: 'bg-green-500',
  push: 'bg-purple-500',
  webhook: 'bg-amber-500',
  in_app: 'bg-rose-500',
};

const channelLabels: Record<string, Record<string, string>> = {
  email: { ar: 'البريد الإلكتروني', en: 'Email' },
  sms: { ar: 'الرسائل النصية', en: 'SMS' },
  push: { ar: 'إشعارات الجوال', en: 'Push Notifications' },
  webhook: { ar: 'Webhooks', en: 'Webhooks' },
  in_app: { ar: 'داخل التطبيق', en: 'In-App' },
};

const statusBadge: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-gray-100 text-gray-700',
};

export default function NotificationsEngine() {
  const { language } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isRtl = language === 'ar';
  const t = (en: string, ar: string) => (isRtl ? ar : en);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [historyFilter, setHistoryFilter] = useState<{ channel: string; status: string }>({ channel: '', status: '' });

  // Queries
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: getNotificationSettings,
  });
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['notification-history', historyFilter],
    queryFn: () => getNotificationHistory({ channel: historyFilter.channel || undefined, status: historyFilter.status || undefined, limit: 50 }),
  });
  const { data: summaryData } = useQuery({
    queryKey: ['notification-summary'],
    queryFn: getNotificationSummary,
    refetchInterval: 30000,
  });

  const settings = settingsData?.data;
  const history = historyData?.data ?? [];
  const summary = summaryData?.data;

  // ── Tab Definitions ──────────────────────────────────
  const tabs = [
    { key: 'overview' as TabKey, labelAr: 'نظرة عامة', labelEn: 'Overview', icon: 'chart-bar' },
    { key: 'email' as TabKey, labelAr: 'البريد الإلكتروني', labelEn: 'Email', icon: 'envelope' },
    { key: 'sms' as TabKey, labelAr: 'الرسائل النصية', labelEn: 'SMS', icon: 'chat' },
    { key: 'push' as TabKey, labelAr: 'إشعارات الجوال', labelEn: 'Push', icon: 'device-mobile' },
    { key: 'webhook' as TabKey, labelAr: 'Webhooks', labelEn: 'Webhooks', icon: 'webhook' },
    { key: 'inapp' as TabKey, labelAr: 'داخل التطبيق', labelEn: 'In-App', icon: 'bell' },
    { key: 'history' as TabKey, labelAr: 'السجل', labelEn: 'History', icon: 'clock-counter-clockwise' },
    { key: 'templates' as TabKey, labelAr: 'القوالب', labelEn: 'Templates', icon: 'file-text' },
  ];

  // ── Channel Form Renderer ────────────────────────────
  function renderChannelForm(channel: string, config: Record<string, unknown>) {
    if (settingsLoading) {
      return <PageLoader />;
    }
    // Fields definition for each channel
    const fields: { key: string; labelAr: string; labelEn: string; type: 'text' | 'password' | 'toggle' | 'url' }[] = [];

    if (channel === 'email') {
      fields.push(
        { key: 'smtp_host', labelAr: 'خادم SMTP', labelEn: 'SMTP Host', type: 'text' },
        { key: 'smtp_port', labelAr: 'منفذ SMTP', labelEn: 'SMTP Port', type: 'text' },
        { key: 'smtp_user', labelAr: 'اسم المستخدم', labelEn: 'Username', type: 'text' },
        { key: 'smtp_pass', labelAr: 'كلمة المرور', labelEn: 'Password', type: 'password' },
        { key: 'from_email', labelAr: 'بريد المرسل', labelEn: 'From Email', type: 'text' },
      );
    } else if (channel === 'sms') {
      fields.push(
        { key: 'provider', labelAr: 'المزود', labelEn: 'Provider', type: 'text' },
        { key: 'api_key', labelAr: 'مفتاح API', labelEn: 'API Key', type: 'password' },
        { key: 'sender_name', labelAr: 'اسم المرسل', labelEn: 'Sender Name', type: 'text' },
      );
    } else if (channel === 'push') {
      fields.push(
        { key: 'api_key', labelAr: 'مفتاح API', labelEn: 'API Key', type: 'password' },
        { key: 'project_id', labelAr: 'معرف المشروع', labelEn: 'Project ID', type: 'text' },
      );
    } else if (channel === 'webhook') {
      fields.push(
        { key: 'url', labelAr: 'رابط Webhook', labelEn: 'Webhook URL', type: 'url' },
        { key: 'secret', labelAr: 'المفتاح السري', labelEn: 'Secret Key', type: 'password' },
      );
    } else if (channel === 'in_app') {
      fields.push(
        { key: 'max_notifications', labelAr: 'الحد الأقصى للإشعارات', labelEn: 'Max Notifications', type: 'text' },
        { key: 'retention_days', labelAr: 'أيام الاحتفاظ', labelEn: 'Retention Days', type: 'text' },
      );
    }

    const isEnabled = (config as any)?.is_enabled ?? true;

    return (
      <div className="space-y-5">
        {/* Toggle + Test */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Power size={20} className={isEnabled ? 'text-green-600' : 'text-gray-300'} weight={isEnabled ? 'fill' : 'regular'} />
            <div>
              <p className="font-semibold text-gray-900">{t('Channel Status', 'حالة القناة')}</p>
              <p className="text-sm text-gray-500">{isEnabled ? t('Enabled', 'مفعلة') : t('Disabled', 'معطلة')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => sendTestNotification()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <PaperPlaneRight size={16} />
            {t('Send Test', 'إرسال تجريبي')}
          </button>
        </div>

        {/* Fields */}
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{isRtl ? field.labelAr : field.labelEn}</label>
            <div className="relative">
              <input
                type={field.type === 'password' && !showPassword[field.key] ? 'password' : 'text'}
                defaultValue={(config as any)?.[field.key] || ''}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-white text-gray-900 text-sm"
              />
              {field.type === 'password' && (
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword[field.key] ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => {
              // In production, collect values and call updateNotificationSettings
              showToast(t('Settings saved', 'تم حفظ الإعدادات'), 'success');
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
          >
            <FloppyDisk size={16} />
            {t('Save Settings', 'حفظ الإعدادات')}
          </button>
        </div>
      </div>
    );
  }

  function sendTestNotification() {
    showToast(t('Test notification sent', 'تم إرسال إشعار تجريبي'), 'success');
  }

  // ===== RENDER =====
  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('Notifications Engine', 'محرك الإشعارات')}
        subtitle={t('Manage all notification channels and delivery', 'إدارة جميع قنوات الإشعارات والإرسال')}
        icon="bell"
      />

      <UnifiedTabs
        tabs={tabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
        variant="pills"
        className="mb-6"
      />

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: t('Total Sent', 'إجمالي الإرسال'), value: summary?.total ?? 0, icon: 'paper-plane', color: 'bg-blue-500' },
              { label: t('Sent Today', 'أرسلت اليوم'), value: summary?.today ?? 0, icon: 'clock', color: 'bg-green-500' },
              { label: t('Pending', 'قيد الانتظار'), value: summary?.pending ?? 0, icon: 'warning', color: 'bg-amber-500' },
              { label: t('Active Channels', 'القنوات النشطة'), value: Object.values(summary?.enabled_channels ?? {}).filter(Boolean).length, icon: 'bell', color: 'bg-purple-500' },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-3xl border shadow-sm border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-gray-500 text-sm font-medium">{card.label}</span>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${card.color} bg-opacity-20`}>
                    <div className="text-white">
                      {card.icon === 'paper-plane' && <PaperPlaneRight size={20} />}
                      {card.icon === 'clock' && <Clock size={20} />}
                      {card.icon === 'warning' && <Warning size={20} />}
                      {card.icon === 'bell' && <Bell size={20} />}
                    </div>
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Channel Status Cards */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-200 p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {t('Channel Status', 'حالة القنوات')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {['email', 'sms', 'push', 'webhook', 'in_app'].map((ch) => {
                const cfg = settings?.[ch];
                const enabled = cfg?.is_enabled ?? false;
                const chCount = summary?.channels?.[ch] ?? 0;
                const label = channelLabels[ch]?.[isRtl ? 'ar' : 'en'] || ch;
                return (
                  <div
                    key={ch}
                    onClick={() => setActiveTab(ch === 'in_app' ? 'inapp' : ch as TabKey)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                      enabled ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${channelColors[ch] || 'bg-gray-500'} bg-opacity-20`}>
                        {ch === 'email' && <Envelope size={16} className="text-blue-600" />}
                        {ch === 'sms' && <ChatText size={16} className="text-green-600" />}
                        {ch === 'push' && <DeviceMobile size={16} className="text-purple-600" />}
                        {ch === 'webhook' && <WebhooksLogo size={16} className="text-amber-600" />}
                        {ch === 'in_app' && <Bell size={16} className="text-rose-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{label}</p>
                        <p className="text-xs text-gray-400">{chCount} {t('messages', 'رسالة')}</p>
                      </div>
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {enabled ? (
                        <span className="flex items-center gap-1 text-green-700"><CheckCircle size={12} weight="fill" />{t('Active', 'نشط')}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-500"><XCircle size={12} weight="fill" />{t('Disabled', 'معطل')}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent History Preview */}
          <div className="bg-white rounded-3xl border shadow-sm border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ClockCounterClockwise size={18} />
                {t('Recent Messages', 'آخر الإرساليات')}
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="text-sm text-primary hover:underline"
              >
                {t('View All', 'عرض الكل')}
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.length === 0 && (
                <p className="text-gray-400 text-sm py-4 text-center">
                  {t('No messages yet', 'لا توجد رسائل بعد')}
                </p>
              )}
              {history.slice(0, 5).map((item: NotificationHistoryItem) => (
                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${channelColors[item.channel] || 'bg-gray-500'} bg-opacity-20`}>
                    {item.channel === 'email' && <Envelope size={14} className="text-blue-600" />}
                    {item.channel === 'sms' && <ChatText size={14} className="text-green-600" />}
                    {item.channel === 'push' && <DeviceMobile size={14} className="text-purple-600" />}
                    {item.channel === 'webhook' && <WebhooksLogo size={14} className="text-amber-600" />}
                    {!['email', 'sms', 'push', 'webhook'].includes(item.channel) && <Bell size={14} className="text-rose-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title || item.content?.slice(0, 60) || '-'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.created_at)}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[item.status] || 'bg-gray-100'}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== EMAIL / SMS / PUSH / WEBHOOK / INAPP TABS ===== */}
      {['email', 'sms', 'push', 'webhook', 'inapp'].includes(activeTab) && (
        <div className="bg-white rounded-3xl border shadow-sm border-gray-200 p-6 shadow-sm">
          {renderChannelForm(
            activeTab === 'inapp' ? 'in_app' : activeTab,
            settings?.[activeTab === 'inapp' ? 'in_app' : activeTab]?.config as Record<string, unknown> || {}
          )}
        </div>
      )}

      {/* ===== HISTORY TAB ===== */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl border shadow-sm border-gray-200 p-5 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ClockCounterClockwise size={18} />
              {t('Notification History', 'سجل الإشعارات')}
            </h2>
            <div className="flex items-center gap-3">
              <select
                value={historyFilter.channel}
                onChange={(e) => setHistoryFilter((prev) => ({ ...prev, channel: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent text-gray-900"
              >
                <option value="">{t('All Channels', 'كل القنوات')}</option>
                {['email', 'sms', 'push', 'webhook', 'in_app'].map((ch) => (
                  <option key={ch} value={ch}>{channelLabels[ch]?.[isRtl ? 'ar' : 'en'] || ch}</option>
                ))}
              </select>
              <select
                value={historyFilter.status}
                onChange={(e) => setHistoryFilter((prev) => ({ ...prev, status: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent text-gray-900"
              >
                <option value="">{t('All Status', 'كل الحالات')}</option>
                {['pending', 'sent', 'delivered', 'failed', 'cancelled'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['notification-history'] })}
                className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"
              >
                <ArrowsClockwise size={18} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {historyLoading ? (
              <PageLoader />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-700">
                    <th className="text-right p-3">{t('Channel', 'القناة')}</th>
                    <th className="text-right p-3">{t('Title', 'العنوان')}</th>
                    <th className="text-right p-3">{t('Recipient', 'المستلم')}</th>
                    <th className="text-right p-3">{t('Status', 'الحالة')}</th>
                    <th className="text-right p-3">{t('Date', 'التاريخ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-gray-400">{t('No messages', 'لا توجد رسائل')}</td></tr>
                  )}
                  {history.map((item: NotificationHistoryItem) => (
                    <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${channelColors[item.channel] || 'bg-gray-500'} bg-opacity-20`}>
                            {item.channel === 'email' && <Envelope size={12} className="text-blue-600" />}
                            {item.channel === 'sms' && <ChatText size={12} className="text-green-600" />}
                            {item.channel === 'push' && <DeviceMobile size={12} className="text-purple-600" />}
                            {item.channel === 'webhook' && <WebhooksLogo size={12} className="text-amber-600" />}
                            {!['email', 'sms', 'push', 'webhook'].includes(item.channel) && <Bell size={12} className="text-rose-600" />}
                          </div>
                          <span className="text-gray-500">{channelLabels[item.channel]?.[isRtl ? 'ar' : 'en'] || item.channel}</span>
                        </div>
                      </td>
                      <td className="p-3 text-gray-900 font-medium max-w-[200px] truncate">{item.title || '-'}</td>
                      <td className="p-3 text-gray-500">{item.recipient_label || '-'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[item.status] || 'bg-gray-100'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500 text-xs">{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ===== TEMPLATES TAB ===== */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-3xl border shadow-sm border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <FileText size={18} />
              {t('Notification Templates', 'قوالب الإشعارات')}
            </h2>
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
            >
              <Plus size={16} />
              {t('New Template', 'قالب جديد')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { channel: 'email', name: t('Welcome Email', 'بريد الترحيب'), desc: t('Welcome new member with login details', 'ترحيب بالعضو الجديد مع بيانات الدخول'), vars: ['member_name', 'gym_name', 'email', 'password'] },
              { channel: 'sms', name: t('Renewal Reminder', 'تذكير التجديد'), desc: t('Remind member before membership expiry', 'تذكير بتجديد العضوية قبل انتهائها'), vars: ['member_name', 'gym_name', 'expiry_date'] },
              { channel: 'push', name: t('Workout Reminder', 'تذكير التمرين'), desc: t('Remind member of upcoming training session', 'تذكير بموعد جلسة التدريب'), vars: ['member_name', 'time', 'trainer'] },
              { channel: 'email', name: t('Payment Receipt', 'إيصال الدفع'), desc: t('Payment confirmation with receipt details', 'تأكيد الدفع مع تفاصيل الإيصال'), vars: ['member_name', 'gym_name', 'amount', 'date'] },
            ].map((tmpl, i) => (
              <div key={i} className="p-4 rounded-xl border border-gray-200 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${channelColors[tmpl.channel] || 'bg-gray-500'} bg-opacity-20`}>
                    {tmpl.channel === 'email' && <Envelope size={14} className="text-blue-600" />}
                    {tmpl.channel === 'sms' && <ChatText size={14} className="text-green-600" />}
                    {tmpl.channel === 'push' && <DeviceMobile size={14} className="text-purple-600" />}
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm">{tmpl.name}</h3>
                </div>
                <p className="text-xs text-gray-500 mb-2">{tmpl.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {tmpl.vars.map((v) => (
                    <span key={v} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono">{`{${v}}`}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
