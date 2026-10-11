// ── Shared tenant-directory helpers (single source; re-exports live here) ──

export type FilterTab = 'all' | 'active' | 'expiring' | 'expired' | 'suspended';

export const colLabels: Record<string, Record<string, string>> = {
  id: { ar: '#', en: '#' },
  status: { ar: 'الحالة', en: 'Status' },
  name: { ar: 'اسم الصالة', en: 'Name' },
  phone: { ar: 'رقم الهاتف', en: 'Phone' },
  expiry: { ar: 'تاريخ الانتهاء', en: 'Expiry' },
  plan: { ar: 'الباقة', en: 'Plan' },
  members: { ar: 'المشتركين', en: 'Members' },
  lastContact: { ar: 'آخر اتصال', en: 'Last Contact' },
  address: { ar: 'العنوان', en: 'Address' },
  email: { ar: 'البريد الإلكتروني', en: 'Email' },
  site: { ar: 'الموقع', en: 'Site' },
  created: { ar: 'تاريخ الإنشاء', en: 'Created' },
  ops: { ar: 'عمليات', en: 'Ops' },
};

export function colKeyToLabel(key: string, rtl: boolean): string {
  return colLabels[key]?.[rtl ? 'ar' : 'en'] || key;
}
