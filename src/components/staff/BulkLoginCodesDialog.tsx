import { useRef, useState } from 'react';
import { Check, DownloadSimple, WhatsappLogo } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import Modal from '../shared/Modal';
import { useApp } from '../../context/GymBrandContext';
import {
  bulkMemberLoginCodes,
  bulkStaffLoginCodes,
  type BulkLoginCodesResult,
  type IssuedLoginCode,
} from '../../services/api';

type Scope = 'staff' | 'members';

interface BulkLoginCodesDialogProps {
  open: boolean;
  onClose: () => void;
  scope: Scope;
}

/** Chunk size — matches the server's cap (200) with headroom for the bcrypt budget. */
const CHUNK = 100;
const MAX_CHUNKS = 500;

/**
 * BulkLoginCodesDialog — the cut-over for accounts that predate the code.
 *
 * Two facts shape the whole design:
 *
 * 1. bcrypt at cost 12 measured 157ms/hash here (8 in parallel: 322ms), so
 *    2 463 members is ~99 seconds of CPU. One HTTP request that long is a
 *    timeout waiting to happen, so the client loops on the server's `remaining`
 *    and renders progress between chunks.
 * 2. A code is shown exactly once, ever. The plaintext lives in this component's
 *    state and nowhere else — so the run blocks dismissal, and closing before
 *    the CSV is downloaded is a real (and warned-about) data loss.
 *
 * Sending on WhatsApp is opt-in per run: ~2 463 messages is a bill, never a
 * default.
 */
export default function BulkLoginCodesDialog({ open, onClose, scope }: BulkLoginCodesDialogProps) {
  const { t } = useTranslation();
  const { language } = useApp();
  const rtl = language === 'ar';

  const [send, setSend] = useState(false);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<IssuedLoginCode[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [channel, setChannel] = useState<BulkLoginCodesResult['channel'] | null>(null);
  const [finished, setFinished] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const fetchChunk = scope === 'staff' ? bulkStaffLoginCodes : bulkMemberLoginCodes;

  const run = async () => {
    setRunning(true);
    setError(null);
    setFinished(false);
    setDownloaded(false);
    cancelled.current = false;

    const collected: IssuedLoginCode[] = [];

    try {
      for (let i = 0; i < MAX_CHUNKS; i++) {
        if (cancelled.current) break;
        const res = await fetchChunk(CHUNK, send);
        const data = res.data;

        collected.push(...data.generated);
        setRows([...collected]);
        setChannel(data.channel);
        setSkipped(data.skipped_no_phone);

        // `remaining` counts work the server still has. A chunk that produced
        // nothing while work is claimed to remain would spin forever — stop.
        if (data.remaining <= 0 || data.generated.length === 0) break;
      }
      setFinished(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('staff.bulkCodesFailed'));
      setFinished(true);
    } finally {
      setRunning(false);
    }
  };

  const download = () => {
    if (!rows.length) return;
    const header = rtl
      ? ['الاسم', 'رقم الموبايل', 'كود الدخول']
      : ['Name', 'Phone', 'Login code'];
    const body = rows.map((r) => [r.name, r.phone ?? '', r.code]);
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    // BOM so Excel reads the Arabic names as UTF-8 instead of mojibake.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${scope === 'staff' ? 'staff' : 'member'}-login-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  const reset = () => {
    setRows([]);
    setSkipped(0);
    setChannel(null);
    setFinished(false);
    setError(null);
    setDownloaded(false);
  };

  const handleClose = () => {
    if (running) return;
    // Keep the codes on screen until the file is out, otherwise they are gone.
    if (downloaded || !rows.length) {
      // Nothing left to lose: clear so the next visit starts clean.
      reset();
      setSend(false);
      onClose();
    }
  };

  const withoutPhone = rows.filter((r) => !r.phone).length;
  const whatsappOff = send && channel === 'console';
  const blockedByUndownloadedCodes = rows.length > 0 && !downloaded;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="md"
      dir={rtl ? 'rtl' : 'ltr'}
      title={t('staff.bulkCodesTitle')}
      description={t('staff.bulkCodesBody')}
      disableDismiss={running}
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={running || blockedByUndownloadedCodes}
            title={blockedByUndownloadedCodes ? t('staff.bulkCodesKeepOpen') : undefined}
            className="inline-flex items-center justify-center rounded-xl border border-hairline px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-container-high disabled:opacity-50"
          >
            {t('staff.close')}
          </button>
          {rows.length ? (
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-petrol-light"
            >
              <DownloadSimple size={16} weight="bold" />
              {t('staff.bulkCodesDownload')}
            </button>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-petrol-light disabled:opacity-60"
            >
              {running ? t('staff.bulkCodesWorking', { count: rows.length }) : t('staff.bulkCodesStart')}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!rows.length && !running ? (
          <label className="flex items-start gap-2 rounded-shell border border-hairline bg-surface-container-low p-3">
            <input
              type="checkbox"
              checked={send}
              onChange={(e) => setSend(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              {t('staff.bulkCodesSendOption')}
            </span>
          </label>
        ) : null}

        {running ? (
          <div className="flex items-center gap-3 rounded-shell border border-hairline bg-surface-container-low p-4">
            <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {t('staff.bulkCodesWorking', { count: rows.length })}
              </p>
              <p className="text-xs text-muted-foreground">{t('staff.bulkCodesKeepOpen')}</p>
            </div>
          </div>
        ) : null}

        {finished && !error ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-shell border border-primary/30 bg-primary/10 p-3 text-sm font-semibold text-primary">
              <Check size={16} weight="bold" />
              {rows.length ? t('staff.bulkCodesDone', { count: rows.length }) : t('staff.bulkCodesNone')}
            </div>

            {scope === 'staff' && skipped > 0 ? (
              <p className="text-xs leading-relaxed text-brass">
                {t('staff.bulkCodesSkippedStaff', { count: skipped })}
              </p>
            ) : null}

            {scope === 'members' && withoutPhone > 0 ? (
              <p className="text-xs leading-relaxed text-brass">
                {t('staff.bulkCodesSkippedMembers', { count: withoutPhone })}
              </p>
            ) : null}

            {whatsappOff ? (
              <p className="flex items-start gap-2 text-xs leading-relaxed text-brass">
                <WhatsappLogo size={14} weight="fill" className="mt-0.5 shrink-0" />
                {t('staff.bulkCodesWhatsappOff')}
              </p>
            ) : null}

            {rows.length && !downloaded ? (
              <p className="text-xs font-semibold text-brass">{t('staff.bulkCodesKeepOpen')}</p>
            ) : null}

            {downloaded ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <Check size={14} weight="bold" />
                {t('staff.bulkCodesDownloaded')}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="rounded-shell border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    </Modal>
  );
}
