import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getAbsentReport, getSettings, type AbsentMemberRow } from '../../services/api';
import { formatDate, fmtNum } from '../../utils/date';
import { StatCard, EmptyState } from '../../components/dashboard';
import DataTable, { type TableColumn } from '../../components/ui/DataTable';
import { SkeletonStats, SkeletonTable } from '../../components/shared/Skeleton';
import { Users, UserMinus as UserX, Clock } from '@phosphor-icons/react';
import MemberContactButtons from '../../components/members/MemberContact';

// ====================================================================
// الأعضاء الغائبون (/admin/reports/absent) — مربوط بزر «الأعضاء
// الغائبون» في شاشة التقارير. قائمة إنقاذ مرتبة بالأخطر أولًا.
// الغياب = أيام منذ آخر حضور (ومن الانضمام لمن لم يحضر قط) — وليس
// منذ انتهاء الاشتراك. المحظورون خارج القائمة. الشارة حمراء للمنقطع
// (بلا اشتراك سارٍ) وكهرمانية للغائب النشط (اشتراكه سارٍ).
// ====================================================================

const SORTABLE: Record<string, { labelAr: string; labelEn: string; def: 'asc' | 'desc' }> = {
  absence: { labelAr: 'أيام الغياب', labelEn: 'Absent days', def: 'desc' },
  member_name: { labelAr: 'الاسم', labelEn: 'Name', def: 'asc' },
};

const inputCls =
  'h-11 min-w-[120px] px-3 rounded-xl border border-gray-200 bg-white text-base text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none tabular-nums';

export default function AbsentMembers() {
  const { language, gymProfile } = useApp();
  const navigate = useNavigate();
  const rtl = language === 'ar';
  const gymName = gymProfile?.name;

  // عتبة الغياب الافتراضية من الإعدادات (نفس مفتاح تبويب الإشعارات)
  const { data: settingsRes } = useApiQuery(['settings'], getSettings, { staleTime: 5 * 60_000 });
  const settingsDefault = (() => {
    const v = parseInt(String(settingsRes?.data?.absent_after_days ?? ''), 10);
    return Number.isFinite(v) && v >= 1 ? Math.min(v, 365) : 15;
  })();
  const [draftDays, setDraftDays] = useState('15');
  const [daysMin, setDaysMin] = useState(15);
  const [daysInit, setDaysInit] = useState(false);
  useEffect(() => {
    if (!daysInit && settingsRes) {
      setDaysInit(true);
      setDraftDays(String(settingsDefault));
      setDaysMin(settingsDefault);
    }
  }, [settingsRes, daysInit, settingsDefault]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('absence');
  const [order, setOrder] = useState('desc');

  const { data, isLoading, isError } = useApiQuery(
    ['reports-absent', String(daysMin), String(page), String(limit), sort, order],
    () => getAbsentReport({ days_min: daysMin, page, limit, sort, order }),
    { staleTime: 30_000 },
  );
  const rows = data?.data ?? [];
  const stats = data?.stats;
  const pagination = data?.pagination;
  const pages = pagination ? pagination.total_pages : 0;

  // موجة 4 / دفعة ج — عمودان قابلان للفرز فقط، وهما حرفيًا whitelist السيرفر
  // (`analytics.ts:974-976` = ['absence','member_name']، الافتراضي absence).
  const columns: TableColumn<AbsentMemberRow>[] = [
    {
      id: '__n',
      label: rtl ? 'م' : '#',
      width: '2.5rem',
      cell: (_r, i) => (
        <span className="text-xs text-gray-400 tabular-nums">
          {((pagination?.page ?? 1) - 1) * ((pagination?.limit) ?? limit) + i + 1}
        </span>
      ),
    },
    {
      id: 'member_name',
      label: rtl ? 'الاسم' : 'Name',
      sortable: true,
      sortDescFirst: SORTABLE.member_name.def === 'desc',
      value: (r) => r.full_name,
      cell: (r) => <span className="font-semibold text-gray-900 whitespace-nowrap">{r.full_name}</span>,
    },
    {
      id: 'card_code',
      label: rtl ? 'الكود' : 'Code',
      value: (r) => r.card_code ?? '—',
      cell: (r) => <span dir="ltr" className={rtl ? 'text-right' : 'text-left'}>{r.card_code ?? '—'}</span>,
    },
    {
      id: 'phone_number',
      label: rtl ? 'الهاتف' : 'Phone',
      value: (r) => r.phone_number || '—',
      cell: (r) => <span dir="ltr" className={`text-gray-500 ${rtl ? 'text-right' : 'text-left'}`}>{r.phone_number || '—'}</span>,
    },
    { id: 'plan_name', label: rtl ? 'الباقة' : 'Plan', value: (r) => r.plan_name || '—' },
    { id: 'sub_end', label: rtl ? 'انتهاء الاشتراك' : 'Sub ends', value: (r) => (r.sub_end ? formatDate(r.sub_end) : '—') },
    { id: 'last_visit', label: rtl ? 'آخر زيارة' : 'Last visit', value: (r) => (r.last_visit ? formatDate(String(r.last_visit)) : '—') },
    {
      id: 'absence',
      label: rtl ? 'أيام الغياب' : 'Absent days',
      sortable: true,
      sortDescFirst: SORTABLE.absence.def === 'desc',
      value: (r) => r.days_absent,
      cell: (r) => (
        <span
          title={r.has_active ? (rtl ? 'غائب نشط — اشتراكه سارٍ' : 'Active absentee — subscription running') : (rtl ? 'منقطع — بلا اشتراك سارٍ' : 'Lapsed — no active subscription')}
          className={`inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full text-xs font-bold tabular-nums ${r.has_active ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}
        >
          {fmtNum(r.days_absent)} {rtl ? 'يوم' : 'd'}
        </span>
      ),
    },
    {
      id: 'contact',
      label: rtl ? 'التواصل' : 'Contact',
      cell: (r) => <MemberContactButtons phone={r.phone_number} rtl={rtl} message={winBack(r.full_name, r.days_absent)} />,
    },
  ];

  const winBack = (name: string, days: number) =>
    rtl
      ? `أهلاً ${name}، وحشتنا في ${gymName || ''}! غيابك طول ${days} يوم — تحب نجهزلك برنامج رجوع؟`
      : `Hi ${name}, we miss you at ${gymName || ''}! ${days} days away — want a comeback plan?`;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-5 bg-gray-50 min-h-screen -m-6 p-6">
      {/* 1) الهيدر: العنوان يمين (الشريط العلوي) + رجوع شمال */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button
          type="button"
          onClick={() => navigate('/admin/reports')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3.5 py-2 hover:bg-gray-50 transition min-h-[44px]"
        >
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
          {rtl ? 'رجوع' : 'Back'}
        </button>
      </div>

      {/* 2) كارت الفلتر */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 flex items-end gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          {rtl ? 'عرض الأعضاء الغائبين منذ أكثر من' : 'Absent more than'}
          <input
            type="number"
            min={0}
            max={3650}
            value={draftDays}
            onChange={(e) => setDraftDays(e.target.value)}
            className={`${inputCls} !min-w-[90px] w-24 text-center`}
            dir="ltr"
          />
          {rtl ? 'يوم' : 'days'}
        </label>
        <button
          type="button"
          onClick={() => { setDaysMin(Math.max(0, Number(draftDays) || 0)); setPage(1); }}
          className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition min-h-[44px] ms-auto"
        >
          {rtl ? 'بحث' : 'Search'}
        </button>
      </div>

      {isLoading ? (
        /* موجة 4 / دفعة ج — الفانطازة بنفس هندسة الشاشة النهائية: 3 كروت ← جدول
           بقشرة كاملة. `rowHeight={45}` مش مقيس حيًا على هذه البيانات: الصالة دي
           كل أعضاءها حضروا اليوم، فالسيرفر بيرجع صفر غائبين عند أي عتبة (حتى
           days_min=0 — `analytics.ts:1008` بيشترط days_absent > العتبة) والقايمة
           بتطرح المحظورين. الرقم من حساب المكوّن نفسه: خلية الاسم سطر واحد بـnowrap
           + حواشي px-4 py-3 = 45، وهو نفس رقم جدول سجل الحضور المقيس في §68. */
        <div className="flex flex-col gap-5">
          <SkeletonStats columns={3} gridClassName="grid-cols-1 sm:grid-cols-3 gap-4" />
          <SkeletonTable rows={6} cols={columns.length} rowHeight={45} />
        </div>
      ) : isError ? (
        <EmptyState title={rtl ? 'تعذّر تحميل التقرير' : 'Failed to load report'} />
      ) : (
        <>
          {/* 3) الكروت الثلاث */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard icon={Users} label={rtl ? 'غائب أسبوع أو أقل' : 'Absent ≤ 7 days'} value={fmtNum(stats?.week_or_less ?? 0)} accent="emerald" />
            <StatCard icon={Clock} label={rtl ? 'غائب 8–30 يوم' : 'Absent 8–30 days'} value={fmtNum(stats?.mid ?? 0)} accent="amber" />
            <StatCard icon={UserX} label={rtl ? 'غائب أكثر من شهر' : 'Absent 30+ days'} value={fmtNum(stats?.over_month ?? 0)} accent="rose" />
          </div>

          {/* 4) جدول الغائبين على صدفة `ui/DataTable` — القشرة نفسها والترقيم
              جوّه نفس القشرة في `footer`. */}
          <DataTable
            columns={columns}
            data={rows}
            minWidth="980px"
            caption={rtl ? 'الأعضاء الغائبون' : 'Absent members'}
            manualSorting
            sorting={[{ id: sort, desc: order === 'desc' }]}
            onSortingChange={(next) => {
              const picked = next[0];
              if (!picked) return;
              setSort(picked.id);
              setOrder(picked.desc ? 'desc' : 'asc');
              setPage(1);
            }}
            empty={<EmptyState title={rtl ? 'لا غائبين بهذا الفلتر' : 'Nobody matches this filter'} />}
            footer={
              rows.length > 0 && pagination ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 tabular-nums">
                      {rtl ? `الفلتر: غياب أكثر من ${daysMin} يوم` : `Filter: absent ${daysMin}+ days`} · {pagination.total} {rtl ? 'عضو' : 'members'}
                    </span>
                    <label className="flex items-center gap-1.5 text-sm text-gray-500">
                      {rtl ? 'عرض' : 'Show'}
                      <select
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm min-h-[40px]"
                        value={limit}
                        onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                      >
                        <option value={10}>10</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={300}>300</option>
                      </select>
                    </label>
                  </div>
                  {pages > 1 && (
                    <div className="flex items-center gap-2" dir={rtl ? 'rtl' : 'ltr'}>
                      {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                        const start = pages <= 5 ? 1 : Math.max(1, Math.min(page - 2, pages - 4));
                        const p = start + i;
                        if (p > pages) return null;
                        return (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            aria-label={rtl ? `الصفحة ${p}` : `Page ${p}`}
                            className={`w-9 h-9 rounded-xl text-sm font-medium transition min-w-[44px] touch-auto ${page === p ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
