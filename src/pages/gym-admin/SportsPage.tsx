import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Pencil, FloppyDisk as Save, Trash as Trash2 } from '@phosphor-icons/react';
import Modal from '../../components/shared/Modal';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { fmtNum } from '../../utils/date';
import {
  listOffersManage, createSport, updateSport, deleteSport, type GymSport,
} from '../../services/api';
import StatusBadge from '../../components/ui/StatusBadge';
import PageLoader from '../../components/shared/PageLoader';
import { SPORT_ICONS, SPORT_COLORS, useSportsCatalog } from './subscriptions/shared';

// ====================================================================
// الرياضات (/admin/sports) — كتالوج الصالة الحي (أيقونة+لون+ترتيب+تفعيل).
// نهاية الـenum الثابت: الباقة الجديدة تُجبر على رياضة من هنا (لا بدون
// تصنيف جديدة)، والبانر العلوي call-to-action للباقات القديمة غير المصنفة.
// الحذف ممنوع مع الاستخدام (باقات/اشتراكات) — 409 بالأرقام.
// ====================================================================

const inputCls =
  'w-full min-h-[48px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/40';

function emptyDraft() {
  return { name: '', icon: 'fitness_center', color: '#0284c7', order: '' };
}

export default function SportsPage() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rtl = language === 'ar';

  const { sports, isLoading, active } = useSportsCatalog();
  const [draft, setDraft] = useState(emptyDraft());
  const [editing, setEditing] = useState<GymSport | null>(null);
  const [deleting, setDeleting] = useState<GymSport | null>(null);

  // الباقات غير المصنفة — رقم البانر (نفس مصدر تبويب الباقات)
  const { data: offersRes } = useApiQuery(
    ['membership-offers', 'manage'],
    async () => (await listOffersManage()).data,
    { staleTime: 30_000 },
  );
  const uncategorized = (offersRes ?? []).filter((o) => !o.sport).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sports'] });
    queryClient.invalidateQueries({ queryKey: ['membership-offers'] });
  };

  const isEdit = editing !== null;
  const cur = isEdit ? { name: editing.name_ar, icon: editing.icon, color: editing.color, order: String(editing.sort_order) } : draft;
  const setCur = (patch: Partial<{ name: string; icon: string; color: string; order: string }>) => {
    if (isEdit) setEditing({ ...editing, name_ar: patch.name ?? editing.name_ar, icon: patch.icon ?? editing.icon, color: patch.color ?? editing.color, sort_order: patch.order !== undefined ? Number(patch.order) || 0 : editing.sort_order });
    else setDraft({ ...draft, ...patch });
  };
  const formValid = cur.name.trim().length > 0;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name_ar: cur.name.trim(),
        icon: cur.icon,
        color: cur.color,
        ...(cur.order.trim() === '' ? {} : { sort_order: Number(cur.order) }),
      };
      return isEdit ? updateSport(editing.id, body) : createSport(body);
    },
    onSuccess: () => {
      invalidate();
      setDraft(emptyDraft()); setEditing(null);
      showToast(rtl ? 'تم حفظ الرياضة' : 'Sport saved', 'success');
    },
    onError: (e) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل الحفظ' : 'Save failed'), 'error');
    },
  });

  const toggle = useMutation({
    mutationFn: (s: GymSport) => updateSport(s.id, { is_active: !s.is_active }),
    onSuccess: () => { invalidate(); showToast(rtl ? 'تم تحديث الحالة' : 'Status updated', 'success'); },
    onError: () => showToast(rtl ? 'فشل التحديث' : 'Update failed', 'error'),
  });

  const remove = useMutation({
    mutationFn: (s: GymSport) => deleteSport(s.id),
    onSuccess: () => {
      invalidate(); setDeleting(null);
      showToast(rtl ? 'تم حذف الرياضة' : 'Sport deleted', 'success');
    },
    onError: (e) => {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const d = (e as { response?: { data?: { plans?: number; subs?: number } } })?.response?.data;
      if (status === 409) {
        showToast(
          rtl ? `لا يمكن الحذف — مستخدمة في ${fmtNum(Number(d?.plans ?? 0))} باقة و${fmtNum(Number(d?.subs ?? 0))} اشتراك.` : 'In use — cannot delete.',
          'error',
        );
      } else showToast(rtl ? 'فشل الحذف' : 'Delete failed', 'error');
    },
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="space-y-5">
        {/* الهيدر: يمين الرياضات + شمال رجوع للباقات */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-gray-900">
            <span className="material-symbols-outlined text-amber-500 align-middle ml-1">military_tech</span>
            {rtl ? 'الرياضات' : 'Sports'}
          </h1>
          <button
            type="button"
            onClick={() => navigate('/admin/plans')}
            className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm font-bold px-4 py-2.5 rounded-2xl shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <ArrowRight size={16} className={rtl ? '' : 'rotate-180'} />
            {rtl ? 'الباقات' : 'Plans'}
          </button>
        </div>

        {/* بانر الداتا الناقصة — call-to-action */}
        <div className="bg-sky-50 border border-sky-200 rounded-3xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-sky-600 text-2xl shrink-0">info</span>
          <p className="text-sm text-sky-900 leading-relaxed">
            {rtl
              ? `كل باقة بتتبع رياضة (من شاشة إضافة/تعديل الباقة). بعد كده من صفحة الاشتراكات تقدر تفلتر بالرياضة أو بالباقة. ${uncategorized > 0 ? `${fmtNum(uncategorized)} باقة لسه من غير رياضة — ` : 'كل الباقات مصنّفة — '}`
              : `Every plan follows a sport (from the add/edit plan screen). Then filter subscriptions by sport or plan. `}
            {uncategorized > 0 && (
              <button type="button" onClick={() => navigate('/admin/plans')} className="font-bold underline hover:text-sky-700">
                {rtl ? 'صنّفها من صفحة الباقات' : 'Classify them from the plans page'}
              </button>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* العمود اليمين — إضافة/تعديل رياضة */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 h-fit">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {isEdit ? (rtl ? 'تعديل رياضة' : 'Edit sport') : (rtl ? '+ إضافة رياضة' : '+ Add sport')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {rtl ? 'اسم الرياضة' : 'Sport name'} <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputCls}
                  value={cur.name}
                  onChange={(e) => setCur({ name: e.target.value })}
                  placeholder={rtl ? 'مثلاً: ملاكمة' : 'e.g. Boxing'}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{rtl ? 'الأيقونة' : 'Icon'}</label>
                <div className="grid grid-cols-6 gap-2">
                  {SPORT_ICONS.map((ic) => (
                    <button
                      key={ic.name}
                      type="button"
                      onClick={() => setCur({ icon: ic.name })}
                      title={ic.ar}
                      aria-pressed={cur.icon === ic.name}
                      className={`aspect-square rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                        cur.icon === ic.name
                          ? 'bg-orange-500 text-white shadow-md shadow-orange-500/30'
                          : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      <span className="material-symbols-outlined text-2xl">{ic.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{rtl ? 'اللون' : 'Color'}</label>
                <div className="flex flex-wrap gap-2">
                  {SPORT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCur({ color: c })}
                      aria-label={c}
                      className={`w-9 h-9 rounded-full transition-all active:scale-95 ${
                        cur.color === c ? 'ring-2 ring-offset-2 ring-gray-900' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{rtl ? 'الترتيب' : 'Order'}</label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  value={cur.order}
                  onChange={(e) => setCur({ order: e.target.value })}
                  placeholder={rtl ? 'تلقائي — للفرز اليدوي' : 'Auto — manual sort'}
                />
              </div>
              <div className="flex gap-2">
                {isEdit && (
                  <button
                    type="button"
                    onClick={() => { setEditing(null); setDraft(emptyDraft()); }}
                    className="min-h-[48px] px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold"
                  >
                    {rtl ? 'إلغاء' : 'Cancel'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => save.mutate()}
                  disabled={!formValid || save.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-6 py-3 rounded-2xl shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
                >
                  <Save size={17} />
                  {save.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : (rtl ? 'حفظ' : 'Save')}
                </button>
              </div>
            </div>
          </div>

          {/* العمود الشمال — جدول الرياضات */}
          <div className="xl:col-span-2 bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {rtl ? `الرياضات (${fmtNum(sports.length)})` : `Sports (${sports.length})`}
            </h2>
            {isLoading ? (
              <PageLoader variant="skeleton" rows={5} />
            ) : sports.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">{rtl ? 'لا رياضات — أضف الأولى من النموذج.' : 'No sports yet.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-900">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الرياضة' : 'Sport'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الباقات' : 'Plans'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'اشتراكات سارية' : 'Active subs'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'الحالة' : 'Status'}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-gray-500">{rtl ? 'إجراءات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sports.map((s) => (
                      <tr key={s.id} className={`border-t border-gray-100 transition-colors ${s.is_active ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-70'}`}>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 font-medium whitespace-nowrap">
                            <span
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
                              style={{ backgroundColor: s.color }}
                            >
                              <span className="material-symbols-outlined text-xl">{s.icon}</span>
                            </span>
                            {s.name_ar}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums">{fmtNum(Number(s.plan_count ?? 0))}</td>
                        <td className="px-4 py-3 tabular-nums">{fmtNum(Number(s.active_sub_count ?? 0))}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={s.is_active ? (rtl ? 'نشطة' : 'Active') : (rtl ? 'موقوفة' : 'Paused')} variant={s.is_active ? 'success' : 'neutral'} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditing(s)}
                              title={rtl ? 'تعديل' : 'Edit'}
                              className="w-10 min-h-[40px] inline-flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggle.mutate(s)}
                              disabled={toggle.isPending}
                              title={s.is_active ? (rtl ? 'إيقاف' : 'Pause') : (rtl ? 'تفعيل' : 'Activate')}
                              className="w-10 min-h-[40px] inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-xl">{s.is_active ? 'pause' : 'play_arrow'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(s)}
                              title={rtl ? 'حذف' : 'Delete'}
                              className="w-10 min-h-[40px] inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-400">
              {rtl ? `المعروض ${fmtNum(active.length)} نشطة من ${fmtNum(sports.length)} — الموقوفة تختفي من قوائم الاختيار.` : `${active.length} active of ${sports.length} — paused sports hide from pickers.`}
            </p>
          </div>
        </div>
      </div>

      {/* تأكيد الحذف */}
      {deleting && (
        <Modal
          open
          onClose={() => setDeleting(null)}
          size="md"
          dir={rtl ? 'rtl' : 'ltr'}
          disableDismiss={remove.isPending}
          title={rtl ? 'حذف الرياضة' : 'Delete sport'}
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
          <p className="text-sm text-gray-700">{rtl ? `حذف «${deleting.name_ar}»؟` : `Delete “${deleting.name_ar}”?`}</p>
          {(Number(deleting.plan_count ?? 0) > 0 || Number(deleting.active_sub_count ?? 0) > 0) && (
            <p className="mt-2 text-sm font-semibold text-red-600">
              {rtl ? `مستخدمة في ${fmtNum(Number(deleting.plan_count ?? 0))} باقة و${fmtNum(Number(deleting.active_sub_count ?? 0))} اشتراك — الحذف سيرفض. أوقفها بدل ذلك.` : 'In use — deletion will be refused. Pause instead.'}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
