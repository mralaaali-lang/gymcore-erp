import { useState } from 'react';
import { useApp } from '../../context/GymBrandContext';
import type { MetricCard } from '../../types';
import PageHeader from '../../components/shared/PageHeader';
import StatsGrid from '../../components/shared/StatsGrid';
import FilterBar from '../../components/shared/FilterBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

interface SessionLog {
  id: string;
  date: string;
  type: string;
  duration: string;
  trainerNote: string;
}

interface MemberOption {
  id: string;
  name: string;
  avatar: string;
}

const members: MemberOption[] = [
  { id: 'M001', name: 'أحمد المحمدي', avatar: 'أ' },
  { id: 'M002', name: 'سارة الدوسري', avatar: 'س' },
  { id: 'M003', name: 'أحمد الزهراني', avatar: 'أ' },
  { id: 'M004', name: 'فاطمة الشمري', avatar: 'ف' },
  { id: 'M005', name: 'محمد العتيبي', avatar: 'م' },
];

const progressMetrics: MetricCard[] = [
  { label: 'الجلسات المنفذة', value: 18, icon: 'check_circle', color: 'primary' },
  { label: 'الوزن (كجم)', value: 82, icon: 'monitor_weight', trend: { value: '-3 كجم هذا الشهر', positive: true }, color: 'secondary' },
  { label: 'نسبة الدهون', value: '15%', icon: 'pie_chart', trend: { value: '-2% هذا الشهر', positive: true }, color: 'secondary' },
  { label: 'معدل الحضور', value: '94%', icon: 'trending_up', trend: { value: '+5% هذا الشهر', positive: true }, color: 'primary' },
];

const sessionHistory: SessionLog[] = [
  { id: 'SL001', date: '2026-06-20', type: 'تمارين قوة', duration: '60 دقيقة', trainerNote: 'تركيز على تمارين الصدر والترايسبس. أداء ممتاز.' },
  { id: 'SL002', date: '2026-06-18', type: 'كارديو', duration: '45 دقيقة', trainerNote: 'تم تحسين سرعة الجري على السير. زادت المسافة.' },
  { id: 'SL003', date: '2026-06-16', type: 'تمارين مقاومة', duration: '50 دقيقة', trainerNote: 'زيادة الأوزان بنسبة 5%. بحاجة لمراقبة التقنية.' },
  { id: 'SL004', date: '2026-06-14', type: 'كروس فيت', duration: '55 دقيقة', trainerNote: 'تحسن ملحوظ في سرعة أداء التمارين الأساسية.' },
  { id: 'SL005', date: '2026-06-12', type: 'تأهيل رياضي', duration: '60 دقيقة', trainerNote: 'تمارين إطالة وتقوية العضلات الأساسية.' },
];

export default function ClientProgress() {
  const { language } = useApp();
  const isRtl = language === 'ar';
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<MemberOption>(members[0]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [note, setNote] = useState('');

  const filteredMembers = members.filter((m) => m.name.includes(search));

  const handleAddNote = () => {
    if (!note.trim()) return;
    setNote('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRtl ? 'تقدم العملاء' : 'Client Progress'}
        icon="trending_up"
      />

      <Card>
        <div className="relative">
          <FilterBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setShowDropdown(true); }}
            searchPlaceholder={isRtl ? 'ابحث عن عضو...' : 'Search member...'}
            extraActions={
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-medium">
                  {selectedMember.avatar}
                </div>
                <span className="text-sm font-medium text-gray-900">{selectedMember.name}</span>
              </div>
            }
          />
          {showDropdown && search && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl border border-gray-100 shadow-sm z-10 overflow-hidden">
              {filteredMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedMember(m); setSearch(''); setShowDropdown(false); }}
                  className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-right"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-sm font-medium">
                    {m.avatar}
                  </div>
                  <span className="text-sm text-gray-900">{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <StatsGrid
        columns={4}
        stats={progressMetrics.map((m) => ({
          key: m.label,
          label: m.label,
          value: m.value,
          icon: m.icon,
          trend: m.trend,
          color: 'primary' as const,
        }))}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {isRtl ? 'سجل الجلسات' : 'Session History'}
          </h2>
          <div className="space-y-4">
            {sessionHistory.map((s) => (
              <div key={s.id} className="relative pr-6 pb-4 border-r-2 border-emerald-500/30 last:pb-0 last:border-transparent">
                <div className="absolute right-0 top-0 -translate-x-1/2 w-3 h-3 rounded-full bg-emerald-500" />
                <div className="mr-2">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs text-emerald-600">{s.date}</span>
                    <span className="text-xs text-gray-500">{s.duration}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{s.type}</p>
                  <p className="text-sm text-gray-500 mt-1">{s.trainerNote}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {isRtl ? 'ملاحظات المدرب' : 'Trainer Notes'}
          </h2>
          <div className="space-y-4">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-2xl border border-gray-100 bg-gray-50 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all resize-none"
              placeholder={isRtl ? 'أضف ملاحظات عن الجلسة...' : 'Add session notes...'}
            />
            <Button
              onClick={handleAddNote}
              variant="primary"
              fullWidth
            >
              {isRtl ? 'حفظ الملاحظة' : 'Save Note'}
            </Button>
          </div>
          <div className="mt-6 space-y-3">
            <p className="text-xs text-gray-500">
              {isRtl ? 'آخر الملاحظات' : 'Recent Notes'}
            </p>
            <div className="p-4 rounded-2xl bg-gray-50">
              <p className="text-xs text-emerald-600">2026-06-20</p>
              <p className="text-sm text-gray-900 mt-1">
                {isRtl ? 'تحسن ملحوظ في أداء تمارين القوة. استمرار في البرنامج الحالي.' : 'Notable improvement in strength training. Continue current program.'}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-gray-50">
              <p className="text-xs text-emerald-600">2026-06-18</p>
              <p className="text-sm text-gray-900 mt-1">
                {isRtl ? 'بحاجة لتحسين مرونة الكتف الأيمن. إضافة تمارين إطالة.' : 'Needs to improve right shoulder flexibility. Add stretching exercises.'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
