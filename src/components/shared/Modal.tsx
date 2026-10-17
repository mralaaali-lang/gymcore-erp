import type { ReactNode } from 'react';
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
 * that except one thing, measured in Chromium on 2026-10-17 (see
 * LOCAL_TESTING_REPORT §موجة 2): background isolation comes as
 * `aria-hidden="true"` on `#root` from `hideOthers`, NOT as `aria-modal` —
 * `@radix-ui/react-dialog@1.3.1` calls that its "better supported equivalent",
 * so do not grep for `aria-modal` when auditing a dialog. What Radix does NOT
 * do here is return focus to the opener: because `react-remove-scroll` moves
 * focus inside the dialog before `FocusScope` reads `document.activeElement`,
 * the element it stores to restore is the dialog's own field, and after unmount
 * `.focus()` on a detached node drops the caret to `<body>`. Verified with
 * trusted `Enter`/`Escape` on a real `DataTable` row. Fixing it means capturing
 * the opener in this component, which is an owner decision — 38 modals share it.
 *
 * Shell rules this component enforces (see AGENT_HANDOVER §5 بند 1هـ):
 * - centred, never a side drawer;
 * - `bg-card` + `border-hairline` + `rounded-shell`, no shadow — depth from the
 *   keyline;
 * - every colour from a token, so dark mode retints it with no page change.
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
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !disableDismiss) onClose();
      }}
    >
      <DialogContent
        // `description` is optional and, when omitted, nothing is passed for
        // `aria-describedby`: Radix only emits the attribute once a
        // `Dialog.Description` has registered (verified in the installed
        // dist — `descriptionPresent ? concat(...) : ariaDescribedby`). An
        // `aria-describedby` pointing at an element that does not exist would
        // be worse than no description at all.
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
