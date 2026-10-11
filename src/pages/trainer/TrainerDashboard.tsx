import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import type { MetricCard, PTSession } from '../../types';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';

const metrics: MetricCard[] = [
  { label: 'العملاء النشطين', value: 24, icon: 'fitness_center', trend: { value: '+3 هذا الأسبوع', positive: true }, color: 'primary' },
  { label: 'جلسات اليوم', value: 8, icon: 'calendar_today', trend: { value: '2 قادمة', positive: true }, color: 'secondary' },
  { label: 'المدفوعات الشهرية', value: '12,450 ر.س', icon: 'payments', trend: { value: '4 متأخرة', positive: false }, color: 'error' },
];

const todaySessions: PTSession[] = [
  { id: 'S001', memberId: 'M001', memberName: 'أحمد المحمدي', trainerId: 'T001', trainerName: 'خالد', totalSessions: 24, completedSessions: 18, totalAmount: 4800, paidAmount: 3600, status: 'active' },
  { id: 'S002', memberId: 'M002', memberName: 'سارة الدوسري', trainerId: 'T001', trainerName: 'خالد', totalSessions: 12, completedSessions: 12, totalAmount: 2400, paidAmount: 2400, status: 'completed' },
  { id: 'S003', memberId: 'M003', memberName: 'أحمد الزهراني', trainerId: 'T001', trainerName: 'خالد', totalSessions: 36, completedSessions: 20, totalAmount: 7200, paidAmount: 4800, status: 'active' },
  { id: 'S004', memberId: 'M004', memberName: 'فاطمة الشمري', trainerId: 'T001', trainerName: 'خالد', totalSessions: 8, completedSessions: 3, totalAmount: 1600, paidAmount: 600, status: 'overdue' },
];

const schedule = [
  { time: '08:00 - 09:00', member: 'أحمد المحمدي', type: 'تمارين قوة' },
  { time: '09:30 - 10:30', member: 'سارة الدوسري', type: 'تأهيل رياضي' },
  { time: '11:00 - 12:00', member: 'أحمد الزهراني', type: 'كروس فيت' },
  { time: '16:00 - 17:00', member: 'فاطمة الشمري', type: 'تمارين مقاومة' },
  { time: '17:30 - 18:30', member: 'محمد العتيبي', type: 'ملاكمة' },
];

const sessionVariant: Record<PTSession['status'], 'success' | 'warning' | 'error' | 'neutral'> = {
  active: 'success',
  completed: 'neutral',
  overdue: 'error',
};

export default function TrainerDashboard() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [, setSelectedSession] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'لوحة المدرب' : 'Trainer Dashboard'}
        subtitle={isRtl ? 'الأحد 21 يونيو 2026' : 'Sun, Jun 21, 2026'}
        icon="fitness_center"
      />

      <StatsGrid
        columns={3}
        stats={metrics.map((m) => ({
          key: m.label,
          label: m.label,
          value: m.value,
          icon: m.icon,
          trend: m.trend,
          color: m.color === 'error' ? ('error' as const) : ('primary' as const),
        }))}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {isRtl ? 'جدول اليوم' : "Today's Schedule"}
          </h2>
          <div className="space-y-3">
            {schedule.map((s, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="w-20 text-center shrink-0">
                  <span className="text-xs text-emerald-600">{s.time}</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{s.member}</p>
                  <p className="text-sm text-gray-500">{s.type}</p>
                </div>
                <Button
                  variant="primary"
                  onClick={() => setSelectedSession(s.member)}
                >
                  {isRtl ? 'بدء' : 'Start'}
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {isRtl ? 'الجلسات النشطة' : 'Active Sessions'}
          </h2>
          <div className="space-y-3">
            {todaySessions.map((s) => {
              const progress = Math.round((s.completedSessions / s.totalSessions) * 100);
              return (
                <div key={s.id} className="p-4 rounded-2xl bg-gray-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{s.memberName}</p>
                    <StatusBadge
                      status={s.status === 'active' ? 'نشط' : s.status === 'completed' ? 'مكتملة' : 'متأخر'}
                      variant={sessionVariant[s.status]}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">
                      {s.completedSessions}/{s.totalSessions}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{s.totalAmount.toLocaleString()} ر.س</span>
                    <span>{isRtl ? 'مدفوع' : 'Paid'}: {s.paidAmount.toLocaleString()} ر.س</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button variant="primary">
          <span className="material-symbols-outlined">play_arrow</span>
          {isRtl ? 'بدء جلسة جديدة' : 'Start New Session'}
        </Button>
        <Button variant="secondary">
          <span className="material-symbols-outlined">note_add</span>
          {isRtl ? 'إضافة ملاحظات' : 'Add Notes'}
        </Button>
      </div>
    </div>
  );
}
