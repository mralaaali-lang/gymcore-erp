// wa.me needs full international digits. Egyptian numbers arrive as
// 01xxxxxxxxx (or with a 00/2 prefix); normalize all of them to 20… + 9.
// Single source shared by the debts screen and the absent-members report.
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('20')) return digits;
  if (digits.startsWith('0')) return `20${digits.slice(1)}`;
  if (digits.length === 10) return `20${digits}`;
  return digits;
}

/** Orange call button (tel: link). Silent when there is no usable number. */
export function CallButton({ phone, rtl }: { phone?: string | null; rtl: boolean }) {
  const clean = (phone || '').trim();
  if (clean.length < 7) return <span />;
  return (
    <a
      href={`tel:${clean.replace(/\s/g, '')}`}
      title={rtl ? 'اتصال' : 'Call'}
      aria-label={rtl ? 'اتصال' : 'Call'}
      className="w-11 min-h-[44px] inline-flex items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-600 text-white shadow-sm transition"
    >
      <span className="material-symbols-outlined text-xl">call</span>
    </a>
  );
}

/** Green WhatsApp button (wa.me in a new tab, optional prefilled text). */
export function WhatsAppButton({
  phone, rtl, message,
}: {
  phone?: string | null; rtl: boolean; message?: string;
}) {
  const intl = toWhatsAppNumber(phone || '');
  if (!intl) return <span />;
  return (
    <button
      type="button"
      onClick={() => window.open(
        `https://wa.me/${intl}${message ? `?text=${encodeURIComponent(message)}` : ''}`,
        '_blank', 'noopener',
      )}
      title={rtl ? 'واتساب' : 'WhatsApp'}
      aria-label={rtl ? 'واتساب' : 'WhatsApp'}
      className="w-11 min-h-[44px] inline-flex items-center justify-center rounded-xl bg-green-500 hover:bg-green-600 text-white shadow-sm transition"
    >
      <span className="material-symbols-outlined text-xl">chat</span>
    </button>
  );
}

/** Dual contact cell (call + WhatsApp) — one pattern for debts and absent lists. */
export default function MemberContactButtons({
  phone, rtl, message,
}: {
  phone?: string | null; rtl: boolean; message?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <CallButton phone={phone} rtl={rtl} />
      <WhatsAppButton phone={phone} rtl={rtl} message={message} />
    </div>
  );
}
