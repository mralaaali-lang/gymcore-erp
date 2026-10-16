/**
 * §34ي — الطباعة/التصدير إلى PDF عبر نافذة الطباعة الحقيقية للمتصفح
 * (حفظ كـ PDF متاح من نفس الحوار). لا مكتبات وهمية: المستخدم يطبع فعلاً.
 */

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printDocument(opts: { title: string; innerHtml: string }): boolean {
  const w = window.open('', '_blank', 'width=780,height=900');
  if (!w) return false; // popup blocked — caller must tell the user
  w.document.write(`<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body { font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif; color: #111827; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #6b7280; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { border: 1px solid #e5e7eb; padding: 7px 9px; text-align: right; }
  th { background: #f3f4f6; }
  .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-top: 14px; }
  .total { font-size: 17px; font-weight: 800; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 13px; }
  .row span:first-child { color: #6b7280; }
  @media print { body { margin: 8mm; } }
</style>
</head>
<body>
${opts.innerHtml}
<script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  w.document.close();
  w.focus();
  return true;
}
