import { useState } from 'react';
import { formatDateTime } from '../../utils/date';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useMutation } from '@tanstack/react-query';
import { useApiQuery } from '../../hooks/useApiQuery';
import { listBroadcasts, createBroadcast } from '../../services/api';
import type { BroadcastData } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

const ROLE_OPTIONS = ['super-admin', 'gym-admin', 'trainer', 'reception', 'player'];

export default function BroadcastEngine() {
  const { language } = useApp();
  const { showToast } = useToast();
  const isRtl = language === 'ar';
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const { data, isLoading } = useApiQuery(['broadcasts'], listBroadcasts);
  const broadcasts: BroadcastData[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => createBroadcast({ title, content, target_roles: selectedRoles }),
    onSuccess: () => {
      showToast(isRtl ? 'تم إرسال البث' : 'Broadcast sent', 'success');
      setTitle(''); setContent(''); setSelectedRoles([]); setShowForm(false);
    },
    onError: () => showToast(isRtl ? 'فشل إرسال البث' : 'Failed to send', 'error'),
  });

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'البث والإشعارات' : 'Broadcast Engine'}
        subtitle={isRtl ? 'إرسال رسائل جماعية للمنشآت' : 'Send bulk messages to gyms'}
        icon="campaign"
        actions={
          <Button onClick={() => setShowForm(!showForm)} variant="primary">
            {showForm ? (isRtl ? 'إلغاء' : 'Cancel') : (isRtl ? 'بث جديد' : 'New Broadcast')}
          </Button>
        }
      />

      {showForm && (
        <Card>
          <div className="space-y-4">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isRtl ? 'العنوان' : 'Title'}
              className="w-full px-4 py-2 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={isRtl ? 'المحتوى' : 'Content'}
              className="w-full px-4 py-2 border border-gray-100 rounded-xl min-h-[100px] focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div>
              <p className="text-sm text-gray-500 mb-2">{isRtl ? 'إرسال إلى:' : 'Send to:'}</p>
              <div className="flex gap-2 flex-wrap">
                {ROLE_OPTIONS.map((role) => (
                  <button key={role} onClick={() => toggleRole(role)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold border ${selectedRoles.includes(role) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-500 border-gray-100'}`}>
                    {role}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={() => createMutation.mutate()}
              disabled={!title || !content || createMutation.isPending}
              variant="primary">
              {createMutation.isPending ? '...' : (isRtl ? 'إرسال البث' : 'Send Broadcast')}
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {isLoading && <PageLoader message={isRtl ? 'جاري التحميل...' : 'Loading...'} />}
        {broadcasts.length === 0 && !isLoading && (
          <Card>
            <p className="text-center text-gray-500 py-8">{isRtl ? 'لا توجد بثوث سابقة' : 'No previous broadcasts'}</p>
          </Card>
        )}
        {broadcasts.map((b) => (
          <Card key={b.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-white text-xl">campaign</span>
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{b.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{b.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <span>{b.sent_by_email || '—'}</span>
                    <span>&middot;</span>
                    <span>{formatDateTime(b.created_at)}</span>
                    {b.target_roles && b.target_roles.length > 0 && (
                      <><span>&middot;</span><StatusBadge status={b.target_roles.join(', ')} variant="neutral" /></>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}