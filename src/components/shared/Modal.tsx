import { useRef, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog';
import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Always rendered — Radix warns (and screen readers get lost) without a title. */
  title: ReactNode;
  /** Optional. When omitted, `aria-describedby` is dropped instead of pointing at nothing. */
  description?: ReactNode;
  children: ReactNode;
  /** md covers a small form, lg a table or a receipt, xl the wide search panels. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Sticky action row at the bottom of the panel. */
  footer?: ReactNode;
  /** Escape / scrim close stays enabled by default; block it while a mutation is in flight. */
  disableDismiss?: boolean;
  /** Merged with `tailwind-merge`, so `max-w-*` here overrides `size`. */
  className?: string;
  /**
   * Text direction of the panel, passed explicitly instead of inherited.
   *
   * The panel is portalled to `<body>`, so the only thing that would otherwise
   * decide its direction is `<html dir>` — document state this component does
   * not own. Measured in Chromium on 2026-10-17 (LOCAL_TESTING_REPORT §50): with
   * `<html dir="ltr">` forced while the app language was still `ar`, the panel
   * kept `direction: rtl` and `dir="rtl"` because of this prop; omit it and the
   * same panel flips with the document.
   *
   * Correction to what an earlier revision of this comment claimed: `<html dir>`
   * is NOT pinned by `index.html` forever, and `AppLayout` is not the only writer
   * — `AppProvider` rewrites `document.documentElement.dir`/`.lang` on every
   * language change (`src/context/GymBrandContext.tsx:103-106`, since `ccc7287`),
   * so ar/en does retint portalled panels on its own. The prop stays necessary for
   * the other half of the problem: the panel is outside every page container, so
   * its direction is decided by a value no component in the dialog's own render
   * tree owns — the pre-hydration value from `index.html` and whatever
   * `AppProvider` last wrote. Pinning it from the same `rtl` flag that picks the
   * panel's strings keeps direction and copy from ever disagreeing.
   * The hand-rolled panels this replaced each carried an explicit
   * `dir={rtl ? 'rtl' : 'ltr'}` for the same reason; the conversion keeps parity.
   */
  dir?: 'rtl' | 'ltr';
}

/** The four widths the legacy panels actually used: 24 / 28 / 32 / 42rem. */
const SIZES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

/**
 * Modal — the one centred popup the product uses, on Radix Dialog.
 *
 * It exists because 38 files were carrying the same hand-rolled block:
 *
 *     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
 *          onClick={close}>
 *       <div className="bg-white rounded-2xl …">{form}</div>
 *     </div>
 *
 * That markup centres the panel (good) and nothing else: Tab walks out of the
 * dialog into the page behind it, Escape does nothing, the scrim is a click
 * target rather than a dismissal affordance, the background stays readable to a
 * screen reader, and the page keeps scrolling underneath. Radix supplies all of
 * it, with two measured caveats (Chromium, 2026-10-17 — LOCAL_TESTING_REPORT
 * §موجة 2): background isolation arrives as `aria-hidden="true"` on `#root` from
 * `hideOthers`, NOT as `aria-modal`, so do not grep for `aria-modal` when
 * auditing a dialog; and Radix does not return focus to the opener on its own,
 * which is what the capture/restore below is for.
 *
 * Shell rules this component enforces (see AGENT_HANDOVER §5 بند 1هـ):
 * - centred, never a side drawer;
 * - `bg-card` + `border-hairline` + `rounded-shell`, no shadow — depth from the
 *   keyline;
 * - every colour from a token, so dark mode retints it with no page change;
 * - `dir` is a prop, not an inference from `index.html` (see `ModalProps.dir`).
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  footer,
  disableDismiss = false,
  className = '',
  dir,
}: ModalProps) {
  /*
   * Radix's own "return focus to what opened me" does not work for a dialog
   * opened by state, which is every dialog in this app. Measured in Chromium on
   * 2026-10-17 with trusted Enter/Escape on a real `DataTable` row: after the
   * close, `document.activeElement` was `<body>` at every sample from 150ms to
   * 900ms. The cause is a race inside the library — `react-remove-scroll` moves
   * focus into the dialog from a layout effect, and `FocusScope` then reads
   * `document.activeElement` as "the element to come back to", so it stores one
   * of the dialog's own nodes; `.focus()` on a detached node is a silent no-op
   * and the caret lands on the body. A keyboard user therefore restarts the Tab
   * walk from the top of the document after every popup.
   *
   * The opener is captured here, during render, the first time this dialog is
   * seen open: the portal has not mounted yet, so `document.activeElement` is
   * still the button or row the user just activated. Restoring happens from
   * `onCloseAutoFocus`, which is Radix's own unmount hook (`FocusScope
   * onUnmountAutoFocus`) — `preventDefault()` opts out of the broken restore
   * instead of racing it with a timer.
   *
   * `wasOpenRef` starts at `false`, not at `open`, because the product mounts
   * popups in two different shapes and both have to work. Measured in Chromium
   * on 2026-10-17 (LOCAL_TESTING_REPORT §49): `MembersPage` renders
   * `{editing && <EditMemberModal …>}`, so `Modal`'s FIRST render already has
   * `open === true`; initialising the ref to `open` made the flip test never
   * fire, nothing was captured, and after Escape the caret fell back to `<body>`
   * — i.e. the fix shipped in `78718c2` was silently inert for the dominant
   * pattern. A persistently mounted `<Modal open={flag}>` (the other shape)
   * still relies on the flip, which `false` preserves.
   */
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current) {
    const active = document.activeElement;
    openerRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }
  wasOpenRef.current = open;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !disableDismiss) onClose();
      }}
    >
      <DialogContent
        dir={dir}
        // `description` is optional and, when omitted, nothing is passed for
        // `aria-describedby`: Radix only emits the attribute once a
        // `Dialog.Description` has registered (verified in the installed
        // dist — `descriptionPresent ? concat(...) : ariaDescribedby`). An
        // `aria-describedby` pointing at an element that does not exist would
        // be worse than no description at all.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = openerRef.current;
          openerRef.current = null;
          // A row removed by the mutation that just completed is no longer in
          // the document; focusing it would repeat the body-drop this fixes.
          if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
        }}
        className={cn(
          'gap-4 overflow-y-auto rounded-shell border border-hairline bg-card p-5 shadow-none md:p-6',
          SIZES[size],
          className,
        )}
      >
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-[17px] font-extrabold tracking-tight text-foreground">
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="text-[13px] text-muted-foreground">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="min-w-0 flex-1">{children}</div>

        {footer ? (
          <div className="flex flex-col-reverse gap-3 border-t border-hairline pt-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
