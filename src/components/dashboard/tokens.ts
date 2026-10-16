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

/**
 * Accent slots. The NAMES are a fixed vocabulary — 163 `accent="…"` props pass
 * them — but each now resolves to a Chalk & Brass SERIES token rather than a
 * literal hex, so icon chips, trend pills and sparklines retint with the theme
 * instead of freezing the light-mode value.
 *
 * `chip`/`icon` are class pairs (they go through `bg-series-N/10`, so alpha
 * works), and `seriesVar` is for the two places that must hand a colour to SVG:
 * a CSS `stroke` accepts `hsl(var(…))`, an SVG attribute does not.
 */
export type AccentName = 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose' | 'sky' | 'gray';

export interface Accent {
  chip: string;
  icon: string;
  seriesVar: string;
}

export const ACCENTS: Record<AccentName, Accent> = {
  emerald: { chip: 'bg-series-3/10', icon: 'text-series-3', seriesVar: '--series-3' },
  cyan: { chip: 'bg-series-8/10', icon: 'text-series-8', seriesVar: '--series-8' },
  sky: { chip: 'bg-series-5/10', icon: 'text-series-5', seriesVar: '--series-5' },
  violet: { chip: 'bg-series-2/10', icon: 'text-series-2', seriesVar: '--series-2' },
  amber: { chip: 'bg-series-1/10', icon: 'text-series-1', seriesVar: '--series-1' },
  rose: { chip: 'bg-series-6/10', icon: 'text-series-6', seriesVar: '--series-6' },
  gray: { chip: 'bg-series-7/10', icon: 'text-series-7', seriesVar: '--series-7' },
};

export const CARD_CLASS =
  'bg-card rounded-shell border border-hairline p-5 md:p-6';

export const CARD_HOVER_CLASS =
  'bg-card rounded-shell border border-hairline p-5 md:p-6 hover:border-brass-soft transition-colors duration-200';

/** A card that IS the button (KPI tiles, action panels): hover states + pointer. */
export const CARD_CLICKABLE_CLASS =
  'bg-card rounded-shell border border-hairline p-5 md:p-6 cursor-pointer hover:border-brass-soft transition-colors duration-200';
