import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/shared/Modal';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { useApiQuery } from '../../hooks/useApiQuery';
import { getMember, updateMember, type MemberResponse } from '../../services/api';

const inputCls =
  'w-full min-h-[48px] md:min-h-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base md:text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-ring';
const labelCls = 'block text-sm font-semibold text-gray-700 mb-1';

function apiError(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error || fallback;
}

/**
 * مودال التعديل السريع — يفتح بالضغط على صف العضو.
 * الاسم/التليفون/الإيميل/الميلاد/ملاحظات طبية عبر PUT الموجود،
 * وزر «الملف الكامل» ينقل لصفحة البروفايل (الاشتراكات/الحضور/الديون).
 *
 * موجة 3: الصدفة اليدوية (الطبقة الثابتة على كامل الشاشة + scrim + حواف) اتحوّلت على
 * `shared/Modal` — نفس العرض (`max-w-lg` = 32rem) ونفس ترتيب الأزرار، وEscape
 * والضغط على الـscrim بقوا شغالين مع حبسهم طالما الحفظ جارٍ (`disableDismiss`).
 * الألوان الحرفية جوه الحقول سايبها لحد موجة 5 (القرار D1/D2 لسه مفتوح).
 */
export default function EditMemberModal({ member, onClose, onSaved }: {
  member: MemberResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';

  const [name, setName] = useState(member.full_name ?? '');
  const [phone, setPhone] = useState(member.phone_number ?? '');
  const [email, setEmail] = useState(member.email ?? '');
  const [birth, setBirth] = useState((member.birth_date ?? '').slice(0, 10));
  const [gender, setGender] = useState(member.gender ?? '');
  const [notes, setNotes] = useState('');
  const [notesReady, setNotesReady] = useState(false);

  // الملاحظات الحالية للاستبدال الآمن (السيرفر يستبدل لا يُلحق) — تُملأ مرة واحدة.
  const { data: full } = useApiQuery(
    ['member', member.id],
    () => getMember(member.id),
    { staleTime: 30_000 }
  );
  useEffect(() => {
    if (!notesReady && full && typeof (full as { medical_notes?: unknown }).medical_notes === 'string') {
      setNotes((full as { medical_notes: string }).medical_notes ?? '');
      setNotesReady(true);
    }
  }, [full, notesReady]);

  const save = useMutation({
    mutationFn: () =>
      updateMember(member.id, {
        full_name: name.trim(),
        phone_number: phone.trim() || undefined,
        email: email.trim() || '',
        birth_date: birth || '',
        gender: gender || null,
        medical_notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      showToast(rtl ? 'تم حفظ بيانات العضو' : 'Member saved', 'success');
      onSaved();
      onClose();
    },
    onError: (e) => showToast(apiError(e, rtl ? 'فشل الحفظ' : 'Save failed'), 'error'),
  });

  const nameOk = name.trim().length >= 2;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dir={rtl ? 'rtl' : 'ltr'}
      disableDismiss={save.isPending}
      title={rtl ? `تعديل بيانات ${member.full_name}` : `Edit ${member.full_name}`}
      description={
        member.code ? (
          <>
            {rtl ? 'كود' : 'Code'} <span dir="ltr">{member.code}</span>
          </>
        ) : undefined
      }
      footer={
        <div className="flex w-full flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50"
              onClick={onClose}
            >
              {rtl ? 'تراجع' : 'Back'}
            </button>
            <button
              type="button"
              disabled={!nameOk || save.isPending}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              onClick={() => save.mutate()}
            >
              {save.isPending ? (rtl ? 'جارٍ الحفظ…' : 'Saving…') : (rtl ? 'حفظ' : 'Save')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/admin/members/${member.id}`)}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50"
          >
            {rtl ? 'فتح الملف الكامل' : 'Open full profile'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelCls}>{rtl ? 'الاسم *' : 'Name *'}</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{rtl ? 'التليفون' : 'Phone'}</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="01xxxxxxxxx" />
          </div>
          <div>
            <label className={labelCls}>{rtl ? 'تاريخ الميلاد' : 'Birth date'}</label>
            <input type="date" className={inputCls} value={birth} onChange={(e) => setBirth(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{rtl ? 'الجنس' : 'Gender'}</label>
          <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">{rtl ? 'بدون تحديد' : 'Not set'}</option>
            <option value="male">{rtl ? 'ذكر' : 'Male'}</option>
            <option value="female">{rtl ? 'أنثى' : 'Female'}</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{rtl ? 'الإيميل' : 'Email'}</label>
          <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" placeholder="name@mail.com" />
        </div>
        <div>
          <label className={labelCls}>{rtl ? 'ملاحظات طبية' : 'Medical notes'}</label>
          <textarea
            className={`${inputCls} min-h-[72px]`}
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setNotesReady(true); }}
            placeholder={rtl ? 'ملاحظات طبية…' : 'Medical notes…'}
          />
        </div>
      </div>
    </Modal>
  );
}
