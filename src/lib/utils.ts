import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Class-name joiner used by every shadcn / Aceternity component.
 *
 * `clsx` handles conditionals, `twMerge` resolves real conflicts so a caller
 * can override a component's own spacing (`"p-4"` + `"p-0"` → `p-0`) instead
 * of shipping both rules and losing to CSS order.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
