import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * shadcn/Aceternity `Button`.
 *
 * Lives in `src/components/shadcn/` (lower-case, one file per primitive) and
 * never overwrites the legacy `src/components/ui/Button.tsx`. Both coexist
 * during the migration; new code and every Aceternity component should import
 * this one.
 *
 * Colour comes only from the tokens in `src/styles/tokens.css` — no hex, no
 * Tailwind palette colour — so dark mode (Phase 3) is a palette swap, not a
 * code change. Radius uses `rounded-lg`, which this project's theme maps to
 * 1rem, i.e. exactly `--radius`.
 */
const buttonVariants = cva(
  // Base: layout, focus ring, disabled + press behaviour.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-label-md font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-card text-card-foreground shadow-sm hover:bg-muted',
        muted: 'bg-muted text-card-foreground hover:bg-muted/80',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-card-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5 py-2.5',
        sm: 'h-9 rounded-lg px-3.5 text-caption',
        lg: 'h-12 rounded-lg px-7',
        icon: 'h-10 w-10 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the single child element instead of a `<button>` (asChild). */
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
