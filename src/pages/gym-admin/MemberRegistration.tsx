import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/GymBrandContext';
import { useToast } from '../../context/ToastContext';
import { createMember, listOffers } from '../../services/api';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/shared/PageHeader';
import PageLoader from '../../components/shared/PageLoader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

interface Offer {
  id: string;
  title: string;
  duration_days: number;
  price: number;
}

export default function MemberRegistration() {
  const { language } = useApp();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const rtl = language === 'ar';
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    birthDate: '',
    planId: '',
    medicalNotes: '',
  });

  useEffect(() => {
    listOffers()
      .then((res) => {
        const data = res.data || res;
        setOffers(data || []);
        if (data && data.length > 0) {
          setForm((prev) => ({ ...prev, planId: data[0].id }));
        }
      })
      .catch(() => showToast(language === 'ar' ? 'فشل تحميل خطط الاشتراك' : 'Failed to load plans', 'error'))
      .finally(() => setOffersLoading(false));
  }, [language, showToast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createMember({
        full_name: form.name,
        phone_number: form.phone,
        email: form.email || undefined,
        birth_date: form.birthDate || undefined,
        plan_id: form.planId,
        medical_notes: form.medicalNotes || undefined,
      });
      showToast(language === 'ar' ? 'تم تسجيل المشترك بنجاح' : 'Member registered successfully', 'success');
      navigate('/members');
    } catch {
      showToast(language === 'ar' ? 'فشل تسجيل المشترك' : 'Failed to register member', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/members');
  };

  const inputCls = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition';

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="bg-gray-50 min-h-screen -m-6 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader
          title={rtl ? 'تسجيل مشترك جديد' : 'New Member Registration'}
          subtitle={rtl ? 'أدخل بيانات المشترك الجديد' : 'Enter the new member details'}
          icon="person_add"
        />

        <form onSubmit={handleSubmit}>
          <Card className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {rtl ? 'الاسم الكامل' : 'Full Name'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  className={inputCls}
                  placeholder={rtl ? 'مثال: أحمد محمد عبدالله' : 'e.g. Ahmed Mohamed'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {rtl ? 'رقم الجوال' : 'Phone Number'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  required
                  dir="ltr"
                  className={inputCls}
                  placeholder="05xxxxxxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {rtl ? 'البريد الإلكتروني' : 'Email'}
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  dir="ltr"
                  className={inputCls}
                  placeholder="member@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {rtl ? 'تاريخ الميلاد' : 'Birth Date'}
                </label>
                <input
                  type="date"
                  name="birthDate"
                  value={form.birthDate}
                  onChange={handleChange}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {rtl ? 'الباقة' : 'Subscription Plan'} <span className="text-red-500">*</span>
              </label>
              {offersLoading ? (
                <PageLoader variant="skeleton" rows={1} />
              ) : (
                <select
                  name="planId"
                  value={form.planId}
                  onChange={handleChange}
                  required
                  className={inputCls}
                >
                  {offers.length === 0 && (
                    <option value="">{rtl ? 'لا توجد خطط متاحة' : 'No plans available'}</option>
                  )}
                  {offers.map((p) => (
                    <option key={p.id} value={p.id}>{p.title} - {p.price} ر.س</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {rtl ? 'ملاحظات طبية' : 'Medical Notes'}
              </label>
              <textarea
                name="medicalNotes"
                value={form.medicalNotes}
                onChange={handleChange}
                rows={3}
                className={`${inputCls} resize-none`}
                placeholder={rtl ? 'أي معلومات صحية هامة...' : 'Any relevant health information...'}
              />
            </div>
          </Card>

          <div className="flex items-center gap-3 mt-6">
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="px-6"
            >
              {loading && <Spinner size="sm" />}
              {rtl ? 'تسجيل المشترك' : 'Register Member'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              className="px-6"
            >
              {rtl ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
