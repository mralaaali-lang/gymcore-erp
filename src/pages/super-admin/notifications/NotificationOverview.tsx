// â”€â”€ Overview Tab â€” Summary cards, channel status, recent history â”€â”€
import { Bell, PaperPlaneRight, Clock, Warning, CheckCircle, XCircle, ClockCounterClockwise, Spinner } from '@phosphor-icons/react';
import { ChannelIcon, channelColors, channelLabels, statusBadge, type TabKey } from './notificationConstants';
import type { NotificationHistoryItem } from '../../../services/api';

interface NotificationSummary {
  total: number;
  today: number;
  pending: number;
  enabled_channels: Record<string, boolean>;
  channels: Record<string, number>;
}

interface OverviewProps {
  t: (ar: string, en: string) => string;
  isRtl: boolean;
  summary: NotificationSummary | undefined;
  settings: Record<string, { is_enabled: boolean; config: Record<string, unknown> }> | undefined;
  history: NotificationHistoryItem[];
  formatDate: (dateStr: string | null) => string;
  setActiveTab: (tab: TabKey) => void;
  summaryLoading?: boolean;
}

export default function NotificationOverview({
  t, isRtl, summary, settings, history, formatDate, setActiveTab,
}: OverviewProps) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('إجمالي الإرسال', 'Total Sent'), value: summary?.total ?? 0, icon: <PaperPlaneRight size={20} />, color: 'bg-blue-500' },
          { label: t('أرسلت اليوم', 'Sent Today'), value: summary?.today ?? 0, icon: <Clock size={20} />, color: 'bg-green-500' },
          { label: t('قيد الانتظار', 'Pending'), value: summary?.pending ?? 0, icon: <Warning size={20} />, color: 'bg-amber-500' },
          { label: t('القنوات النشطة', 'Active Channels'), value: Object.values(summary?.enabled_channels ?? {}).filter(Boolean).length, icon: <Bell size={20} />, color: 'bg-purple-500' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 text-sm font-medium">{card.label}</span>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color} bg-opacity-20`}>
                <div className="text-white">{card.icon}</div>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Channel Status Cards */}
      <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {t('حالة القنوات', 'Channel Status')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {['email', 'sms', 'push', 'webhook', 'in_app'].map((ch) => {
            const cfg = settings?.[ch];
            const enabled = cfg?.is_enabled ?? false;
            const chCount = summary?.channels?.[ch] ?? 0;
            return (
              <div
                key={ch}
                onClick={() => setActiveTab(ch as TabKey)}
                className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                  enabled ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${channelColors[ch] || 'bg-gray-500'} bg-opacity-20`}>
                    <ChannelIcon channel={ch} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {channelLabels[ch]?.[isRtl ? 'ar' : 'en'] || ch}
                    </p>
                    <p className="text-xs text-gray-500/70">{chCount} {t('رسالة', 'messages')}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {enabled ? (
                    <span className="flex items-center gap-1 text-green-700"><CheckCircle size={12} />{t('نشط', 'Active')}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-500"><XCircle size={12} />{t('معطل', 'Disabled')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent History Preview */}
      <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ClockCounterClockwise size={18} />
            {t('آخر الإرساليات', 'Recent Messages')}
          </h2>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className="text-sm text-primary hover:underline"
          >
            {t('عرض الكل', 'View All')}
          </button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {history.length === 0 && (
            <p className="text-gray-500/60 text-sm py-4 text-center">
              {t('لا توجد رسائل بعد', 'No messages yet')}
            </p>
          )}
          {history.slice(0, 5).map((item: NotificationHistoryItem) => (
            <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
              <ChannelIcon channel={item.channel} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.title || item.content?.slice(0, 60) || '-'}</p>
                <p className="text-xs text-gray-500/60 mt-0.5">{formatDate(item.created_at)}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[item.status] || 'bg-gray-100'}`}>
                {item.status}
              </span>
            </div>
          ))}
          {history.length > 0 && (
            <div className="flex justify-center pt-2">
              {summary === undefined && <Spinner size={16} className="animate-spin text-primary" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}