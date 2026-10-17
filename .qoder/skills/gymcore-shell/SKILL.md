---
name: gymcore-shell
description: GymCore ERP's Chalk & Brass UI shell plus the repo's delivery ritual. Use when editing any screen, component, or stylesheet in this repo (src/pages, src/components, src/styles), when migrating legacy Tailwind colours to shell tokens, when working on Arabic/RTL surfaces or touch-target sizing, when writing an honest empty state or replacing mock data, and before committing any UI milestone. Also use for the verification routine (tsc/build/live browser) and the handover docs (LOCAL_TESTING_REPORT.md, AGENT_HANDOVER.md) and the owner's push/deploy gate.
---

# GymCore shell & delivery

## Overview

Turns this repo's unwritten conventions into loadable rules: one colour source
(the Chalk & Brass shell tokens), one touch/typography rule for Arabic RTL
surfaces, a zero-mock data policy, and a one-milestone / one-verified-commit
ritual. The shell exists because the app was written against a Material-3-era
cold palette; the job of every edit is to move it toward the token vocabulary
without breaking behaviour.

## Colour: one source, no literals

Every colour resolves from `src/styles/tokens.css` (bare HSL triplets) through
the utility names mapped in `src/styles/shadcn-colors.js`. Never write a hex,
an RGB value, or a Tailwind palette colour (`gray-500`, `emerald-600`,
`white`) in a component.

Canonical vocabulary (light + dark both come from the same variable):

| Need | Class |
| --- | --- |
| Page / surface | `bg-background`, `bg-card`, `bg-surface-container-low` |
| Ink | `text-foreground`, `text-muted-foreground`, `text-ink-faint` |
| Rules | `border-hairline` (card edge), `border-input` (fields), `border-brass-soft` (meta accent) |
| Action | `bg-primary text-primary-foreground`; secondary = `bg-card border border-input` |
| Danger | `bg-destructive text-destructive-foreground` |
| Focus | `ring-2 ring-ring` (never `ring-emerald-500`) |
| Data series | `bg-series-N/10`, `text-series-N` (N = 1..8) |
| Radius | `rounded-shell` (= `var(--radius)`) |

Cards use `CARD_CLASS` from `src/components/dashboard/tokens.ts`
(`bg-card rounded-shell border border-hairline p-5 md:p-6`) — flat paper,
**no shadow**: depth comes from the border and the bone/white contrast, not blur.
Accent props (`accent="cyan" | "emerald" | …`) are a fixed vocabulary of 163 call
sites; they resolve to `ACCENTS[…]` series tokens, so never swap a name for a hex.

SVG is the one exception: an SVG *attribute* cannot take `hsl(var(--x))`. Use
`ACCENTS[…].seriesVar` and set `style={{ stroke: 'hsl(var(--series-3))' }}`.

Dark mode is `.dark` on `<html>` (`tokens.css:130`, toggled by
`ThemeContext.tsx:60`). Anything that reads a token retints for free; anything
that hardcodes a colour is a dark-mode bug.

Run the audit before committing a UI change:

```bash
node .qoder/skills/gymcore-shell/scripts/audit-shell-colors.mjs src/pages/gym-admin/SalesPage.tsx
```

Prefer fixing the file you are already touching. Do not open a new file purely
to colour-mod it — the legacy palette is a planned tranche, not a free-for-all.

## Typography, RTL, touch targets

- Type scale lives in `src/styles/tailwind-tokens.js`: `text-headline-xl/lg/md`,
  `text-body-lg/md`, `text-label-md`, `text-caption`. Page titles use
  `text-2xl md:text-3xl font-bold text-foreground tracking-tight`; subtitles
  `text-sm text-muted-foreground`.
- Arabic is the primary language. Root pages set `dir={rtl ? 'rtl' : 'ltr'}`
  from `useApp().language`; use logical utilities (`ps-`/`pe-`, `text-start`,
  `ms-auto`) instead of `pl-`/`pr-`/`text-left` on any surface that can flip.
- Dates, phone numbers, money and IDs stay `<span dir="ltr">`.
- §34و: mobile is a 16px-text / 48px-touch surface. Density may still step down
  (`text-base md:text-sm`), but on touch surfaces (POS, check-in, kiosk) keep
  interactive elements ≥48px at **every** breakpoint and say so in the handover
  when it deviates from the desktop norm.
- Table cells inherit `--table-fg` through the global `table` rule; never set
  `text-gray-900` on a `<td>`. Headers are `--table-head` micro-labels.
- Modals open **centered** — never a side drawer. Check-in stays open in
  continuous mode with a session counter. Gym identity lives only in the
  sidebar brand; do not repeat it inside page cards.

## Data honesty

Zero mock or hardcoded data anywhere in product code — no placeholder arrays,
no invented stats, no `setTimeout` pretending to be an API. If a screen needs
data that has no endpoint, build the endpoint (real SQL, real aggregate) or
render an honest empty state that routes to where the data is actually created
(e.g. the POS empty state navigates to `/admin/products`).

Never label a value with a unit it does not have: a count rendered as money, or
a sum rendered as a count, is a bug even when the number is right. Server
aggregates are the source of truth for totals; do not recompute them client-side.

## Verification ritual

A UI milestone is not done until all four hold:

1. `npx tsc --noEmit -p tsconfig.json` → 0 errors (`noUnusedLocals` is on).
2. `npx vite build` → succeeds.
3. Live check in a browser against the real stack, with measured numbers
   (heights, computed colours, request bodies, response codes) — not "looks good".
4. Probe data created for the check gets deleted afterwards, and any residue
   that *cannot* be deleted is declared in the report.

Read `references/verification.md` before measuring anything in a browser: the
environment has four known traps (hidden-tab transition freeze, cookie host
splitting, stale Docker image on `:9000`, `planGuard` feature gating).

## Commit & handover ritual

- One verified milestone per commit. Stage **only your own paths and hunks** —
  a second agent session works in this same checkout and dev DB. Never
  `git stash`, never revert files you do not own, never `git add -A`.
- Commit messages are Egyptian Arabic, one line of "why" plus the measured
  outcome (match `git log --oneline -5` for style).
- Document the change in `LOCAL_TESTING_REPORT.md` (what was / what is now /
  measurements / declared residue) and any reusable lesson in
  `AGENT_HANDOVER.md`. New Arabic prose gets proofread for stray CJK glyphs and
  dropped letters before committing.
- **Push and deploy are two separate, owner-approved actions.** Never push
  because a commit succeeded, never rebuild Docker or touch Railway because a
  push happened. Ask first. Auto-deploy on staging is off by design.
- Secrets are off-limits: never read, compare, echo, or hash password hashes,
  tokens, or API keys. Hand the owner self-run commands instead.

## Environment quick facts

- Frontend dev `:9100` (Vite) · backend dev `:4000` (ts-node-dev) · Docker stack
  nginx `:9000` → backend container `:4001` · Postgres 17 in container
  `gymcore-db`, host port `5433`, role/db `gymcore` · Redis `:6379`.
- No `psql` or `gh` on the host: use `docker exec gymcore-db psql -U gymcore -d gymcore -c '…'`.
- Staging DB ≠ local DB. Railway CLI exists (`railway` 5.64) but is owner-run.
- If a fix "does not work" on `:9000`, suspect the image before the code:
  compare the served bundle hash (`index-*.js`) against a fresh build.

## Resources

- `references/tokens.md` — full variable list, legacy→shell mapping table for
  colour codemods, and the accent/series vocabulary.
- `references/verification.md` — browser-measurement traps, auth/cookie notes,
  `planGuard` feature gates, audit-table gotchas.
- `scripts/audit-shell-colors.mjs` — literal-colour audit for `.ts`/`.tsx`
  (paths as args, default `src`; `--counts` for a per-file summary).
