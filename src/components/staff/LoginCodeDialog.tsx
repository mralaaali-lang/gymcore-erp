import { useState } from 'react';
import { Check, CopySimple, WhatsappLogo } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import Modal from '../shared/Modal';
import { useApp } from '../../context/GymBrandContext';
import { toWhatsAppNumber } from '../members/MemberContact';

interface LoginCodeDialogProps {
  open: boolean;
  onClose: () => void;
  /** Dialog heading — e.g. "كود الدخول" / "Login code". */
  title: string;
  /** Whose code it is, when known ("كود دخول أحمد"). */
  subject?: string;
  /** The plaintext code. It exists nowhere else — this dialog is the only copy. */
  code: string;
  /** Phone the code was issued against, shown so the manager can check it. */
  phone?: string | null;
  /** Who the code is for — quoted in the WhatsApp message. */
  name?: string;
}

/**
 * LoginCodeDialog — the single moment a login code exists in plain text.
 *
 * Codes are stored bcrypt-hashed (members.pin_code_hash /
 * staff_users.login_code_hash), so nothing can read one back later: the manager
 * either relays it now or issues a replacement. The dialog therefore leads with
 * the digits, keeps the copy button beside them, and makes the closing action an
 * acknowledgement rather than a silent X.
 *
 * The WhatsApp action is Click-to-Chat (wa.me), not a server-side send: only a
 * hash is stored, so a provider could only ever deliver a *second* code — the
 * one on screen here is the one that works. Opening WhatsApp Web with the code
 * already typed keeps both the same, and it claims nothing about delivery (the
 * desk's own WhatsApp session is the sender, so "sent" is not ours to report).
 */
export default function LoginCodeDialog({
  open,
  onClose,
  title,
  subject,
  code,
  phone,
  name,
}: LoginCodeDialogProps) {
  const { t } = useTranslation();
  const { language } = useApp();
  const rtl = language === 'ar';
  const [copied, setCopied] = useState(false);

  // wa.me needs international digits; the app's single normalizer handles the
  // local 01… / 00… / +20… shapes. An empty result means there is no usable
  // number at all, so there is nothing to open a chat with.
  const intl = toWhatsAppNumber(phone || '');
  const waHref = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(
        t('staff.waMessage', { name: name || '', code }),
      )}`
    : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; the code is on screen anyway.
      setCopied(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      dir={rtl ? 'rtl' : 'ltr'}
      title={title}
      description={subject}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-petrol-light"
        >
          {t('staff.close')}
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-center gap-3 rounded-shell border border-hairline bg-surface-container-low px-4 py-5">
          <p dir="ltr" className="font-mono text-4xl font-bold tracking-[0.35em] text-primary">
            {code}
          </p>
          <button
            type="button"
            onClick={copy}
            aria-label={t('staff.copyCode')}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-container-high hover:text-foreground"
          >
            {copied ? <Check size={18} weight="bold" className="text-primary" /> : <CopySimple size={18} />}
          </button>
        </div>

        {phone ? (
          <p dir="ltr" className="text-center text-xs text-muted-foreground">
            {phone}
          </p>
        ) : null}

        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-600"
          >
            <WhatsappLogo size={18} weight="fill" />
            {t('staff.sendWhatsapp')}
          </a>
        ) : (
          <p className="text-center text-[11px] leading-relaxed text-brass">
            {t('staff.loginCodeNoPhone')}
          </p>
        )}

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {t('staff.loginCodeBody')}
        </p>
      </div>
    </Modal>
  );
}
