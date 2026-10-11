import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dumbbell, Calendar, DollarSign, Filter, Building2, Users, Wallet, Package,
  type LucideIcon,
} from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { useApp } from '../../context/GymBrandContext';
import { useSetupProgress, type SetupStepId } from '../../hooks/useGymDashboard';
import type { UserRole } from '../../types';

const DISMISS_KEY = 'gymcore-setup-dismissed';

interface SetupStep {
  id: SetupStepId;
  title: string;
  description: string;
  icon: LucideIcon;
  path: string;
}

const ROLE_BASE: Record<UserRole, string> = {
  'super-admin': '/super-admin',
  'gym-admin': '/admin',
  'trainer': '/trainer',
  'reception': '/reception',
  'player': '/player',
};

const BASE_STEPS: SetupStep[] = [
  { id: 'trainers', title: 'أضف أول مدرب', description: 'ادعُ مدربينك لإدارة جداول التدريب', icon: Dumbbell, path: '/trainers' },
  { id: 'subscriptions', title: 'أنشئ باقات الاشتراك', description: 'عرّف خطط العضوية والأسعار', icon: Package, path: '/subscriptions' },
  { id: 'members', title: 'سجّل أول عضو', description: 'أضف أعضاءك واصدر كارنيهات الدخول', icon: Users, path: '/members/add' },
  { id: 'cashbox', title: 'اضبط الخزنة والشيفت', description: 'افتح الخزنة وحدّد شيفتات العمل', icon: Wallet, path: '/cashbox' },
  { id: 'schedule', title: 'جدول الحصص', description: 'سجّل أول حضور أو جلسة تدريب', icon: Calendar, path: '/attendance' },
  { id: 'payments', title: 'اربط وسيلة الدفع', description: 'فعّل المدفوعات والفوترة', icon: DollarSign, path: '/payments' },
  { id: 'marketing', title: 'حملة تسويقية', description: 'أطلق عروضاً لجذب أعضاء جدد', icon: Filter, path: '/announcements' },
  { id: 'settings', title: 'خصّص إعدادات النادي', description: 'العلامة التجارية والموقع والفروع', icon: Building2, path: '/settings' },
];

export default function SetupChecklist() {
  const navigate = useNavigate();
  const { role, isZeroState } = useApp();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  const showChecklist = !dismissed || isZeroState;
  const { completed, doneCount, total, isLoading } = useSetupProgress(showChecklist);

  const base = ROLE_BASE[role];
  const steps = useMemo(
    () => BASE_STEPS.map((s) => ({ ...s, path: `${base}${s.path}` })),
    [base],
  );

  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  if (dismissed && !isZeroState) return null;
  if (!isLoading && doneCount === total && !isZeroState) return null;

  const handleSkip = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }, []);

  return (
    <div className="space-y-stack-md">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-headline-md font-bold text-on-surface">إعداد حسابك</h2>
          <p className="text-body-md text-on-surface-variant mt-1">
            {isLoading ? 'جاري التحقق من التقدم...' : `${doneCount} من ${total} خطوات مكتملة`}
          </p>
        </div>
        <Button variant="primary" onClick={handleSkip}>
          تخطي الإعداد
        </Button>
      </div>

      <div className="w-full h-2.5 bg-surface-container rounded-full overflow-hidden shadow-inner">
        <div
          className="h-full bg-gradient-to-r from-petrol to-accent rounded-full transition-all duration-700 ease-out shadow-sm shadow-accent/30"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-stack-md">
        {steps.map((step) => {
          const done = completed[step.id];
          const Icon = step.icon;
          return (
            <Card
              key={step.id}
              hoverable
              onClick={() => navigate(step.path)}
              className={`group cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
                done ? 'border-petrol/40 bg-petrol/[0.03]' : ''
              }`}
            >
              <div className="flex flex-col gap-4 h-full">
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-105 ${
                    done ? 'bg-petrol/15' : 'bg-primary-container'
                  }`}>
                    <Icon size={22} className="text-petrol" strokeWidth={1.75} />
                  </div>
                  <span
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                      done ? 'bg-petrol border-petrol' : 'border-outline-variant group-hover:border-petrol/40'
                    }`}
                  >
                    {done && <span className="material-symbols-outlined text-white text-xs">check</span>}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-label-md font-bold text-on-surface">{step.title}</h3>
                  <p className="text-caption text-on-surface-variant mt-1.5 leading-relaxed">{step.description}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

