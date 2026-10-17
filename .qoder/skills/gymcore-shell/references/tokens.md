# Shell token reference

Single source: `src/styles/tokens.css` (bare HSL triplets so `bg-x/10` works).
Utility names: `src/styles/shadcn-colors.js`. Legacy hex/typography/geometry:
`src/styles/tailwind-tokens.js` (spread **before** `shadcnColors` in
`tailwind.config.js`, so the shell names win).

## Light (Chalk & Brass) / Dark (Court Green)

| Variable | Utility | Light | Dark | Use for |
| --- | --- | --- | --- | --- |
| `--background` | `bg-background` | `#f5f3ee` bone | `#12241d` | app canvas (AppLayout only) |
| `--card` | `bg-card` | `#fffdf9` paper | `#172c24` | every panel, tile, field |
| `--foreground` | `text-foreground` | `#2b2620` | `#eef0e8` | titles, primary text |
| `--muted-foreground` | `text-muted-foreground` | `#665f54` (6.21:1) | `#93a89d` | subtitles, secondary text |
| `--ink-faint` | `text-ink-faint` | `#8b8478` (3.42:1) | `#86a08f` | placeholders, hint icons — never body copy |
| `--hairline` | `border-hairline` | `#efe9dd` | `#2e4a3e` | card edge, row separators |
| `--input` / `--border` | `border-input` | `#e2ddd2` | `#2e4a3e` | form fields |
| `--brass` | `text-brass` | `#a67c2e` | `#d8b26a` | meta accent (marks, premium) |
| `--brass-soft` | `border-brass-soft` | `#f0e6d2` | `#6b5a33` | hover keyline, active mark |
| `--pine` | `text-pine` | `#1f3a2e` | `#93a89d` | brand mark only |
| `--primary` | `bg-primary` / `text-primary` | `#10b981` | `#10b981` | the one action colour |
| `--secondary` | `bg-secondary` | `#006c49` | `#22382e` | deep action fill |
| `--destructive` | `bg-destructive` | `#ba1a1a` | `#f87171` | delete / loss |
| `--ring` | `ring-ring` | `#10b981` | `#10b981` | focus ring |
| `--table-fg` | `text-table-fg` | `#4a4239` | `#eef0e8` | `<td>` (also applied by the global `table` rule) |
| `--table-head` | `text-table-head` | `#665f54` | `#93a89d` | `<th>` micro-labels |
| `--radius` | `rounded-shell` | `0.625rem` | same | all radii on migrated surfaces |

Surface ladder (warm fills, no shadow): `bg-surface-container-lowest`
`#fffdf9` → `-low` `#faf8f3` → (default) `#f1ede4` → `-high` `#e2ddd2` →
`-highest` `#cfc8b9`. Dark mirrors at `#172c24 / #1a3129 / #20362c / #22382e /
#2e4a3e`. `bg-muted` = `surface-container`. `--outline` `#d5cec0`,
`--outline-variant` = hairline.

Data series (every value clears ≥3:1 against `--card`, measured 3.39–12.14, so
they are legal as SVG marks under WCAG 1.4.11):

| Token | Light | Meaning | `ACCENTS` name |
| --- | --- | --- | --- |
| `--series-1` | `#a67c2e` brass | meta / premium | `amber` |
| `--series-2` | `#1f3a2e` pine | deep / total | `violet` |
| `--series-3` | `#2f7d5f` turf | growth | `emerald` |
| `--series-4` | `#b4562f` clay | warm warning | — |
| `--series-5` | `#7f8f76` sage | neutral | `sky` |
| `--series-6` | `#8c2f3a` oxblood | loss | `rose` |
| `--series-7` | `#4a4239` graphite | inactive | `gray` |
| `--series-8` | `#56636f` slate | secondary series | `cyan` |

The `ACCENTS` names are a frozen vocabulary (163 `accent="…"` props). Only the
values behind them changed. For SVG attributes use `ACCENTS[x].seriesVar` with
`style={{ stroke: 'hsl(var(…))' }}` — an SVG *attribute* cannot parse
`hsl(var())`.

## Auth console

`--auth-accent` `#06b6d4`, `-strong` `#0891b2`, `-deep` `#0e7490`,
`--auth-amber` `#f59e0b`, backgrounds `--auth-bg-1..4`, gradients
`--auth-root-bg` / `--auth-cta-bg`. The unauthenticated area (login, team-login,
forgot/reset) paints from these **and nothing else**. Utilities:
`bg-auth-accent/5`, `from-auth-accent/40`.

`--obsidian-700…950` are raw hex on purpose: literal gradient/shadow stops.

## Legacy → shell (codemod table)

Old pages carry the MD3-era cool grays and the emerald shortcuts. Replace on
touch, one file at a time:

| Legacy | Shell |
| --- | --- |
| `bg-white` | `bg-card` |
| `bg-gray-50` | `bg-surface-container-low` |
| `bg-gray-100` | `bg-muted` |
| `text-gray-900` | `text-foreground` |
| `text-gray-600` / `text-gray-500` | `text-muted-foreground` |
| `text-gray-400` / `placeholder:text-gray-400` | `text-ink-faint` |
| `border-gray-100` | `border-hairline` |
| `border-gray-200` | `border-input` |
| `text-emerald-600` / `text-emerald-700` | `text-primary` |
| `bg-emerald-500` | `bg-primary` |
| `bg-emerald-50` | `bg-primary/10` |
| `border-emerald-200` | `border-primary/30` |
| `focus:ring-emerald-500` | `focus:ring-2 focus:ring-ring` |
| `rounded-2xl` / `rounded-3xl` | `rounded-shell` |
| `shadow-sm` / `shadow-lg` on a card | *(delete — the shell has no card shadow)* |
| `bg-surface-container-high`, `text-on-surface`, … | already re-pointed: these legacy **names** now resolve to warm shell values, so leave the call sites and never re-add the hex |

`src/components/ui/Button.tsx` and `Card.tsx` still carry pre-token literals —
known debt, scheduled as its own tranche. Do not "fix" them as a side effect of
a feature commit.

## Shared primitives to reuse

- `Panel` (`src/components/dashboard/Panel.tsx`) — card + optional header with
  icon chip, title, subtitle, actions. Action cards must use this, not a raw div.
- `tokens.ts` — `CARD_CLASS`, `CARD_HOVER_CLASS`, `CARD_CLICKABLE_CLASS`,
  `ACCENTS`, `AccentName`.
- `DataTable`, `StatsGrid`, `UnifiedTabs`, `StatusBadge`, `PageLoader` — the
  shared surface layer; check for one before hand-rolling markup.
- AppLayout supplies page background and padding: a page container is
  `space-y-6` and must never set its own `bg-*`.
