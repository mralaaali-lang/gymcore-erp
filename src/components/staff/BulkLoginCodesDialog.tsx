import { useRef, useState } from 'react';
import { Check, DownloadSimple, WhatsappLogo } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import Modal from '../shared/Modal';
import { useApp } from '../../context/GymBrandContext';
import { bulkMemberLoginCodes, bulkStaffLoginCodes, type IssuedLoginCode } from '../../services/api';
import { toWhatsAppNumber } from '../members/MemberContact';

type Scope = 'staff' | 'members';

interface BulkLoginCodesDialogProps {
  open: boolean;
  onClose: () => void;
  scope: Scope;
}

/** Chunk size — matches the server's cap (200) with headroom for the bcrypt budget. */
const CHUNK = 100;
const MAX_CHUNKS = 500;
/** WhatsApp links rendered inline; beyond this the CSV is the artifact that scales. */
const LIST_CAP = 200;

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
 * Delivery is Click-to-Chat: each row opens WhatsApp Web with that person's code
 * already typed (the same link the single-code dialog uses). A provider on the
 * server cannot stand in for it — only the hash is stored, so it could only send
 * a code that is *not* the one on screen. The CSV stays the artifact for a real
 * batch: messaging thousands of numbers one by one is what gets a number
 * blocked, so the links are capped rather than pretending to be a campaign.
 */
export default function BulkLoginCodesDialog({ open, onClose, scope }: BulkLoginCodesDialogProps) {
  const { t } = useTranslation();
  const { language } = useApp();
  const rtl = language === 'ar';

  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<IssuedLoginCode[]>([]);
  const [skipped, setSkipped] = useState(0);
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
        const res = await fetchChunk(CHUNK);
        const data = res.data;

        collected.push(...data.generated);
        setRows([...collected]);
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
      onClose();
    }
  };

  /** Click-to-Chat for one row. Without a stored number the chat opens on the
   *  prefilled text and WhatsApp asks the desk which contact to send it to. */
  const waHref = (row: IssuedLoginCode) => {
    const intl = toWhatsAppNumber(row.phone || '');
    const text = encodeURIComponent(t('staff.waMessage', { name: row.name, code: row.code }));
    return intl ? `https://wa.me/${intl}?text=${text}` : `https://wa.me/?text=${text}`;
  };

  const withoutPhone = rows.filter((r) => !r.phone).length;
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

        {rows.length ? (
          <div className="overflow-hidden rounded-shell border border-hairline">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-hairline bg-surface-container-low px-3 py-2">
              <p className="text-xs font-semibold text-foreground">{t('staff.bulkCodesList')}</p>
              <p className="text-[11px] text-muted-foreground">{t('staff.bulkCodesListHint')}</p>
            </div>
            <div className="max-h-64 divide-y divide-hairline overflow-y-auto">
              {rows.slice(0, LIST_CAP).map((row, i) => (
                <div key={`${row.name}-${row.code}-${i}`} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{row.name}</p>
                    <p dir="ltr" className="truncate text-[11px] text-muted-foreground">
                      {row.phone || '—'}
                    </p>
                  </div>
                  <p dir="ltr" className="font-mono text-sm font-bold tracking-[0.2em] text-primary">
                    {row.code}
                  </p>
                  <a
                    href={waHref(row)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('staff.sendWhatsapp')}
                    aria-label={t('staff.sendWhatsapp')}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-500 text-white transition-colors hover:bg-green-600"
                  >
                    <WhatsappLogo size={16} weight="fill" />
                  </a>
                </div>
              ))}
            </div>
            {rows.length > LIST_CAP ? (
              <p className="border-t border-hairline bg-surface-container-low px-3 py-2 text-[11px] leading-relaxed text-brass">
                {t('staff.bulkCodesListMore', { count: rows.length - LIST_CAP })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
