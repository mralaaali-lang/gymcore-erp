import { formatMoney } from '../../../utils/currency';
import { formatDate } from '../../../utils/date';
import { escapeHtml, printDocument } from '../../../utils/print';
import { durationLabelAr, paymentMethodLabel } from './shared';

export interface InvoiceSubscription {
  id: string;
  member_name: string;
  member_code?: string | null;
  member_phone?: string | null;
  offer_title: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  price_paid: number | string;
  offer_price: number | string;
  payment_method?: string | null;
  outstanding_amount?: number | string;
  coach_name?: string | null;
  sport_label?: string | null;
}

/**
 * §34ي — فاتورة ورقية حقيقية تُطبع من المتصفح (حفظ PDF من نفس الحوار).
 * كل الأسطر من بيانات الاشتراك نفسها — لا شيء مفبرك؛ القيم الغائبة «—».
 */
export function printSubscriptionInvoice(gymName: string | undefined, currency: string | null | undefined, s: InvoiceSubscription): boolean {
  const price = Number(s.offer_price);
  const paid = Number(s.price_paid);
  const outstanding = s.outstanding_amount !== undefined ? Number(s.outstanding_amount) : Math.max(price - paid, 0);
  const rows: [string, string][] = [
    ['رقم الاشتراك', s.id.slice(0, 8)],
    ['العضو', s.member_name],
    ['كود العضو', s.member_code || '—'],
    ['التليفون', s.member_phone || '—'],
    ['الباقة', `${s.offer_title} (${durationLabelAr(s.duration_days)})`],
    ['الرياضة', s.sport_label || '—'],
    ['المدرب', s.coach_name || 'بدون مدرب'],
    ['من', formatDate(s.start_date)],
    ['إلى', formatDate(s.end_date)],
  ];
  const inner = `
  <h1>فاتورة اشتراك${gymName ? ` — ${escapeHtml(gymName)}` : ''}</h1>
  <p class="muted">تاريخ الإصدار: ${escapeHtml(new Date().toISOString().slice(0, 10))}</p>
  <table>${rows.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>
  <div class="box">
    <div class="row"><span>سعر الباقة</span><b>${escapeHtml(formatMoney(price, currency))}</b></div>
    <div class="row"><span>المدفوع (${escapeHtml(paymentMethodLabel(s.payment_method))})</span><b>${escapeHtml(formatMoney(paid, currency))}</b></div>
    ${outstanding > 0 ? `<div class="row"><span>المتبقي (مُسجَّل كدين على العضو)</span><b>${escapeHtml(formatMoney(outstanding, currency))}</b></div>` : ''}
    <div class="row total"><span>الإجمالي</span><b>${escapeHtml(formatMoney(price, currency))}</b></div>
  </div>
  <p class="muted" style="margin-top:18px">شكراً لثقتك — الصالة</p>`;
  return printDocument({ title: `فاتورة اشتراك ${s.member_name}`, innerHtml: inner });
}
