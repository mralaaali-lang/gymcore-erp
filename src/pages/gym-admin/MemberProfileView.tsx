import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { getMember, getCustomer360, updateMember, resetMemberPin, uploadMemberPhoto, type Customer360Data } from '../../services/api';
import PageLoader from '../../components/shared/PageLoader';
import UnifiedTabs from '../../components/shared/UnifiedTabs';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatMoney } from '../../utils/currency';
// §35ج — real printed membership card: 6-digit per-gym card_code (migration 063)
// encoded in a QR that the unified check-in field understands.
import { printMemberCard, latestActiveEnd } from '../../utils/memberCard';

// §34ج — messaging/documents/ranks tabs removed: no screens exist behind them
// and they only rendered a "Coming soon" card. The tab bar now shows truth.
const PROFILE_TABS = ['profile', 'attendance'] as const;
type ProfileTab = typeof PROFILE_TABS[number];

const TAB_ICONS: Record<ProfileTab, string> = {
  profile: 'person',
  attendance: 'fact_check',
};

/** رقم صالح لـ wa.me: أرقام فقط، والمحلي المصري 01xxxxxxxxx يُكتب 201xxxxxxxxx. */
function toWhatsApp(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (/^01\d{9}$/.test(d)) return '2' + d;
  if (d.startsWith('00201')) return d.slice(2);
  return d;
}

export default function MemberProfileView() {
  const { language, gymProfile, role } = useApp();
  // §30: money() — gym currency symbol everywhere on this page
  const money = (v: number | string | null | undefined) =>
    v == null || v === '' ? '—' : formatMoney(Number(v), gymProfile?.currency);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const rtl = language === 'ar';

  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [showSuccess, setShowSuccess] = useState(false);

  // §34ج — real edit: PUT /api/members/:id (the EDIT button used to fire a
  // fake "coming soon" toast). Centered modal per project convention.
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', phone_number: '', email: '', birth_date: '', medical_notes: '', photo_url: '', gender: '' });
  const [editSaving, setEditSaving] = useState(false);
  // رمز الدخول الجديد يُعرض مرة واحدة فقط (لا يُسترجع بعدها).
  const [freshPin, setFreshPin] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  // نافذة الاتصال: تعرض الرقم المسجل بخط كبير (مريحة للموبايل).
  const [callOpen, setCallOpen] = useState(false);
  // صورة العضو: تُعرض عند وجودها وتسقط للأحرف الأولى لو الرابط مكسور.
  const [imgOk, setImgOk] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setImgOk(true); setFreshPin(null); }, [id]);

  // الضغط على الصورة/الأحرف يفتح اختيار صورة → رفع → حفظ في الملف.
  const changePhoto = async (file: File | undefined) => {
    if (!file || !id) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast(rtl ? 'الصورة أكبر من 2 ميجا' : 'Image larger than 2MB', 'error');
      return;
    }
    setPhotoBusy(true);
    try {
      const up = await uploadMemberPhoto(file);
      await updateMember(id, { photo_url: up.data.url });
      setImgOk(true);
      queryClient.invalidateQueries({ queryKey: ['member', id] });
      showToast(rtl ? 'تم تحديث الصورة' : 'Photo updated', 'success');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      showToast(msg || (rtl ? 'فشل رفع الصورة' : 'Photo upload failed'), 'error');
    } finally {
      setPhotoBusy(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  };

  useEffect(() => {
    if (sessionStorage.getItem('member_just_added') === 'true') {
      setShowSuccess(true);
      sessionStorage.removeItem('member_just_added');
      const timer = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [id]);

  const { data: memberData, isLoading: memberLoading, isError: memberError } = useApiQuery<Record<string, unknown>>(
    ['member', id || ''],
    () => getMember(id || '').then((r: any) => r.data || r),
    { staleTime: 60_000, retry: false, enabled: !!id }
  );

  const { data: c360Data } = useApiQuery<Customer360Data | null>(
    ['customer360', id || ''],
    () => getCustomer360(id || '').then((r: any) => r.data as Customer360Data),
    { staleTime: 60_000, retry: false, enabled: !!id }
  );

  useEffect(() => {
    if (memberError) {
      showToast(rtl ? 'عضو غير موجود' : 'Member not found', 'error');
      navigate('/members');
    }
  }, [memberError, rtl, navigate, showToast]);

  if (memberLoading) {
    return (
      <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
        <PageLoader />
      </div>
    );
  }

  if (!memberData) return null;

  const m = memberData as Record<string, string>;
  const fullName = m.full_name || '';
  const initials = fullName ? fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : '??';
  const pinCode = m.pin_code || m.generated_pin || '----';
  const cardCode = m.card_code || '';
  const joinDate = m.join_date || m.created_at?.split('T')[0] || '-';
  const phone = m.phone_number || '';
  const hasPhone = phone.trim().length >= 7;
  const gender = m.gender === 'male' ? (rtl ? 'ذكر' : 'Male') : m.gender === 'female' ? (rtl ? 'أنثى' : 'Female') : '-';
  // §34ج — pg returns date columns as full ISO timestamps; UI standard is YYYY-MM-DD.
  const birthDate = m.birth_date ? String(m.birth_date).split('T')[0] : '-';
  const balance = m.balance || '0.00';

  const tabs: Record<ProfileTab, string> = {
    profile: rtl ? 'الملف الشخصي' : 'Profile',
    attendance: rtl ? 'الحضور' : 'Attendance',
  };

  const openEdit = () => {
    setEditForm({
      full_name: m.full_name || '',
      phone_number: m.phone_number || '',
      email: (m.email as string) || '',
      birth_date: (m.birth_date as string)?.split('T')[0] || '',
      medical_notes: (m.medical_notes as string) || '',
      photo_url: (m.photo_url as string) || '',
      gender: (m.gender as string) || '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (editForm.full_name.trim().length < 2) {
      showToast(rtl ? 'الاسم مطلوب (حرفان على الأقل)' : 'Name is required (min 2 chars)', 'error');
      return;
    }
    setEditSaving(true);
    try {
      await updateMember(id!, {
        full_name: editForm.full_name.trim(),
        phone_number: editForm.phone_number.trim(),
        email: editForm.email.trim(),
        birth_date: editForm.birth_date || undefined,
        medical_notes: editForm.medical_notes,
        photo_url: editForm.photo_url,
        gender: editForm.gender || null,
      });
      queryClient.invalidateQueries({ queryKey: ['member', id] });
      queryClient.invalidateQueries({ queryKey: ['customer360', id] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setEditOpen(false);
      showToast(rtl ? 'تم تحديث بيانات العضو' : 'Member updated', 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.error || (rtl ? 'فشل التحديث' : 'Update failed'), 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const stats = c360Data?.stats;
  const attendance = c360Data?.attendance || [];
  const payments = c360Data?.payments || [];

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-6 bg-gray-50 min-h-screen -m-6 p-6">
      {/* Success banner */}
      {showSuccess && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-sm font-medium">
          <span className="material-symbols-outlined text-lg text-emerald-600">check_circle</span>
          {rtl ? 'تمت إضافة المشترك بنجاح!' : 'Member added successfully!'}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar */}
        <aside className="lg:w-72 shrink-0">
          <Card className="sticky top-4 space-y-5">
            {/* Avatar — الضغط عليها يغيّر الصورة (رفع فوري وحفظ في الملف) */}
            <div className="text-center">
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => changePhoto(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                disabled={photoBusy}
                title={rtl ? 'اضغط لتغيير الصورة' : 'Click to change photo'}
                className="relative block mx-auto mb-3 group disabled:opacity-60"
              >
                {m.photo_url && imgOk ? (
                  <img
                    src={String(m.photo_url)}
                    alt={fullName}
                    onError={() => setImgOk(false)}
                    className="w-20 h-20 rounded-3xl object-cover shadow-sm"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-3xl bg-emerald-500 text-white flex items-center justify-center text-2xl font-bold shadow-sm shadow-emerald-500/25">
                    {photoBusy ? '…' : initials}
                  </div>
                )}
                <span className="absolute inset-0 rounded-3xl bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-2xl opacity-0 group-hover:opacity-100 transition">photo_camera</span>
                </span>
              </button>
              <h2 className="text-lg font-bold text-gray-900 leading-tight">{fullName}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {rtl ? 'مشترك منذ' : 'Member since'} {joinDate}
              </p>
              <Button
                variant="outline"
                className="mt-3 px-4 py-1.5 text-xs"
                onClick={openEdit}
              >
                {rtl ? 'تعديل' : 'EDIT'}
              </Button>
            </div>

            {/* Check-in Code */}
            <div className="text-center py-3 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">{rtl ? 'رمز الدخول' : 'CHECK-IN CODE'}</p>
              <p className="text-4xl font-mono font-bold tracking-[0.3em] text-emerald-600">
                {freshPin ?? pinCode}
              </p>
              {freshPin ? (
                <p className="text-[11px] text-amber-700 mt-1 px-2">
                  {rtl ? 'جديد — أبلغه للعضو الآن، لن يظهر مجددًا' : 'New — relay it to the member now, it will not show again'}
                </p>
              ) : (
                role === 'gym-admin' && (
                  <button
                    type="button"
                    disabled={pinBusy}
                    onClick={async () => {
                      setPinBusy(true);
                      try {
                        const res = await resetMemberPin(id!);
                        setFreshPin(res.data.pin);
                        showToast(rtl ? 'تم توليد رمز جديد — أبلغه للعضو فورًا' : 'New PIN generated — relay it now', 'success');
                      } catch (e: unknown) {
                        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
                        showToast(msg || (rtl ? 'فشل توليد الرمز' : 'PIN generation failed'), 'error');
                      } finally {
                        setPinBusy(false);
                      }
                    }}
                    className="mt-1.5 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50 min-h-[32px]"
                  >
                    {pinBusy ? (rtl ? 'جارٍ…' : '…') : (rtl ? 'توليد رمز جديد' : 'Generate new PIN')}
                  </button>
                )
              )}
            </div>

            {/* §35ج — كود العضوية الحقيقي: رقم تسلسلي لكل صالة + طباعة بطاقة بـQR */}
            {cardCode ? (
              <div className="text-center py-3 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-xs text-gray-500 mb-1">{rtl ? 'كود العضوية' : 'MEMBERSHIP CODE'}</p>
                <p dir="ltr" className="text-2xl font-mono font-bold tracking-[0.25em] text-gray-900">{cardCode}</p>
                <button
                  type="button"
                  onClick={() => {
                    const ok = printMemberCard({
                      gymName: gymProfile?.name,
                      fullName,
                      cardCode,
                      validUntil: latestActiveEnd(memberData.subscriptions),
                    });
                    if (!ok) showToast(rtl ? 'المتصفح منع نافذة الطباعة' : 'Print popup blocked', 'error');
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 min-h-[40px]"
                >
                  <span className="material-symbols-outlined text-base">print</span>
                  {rtl ? 'طباعة البطاقة' : 'Print card'}
                </button>
              </div>
            ) : (
              <p className="text-center text-xs text-gray-400">{rtl ? 'لم يُصدر كود بطاقة لهذا العضو بعد' : 'No card code issued for this member yet'}</p>
            )}

            {/* Quick Actions — اتصال (نافذة بالرقم كبير) وواتساب على نفس الرقم */}
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setCallOpen(true)}
                className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition"
                title={rtl ? 'اتصال' : 'Call'}
              >
                <span className="material-symbols-outlined text-xl">call</span>
              </button>
              <button
                onClick={() => {
                  if (!hasPhone) {
                    showToast(rtl ? 'لا يوجد رقم مسجل لهذا العضو' : 'No phone number saved for this member', 'error');
                    return;
                  }
                  window.open(`https://wa.me/${toWhatsApp(phone)}`, '_blank');
                }}
                className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition"
                title={rtl ? 'واتساب' : 'WhatsApp'}
              >
                <span className="material-symbols-outlined text-xl">chat</span>
              </button>
              {/* §34ج — fake «بطاقة» toast button removed; §35ج shipped the real
                  printed card above (كود العضوية + طباعة البطاقة). */}
            </div>

            {/* Tags */}
            {m.tags && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">{rtl ? 'الوسوم' : 'TAGS'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(m.tags) ? m.tags : [m.tags]).map((tag: string, i: number) => (
                    <span key={i} className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full font-medium">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Personal Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{rtl ? 'البيانات الشخصية' : 'Personal Details'}</h4>
              <div className="space-y-2">
                {[
                  { label: rtl ? 'تاريخ الميلاد' : 'Birthday', value: birthDate },
                  { label: rtl ? 'الجنس' : 'Gender', value: gender },
                  { label: rtl ? 'رقم الهاتف' : 'Phone Number', value: phone || '—' },
                  { label: rtl ? 'الرصيد' : 'Balance', value: balance },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <span className="text-xs text-gray-500">{item.label}</span>
                    <span className="text-sm text-gray-900 font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </Card>
        </aside>

        {/* Right Main Panel */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Sub-tabs */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-4 pt-2 overflow-x-auto">
            <UnifiedTabs
              variant="underline"
              tabs={PROFILE_TABS.map((tab) => ({
                key: tab,
                labelAr: tabs[tab],
                labelEn: tabs[tab],
                icon: TAB_ICONS[tab],
              }))}
              activeKey={activeTab}
              onChange={(key) => setActiveTab(key as ProfileTab)}
            />
          </div>

          {/* Profile Tab Content */}
          {activeTab === 'profile' && (
            <div className="space-y-5">
              {/* Attendance Graph */}
              <Card>
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">bar_chart</span>
                  </span>
                  {rtl ? 'إحصائيات الحضور' : 'Attendance Overview'}
                </h3>
                {stats ? (
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: rtl ? 'إجمالي الحضور' : 'Total Check-ins', value: stats.total_checkins },
                      { label: rtl ? 'آخر 30 يوم' : 'Last 30 Days', value: stats.checkins_30d },
                      { label: rtl ? 'آخر 7 أيام' : 'Last 7 Days', value: stats.checkins_7d },
                    ].map((s) => (
                      <div key={s.label} className="text-center p-3 bg-gray-50 rounded-2xl border border-gray-100">
                        <p className="text-2xl font-bold text-emerald-600">{s.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-24 text-gray-300">
                    <span className="material-symbols-outlined text-4xl">bar_chart</span>
                  </div>
                )}
              </Card>

              {/* Notes — real content: members.medical_notes (the ADD NOTE
                  button was dead; there is no notes table, so the card now
                  shows the one note field that actually exists). */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">sticky_note_2</span>
                  </span>
                  <h3 className="text-base font-bold text-gray-900">
                    {rtl ? 'الملاحظات الطبية' : 'Medical Notes'}
                  </h3>
                  <button
                    type="button"
                    onClick={openEdit}
                    className="ms-auto text-xs font-bold text-emerald-700 hover:underline min-h-[36px] px-2"
                  >
                    {m.medical_notes ? (rtl ? 'تعديل الملاحظة' : 'Edit note') : (rtl ? 'إضافة ملاحظة' : 'Add note')}
                  </button>
                </div>
                {m.medical_notes ? (
                  <p className="text-sm text-gray-700 whitespace-pre-line">{String(m.medical_notes)}</p>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-6">
                    {rtl ? 'لا توجد ملاحظات — أضفها من زرار «تعديل».' : 'No notes yet — add them via the EDIT button.'}
                  </p>
                )}
              </Card>

              {/* Recurring Payments card removed (§34ج): no recurring engine
                  exists in the server — the card only re-counted `payments`
                  under a false label and carried a dead CREATE button. */}

              {/* Payments */}
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">payments</span>
                  </span>
                  <h3 className="text-base font-bold text-gray-900">
                    {rtl ? 'المدفوعات' : 'Payments'}
                  </h3>
                </div>
                {payments.length > 0 ? (
                  <div className="space-y-2">
                    {payments.slice(0, 5).map((p: Record<string, unknown>, i: number) => (
                      <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-xl">
                        <span className="text-sm text-gray-900">{String(p.description || p.payment_method || '-')}</span>
                        <span className="text-sm font-semibold text-gray-900">{money(p.amount as number | string)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    {rtl ? 'لا توجد مدفوعات' : 'No payments recorded'}
                  </p>
                )}
              </Card>
            </div>
          )}

          {/* Attendance Tab Content */}
          {activeTab === 'attendance' && (
            <Card>
              <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-xl">fact_check</span>
                </span>
                {rtl ? 'سجل الحضور' : 'Attendance Records'}
              </h3>
              {attendance.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-100">
                  <table className="w-full text-sm text-gray-900">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{rtl ? 'التاريخ' : 'Date'}</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{rtl ? 'الوقت' : 'Time'}</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500">{rtl ? 'طريقة الدخول' : 'Entry Method'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.map((a: Record<string, unknown>, i: number) => {
                        const checkInTime = String(a.check_in_time || a.checkin_time || '');
                        const date = checkInTime.split('T')[0] || '-';
                        const time = checkInTime.split('T')[1]?.split('.')[0]?.slice(0, 5) || '-';
                        const method = String(a.entry_method || 'qr_code');
                        return (
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="py-2.5 px-4 text-gray-900">{date}</td>
                            <td className="py-2.5 px-4 text-gray-900">{time}</td>
                            <td className="py-2.5 px-4">
                              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                {method === 'qr_code' ? (rtl ? 'QR' : 'QR Code') : method === 'manual_phone' ? (rtl ? 'يدوي' : 'Manual') : method}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-24 text-gray-300">
                  <span className="material-symbols-outlined text-4xl">fact_check</span>
                </div>
              )}
            </Card>
          )}

          {/* §34ج — the "other tabs" placeholder block deleted: the tab bar
              now only contains the two tabs that render real content. */}
        </div>
      </div>

      {/* نافذة الاتصال: الرقم المسجل بخط كبير + زر اتصال (مريحة للموبايل) */}
      {callOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setCallOpen(false)}>
          <div className="absolute inset-0 bg-black/40" aria-hidden />
          <div dir={rtl ? 'rtl' : 'ltr'} className="relative w-full max-w-xs bg-white rounded-3xl shadow-2xl p-6 text-center space-y-4">
            <p className="text-sm text-gray-500">{fullName}</p>
            {hasPhone ? (
              <>
                <p dir="ltr" className="text-3xl font-mono font-extrabold tracking-wider text-gray-900">{phone}</p>
                <a
                  href={`tel:${phone.replace(/\s/g, '')}`}
                  className="flex items-center justify-center gap-2 w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-bold text-white hover:bg-emerald-700 min-h-[52px]"
                >
                  <span className="material-symbols-outlined text-xl">call</span>
                  {rtl ? 'اتصال الآن' : 'Call now'}
                </a>
              </>
            ) : (
              <p className="text-sm text-gray-500 py-4">
                {rtl ? 'لا يوجد رقم مسجل لهذا العضو' : 'No phone number saved for this member'}
              </p>
            )}
            <button
              type="button"
              onClick={() => setCallOpen(false)}
              className="w-full rounded-2xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              {rtl ? 'إغلاق' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* §34ج — real member edit (centered modal per project convention) */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditOpen(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl border border-gray-100 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {rtl ? 'تعديل بيانات العضو' : 'Edit Member'}
            </h2>
            <div className="space-y-4">
              {(
                [
                  { key: 'full_name', labelAr: 'الاسم الكامل', labelEn: 'Full name', type: 'text' },
                  { key: 'phone_number', labelAr: 'رقم الهاتف', labelEn: 'Phone', type: 'tel' },
                  { key: 'email', labelAr: 'البريد الإلكتروني', labelEn: 'Email', type: 'email' },
                  { key: 'birth_date', labelAr: 'تاريخ الميلاد', labelEn: 'Birth date', type: 'date' },
                ] as const
              ).map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? f.labelAr : f.labelEn}</label>
                  <input
                    type={f.type}
                    value={editForm[f.key]}
                    onChange={(e) => setEditForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    dir={f.key === 'phone_number' || f.key === 'email' || f.key === 'birth_date' ? 'ltr' : undefined}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'رابط الصورة' : 'Photo URL'}</label>                <input
                  type="url"
                  value={editForm.photo_url}
                  onChange={(e) => setEditForm((p) => ({ ...p, photo_url: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  dir="ltr"
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الجنس' : 'Gender'}</label>
                <select
                  value={editForm.gender}
                  onChange={(e) => setEditForm((p) => ({ ...p, gender: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">{rtl ? 'بدون تحديد' : 'Not set'}</option>
                  <option value="male">{rtl ? 'ذكر' : 'Male'}</option>
                  <option value="female">{rtl ? 'أنثى' : 'Female'}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{rtl ? 'الملاحظات الطبية' : 'Medical notes'}</label>
                <textarea
                  value={editForm.medical_notes}
                  onChange={(e) => setEditForm((p) => ({ ...p, medical_notes: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" fullWidth onClick={() => setEditOpen(false)}>
                {rtl ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button variant="primary" fullWidth onClick={saveEdit} disabled={editSaving}>
                {editSaving ? '…' : (rtl ? 'حفظ التعديلات' : 'Save changes')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
