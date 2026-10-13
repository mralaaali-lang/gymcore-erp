import { useApp } from '../../context/GymBrandContext';
import { formatDateTime } from '../../utils/date';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listBroadcasts } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';

// ====================================================================
// Messaging Gateway — §32: mock-free.
//
// Removed: fabricated "Delivered = total − 2 / Failed = 0" cards (no
// delivery status exists on platform_broadcasts), a fake per-row status
// badge, and a hardcoded Templates tab with a no-op "Use Template"
// button (no SMS provider integration). What remains shows only real
// broadcast records from /platform/broadcasts.
// ====================================================================

export default function SmsGateway() {
  const { language } = useApp();
  const isRtl = language === 'ar';

  const { data } = useApiQuery(['broadcasts'], listBroadcasts);
  const broadcasts = data?.data ?? [];

  const now = new Date();
  const monthCount = broadcasts.filter((b) => {
    const d = new Date(b.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  // /platform/broadcasts returns newest-first (ORDER BY created_at DESC).
  const lastSent = broadcasts.length > 0 ? formatDateTime(broadcasts[0].created_at) : '—';
  const senders = new Set(broadcasts.map((b) => b.sent_by_email).filter(Boolean)).size;

  const stats = [
    { key: 'total', label: isRtl ? 'إجمالي broadcasts المرسلة' : 'Total Broadcasts', value: String(broadcasts.length), icon: 'sms', color: 'primary' as const },
    { key: 'month', label: isRtl ? 'هذا الشهر' : 'This Month', value: String(monthCount), icon: 'calendar_month', color: 'primary' as const },
    { key: 'last', label: isRtl ? 'آخر إرسال' : 'Last Sent', value: lastSent, icon: 'schedule', color: 'secondary' as const },
    { key: 'senders', label: isRtl ? 'المرسلون' : 'Senders', value: String(senders), icon: 'analytics', color: 'warning' as const },
  ];

  const historyColumns = [
    { key: 'sender', label: isRtl ? 'المرسل' : 'Sender' },
    { key: 'title', label: isRtl ? 'العنوان' : 'Title' },
    { key: 'content', label: isRtl ? 'المحتوى' : 'Content' },
    { key: 'audience', label: isRtl ? 'الجمهور المستهدف' : 'Audience' },
    { key: 'date', label: isRtl ? 'التاريخ' : 'Date' },
  ];
  const historyRows = broadcasts.map((b) => ({
    id: b.id,
    sender: b.sent_by_email || '—',
    title: b.title,
    content: b.content,
    audience: Array.isArray(b.target_roles) && b.target_roles.length > 0 ? b.target_roles.join('، ') : (isRtl ? 'الكل' : 'All'),
    date: formatDateTime(b.created_at),
  }));

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'بوابة الرسائل' : 'Messaging Gateway'}
        subtitle={isRtl ? 'سجل بث الرسائل المنصة — لا بوابة SMS خارجية متصلة بعد' : 'Platform broadcast history — no external SMS gateway connected yet'}
        icon="sms"
      />

      <StatsGrid stats={stats} columns={4} />

      <Card>
        <DataTable columns={historyColumns} data={historyRows} />
      </Card>
    </div>
  );
}
