import { useState } from 'react';
import { Check, CopySimple } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import Modal from '../shared/Modal';
import { useApp } from '../../context/GymBrandContext';

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
 * There is deliberately no "send it" action here: sending issues a *new* code
 * (only a hash is stored, so an existing one cannot be re-sent), and callers
 * that offer that offer it as its own button before the code ever exists.
 */
export default function LoginCodeDialog({
  open,
  onClose,
  title,
  subject,
  code,
  phone,
}: LoginCodeDialogProps) {
  const { t } = useTranslation();
  const { language } = useApp();
  const rtl = language === 'ar';
  const [copied, setCopied] = useState(false);

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

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {t('staff.loginCodeBody')}
        </p>
      </div>
    </Modal>
  );
}
