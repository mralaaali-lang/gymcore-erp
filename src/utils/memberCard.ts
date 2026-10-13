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
    createElement(QRCodeSVG, { value: c.cardCode, size: 140, level: 'M' })
  );
  const inner = `
  <div style="display:flex;justify-content:center;padding:18px 0">
    <div style="width:340px;border:2px solid #059669;border-radius:16px;padding:18px 20px;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="font-size:15px;color:#065f46">${escapeHtml(c.gymName || '—')}</b>
        <span style="font-size:10px;color:#6b7280">بطاقة عضوية</span>
      </div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:14px">
        <div style="flex:0 0 auto">${svg}</div>
        <div>
          <div style="font-size:15px;font-weight:700">${escapeHtml(c.fullName)}</div>
          <div dir="ltr" style="font-family:monospace;font-size:22px;letter-spacing:3px;color:#059669;margin-top:6px">${escapeHtml(c.cardCode)}</div>
        </div>
      </div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;font-size:11px;color:#6b7280">
        <span>صالحة حتى: <b style="color:#111827">${escapeHtml(c.validUntil || '—')}</b></span>
        <span>قدّم هذا الكود عند الحضور</span>
      </div>
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
