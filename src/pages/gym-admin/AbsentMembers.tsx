import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getAbsentReport, getSettings } from '../../services/api';
import { formatDate, fmtNum } from '../../utils/date';
import { StatCard, EmptyState } from '../../components/dashboard';
import Spinner from '../../components/ui/Spinner';
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

  const toggleSort = (key: string) => {
    if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setOrder(SORTABLE[key].def); }
    setPage(1);
  };
  const sortTh = (key: string) => {
    const cfg = SORTABLE[key];
    const active = sort === key;
    return (
      <th key={key} className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          title={rtl ? 'اضغط للترتيب' : 'Click to sort'}
          className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? 'text-emerald-700' : ''}`}
        >
          {rtl ? cfg.labelAr : cfg.labelEn}
          <span className="material-symbols-outlined text-base">
            {active ? (order === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
          </span>
        </button>
      </th>
    );
  };

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
        <div className="py-16 flex justify-center"><Spinner /></div>
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

          {/* 4) جدول الغائبين بإعدادات جدول المشتركين */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-start">
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 w-10">#</th>
                    {sortTh('member_name')}
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الكود' : 'Code'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الهاتف' : 'Phone'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'الباقة' : 'Plan'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'انتهاء الاشتراك' : 'Sub ends'}</th>
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'آخر زيارة' : 'Last visit'}</th>
                    {sortTh('absence')}
                    <th className="py-3 px-3 font-semibold text-start text-xs text-gray-500 whitespace-nowrap">{rtl ? 'التواصل' : 'Contact'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={10} className="p-10 text-center text-gray-400 text-sm">
                      {rtl ? 'لا غائبين بهذا الفلتر' : 'Nobody matches this filter'}
                    </td></tr>
                  )}
                  {rows.map((r, idx) => (
                    <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3 text-start text-gray-400 tabular-nums text-xs">
                        {((pagination?.page ?? 1) - 1) * ((pagination?.limit) ?? limit) + idx + 1}
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-900 text-start whitespace-nowrap">{r.full_name}</td>
                      <td className={`py-3 px-3 tabular-nums whitespace-nowrap font-semibold ${rtl ? 'text-right' : 'text-left'}`} dir="ltr">{r.card_code ?? '—'}</td>
                      <td className={`py-3 px-3 text-gray-500 whitespace-nowrap ${rtl ? 'text-right' : 'text-left'}`} dir="ltr">{r.phone_number || '—'}</td>
                      <td className="py-3 px-3 text-gray-600 text-start whitespace-nowrap">{r.plan_name || '—'}</td>
                      <td className="py-3 px-3 text-gray-500 text-start tabular-nums whitespace-nowrap">{r.sub_end ? formatDate(r.sub_end) : '—'}</td>
                      <td className="py-3 px-3 text-gray-500 text-start tabular-nums whitespace-nowrap">{r.last_visit ? formatDate(String(r.last_visit)) : '—'}</td>
                      <td className="py-3 px-3 text-start">
                        <span
                          title={r.has_active ? (rtl ? 'غائب نشط — اشتراكه سارٍ' : 'Active absentee — subscription running') : (rtl ? 'منقطع — بلا اشتراك سارٍ' : 'Lapsed — no active subscription')}
                          className={`inline-flex items-center justify-center min-w-8 h-7 px-2 rounded-full text-xs font-bold tabular-nums ${r.has_active ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}
                        >
                          {fmtNum(r.days_absent)} {rtl ? 'يوم' : 'd'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-start">
                        <MemberContactButtons
                          phone={r.phone_number}
                          rtl={rtl}
                          message={winBack(r.full_name, r.days_absent)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 0 && pagination && (
              <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-100 flex-wrap">
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
                          className={`w-9 h-9 rounded-xl text-sm font-medium transition min-w-[44px] ${page === p ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
