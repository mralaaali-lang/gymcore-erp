import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from '@phosphor-icons/react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Radix DropdownMenu — the accessible base for the row `⋯` menus that Phase 4
 * was hand-rolling one `useState<string | null>(openId)` + scrim at a time.
 *
 * Positioning is logical, not literal: `align="start"` follows the `dir`
 * attribute on `<html>` (set by GymBrandContext), so an RTL menu opens to the
 * right of its trigger without a `left-0`/`right-0` fork in every page. Radix
 * also portals the panel and flips it on collision, which a table cell with
 * `overflow-hidden` ancestors cannot do on its own.
 *
 * Shell matches Modal: `bg-card` + `border-hairline` + `rounded-shell`, depth
 * from the keyline, every colour from a token so dark mode retints it free.
 */
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[11rem] overflow-hidden rounded-shell border border-hairline bg-card p-1 text-card-foreground',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

/**
 * `variant="danger"` is the only reason this wraps the primitive: the delete
 * row used to repeat `hover:bg-red-50 text-red-600` in every page, which is a
 * pastel literal that dark mode cannot retint. `--series-6` is the token the
 * bridge already uses for red-ish chips.
 */
const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { variant?: 'default' | 'danger' }
>(({ className, variant = 'default', ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none',
      'transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      variant === 'danger'
        // `/10` and not `/12`: this Tailwind build does not emit an alpha
        // modifier that is outside the opacity scale, so the rule silently
        // disappeared (measured in the built CSS) and the row had no hover
        // wash at all. `/10` is the step every other chip in the shell uses.
        ? 'text-series-6 focus:bg-series-6/10 data-[highlighted]:bg-series-6/10'
        : 'text-foreground focus:bg-muted data-[highlighted]:bg-muted',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

function DropdownMenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('my-1 h-px bg-hairline', className)}
      {...props}
    />
  );
}

function DropdownMenuLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-3 py-1.5 text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * Radio pair — for menus that choose one value out of a set (the palette
 * picker) rather than fire an action. Radix supplies `menuitemradio` +
 * `aria-checked`; the indicator is ours because the primitive renders none.
 */
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2.5 rounded-lg py-2.5 pe-3 ps-8 text-sm outline-none',
      'transition-colors text-foreground focus:bg-muted data-[highlighted]:bg-muted',
      className,
    )}
    {...props}
  >
    {children}
    <span className="ms-auto shrink-0 text-brass">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check size={15} weight="bold" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
};
