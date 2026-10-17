# Verification traps

Everything here cost a real debugging session. Read before trusting a
measurement, a screenshot, or a "it does not work".

## Which layer is actually serving you

| Endpoint | What it is |
| --- | --- |
| `:9100` | Vite dev server — current source, HMR |
| `:4000` | native backend (`ts-node-dev`) |
| `:9000` | Docker stack: nginx serving a **built `dist`** → backend container `:4001` |
| Railway | staging. Its DB is **not** the local DB, and auto-deploy is **off** |

Before debugging a fix that "did not work" on `:9000`, compare bundle identity:

```bash
curl -s http://localhost:9000/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
ls -la dist/assets/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

A stale `index-*.js` means the image is old, not that the code is wrong. Rebuilding
the frontend image also pulls whatever the other agent session has uncommitted in
this checkout — say so before doing it, and get the owner's approval.

esbuild fingerprints content, not intent: identical output hash = your change did
not reach the bundle at all (wrong file, dead branch, or the page is not routed).

## Browser measurement

- **Hidden tabs freeze CSS transitions.** With `visibilityState=hidden`,
  `getComputedStyle(el).backgroundColor` on an element carrying
  `transition-colors` returns the value **before** the change. This produced a
  false "dark mode is broken" reading on a POS tile. Fix: set
  `el.style.transition='none'` before reading, or compare against a freshly
  injected `<div class="bg-card">` in the same DOM.
- **`localhost` and `127.0.0.1` are separate cookie jars** (cookies are
  host-based, not port-based). Opening the dev server on
  `http://127.0.0.1:9100` lets you log in as a test gym without kicking the
  owner's session on `localhost:9000`. Cleanest way to verify live.
- `click` via the browser tool can fail with
  `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE … visibilityState=hidden`; drive the UI
  with `evaluate_script` + `element.click()` instead.
- `requestAnimationFrame` never fires in a hidden tab — an rAF-based wait times
  out. Use `setTimeout`.
- Never assert a class string contains a token (`className.includes('border-brass-soft')`
  is also true for `hover:border-brass-soft`). Compare computed
  `borderColor` / `backgroundColor`.
- Report measured **numbers** (px heights, rgb triples, request bodies, status
  codes), never adjectives.

## Auth, plans, and what a 4xx really means

- `planGuard({ requireFeatures: […] })` returns 4xx for features the tenant's
  plan lacks. `gym_effective_features`: Starter = `{attendance, dashboard}`,
  Pro = `{attendance, daily_reports, dashboard, products}`. So `POST /api/products`
  fails on a Starter test gym — assign a plan that has the feature before
  blaming the UI, and restore the plan afterwards.
- `auth.ts` rejects `!is_active`; `listGyms` filters `deleted_at IS NULL`.
  Therefore archived gym + deactivated staff is **indistinguishable from deleted**
  for every user-facing purpose.
- `activity_logs` is append-only (a trigger raises `TABLE_IS_IMMUTABLE`) and
  `activity_logs_staff_user_id_fkey → staff_users` is RESTRICT, so a hard
  `DELETE FROM gyms` throws 23503 for any gym whose manager ever logged in.
  Platform audit lives in `platform_audit_logs`, and its column is
  **`action_type`**, not `action`.
- `getAdminClient()` opens an implicit `BEGIN`: one failed statement aborts the
  transaction and every later one returns `25P02`. Use explicit
  `BEGIN`/`COMMIT` in multi-statement writes.

## Database access

No `psql` on the host. Use the container:

```bash
docker exec gymcore-db psql -U gymcore -d gymcore -c 'SELECT …'
```

The role/db are `gymcore` (compose defaults) — `postgres` does not exist.
Never print, copy, or compare password hashes, tokens, or secret values in
commands, logs, or docs.

## Cleanup after a live check

Delete every probe row you created (`pos_order_items` → `financial_transactions`
→ `pos_orders` → `products`, in FK order), then state what could **not** be
deleted (e.g. immutable `activity_logs` rows) with counts. Rows the owner created
himself are real data — never delete them, and never touch a named production
gym as a test subject.
