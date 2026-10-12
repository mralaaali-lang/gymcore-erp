import { useState } from 'react';
import { useApp } from '../../../context/GymBrandContext';
import { useToast } from '../../../context/ToastContext';
import Button from '../../../components/ui/Button';

const PROVIDERS = [
  { value: '', labelEn: 'Select your current provider', labelAr: 'اختر مزود الخدمة الحالي' },
  { value: 'mindbody', labelEn: 'Mindbody', labelAr: 'مايندبودي' },
  { value: 'pushpress', labelEn: 'PushPress', labelAr: 'بوش برس' },
  { value: 'wodify', labelEn: 'Wodify', labelAr: 'ووديفاي' },
  { value: 'fitdegree', labelEn: 'FitDegree', labelAr: 'فيت ديجري' },
  { value: 'gymcatch', labelEn: 'Gymcatch', labelAr: 'جيم كاتش' },
  { value: 'exercisecom', labelEn: 'Exercise.com', labelAr: 'إكسيرسايس دوت كوم' },
  { value: 'other', labelEn: 'Other', labelAr: 'أخرى' },
];

const IMPORT_CARDS = [
  { id: 'members', icon: 'group', labelEn: 'Import Members', labelAr: 'استيراد الأعضاء', descEn: 'Import member profiles, contact info, and photos', descAr: 'استيراد بيانات الأعضاء ومعلومات الاتصال والصور' },
  { id: 'memberships', icon: 'card_membership', labelEn: 'Import Memberships', labelAr: 'استيراد الباقات', descEn: 'Import membership plans and active subscriptions', descAr: 'استيراد خطط العضوية والاشتراكات النشطة' },
  { id: 'attendance', icon: 'fact_check', labelEn: 'Import Attendance', labelAr: 'استيراد الحضور', descEn: 'Import historical attendance logs and check-ins', descAr: 'استيراد سجلات الحضور السابقة' },
  { id: 'leads', icon: 'leaderboard', labelEn: 'Import Leads', labelAr: 'استيراد العملاء المحتملين', descEn: 'Import CRM leads and contact records', descAr: 'استيراد سجلات العملاء المحتملين' },
  { id: 'payments', icon: 'payments', labelEn: 'Import Payments', labelAr: 'استيراد المدفوعات', descEn: 'Import payment history and invoices', descAr: 'استيراد سجل المدفوعات والفواتير' },
  { id: 'products', icon: 'inventory_2', labelEn: 'Import Products', labelAr: 'استيراد المنتجات', descEn: 'Import product inventory and pricing', descAr: 'استيراد المخزون والتسعير' },
];

/**
 * MigrationTab — §27: merged /admin/settings/migration (MigrationCenter)
 * into the Settings hub. Renders inside SettingsPage's content Card.
 */
export default function MigrationTab() {
  const { language } = useApp();
  const { showToast } = useToast();
  const rtl = language === 'ar';
  const [provider, setProvider] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const handleImport = (id: string) => {
    if (!provider) {
      showToast(rtl ? 'يرجى اختيار مزود الخدمة أولاً' : 'Please select a provider first', 'warning');
      return;
    }
    setImporting(id);
    setTimeout(() => {
      setImporting(null);
      showToast(rtl ? 'تم استيراد البيانات بنجاح' : 'Data imported successfully', 'success');
    }, 2000);
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-500 mb-2">
          {rtl ? 'اختر مزود الخدمة الحالي' : 'Choose your current provider'}
        </label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value} disabled={!p.value}>{rtl ? p.labelAr : p.labelEn}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {IMPORT_CARDS.map((card) => (
          <div key={card.id} className="border border-gray-100 rounded-3xl p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-2xl">{card.icon}</span>
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">{rtl ? card.labelAr : card.labelEn}</h3>
            <p className="text-xs text-gray-500 mb-4">{rtl ? card.descAr : card.descEn}</p>
            <Button
              variant="primary"
              fullWidth
              onClick={() => handleImport(card.id)}
              disabled={importing === card.id}
            >
              {importing === card.id ? (
                <span className="material-symbols-outlined animate-spin text-lg">sync</span>
              ) : (
                <span className="material-symbols-outlined text-lg">download</span>
              )}
              {importing === card.id ? (rtl ? 'جاري الاستيراد...' : 'Importing...') : (rtl ? 'استيراد' : 'IMPORT')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
