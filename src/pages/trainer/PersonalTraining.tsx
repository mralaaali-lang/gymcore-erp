import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { listPtPackages, createPtPackage, listPtSessions, createPtSession, completePtSession, listTrainers, listMembers } from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatMoney } from '../../utils/currency';

const sessionStatusVariant: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success', completed: 'neutral', cancelled: 'error',
};

const sessionStatusLabel = (status: string): string =>
  status === 'active' ? 'نشط' : status === 'completed' ? 'مكتمل' : 'ملغي';

export default function PersonalTraining() {
  const { language, gymProfile } = useApp();
  // §30: money() — gym currency symbol everywhere on this page
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const queryClient = useQueryClient();
  const [showPkgForm, setShowPkgForm] = useState(false);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [pkgForm, setPkgForm] = useState({ name: '', session_count: 1, total_price: 0 });
  const [sessionForm, setSessionForm] = useState({ package_id: '', member_id: '', trainer_id: '', session_number: 1, scheduled_at: '' });

  const { data: packagesData, isLoading: pkgLoading } = useQuery({ queryKey: ['pt-packages'], queryFn: listPtPackages });
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({ queryKey: ['pt-sessions'], queryFn: () => listPtSessions() });
  const { data: trainersData } = useQuery({ queryKey: ['trainers'], queryFn: listTrainers });
  const { data: membersData } = useQuery({ queryKey: ['members'], queryFn: () => listMembers() });

  const createPkgMut = useMutation({
    mutationFn: createPtPackage,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pt-packages'] }); setShowPkgForm(false); setPkgForm({ name: '', session_count: 1, total_price: 0 }); },
  });

  const createSessionMut = useMutation({
    mutationFn: createPtSession,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pt-sessions'] }); setShowSessionForm(false); setSessionForm({ package_id: '', member_id: '', trainer_id: '', session_number: 1, scheduled_at: '' }); },
  });

  const completeMut = useMutation({
    mutationFn: (id: string) => completePtSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pt-sessions'] }),
  });

  const packages = packagesData?.data || [];
  const sessions = sessionsData?.data || [];
  const trainers = trainersData?.data || [];
  const members = membersData?.members || [];

  const handlePkgSubmit = (e: React.FormEvent) => { e.preventDefault(); createPkgMut.mutate(pkgForm); };
  const handleSessionSubmit = (e: React.FormEvent) => { e.preventDefault(); createSessionMut.mutate({ ...sessionForm, scheduled_at: sessionForm.scheduled_at || null }); };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader
        title="التدريب الشخصي"
        icon="fitness_center"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => { setShowSessionForm(!showSessionForm); setShowPkgForm(false); }} variant="primary">
              <span className="material-symbols-outlined text-lg">add</span>إضافة جلسة
            </Button>
            <Button onClick={() => { setShowPkgForm(!showPkgForm); setShowSessionForm(false); }} variant="primary">
              <span className="material-symbols-outlined text-lg">add</span>إضافة باقة
            </Button>
          </div>
        }
      />

      {showPkgForm && (
        <Card>
          <form onSubmit={handlePkgSubmit} className="space-y-4">
            <h2 className="text-base font-bold text-gray-900">إضافة باقة</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
              <input type="text" value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} className="w-full px-4 py-2 rounded-3xl border border-gray-100 shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">عدد الجلسات</label>
              <input type="number" value={pkgForm.session_count} onChange={(e) => setPkgForm({ ...pkgForm, session_count: +e.target.value })} className="w-full px-4 py-2 rounded-3xl border border-gray-100 shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500" min="1" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">السعر الإجمالي</label>
              <input type="number" value={pkgForm.total_price} onChange={(e) => setPkgForm({ ...pkgForm, total_price: +e.target.value })} className="w-full px-4 py-2 rounded-3xl border border-gray-100 shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500" min="0" required />
            </div>
          </div>
          <Button type="submit" variant="primary">إضافة</Button>
          </form>
        </Card>
      )}

      {showSessionForm && (
        <Card>
          <form onSubmit={handleSessionSubmit} className="space-y-4">
            <h2 className="text-base font-bold text-gray-900">إضافة جلسة</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الباقة</label>
              <select value={sessionForm.package_id} onChange={(e) => setSessionForm({ ...sessionForm, package_id: e.target.value })} className="w-full px-4 py-2 rounded-3xl border border-gray-100 shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500" required>
                <option value="">اختر باقة</option>
                {packages.map((pkg: any) => (
                  <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المشترك</label>
              <select value={sessionForm.member_id} onChange={(e) => setSessionForm({ ...sessionForm, member_id: e.target.value })} className="w-full px-4 py-2 rounded-3xl border border-gray-100 shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500" required>
                <option value="">اختر مشترك</option>
                {members.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المدرب</label>
              <select value={sessionForm.trainer_id} onChange={(e) => setSessionForm({ ...sessionForm, trainer_id: e.target.value })} className="w-full px-4 py-2 rounded-3xl border border-gray-100 shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500" required>
                <option value="">اختر مدرب</option>
                {trainers.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الجلسة</label>
              <input type="number" value={sessionForm.session_number} onChange={(e) => setSessionForm({ ...sessionForm, session_number: +e.target.value })} className="w-full px-4 py-2 rounded-3xl border border-gray-100 shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500" min="1" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
              <input type="datetime-local" value={sessionForm.scheduled_at} onChange={(e) => setSessionForm({ ...sessionForm, scheduled_at: e.target.value })} className="w-full px-4 py-2 rounded-3xl border border-gray-100 shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <Button type="submit" variant="primary">إضافة</Button>
          </form>
        </Card>
      )}

      <h2 className="text-lg font-bold text-gray-900">الباقات</h2>
      {pkgLoading && <PageLoader message="جاري التحميل..." />}
      {!pkgLoading && packages.length === 0 && <div className="text-center py-4 text-gray-400">لا توجد باقات</div>}
      {!pkgLoading && packages.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg: any) => (
            <Card key={pkg.id}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-white text-xl">package_2</span>
                  </span>
                  <div>
                    <p className="font-bold text-gray-900">{pkg.name}</p>
                    <p className="text-sm text-gray-500">{pkg.session_count} جلسة</p>
                  </div>
                </div>
                <StatusBadge status={sessionStatusLabel(pkg.status || 'active')} variant={sessionStatusVariant[pkg.status || 'active'] || 'neutral'} />
              </div>
              <p className="text-xl font-bold text-emerald-600">{money(pkg.total_price)}</p>
            </Card>
          ))}
        </div>
      )}

      <h2 className="text-lg font-bold text-gray-900">الجلسات</h2>
      {sessionsLoading && <PageLoader message="جاري التحميل..." />}
      {!sessionsLoading && sessions.length === 0 && <div className="text-center py-4 text-gray-400">لا توجد جلسات</div>}
      {!sessionsLoading && sessions.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right p-4 font-semibold text-gray-700">#</th>
                  <th className="text-right p-4 font-semibold text-gray-700">المشترك</th>
                  <th className="text-right p-4 font-semibold text-gray-700">المدرب</th>
                  <th className="text-right p-4 font-semibold text-gray-700">الباقة</th>
                  <th className="text-right p-4 font-semibold text-gray-700">رقم الجلسة</th>
                  <th className="text-right p-4 font-semibold text-gray-700">الحالة</th>
                  <th className="text-right p-4 font-semibold text-gray-700">التاريخ</th>
                  <th className="text-right p-4 font-semibold text-gray-700">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s: any, i: number) => (
                  <tr key={s.id || i} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-500">{i + 1}</td>
                    <td className="p-4 font-medium text-gray-900">{s.member_name || s.member?.full_name || '-'}</td>
                    <td className="p-4 text-gray-600">{s.trainer_name || s.trainer?.full_name || '-'}</td>
                    <td className="p-4 text-gray-600">{s.package_name || s.package?.name || '-'}</td>
                    <td className="p-4">{s.session_number || '-'}</td>
                    <td className="p-4"><StatusBadge status={sessionStatusLabel(s.status)} variant={sessionStatusVariant[s.status] || 'neutral'} /></td>
                    <td className="p-4 text-gray-600">{s.scheduled_at ? new Date(s.scheduled_at).toLocaleDateString('ar-EG') : '-'}</td>
                    <td className="p-4">
                      {s.status === 'active' && (
                        <button onClick={() => completeMut.mutate(s.id)} className="text-emerald-600 hover:text-emerald-600 transition-colors text-sm font-medium">إكمال</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

