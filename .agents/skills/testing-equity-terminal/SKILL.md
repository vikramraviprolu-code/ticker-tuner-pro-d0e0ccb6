---
name: testing-equity-terminal
description: How to build, run and smoke-test the Global Equity Terminal (TanStack Start v1 / React 19 / Vite 7) locally, including which routes are safe to assert on and which known failures are environmental rather than regressions.
---

# Testing the Global Equity Terminal locally

## Install / build / run

The repo is standardised on **npm** (bun.lockb and bunfig.toml were removed). Do not use bun.

```bash
npm ci            # ~10s, package-lock.json is authoritative
npm run build     # vite build, should exit 0 in a few seconds
```

`npm run preview` uses **wrangler** against the Cloudflare Worker output and is *not* the smoke-test
path. Run the Vite dev server instead, mirroring what `playwright.config.ts` does, with inert
Supabase placeholders so auth/error-reporting degrade instead of throwing:

```bash
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_PUBLISHABLE_KEY=placeholder \
SUPABASE_SERVICE_ROLE_KEY=placeholder \
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=placeholder \
npm run dev -- --host 127.0.0.1 --port 4173
```

On the very first page load Vite optimises deps and force-reloads the page once
(`optimized dependencies changed. reloading`). Reload manually if the first navigation looks stuck.

`npm run lint` fails with thousands of pre-existing prettier/`no-explicit-any` errors on main.
Do not treat lint failures as a regression and do not try to fix them.

## Routes that render reliably offline

These work with no API keys and are the best smoke-test surface:

| Route | What to assert |
|---|---|
| `/` | Hero h1, "Network Status" card, Universe count (e.g. 143), Top Movers list |
| `/app` | h1 "Global Equity Screener", `tbody tr` rows (143), search input filters to "1 of 143" |
| `/app?view=chart` | Per-ticker cards each with an SVG sparkline |
| `/app?view=heatmap` | Colour-scaled sector tiles (good proof that CSS + SVG pipeline works) |
| `/compare` | Type a ticker in the "Add ticker…" input, click **Add**; 2+ tickers render a recharts radar + metric table |
| `/changelog`, `/settings`, `/watchlist`, `/events`, `/data-quality`, `/sources` | h1 + styled cards |
| `/portfolio`, `/alerts` | Redirect to `/auth` |
| `/auth` | Sign in / Sign up tabs, email + password inputs, "Continue with Google" |

## Known environmental failures (NOT regressions)

- **`/terminal/$symbol` hangs forever on "ANALYZING · <TICKER>"** in sandboxes.
  `analyzeTicker` (src/server/analyze.ts) chains Finimpulse → Yahoo → FMP → Stooq → Alpha Vantage
  and then fetches up to 25 peers, each with 3 retries × 12s. Without `FINIMPULSE_API_KEY` /
  `FMP_API_KEY` / `ALPHAVANTAGE_API_KEY`, and with Yahoo returning 429 to datacenter IPs, the
  mutation never resolves. The page chrome (nav, ticker input, "ANALYZING" card) still renders
  styled — it is not a blank screen. Terminal charts/metrics are effectively **untestable**
  without provider API keys; report as untested rather than failed.
- **React hydration text mismatch on `/` and `/app`** (server renders `—` / `Updating…`, client
  renders `143` / `Updated <time>`). This is pre-existing app behaviour from time/loader-dependent
  render, not caused by dependency bumps.

## Distinguishing regressions from pre-existing issues

The cheapest A/B is a git worktree of the base commit on a second port:

```bash
git worktree add /tmp/geq-base <base-sha>
cd /tmp/geq-base && npm ci
# ...same dev command with --port 4174
```

Then run the same check against both ports. Always do this before reporting a runtime failure on a
dependency-bump PR.

## Checking for console errors without a browser harness

Devin's DOM annotator injects `devinid`/`devin-hidden`/`offscreen` attributes, which itself
produces a spurious React *attribute* hydration warning. To get a clean signal, drop a script into
the **repo root** (so `@playwright/test` resolves) and run it with node:

```js
import { chromium } from '@playwright/test';
const b = await chromium.launch();
for (const path of ['/', '/app', '/compare', '/changelog', '/settings', '/auth']) {
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:4173' + path, { waitUntil: 'networkidle' }).catch(()=>{});
  await p.waitForTimeout(3000);
  console.log(path, '=>', errs.length ? errs : 'NO CONSOLE ERRORS');
  await p.close();
}
await b.close();
```

Ignore `[error-log] insert failed: ... ECONNREFUSED 127.0.0.1:54321` in the dev-server log — that
is the Supabase placeholder and is expected.

## Devin Secrets Needed

- None for the public-route smoke test.
- To exercise `/terminal/$symbol` end-to-end you would need at least one market-data provider key:
  `FINIMPULSE_API_KEY`, `FMP_API_KEY`, or `ALPHAVANTAGE_API_KEY`.
- To exercise `/portfolio`, `/alerts`, or any signed-in flow you would need real
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` and a test account.
