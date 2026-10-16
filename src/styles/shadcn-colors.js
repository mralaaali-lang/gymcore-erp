/**
 * shadcn / Aceternity colour interface — maps the utility-class names those
 * components are written against onto the CSS variables in `tokens.css`.
 *
 * `<alpha-value>` is what lets `bg-primary/10` work: Tailwind substitutes it
 * with the modifier, so the variable must stay a bare HSL triplet.
 *
 * Four names already exist in the MD3-style palette (`background`, `primary`,
 * `secondary`, `accent`). They are re-pointed here at variables holding the
 * SAME values, so no screen changes appearance — this file only adds the
 * names the shared-component ecosystem expects.
 */
const v = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export const shadcnColors = {
  background: v('background'),
  foreground: v('foreground'),
  card: { DEFAULT: v('card'), foreground: v('card-foreground') },
  popover: { DEFAULT: v('popover'), foreground: v('popover-foreground') },
  primary: { DEFAULT: v('primary'), foreground: v('primary-foreground') },
  secondary: { DEFAULT: v('secondary'), foreground: v('secondary-foreground') },
  muted: { DEFAULT: v('muted'), foreground: v('muted-foreground') },
  accent: { DEFAULT: v('accent'), foreground: v('accent-foreground') },
  destructive: { DEFAULT: v('destructive'), foreground: v('destructive-foreground') },
  border: v('border'),
  input: v('input'),
  ring: v('ring'),
};
