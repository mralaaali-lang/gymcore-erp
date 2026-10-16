import { useTranslation } from 'react-i18next';
import { Sun, Moon, CircleHalf as MonitorSmartphone, CaretDown } from '@phosphor-icons/react';
import { useTheme, type ThemePreference } from '../../context/ThemeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../shadcn/dropdown-menu';

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
 *
 * The panel is Radix's DropdownMenu (Phase 4), which replaced a hand-rolled
 * `mousedown` + `Escape` listener pair here: arrow keys, `menuitemradio`,
 * focus return to the trigger and outside-dismiss come from the primitive.
 */
export default function ThemeControl() {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const TriggerIcon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('السمة', 'Appearance')}
          className="group flex items-center gap-1 bg-white/15 hover:bg-white/25 text-white rounded-full px-3 py-2.5 font-bold transition-all duration-200"
        >
          <TriggerIcon size={18} weight="duotone" />
          {/* `data-state` lands on Radix's trigger, so the chevron reads it
              through the group rather than its own attribute. */}
          <CaretDown size={12} weight="bold" className="transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44 p-1">
        <DropdownMenuRadioGroup value={theme}>
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.value;
            return (
              <DropdownMenuRadioItem key={opt.value} value={opt.value} onSelect={() => setTheme(opt.value)}>
                <Icon size={17} weight={active ? 'fill' : 'regular'} className="shrink-0" />
                <span className="flex-1 text-start">{t(opt.ar, opt.en)}</span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
