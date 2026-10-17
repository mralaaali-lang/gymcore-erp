import { useState } from 'react';
import { useApp } from '../../../context/GymBrandContext';
import Button from '../../../components/ui/Button';
import Modal from '../../../components/shared/Modal';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: string;
  status: string;
  notes?: string;
  assigned_to?: string;
}

interface LeadFormProps {
  lead?: Lead | null;
  onSubmit: (data: Omit<Lead, 'id' | 'status'>) => void;
  onCancel: () => void;
  loading: boolean;
}

const inputClass =
  'w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-white text-sm text-gray-900 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400';

export default function LeadForm({ lead, onSubmit, onCancel, loading }: LeadFormProps) {
  const { language } = useApp();
  const [name, setName] = useState(lead?.name || '');
  const [phone, setPhone] = useState(lead?.phone || '');
  const [email, setEmail] = useState(lead?.email || '');
  const [source, setSource] = useState(lead?.source || 'other');
  const [notes, setNotes] = useState(lead?.notes || '');
  const [assignedTo, setAssignedTo] = useState(lead?.assigned_to || '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  const validate = () => {
    const errs: { name?: string; phone?: string } = {};
    if (!name.trim()) {
      errs.name = language === 'ar' ? 'الاسم مطلوب' : 'Name is required';
    }
    if (!phone.trim()) {
      errs.phone = language === 'ar' ? 'رقم الجوال مطلوب' : 'Phone is required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validate()) return;
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      source,
      notes: notes.trim(),
      assigned_to: assignedTo.trim(),
    });
  };

  return (
    <Modal
      open
      onClose={onCancel}
      size="lg"
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      disableDismiss={loading}
      title={lead
        ? (language === 'ar' ? 'تعديل العميل المحتمل' : 'Edit Lead')
        : (language === 'ar' ? 'إضافة عميل محتمل' : 'Add Lead')}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            {language === 'ar' ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => handleSubmit()}
            disabled={loading}
          >
            {loading
              ? (language === 'ar' ? 'جاري الحفظ…' : 'Saving…')
              : (language === 'ar' ? 'حفظ' : 'Save')}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ar' ? 'الاسم' : 'Name'} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClass} ${errors.name ? '!border-red-400' : ''}`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ar' ? 'رقم الجوال' : 'Phone'} *
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={`${inputClass} ${errors.phone ? '!border-red-400' : ''}`}
            />
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ar' ? 'المصدر' : 'Source'}
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={inputClass}
            >
              <option value="facebook">{language === 'ar' ? 'فيسبوك' : 'Facebook'}</option>
              <option value="instagram">{language === 'ar' ? 'انستغرام' : 'Instagram'}</option>
              <option value="walk_in">{language === 'ar' ? 'زيارة' : 'Walk-in'}</option>
              <option value="other">{language === 'ar' ? 'أخرى' : 'Other'}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ar' ? 'ملاحظات' : 'Notes'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {language === 'ar' ? 'مسؤول' : 'Assigned To'}
            </label>
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder={language === 'ar' ? 'اسم المسؤول' : 'Assignee name'}
              className={inputClass}
            />
          </div>

        </form>
    </Modal>
  );
}
