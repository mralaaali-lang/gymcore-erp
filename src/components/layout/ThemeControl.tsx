import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, CircleHalf as MonitorSmartphone, Check, CaretDown } from '@phosphor-icons/react';
import { useTheme, type ThemePreference } from '../../context/ThemeContext';

const OPTIONS: { value: ThemePreference; icon: typeof Sun; ar: string; en: string }[] = [
  { value: 'light', icon: Sun, ar: 'فاتح', en: 'Light' },
  { value: 'dark', icon: Moon, ar: 'داكن', en: 'Dark' },
  { value: 'system', icon: MonitorSmartphone, ar: 'تلقائي', en: 'System' },
];

/**
 * ThemeControl — the shell's palette picker.
 *
 * Lives in the top bar next to the language toggle because that is the one row
 * every portal (owner, platform, trainer) already treats as "my view settings".
 * A menu rather than a two-state switch: `system` is a real preference, and a
 * toggle would either drop it or hide it behind a long-press.
 *
 * The trigger shows the *resolved* palette (what is on screen), while the check
 * mark follows the stored preference — so choosing "تلقائي" on an OS in dark
 * mode still shows a moon, which is what the user is actually looking at.
 */
export default function ThemeControl() {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const TriggerIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('السمة', 'Appearance')}
        className="flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white rounded-full px-3 py-2.5 font-bold transition-all duration-200"
      >
        <TriggerIcon size={18} weight="duotone" />
        <CaretDown size={12} weight="bold" className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full mt-2 w-44 bg-card border border-hairline rounded-shell shadow-lg overflow-hidden z-50"
        >
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                  active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <Icon size={17} weight={active ? 'fill' : 'regular'} className="shrink-0" />
                <span className="flex-1 text-start">{t(opt.ar, opt.en)}</span>
                {active && <Check size={15} weight="bold" className="text-brass shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
