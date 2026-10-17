import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash as Trash2, CalendarDots as CalendarDays, Ticket, Users, Clock, Barbell as Dumbbell, Gift } from '@phosphor-icons/react';
import { useApp } from '../../context/GymBrandContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney, currencySymbol } from '../../utils/currency';
import { fmtNum } from '../../utils/date';
import { useToast } from '../../context/ToastContext';
import {
  listOffersManage, updateOffer, deleteOffer, type MembershipOffer,
} from '../../services/api';
import { DashboardPage, PrimaryAction, SecondaryAction, StatCard, Panel, EmptyState } from '../../components/dashboard';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import Modal from '../../components/shared/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import { sportName, SPORTS, WEEK_DAYS, useSportsCatalog } from './subscriptions/shared';
import SportSelect from './subscriptions/SportSelect';

/** Extract the server's own error text so the UI never hides a real rejection. */
function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { error?: string; count?: number; details?: { field?: string; message: string }[] } } })?.response?.data;
  if (data?.details?.length) {
    const parts = data.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message));
    return `${data.error ?? 'Validation failed'} — ${parts.join(' · ')}`;
  }
  return data?.error || fallback;
}

/**
 * §33ب — الباقات والعروض: membership_offers is the single source of truth.
 * الكارت يعرض 4 سطور من نفس دفتر member_subscriptions: الأيام من الباقة،
 * والحصص «تلقائي» = عدد الأيام (الباقة اليومية المفتوحة حصة/يوم — اختصار
 * مقصود بدل إدخال الرقم مرتين)، والنشط/الإجمالي والإيراد محسوبان على
 * السيرفر. الرياضة تصنيف الاشتراكات (sport_mode الغالبة) لا عمود في الباقة —
 * باقة بلا اشتراكات مصنّفة = «بدون تصنيف».
 */

const inputCls =
  'w-full min-h-[48px] md:min-h-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40';

function OfferForm({ rtl, currency, offer, onClose }: {
  rtl: boolean; currency?: string | null; offer: MembershipOffer; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [title, setTitle] = useState(offer.title ?? '');
  const [days, setDays] = useState(String(offer.duration_days));
  const [price, setPrice] = useState(String(offer.price));
  const [sport, setSport] = useState(offer.sport ?? '');
  const [sessions, setSessions] = useState(offer.total_sessions != null ? String(offer.total_sessions) : '');
  const [freeze, setFreeze] = useState(String(offer.freeze_days_max ?? 0));
  const [weekly, setWeekly] = useState<string[]>(offer.weekly_days?.length ? offer.weekly_days : WEEK_DAYS.map((d) => d.code));
  const [description, setDescription] = useState(offer.description ?? '');
  const daysNum = Number(days);
  const daysOk = days.trim() !== '' && Number.isInteger(daysNum) && daysNum >= 1 && daysNum <= 3650;
  const sessionsNum = Number(sessions);
  const sessionsOk = sessions.trim() === '' || (Number.isInteger(sessionsNum) && sessionsNum >= 1);
  const freezeNum = Number(freeze);
  const freezeOk = freeze.trim() === '' || (Number.isInteger(freezeNum) && freezeNum >= 0);
  // الرياضة إجبارية حتى في التعديل — أي تعديل لباقة قديمة يصنّفها
  const valid = title.trim().length > 0 && sport !== '' && daysOk && sessionsOk && price !== '' && Number(price) >= 0 && freezeOk;

  const toggleDay = (code: string) =>
    setWeekly((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));

  const save = useMutation({
    mutationFn: () => updateOffer(offer.id, {
      title: title.trim(), duration_days: daysNum, price: Number(price),
      sport: sport || null,
      total_sessions: sessions.trim() === '' ? null : sessionsNum,
      freeze_days_max: freeze.trim() === '' ? 0 : freezeNum,
      weekly_days: weekly.length === WEEK_DAYS.length ? null : weekly,
      description: description.trim() || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
      showToast(rtl ? 'تم حفظ الباقة' : 'Plan saved', 'success');
      onClose();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل حفظ الباقة' : 'Failed to save plan'), 'error'),
  });

  return (
    <Modal
      open
      title={rtl ? 'تعديل الباقة' : 'Edit plan'}
      onClose={onClose}
      size="md"
      dir={rtl ? 'rtl' : 'ltr'}
      disableDismiss={save.isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={save.isPending}
            className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition disabled:opacity-50"
          >
            {rtl ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending}
            className="min-h-[48px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50"
          >
            {save.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : (rtl ? 'حفظ' : 'Save')}
          </button>
        </>
      }
    >
      {/* القشرة بتمّرر overflow-y-auto على اللوحة نفسها، فالحشو ما بيعملش سكرول خاص بيه */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'اسم الباقة' : 'Plan name'}</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={rtl ? 'مثال: شهر واحد' : 'e.g. Monthly'} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'الرياضة' : 'Sport'} <span className="text-red-500">*</span></label>
          <SportSelect value={sport} onChange={setSport} rtl={rtl} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'المدة (أيام)' : 'Duration (days)'}</label>
            <input className={inputCls} type="number" min={1} max={3650} step={1} value={days} onChange={(e) => setDays(e.target.value)} />
            {!daysOk && days.trim() !== '' && (
              <p className="mt-1 text-xs text-red-500">{rtl ? 'رقم صحيح أكبر من صفر' : 'Whole number above zero'}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'الحصص' : 'Sessions'}</label>
            <input
              className={inputCls}
              type="number"
              min={1}
              step={1}
              value={sessions}
              onChange={(e) => setSessions(e.target.value)}
              placeholder={rtl ? `تلقائي ${daysOk ? daysNum : ''}` : 'auto'}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'السعر' : 'Price'} ({currencySymbol(currency)})</label>
            <input className={inputCls} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-2">{rtl ? 'الحصص الفارغة = تلقائي (نفس عدد الأيام، حصة/يوم)' : 'Empty sessions = auto (same as days, 1/day)'}</p>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'أيام التجميد المسموحة' : 'Freeze days allowed'}</label>
          <input className={inputCls} type="number" min={0} step={1} value={freeze} onChange={(e) => setFreeze(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'أيام الحضور' : 'Attendance days'}</label>
          <div className="flex flex-wrap gap-1.5">
            {WEEK_DAYS.map((d) => {
              const on = weekly.includes(d.code);
              return (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => toggleDay(d.code)}
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-bold transition-all ${
                    on ? 'bg-sky-500 text-white' : 'bg-white border border-gray-200 text-gray-500'
                  }`}
                >
                  {d.ar}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-gray-400">{rtl ? 'الكل مختار = كل الأيام' : 'All selected = every day'}</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'الوصف' : 'Description'}</label>
          <textarea className={`${inputCls} resize-none`} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

export default function SubscriptionManagement() {
  const { language, gymProfile } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';
  const currency = gymProfile?.currency;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MembershipOffer | undefined>(undefined); // undefined = closed
  const [deleting, setDeleting] = useState<MembershipOffer | null>(null);
  const [sportTab, setSportTab] = useState('all');

  const { data, isLoading } = useApiQuery(
    ['membership-offers', 'manage'],
    async () => (await listOffersManage()).data,
    { staleTime: 30_000 }
  );
  const offers = useMemo(() => data ?? [], [data]);

  // ── كروت الهيدر الأربعة: كلها من نفس الصفوف ──
  const totalPlans = offers.length;
  const activePlans = offers.filter((o) => o.is_active).length;
  const activeSubs = offers.reduce((s, o) => s + Number(o.active_count ?? 0), 0);
  const totalRevenue = offers.reduce((s, o) => s + Number(o.revenue ?? 0), 0);

  // ── تبويبات الفلتر: تصنيف الباقة نفسها أولًا، ثم الغالبة من اشتراكاتها ──
  const { sports: catalog } = useSportsCatalog();
  const sportOf = (o: MembershipOffer) => o.sport || o.sport_mode || null;
  const sportTabs = useMemo(() => {
    const bySport = new Map<string, number>();
    let none = 0;
    for (const o of offers) {
      const s = sportOf(o);
      if (s) bySport.set(s, (bySport.get(s) ?? 0) + 1);
      else none += 1;
    }
    const tabs = [{ key: 'all', labelAr: 'كل الرياضات', labelEn: 'All sports', icon: 'sports', count: offers.length }];
    const ordered = catalog.length > 0 ? catalog : SPORTS.map((s) => ({ code: s.code }));
    for (const s of ordered) {
      const c = bySport.get(s.code) ?? 0;
      if (c > 0) {
        const cat = catalog.find((x) => x.code === s.code);
        tabs.push({
          key: s.code,
          labelAr: cat?.name_ar ?? SPORTS.find((x) => x.code === s.code)?.ar ?? s.code,
          labelEn: s.code,
          icon: 'sports',
          count: c,
        });
      }
    }
    for (const [code, c] of bySport) {
      if (!ordered.some((s) => s.code === code)) tabs.push({ key: code, labelAr: code, labelEn: code, icon: 'sports', count: c });
    }
    tabs.push({ key: 'none', labelAr: 'بدون تصنيف', labelEn: 'Uncategorized', icon: 'help', count: none });
    return tabs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, catalog]);

  const visible = offers.filter((o) => {
    if (sportTab === 'all') return true;
    if (sportTab === 'none') return !sportOf(o);
    return sportOf(o) === sportTab;
  });

  const toggle = useMutation({
    mutationFn: (o: MembershipOffer) => updateOffer(o.id, { is_active: !o.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
      showToast(rtl ? 'تم تحديث الحالة' : 'Status updated', 'success');
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل التحديث' : 'Update failed'), 'error'),
  });

  const remove = useMutation({
    mutationFn: (o: MembershipOffer) => deleteOffer(o.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
      setDeleting(null);
      showToast(rtl ? 'تم حذف الباقة' : 'Plan deleted', 'success');
    },
    onError: (e, o) => {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        const n = Number(o.subscription_count ?? 0);
        showToast(
          rtl ? `لا يمكن حذف «${o.title}» — عليها ${fmtNum(n)} اشتراك. عطّلها بدل الحذف.` : `Cannot delete — ${n} subscriptions linked. Deactivate instead.`,
          'error',
        );
      } else {
        showToast(apiError(e, rtl ? 'فشل الحذف' : 'Delete failed'), 'error');
      }
    },
  });

  // أقصر مسار بيع: باقة → عضو → دفع — رياضة الباقة وأيامها منقولان
  // تلقائيًا كقيم ابتدائية قابلة للتعديل في نموذج الاشتراك
  const subscribe = (o: MembershipOffer) => {
    const p = new URLSearchParams({ new: '1', offer: o.id });
    if (sportOf(o)) p.set('sport', sportOf(o)!);
    const w = o.weekly_days?.length ? o.weekly_days : null;
    if (w) p.set('weekly', w.join(','));
    navigate(`/admin/subscriptions?${p.toString()}`);
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <DashboardPage
        actions={
          <>
            <SecondaryAction onClick={() => navigate('/admin/sports')}>
              <Dumbbell size={16} />
              {rtl ? 'الرياضات' : 'Sports'}
            </SecondaryAction>
            <PrimaryAction onClick={() => navigate('/admin/plans/add')}>
              <Plus size={16} />
              {rtl ? 'إضافة باقة' : 'New plan'}
            </PrimaryAction>
          </>
        }
      >
        {/* ── الكروت الأربعة ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={Gift} label={rtl ? 'إجمالي الباقات' : 'Total plans'} value={fmtNum(totalPlans)} accent="violet" />
          <StatCard icon={Dumbbell} label={rtl ? 'باقات نشطة' : 'Active plans'} value={fmtNum(activePlans)} accent="emerald" />
          <StatCard icon={Users} label={rtl ? 'اشتراكات نشطة' : 'Active subscriptions'} value={fmtNum(activeSubs)} accent="sky" onClick={() => navigate('/admin/subscriptions?status=active')} />
          <StatCard icon={Ticket} label={rtl ? 'إجمالي الإيرادات' : 'Total revenue'} value={formatMoney(totalRevenue, currency)} accent="amber" onClick={() => navigate('/admin/reports/financial')} />
        </div>

        {/* ── فلتر الرياضات ── */}
        <UnifiedTabs
          tabs={sportTabs}
          activeKey={sportTab}
          onChange={setSportTab}
        />

        <Panel>
          {isLoading ? (
            <p className="text-center py-12 text-gray-400">{rtl ? 'جاري التحميل...' : 'Loading…'}</p>
          ) : offers.length === 0 ? (
            <EmptyState
              title={rtl ? 'لا توجد باقات بعد' : 'No plans yet'}
              description={rtl ? 'أضف أول باقة لتبدأ تسجيل المشتركين.' : 'Create your first plan to start enrolling members.'}
              actions={<PrimaryAction onClick={() => navigate('/admin/plans/add')}>{rtl ? 'إضافة باقة' : 'New plan'}</PrimaryAction>}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title={rtl ? 'لا باقات بهذا التصنيف' : 'No plans in this category'}
              description={rtl ? 'صنّف اشتراكات الباقة برياضة لتظهر هنا.' : 'Assign a sport to the plan subscriptions to list them here.'}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {visible.map((o) => {
                const days = Number(o.duration_days ?? 0);
                const active = Number(o.active_count ?? 0);
                const total = Number(o.subscription_count ?? 0);
                const planSport = o.sport || o.sport_mode || null;
                const sportCat = catalog.find((x) => x.code === planSport);
                const autoSessions = o.total_sessions == null;
                const sessionsVal = autoSessions ? days : Number(o.total_sessions);
                return (
                  <div
                    key={o.id}
                    className={`rounded-3xl border p-5 shadow-sm ${o.is_active ? 'border-gray-100 bg-white' : 'border-gray-200 bg-gray-50'}`}
                  >
                    {/* الاسم + شارة الرياضة */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-bold text-gray-900 leading-snug">{o.title}</h3>
                      {planSport ? (
                        sportCat ? (
                          <span
                            className="inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                            style={{ backgroundColor: `${sportCat.color}1A`, color: sportCat.color }}
                          >
                            <span className="material-symbols-outlined text-sm">{sportCat.icon}</span>
                            {sportCat.name_ar}
                          </span>
                        ) : (
                          <span className="inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold bg-sky-50 text-sky-700">
                            {sportName(planSport, catalog, rtl)}
                          </span>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditing(o)}
                          title={rtl ? 'حدد رياضة الباقة من التعديل' : 'Set the plan sport from edit'}
                          className="inline-block shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold border border-dashed border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        >
                          {rtl ? '+ حدد الرياضة' : '+ Set sport'}
                        </button>
                      )}
                    </div>
                    {o.description && (
                      <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">{o.description}</p>
                    )}

                    {/* السعر ضخم برتقالي + العملة تحته */}
                    <p className="text-3xl font-extrabold text-orange-500 tabular-nums mt-2">{fmtNum(Number(o.price ?? 0))}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{currencySymbol(currency)}</p>

                    {/* 4 سطور */}
                    <ul className="mt-3 space-y-1.5 text-sm">
                      <li className="flex items-center gap-2 text-gray-700">
                        <CalendarDays size={16} className="text-gray-400 shrink-0" />
                        <span>{fmtNum(days)} {rtl ? 'يوم' : 'days'}</span>
                      </li>
                      <li className="flex items-center gap-2 text-gray-700">
                        <Ticket size={16} className="text-gray-400 shrink-0" />
                        <span>{fmtNum(sessionsVal)} {rtl ? 'حصة' : 'sessions'}</span>
                        {autoSessions && (
                          <span
                            title={rtl ? 'الباقة يومية مفتوحة: حصة لكل يوم — لا تُدخَل مرتين' : 'Open daily plan: one session per day'}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500"
                          >
                            {rtl ? '(تلقائي)' : '(auto)'}
                          </span>
                        )}
                      </li>
                      <li className="flex items-center gap-2 font-semibold text-emerald-600">
                        <Users size={16} className="shrink-0" />
                        <span>{fmtNum(active)} {rtl ? 'اشتراك نشط' : 'active'}</span>
                      </li>
                      <li className="flex items-center gap-2 font-semibold text-sky-600">
                        <Clock size={16} className="shrink-0" />
                        <span>{fmtNum(total)} {rtl ? 'إجمالي الاشتراكات' : 'total'}</span>
                      </li>
                    </ul>

                    {/* الحالة (الضغط يبدّل) */}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => toggle.mutate(o)}
                        disabled={toggle.isPending}
                        title={rtl ? 'اضغط للتبديل' : 'Click to toggle'}
                        className="disabled:opacity-50"
                      >
                        <StatusBadge
                          status={o.is_active ? (rtl ? 'نشطة' : 'Active') : (rtl ? 'غير نشطة' : 'Inactive')}
                          variant={o.is_active ? 'success' : 'neutral'}
                        />
                      </button>
                    </div>

                    {/* 3 أزرار */}
                    <div className="flex items-center gap-2 mt-4">
                      <button
                        onClick={() => setEditing(o)}
                        className="flex-1 min-h-[44px] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-100 inline-flex items-center justify-center gap-1.5"
                      >
                        <Pencil size={14} />
                        {rtl ? 'تعديل' : 'Edit'}
                      </button>
                      <button
                        onClick={() => subscribe(o)}
                        disabled={!o.is_active}
                        title={!o.is_active ? (rtl ? 'فعّل الباقة أولًا — الاشتراك الجديد يقبل النشطة فقط' : 'Activate first — new subscriptions need an active plan') : (rtl ? 'بيع مباشر: باقة → عضو → دفع' : 'Direct sell: plan → member → payment')}
                        className="flex-1 min-h-[44px] rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
                      >
                        <Plus size={14} />
                        {rtl ? 'اشتراك' : 'Subscribe'}
                      </button>
                      <button
                        onClick={() => setDeleting(o)}
                        title={rtl ? 'حذف الباقة' : 'Delete plan'}
                        aria-label={rtl ? 'حذف الباقة' : 'Delete plan'}
                        className="w-11 min-h-[44px] inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </DashboardPage>

      {editing !== undefined && (
        <OfferForm rtl={rtl} currency={currency} offer={editing} onClose={() => setEditing(undefined)} />
      )}

      {deleting && (
        <Modal
          open
          title={rtl ? 'حذف الباقة' : 'Delete plan'}
          onClose={() => setDeleting(null)}
          size="md"
          dir={rtl ? 'rtl' : 'ltr'}
          disableDismiss={remove.isPending}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={remove.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold transition disabled:opacity-50"
              >
                {rtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(deleting)}
                disabled={remove.isPending}
                className="min-h-[48px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition disabled:opacity-50"
              >
                {remove.isPending ? (rtl ? 'جارٍ الحذف…' : 'Deleting…') : (rtl ? 'تأكيد الحذف' : 'Confirm delete')}
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-700">
            {rtl ? `حذف «${deleting.title}» نهائيًا؟` : `Permanently delete “${deleting.title}”?`}
          </p>
          {Number(deleting.subscription_count ?? 0) > 0 && (
            <p className="mt-2 text-sm font-semibold text-red-600">
              {rtl
                ? `عليها ${fmtNum(Number(deleting.subscription_count))} اشتراك — الحذف سيرفض. عطّلها بدل ذلك.`
                : `${deleting.subscription_count} subscriptions linked — deletion will be refused. Deactivate instead.`}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
