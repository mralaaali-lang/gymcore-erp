// â”€â”€ History Tab â€” Full notification history with filters â”€â”€
import { ArrowsClockwise, ClockCounterClockwise } from '@phosphor-icons/react';
import PageLoader from '../../../components/shared/PageLoader';
import { ChannelIcon, channelLabels, statusBadge } from './notificationConstants';
import type { NotificationHistoryItem } from '../../../services/api';
import type { QueryClient } from '@tanstack/react-query';

interface HistoryProps {
  t: (ar: string, en: string) => string;
  isRtl: boolean;
  history: NotificationHistoryItem[];
  historyLoading: boolean;
  historyFilter: { channel: string; status: string };
  setHistoryFilter: React.Dispatch<React.SetStateAction<{ channel: string; status: string }>>;
  formatDate: (dateStr: string | null) => string;
  queryClient: QueryClient;
}

export default function NotificationHistory({
  t, isRtl, history, historyLoading, historyFilter, setHistoryFilter, formatDate, queryClient,
}: HistoryProps) {
  return (
    <div className="bg-white rounded-3xl border shadow-sm border-gray-100 p-5">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <ClockCounterClockwise size={18} />
          {t('سجل الإشعارات', 'Notification History')}
        </h2>
        <div className="flex items-center gap-3">
          <select
            value={historyFilter.channel}
            onChange={(e) => setHistoryFilter((prev) => ({ ...prev, channel: e.target.value }))}
            className="px-3 py-2 border border-gray-100 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">{t('كل القنوات', 'All Channels')}</option>
            {['email', 'sms', 'push', 'webhook', 'in_app'].map((ch) => (
              <option key={ch} value={ch}>{channelLabels[ch]?.[isRtl ? 'ar' : 'en'] || ch}</option>
            ))}
          </select>
          <select
            value={historyFilter.status}
            onChange={(e) => setHistoryFilter((prev) => ({ ...prev, status: e.target.value }))}
            className="px-3 py-2 border border-gray-100 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">{t('كل الحالات', 'All Status')}</option>
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
              <tr className="bg-gray-100 text-gray-900">
                <th className="text-right p-3">{t('القناة', 'Channel')}</th>
                <th className="text-right p-3">{t('العنوان', 'Title')}</th>
                <th className="text-right p-3">{t('المستلم', 'Recipient')}</th>
                <th className="text-right p-3">{t('الحالة', 'Status')}</th>
                <th className="text-right p-3">{t('التاريخ', 'Date')}</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-gray-500">{t('لا توجد رسائل', 'No messages')}</td></tr>
              )}
              {history.map((item: NotificationHistoryItem) => (
                <tr key={item.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <ChannelIcon channel={item.channel} />
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
  );
}