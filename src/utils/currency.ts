// Per-tenant currency display (§24). The code lives in gyms.currency and
// reaches the UI through /auth/me → useApp().gymProfile.currency.
const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: 'ج.م',
  SAR: 'ر.س',
  AED: 'د.إ',
  KWD: 'د.ك',
  QAR: 'ر.ق',
  BHD: 'د.ب',
  OMR: 'ر.ع',
  JOD: 'د.أ',
  USD: '$',
  EUR: '€',
  GBP: '£',
  TRY: '₺',
};

export function currencySymbol(code?: string | null): string {
  const key = (code || 'EGP').toUpperCase();
  return CURRENCY_SYMBOLS[key] || key;
}

/** "1,250 ر.س" — symbol after the number (Arabic-market convention). */
export function formatMoney(amount: number, code?: string | null): string {
  return `${Number(amount || 0).toLocaleString()} ${currencySymbol(code)}`;
}
