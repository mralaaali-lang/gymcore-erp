import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Token-driven `<input>`. Border/focus come from `--input` and `--ring`, so
 * the field reads correctly on both the light surface and the Obsidian
 * palette without a second set of classes.
 */
const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-lg border border-input bg-card px-3.5 py-2 text-body-md text-card-foreground shadow-sm transition-colors',
        'placeholder:text-muted-foreground',
        'file:border-0 file:bg-transparent file:text-label-md file:font-semibold file:text-card-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        '[type=number]:tabular-nums',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
