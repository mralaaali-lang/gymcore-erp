// §35ج — بطاقة عضو حقيقية تُطبع من المتصفح (أو تُحفظ PDF من نفس الحوار).
// الكود رقم تسلسلي 6 أرقام لكل صالة (members.card_code، migration 063) —
// الـQR يحمل الكود نفسه حرفيًا، فيقرأه أي ماسح ويعرفه حقل الحضور الموحد
// عبر /api/attendance/lookup. لا بيانات مفبركة: كل سطر من ملف العضو الفعلي.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { escapeHtml, printDocument } from './print';

export interface MemberCardData {
  gymName?: string | null;
  fullName: string;
  cardCode: string;
  /** تاريخ انتهاء أحدث اشتراك نشط (YYYY-MM-DD) أو null — يُطبع «—» بأمان. */
  validUntil?: string | null;
}

export function printMemberCard(c: MemberCardData): boolean {
  const svg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value: c.cardCode, size: 150, level: 'M' })
  );
  const inner = `
  <div style="display:flex;justify-content:center;padding:18px 0">
    <div style="width:360px;border-radius:18px;overflow:hidden;border:1px solid #d1d5db;font-family:'Segoe UI',Tahoma,Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,0.08)">
      <div style="background:linear-gradient(135deg,#065f46 0%,#059669 100%);padding:14px 20px;display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:16px;color:#ffffff">${escapeHtml(c.gymName || '—')}</b>
        <span style="font-size:10px;color:#d1fae5;letter-spacing:2px">بطاقة عضوية</span>
      </div>
      <div style="height:3px;background:linear-gradient(90deg,#d4af37,#f5e08c,#d4af37)"></div>
      <div style="padding:18px 20px 20px;text-align:center;background:#ffffff">
        <div style="font-size:17px;font-weight:800;color:#111827">${escapeHtml(c.fullName)}</div>
        <div dir="ltr" style="font-family:monospace;font-size:26px;letter-spacing:4px;color:#059669;margin-top:4px">${escapeHtml(c.cardCode)}</div>
        <div style="display:inline-block;margin-top:12px;padding:12px;background:#ffffff;border:1.5px solid #e5e7eb;border-radius:12px">${svg}</div>
        <div style="margin-top:12px;font-size:11px;color:#6b7280">صالحة حتى: <b style="color:#111827">${escapeHtml(c.validUntil || '—')}</b></div>
      </div>
      <div style="background:#f9fafb;padding:9px;text-align:center;font-size:10px;color:#6b7280;border-top:1px solid #f3f4f6">قدّم هذا الكود عند الحضور</div>
    </div>
  </div>
  <p class="muted" style="text-align:center">اطبع هذه الصفحة على ورق عادي ثم قصّ على الحد، أو احفظها PDF.</p>`;
  return printDocument({ title: `بطاقة العضو ${c.fullName}`, innerHtml: inner });
}

/** أحدث تاريخ انتهاء بين اشتراكات الملف — من m.subscriptions الفعلية فقط. */
export function latestActiveEnd(
  subs: unknown
): string | null {
  if (!Array.isArray(subs)) return null;
  const active = subs
    .filter((s) => (s as { status?: string })?.status === 'active')
    .map((s) => String((s as { end_date?: unknown })?.end_date ?? '').slice(0, 10))
    .filter(Boolean)
    .sort();
  return active.length ? active[active.length - 1] : null;
}
