import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { listAnnouncements, createAnnouncement } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import StatusBadge from '../../components/ui/StatusBadge';

interface Announcement {
  id: string;
  title: string;
  content: string;
  target_audience: string;
  is_pinned: boolean;
  staff_name: string;
  created_at: string;
}

const audienceLabels: Record<string, string> = {
  all: 'الكل',
  members: 'الأعضاء',
  staff: 'الموظفين',
  trainers: 'المدربين',
};

function audienceVariant(audience: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (audience === 'members') return 'success';
  if (audience === 'staff') return 'warning';
  if (audience === 'trainers') return 'error';
  return 'neutral';
}

export default function AnnouncementsPage() {
  const { language } = useApp();
  const rtl = language === 'ar';
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetAudience, setTargetAudience] = useState('all');
  const [isPinned, setIsPinned] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => listAnnouncements(),
    staleTime: 30_000,
  });

  const announcements: Announcement[] = data?.data || [];

  const sorted = [...announcements].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const createMutation = useMutation({
    mutationFn: () => createAnnouncement({
      title,
      content,
      target_audience: targetAudience,
      is_pinned: isPinned,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setShowForm(false);
      setTitle('');
      setContent('');
      setTargetAudience('all');
      setIsPinned(false);
    },
  });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ar-EG');
  const inputCls = 'w-full px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none bg-white';

  if (isLoading) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
        <PageLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
        <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center text-red-700">
          {rtl ? 'فشل تحميل الإعلانات' : 'Failed to load announcements'}
        </div>
      </div>
    );
  }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      <PageHeader
        title="الإعلانات"
        subtitle={rtl ? 'إعلانات الصالة للأعضاء والموظفين' : 'Gym announcements for members and staff'}
        icon="campaign"
        actions={
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <span className="material-symbols-outlined text-lg">add</span>
            إضافة إعلان
          </Button>
        }
      />

      {sorted.length === 0 && (
        <Card className="p-12 text-center">
          <span className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gray-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-gray-400 text-3xl">campaign</span>
          </span>
          <p className="text-gray-500">
            {rtl ? 'لا توجد إعلانات' : 'No announcements'}
          </p>
        </Card>
      )}

      <div className="space-y-4">
        {sorted.map((a) => (
          <Card key={a.id} className={a.is_pinned ? 'border-amber-200 bg-amber-50/40' : ''}>
            <div className="flex items-start gap-3">
              {a.is_pinned && (
                <span className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">keep</span>
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-bold text-gray-900">{a.title}</h3>
                  <StatusBadge status={audienceLabels[a.target_audience] || a.target_audience} variant={audienceVariant(a.target_audience)} />
                </div>
                <p className="text-sm text-gray-500 whitespace-pre-wrap line-clamp-3 mb-2">{a.content}</p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{a.staff_name}</span>
                  <span>{formatDate(a.created_at)}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <Card className="shadow-xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{rtl ? 'إضافة إعلان' : 'Add Announcement'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'العنوان' : 'Title'}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'المحتوى' : 'Content'}</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className={inputCls}
                  rows={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الجمهور المستهدف' : 'Target Audience'}</label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className={inputCls}
                >
                  <option value="all">{audienceLabels.all}</option>
                  <option value="members">{audienceLabels.members}</option>
                  <option value="staff">{audienceLabels.staff}</option>
                  <option value="trainers">{audienceLabels.trainers}</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pinToggle"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-emerald-500"
                />
                <label htmlFor="pinToggle" className="text-sm text-gray-700">
                  {rtl ? 'إعلان مثبت' : 'Pinned announcement'}
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" fullWidth onClick={() => setShowForm(false)} className="px-4 py-2 text-sm">
                {rtl ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !title || !content}
                className="px-4 py-2 text-sm"
              >
                {createMutation.isPending ? '...' : (rtl ? 'نشر' : 'Publish')}
              </Button>
            </div>
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}

