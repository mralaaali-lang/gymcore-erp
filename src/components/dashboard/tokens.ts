/**
 * Dashboard Design Kit — canonical visual language for every dashboard surface.
 *
 * Shell language: **Chalk & Brass** (bone paper, warm graphite ink, hairline
 * rules, emerald reserved for action, brass for the meta accent). All values
 * come from `src/styles/tokens.css` through the shadcn colour interface — a
 * component must never hardcode a hex or a Tailwind palette colour here.
 *
 * Rules (do NOT deviate):
 * - Page container: `space-y-6` (AppLayout supplies bg/padding — do NOT set bg here)
 * - Cards: `CARD_CLASS` — flat paper: `bg-card rounded-shell border border-hairline p-5 md:p-6`.
 *   No shadow: the Chalk & Brass shell gets its depth from the border and the
 *   bone/white contrast between `--background` and `--card`, not from blur.
 * - Titles: `text-2xl md:text-3xl font-bold text-foreground tracking-tight`
 * - Subtitles: `text-sm text-muted-foreground`
 * - Section titles: `text-lg font-bold text-foreground`
 * - Table cells: inherit `--table-fg` (graphite) via the global `table` rule in
 *   `index.css`; never set `text-gray-900` / a near-black on a `<td>`.
 * - Primary action: `bg-primary text-primary-foreground` / Secondary: `bg-card border border-input`
 * - Meta accent (rings, dividers, "premium" marks): `text-brass` / `border-brass-soft`
 *
 * Legacy pages still carry `bg-white` / `text-gray-900` / `border-gray-100`.
 * Those are a colour-only codemod tranche, not a reason to write new classes
 * in the old palette.
 */

/** Data-series palette for charts and KPI tints — identity-free, do not treat as brand. */
export type AccentName = 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose' | 'sky' | 'gray';

export const ACCENTS: Record<AccentName, { solid: string; soft: string }> = {
  cyan: { solid: '#06b6d4', soft: '#cffafe' },
  emerald: { solid: '#10b981', soft: '#d1fae5' },
  violet: { solid: '#8b5cf6', soft: '#ede9fe' },
  amber: { solid: '#f59e0b', soft: '#fef3c7' },
  rose: { solid: '#f43f5e', soft: '#ffe4e6' },
  sky: { solid: '#0ea5e9', soft: '#e0f2fe' },
  gray: { solid: '#6b7280', soft: '#f3f4f6' },
};

export const CARD_CLASS =
  'bg-card rounded-shell border border-hairline p-5 md:p-6';

export const CARD_HOVER_CLASS =
  'bg-card rounded-shell border border-hairline p-5 md:p-6 hover:border-brass-soft transition-colors duration-200';
