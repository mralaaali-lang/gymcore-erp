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

  // Chalk & Brass shell extras: hairline rules, the two meta accents, and the
  // table pair — cell text is a softer graphite than `foreground`, and headers
  // are micro-labels. Nothing here is a button colour.
  hairline: v('hairline'),
  brass: { DEFAULT: v('brass'), soft: v('brass-soft') },
  pine: v('pine'),
  'table-fg': v('table-fg'),
  'table-head': v('table-head'),
  // Tertiary ink for hints/placeholder icons — AA in both themes, but reserved
  // for non-essential type (body text stays `muted-foreground`).
  'ink-faint': v('ink-faint'),

  // Data-series ladder: utilities for DOM chips (`bg-series-3/15`), and the
  // single source apexcharts reads through `chartTheme.ts`.
  'series-1': v('series-1'),
  'series-2': v('series-2'),
  'series-3': v('series-3'),
  'series-4': v('series-4'),
  'series-5': v('series-5'),
  'series-6': v('series-6'),
  'series-7': v('series-7'),
  'series-8': v('series-8'),

  // Re-points for the MD3-era names that `tailwind-tokens.js` defines as cold
  // hex literals. Spreading this file last in tailwind.config.js means the hex
  // values become fallbacks that no class can reach: `bg-surface-container-high`
  // and `text-on-surface` now follow the shell (warm bone/graphite) in both
  // themes, with no edit at any of the ~75 call sites.
  //
  // Written FLAT, one key per legacy key, on purpose: nesting these as objects
  // would make Tailwind flatten `surface.containerHigh` into `surface-container-*`
  // too, and two spellings of the same utility resolve from two different sources.
  surface: v('surface'),
  'surface-dim': v('surface-dim'),
  'surface-bright': v('surface-container-low'),
  'surface-variant': v('surface-variant'),
  'surface-container-lowest': v('surface-container-lowest'),
  'surface-container-low': v('surface-container-low'),
  'surface-container': v('surface-container'),
  'surface-container-high': v('surface-container-high'),
  'surface-container-highest': v('surface-container-highest'),
  'on-surface': v('on-surface'),
  'on-surface-variant': v('on-surface-variant'),
  'inverse-surface': v('inverse-surface'),
  'inverse-on-surface': v('inverse-on-surface'),
  outline: v('outline'),
  'outline-variant': v('outline-variant'),

  // Auth console identity. Not shadcn names — these are the project's own,
  // exposed the same way so `bg-auth-accent/5` and `from-auth-accent/40`
  // work with correct alpha instead of `bg-[#06b6d4]/5`.
  'auth-accent': v('auth-accent'),
  'auth-accent-strong': v('auth-accent-strong'),
  'auth-accent-deep': v('auth-accent-deep'),
  'auth-amber': v('auth-amber'),
};
