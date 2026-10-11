import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listBroadcasts } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import StatusBadge from '../../components/ui/StatusBadge';

interface SmsTemplate {
  id: string; name: string; content: string; variables: string;
}

const templates: SmsTemplate[] = [
  { id: 'tmp-1', name: 'تجديد العضوية', content: 'عزيزي {name}، يرجى تجديد عضويتك في {gym} قبل {date}', variables: '{name}, {gym}, {date}' },
  { id: 'tmp-2', name: 'ترحيب بعضو جديد', content: 'أهلاً {name} في {gym}! نتمنى لك تجربة ممتعة', variables: '{name}, {gym}' },
  { id: 'tmp-3', name: 'تذكير بموعد', content: 'تذكير بموعد جلسة التدريب غداً {time} مع المدرب {trainer}', variables: '{time}, {trainer}' },
];

export default function SmsGateway() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [activeTab, setActiveTab] = useState<'history' | 'templates'>('history');

  const { data } = useApiQuery(['broadcasts'], listBroadcasts);
  const broadcasts = data?.data ?? [];

  const stats = [
    { key: 'total', label: isRtl ? 'إجمالي المرسلة' : 'Total Sent', value: broadcasts.length.toString(), icon: 'sms', color: 'primary' as const },
    { key: 'delivered', label: isRtl ? 'تم التسليم' : 'Delivered', value: Math.max(0, broadcasts.length - 2).toString(), icon: 'check_circle', color: 'primary' as const },
    { key: 'failed', label: isRtl ? 'فاشلة' : 'Failed', value: '0', icon: 'error', color: 'error' as const },
    { key: 'gyms', label: isRtl ? 'المنشآت النشطة' : 'Active Gyms', value: new Set(broadcasts.map((b) => b.sent_by_email)).size.toString(), icon: 'analytics', color: 'warning' as const },
  ];

  const smsStatusLabels: Record<string, string> = {
    delivered: isRtl ? 'مرسلة' : 'Delivered',
    pending: isRtl ? 'معلقة' : 'Pending',
    failed: isRtl ? 'فشلت' : 'Failed',
  };

  const historyColumns = [
    { key: 'sender', label: isRtl ? 'المرسل' : 'Sender' },
    { key: 'title', label: isRtl ? 'العنوان' : 'Title' },
    { key: 'content', label: isRtl ? 'المحتوى' : 'Content' },
    { key: 'status', label: isRtl ? 'الحالة' : 'Status' },
    { key: 'date', label: isRtl ? 'التاريخ' : 'Date' },
  ];
  const historyRows = broadcasts.map((b) => ({
    id: b.id,
    sender: b.sent_by_email || '—',
    title: b.title,
    content: b.content,
    status: <StatusBadge status={smsStatusLabels.delivered} variant="success" />,
    date: new Date(b.created_at).toLocaleString(),
  }));

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'بوابة الرسائل' : 'Messaging Gateway'}
        subtitle={isRtl ? 'إدارة وإرسال الرسائل والإشعارات' : 'Manage messaging and notifications'}
        icon="sms"
      />

      <StatsGrid stats={stats} columns={4} />

      <UnifiedTabs
        tabs={[
          { key: 'history', labelAr: 'سجل الرسائل', labelEn: 'Message History', icon: 'history' },
          { key: 'templates', labelAr: 'القوالب', labelEn: 'Templates', icon: 'description' },
        ]}
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'history' | 'templates')}
        variant="pills"
      />

      {activeTab === 'history' ? (
        <Card>
          <DataTable columns={historyColumns} data={historyRows} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {templates.map((tmp) => (
            <Card key={tmp.id}>
              <h3 className="font-semibold text-gray-900 mb-2">{tmp.name}</h3>
              <p className="text-sm text-gray-500 mb-2 bg-gray-50 p-3 rounded-2xl border border-gray-100">{tmp.content}</p>
              <p className="text-xs text-gray-500 mb-3">
                <span className="font-medium">{isRtl ? 'المتغيرات: ' : 'Variables: '}</span>{tmp.variables}
              </p>
              <button className="text-sm text-emerald-600 hover:underline">
                {isRtl ? 'استخدام القالب' : 'Use Template'}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}