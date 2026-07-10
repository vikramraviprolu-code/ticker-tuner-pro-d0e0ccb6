# Global Equity Terminal V2 Performance + Free Data Multi-Agent Kanban Plan

> For Hermes/Claude Code: use subagent-driven-development selectively. Keep context packs small, dispatch one domain per agent, and require verification before code changes are accepted.

Goal: Make Global Equity Terminal V2 reliable, high-performance, and cost-efficient using the best available free/low-cost market data sources, while being explicit about when data is real-time, delayed, historical, stale, or unavailable.

Architecture: Preserve the TanStack Start + React 19 + Cloudflare Workers/Supabase architecture. First stabilize runtime/toolchain and tests, then reduce bundle/runtime cost, then harden the data-provider layer with durable caching, provider budgets, source provenance, scheduled refresh, and a zero-key fallback mode. Avoid broad rewrites; use tests as contracts before refactors.

Data-source product policy:
- Use real-time market data where and when it is legally/technically available from free or keyed free-tier sources.
- If real-time data is not available, prefer delayed quotes or recent historical/EOD data rather than fabricated values.
- Every row/field shown to users must disclose freshness: real-time, delayed, EOD/historical, stale cache, mixed-source, unavailable, or explicit demo/mock.
- API keys are available for keyed free-tier providers, but the product must also operate in zero-key mode when keys are absent, disabled, exhausted, or rate-limited.
- When a keyed provider hits its free quota/limit, fail over to cached, delayed, historical, or zero-key providers with honest labels instead of hard-failing the app or substituting fake data.
- Continue researching alternative free sources as part of implementation, but treat provider terms, quotas, coverage, latency, and attribution as acceptance criteria, not afterthoughts.

Tech stack: TanStack Start, React 19, Vite 7, Cloudflare Workers, Supabase/Lovable, Playwright, Vitest, TypeScript.

Audit date: 2026-05-26
Repo path audited: /opt/data/work/Global-Equity-Terminal-V2

Verification already run:
- npm ci: passed, but Node 20 emitted EBADENGINE warnings because current TanStack Start/tooling packages require modern Node 22+.
- npm run test:unit: passed, 13/13 tests.
- npm run build: passed, but Vite warned about large chunks.

Key evidence:
- package.json uses @tanstack/react-start ^1.167.14 and Vite 7.
- Largest source files:
  - src/components/terminal/terminal-page.tsx: 2056 lines
  - src/routes/app.tsx: 907 lines
  - src/server/analyze.ts: 890 lines
- Large client chunks from build:
  - index-g9UkQVNU.js: 702.66 kB raw / 205.93 kB gzip
  - terminal-page-DeiyySPH.js: 513.18 kB raw / 159.01 kB gzip
  - compare-B2HVfohc.js: 374.65 kB raw / 104.14 kB gzip
  - html2canvas.esm-DXEQVQnt.js: 201.04 kB raw
  - site-nav-BOfIXoXa.js: 99.19 kB raw

Cost/token strategy:
- Do not repeatedly load 2000-line terminal-page.tsx or 900-line app.tsx into every agent.
- First extract pure logic and component boundaries so later agents work on smaller files.
- Use one focused agent per domain; do not run full multi-agent review for trivial tasks.
- Use cheap/local Hermes for mechanical file edits/tests where possible; use Claude Code/Codex only for complex refactors or review.
- Prefer file/path context packs over pasted code.
- Require each coding agent to return changed files, commands run, and residual risks.

Kanban board

Columns:
- Backlog
- Ready
- In Progress
- Review
- QA
- Done

Lane 0: Foundation / CI / Runtime

Card F1 [P0] Enforce supported Node runtime
Owner: implementation agent
Objective: Remove runtime ambiguity between local/CI/deploy.
Files:
- Modify: package.json
- Modify: README.md or DEPLOYMENT_SETUP.md
Tasks:
1. Add package.json engines: node >=22.13.0.
2. Document Node 22.13+ requirement.
3. Ensure CI/deploy uses Node 22.13+ where configurable.
4. Re-run npm ci, npm run test:unit, npm run build under Node 22.
Acceptance:
- No EBADENGINE warnings under supported runtime.
- Unit tests/build pass.
Notes:
- If deploy platform is fixed to Node 20, evaluate temporary TanStack package downgrade separately; do not downgrade by default.

Card F2 [P0] Add bundle-size governance
Owner: implementation agent
Objective: Prevent future bundle regressions.
Files:
- Create/modify: scripts/bundle-size-check.mjs or equivalent
- Modify: package.json scripts
- Optionally modify: vite config if wrapper supports stats output
Tasks:
1. Generate build stats or parse dist/client asset sizes after build.
2. Fail CI on oversized critical chunks.
3. Suggested initial budgets:
   - entry chunk target <250 kB raw after optimization
   - terminal initial route chunk target <250 kB raw
   - compare initial route chunk target <180 kB raw
4. Add npm script: bundle:check.
Acceptance:
- npm run build && npm run bundle:check passes with current temporary thresholds or reports actionable failures.
- Thresholds can be tightened after optimization cards land.

Lane 1: Data-provider reliability and free-source architecture

Card D0 [P0] Free-source discovery matrix and provider policy
Owner: data/research agent
Objective: Build a maintained provider decision matrix before changing fallback logic, so implementation uses the best free sources available and remains compliant with provider terms.
Files:
- Create: docs/data/free-source-matrix.md
- Modify: README.md or in-app source guide route as needed
- Optionally create: src/server/providers/provider-registry.server.ts
Initial candidate sources to evaluate:
- Keyed free-tier/API-key available: Finimpulse, Financial Modeling Prep, Alpha Vantage, Finnhub, Twelve Data if free global coverage is useful.
- Zero-key/unofficial/free public sources: Yahoo-compatible endpoints only where permitted/acceptable, Stooq CSV/EOD, Nasdaq/SEC/company filings where relevant, exchange/public datasets where practical.
- Historical/fundamentals-only sources: Stooq EOD, SEC EDGAR/companyfacts, public central bank/FX feeds, other free datasets discovered during research.
Tasks:
1. For each candidate, document coverage, field types, latency/freshness, quota/rate limits, key requirement, commercial restrictions, attribution needs, reliability risks, and best use in the chain.
2. Classify each source as real-time, delayed, EOD/historical, fundamentals-only, FX-only, or metadata-only.
3. Decide per field group which provider is preferred: quote, history, fundamentals, metadata, FX, news/events.
4. Define zero-key mode provider order and behavior when keyed quotas are exhausted.
5. Convert findings into provider-registry config/tests rather than scattering decisions through provider code.
Acceptance:
- The plan has a documented provider matrix before fallback changes are accepted.
- Every provider used in code has a declared freshness class and key/quota policy.
- Zero-key mode still returns useful public/historical data where possible and labels it honestly.

Card D1 [P0] Align provider fallback behavior with docs
Owner: data agent
Objective: Fix mismatch between README 5-tier fallback and actual screener path.
Files:
- Inspect/modify: src/server/finimpulse.server.ts
- Inspect/modify: src/server/alphavantage.server.ts
- Modify docs: README.md, /sources or system guide route as needed
Findings to address:
- Screener path currently appears to use Finimpulse -> Yahoo -> FMP -> Stooq -> mock, not Alpha Vantage.
- Alpha Vantage exists mostly in analyze path.
Tasks:
1. Use the D0 provider matrix to decide the fallback chain per field group instead of one global chain.
2. Include keyed free-tier providers because API keys are available, but make each keyed provider skippable when quota is exhausted or a key is absent.
3. Add zero-key fallback order for public/delayed/historical sources.
4. If adding Alpha Vantage or similar keyed sources to screener fallback, do not use demo keys for production fallback.
5. Add tests around fallback order, rate-limit skipping, zero-key behavior, and source/freshness labels.
Acceptance:
- Docs and code match.
- Provider badges/source page reflect actual behavior.
- Free-key quota exhaustion degrades to cached/historical/zero-key sources without fake data.

Card D2 [P0] Disable mock market data in production/default mode
Owner: data agent
Objective: Prevent plausible fake equity metrics from polluting user-facing results while allowing honest historical/stale/public data when live data is unavailable.
Files:
- Modify: src/server/finimpulse.server.ts or provider orchestration file
- Modify: data-quality/source UI if needed
Tasks:
1. Put mock fallback behind explicit demo flag.
2. In production/default, return unavailable/partial rows, stale cache, delayed, or historical/EOD values instead of mock metrics.
3. Require explicit labels for historical/EOD/stale values used in quote-like contexts.
4. Ensure filters/scoring exclude mock/unavailable rows unless demo mode is explicitly enabled; historical rows may be included only when the user-facing label makes the freshness clear.
5. Add tests for production, demo, keyed, zero-key, quota-exhausted, stale-cache, and historical fallback behavior.
Acceptance:
- No mock rows in normal production/default screener results.
- Demo mode remains available if desired and clearly labeled.
- Historical/free public data is explicitly labeled and never presented as real-time.

Card D3 [P0] Add durable L2 cache and stale-while-revalidate design
Owner: data agent
Objective: Stop full-universe cold-start fan-out and improve free-provider reliability without adding paid infrastructure.
Recommended backend decision:
- Primary recommendation: Supabase Postgres L2 cache, because the repo already uses Supabase clients, auth middleware, migrations, and server-side service-role access. This avoids adding a second datastore and should fit the no-cost constraint if cache volume is bounded below the Supabase Free 500 MB database limit.
- Cloudflare KV/R2/D1 should remain optional/phase-2 only if the deployed Cloudflare account has sufficient free-tier capacity and the use case justifies it. Current repo evidence shows Cloudflare Worker config but no KV/D1/R2 binding yet.
- Prefer Supabase first for structured metadata, provenance, TTL queries, stale scans, and admin visibility. Consider Cloudflare KV later only for ultra-hot key/value edge reads; consider R2 only for large immutable snapshots; consider D1 only if moving cache fully into Workers and staying within D1 Free limits.
Files:
- Modify: src/server/cache.server.ts
- Modify: screen/analyze provider functions using cache
- Add Supabase migration/table for provider cache, provider budget state, and optional cache stats views
Tasks:
1. Keep existing in-memory Map as L1.
2. Add Supabase Postgres as bounded durable L2 cache for universe, screener rows, ticker analysis, search results, and negative misses.
3. Store metadata: provider, retrievedAt, expiresAt, staleUntil, errorCount, stale flag, freshness class, source URL/API, and whether data required a key.
4. Serve stale-on-error; refresh in background where supported.
5. Add cache buckets/TTLs by data class: intraday/real-time quote, delayed quote, EOD/historical, fundamentals, metadata, FX.
6. Add row-size/storage guardrails: compact JSON payloads, indexes on cacheKey/expiresAt/staleUntil, prune expired negative misses, cap historical snapshot retention, and add an estimated storage budget.
7. Add admin/data-quality visibility for durable cache stats.
Acceptance:
- Public universe can be served from durable Supabase snapshot without live provider fan-out.
- Cache metadata is visible/testable.
- Cache responses preserve source/freshness labels through the UI.
- Cache implementation has a documented free-tier storage budget and pruning strategy.
- No Cloudflare paid product is required for the first implementation phase.

Card D4 [P1] Provider rate budgets, circuit breakers, and Retry-After
Owner: data agent
Objective: Protect free providers and prevent quota/cold-start storms.
Files:
- Modify: src/server/http.server.ts
- Modify/add: src/server/rate-limit.server.ts or provider-budget.server.ts
Tasks:
1. Add per-provider token buckets/configured quotas.
2. Add circuit breaker on repeated 429/5xx/timeouts.
3. Honor Retry-After headers.
4. Add jittered backoff and total wall-clock budget per interactive request.
5. Bound peer analysis concurrency.
6. Detect quota exhaustion distinctly from transient failures and switch that provider into cooldown/quota-exhausted state.
7. When a keyed provider is in cooldown, skip directly to durable cache, delayed/historical, or zero-key sources.
Acceptance:
- Provider outage/429 skips to next provider quickly.
- Interactive calls do not wait tens of seconds for a slow primary provider.
- Keyed-provider limit exhaustion does not break zero-key operation.

Card D5 [P1] Centralized symbol registry + FX normalization
Owner: data agent
Objective: Make global equities comparable and provider mappings testable.
Files:
- Create: src/server/symbol-registry.server.ts or src/lib/symbol-registry.ts
- Modify: provider symbol mapping code
- Modify tests
Tasks:
1. Define canonical symbol metadata: exchange/MIC, country, currency, timezone, provider symbols.
2. Add representative fixture tests:
   - AAPL, BRK-B
   - RELIANCE.NS
   - ASML.AS, SHEL.L, SAP.DE
   - 7203.T
   - 0700.HK
   - 005930.KS
   - 2330.TW
   - D05.SI
   - CBA.AX
3. Add daily cached FX rates.
4. Normalize marketCapUsd and priceUsd separately from native values.
Acceptance:
- Global filters use USD-normalized values.
- Provider-specific symbol transforms are tested centrally.

Card D6 [P1] Field-level source provenance
Owner: data agent
Objective: Make mixed Yahoo/FMP/Stooq/etc. data transparent.
Files:
- Modify provider row type(s)
- Modify ProviderBadge/data-quality UI
Tasks:
1. Track provenance by field group: quote, history, fundamentals, metadata, FX, events/news if added.
2. Expose retrievedAt/stale/missing fields, freshness class, delay/EOD marker, key requirement, and quota-fallback reason where applicable.
3. Show mixed-source rows accurately.
4. Add UI copy that says, for example, "historical/EOD free data" or "stale cached quote" instead of implying live pricing.
Acceptance:
- Source badge is not misleading when a row combines multiple providers.
- Users can distinguish real-time, delayed, historical/EOD, stale-cache, and unavailable data.

Lane 2: Bundle and frontend performance

Card P1 [P0] Isolate PDF/export libraries behind dynamic import
Owner: frontend performance agent
Objective: Users should not download jsPDF/html2canvas/export dependencies unless exporting.
Files:
- Modify: src/components/terminal/terminal-page.tsx
- Modify: src/lib/pdf-report.ts usage only if needed
Tasks:
1. Replace static import of downloadTerminalPdf with action-time dynamic import.
2. Ensure jspdf/jspdf-autotable stay in the lazy export chunk.
3. Verify html2canvas is actually used; remove or isolate if unused directly.
Acceptance:
- terminal-page initial chunk no longer includes PDF/export libs.
- Build passes.

Card P2 [P0] Split TerminalPage monolith by tabs/sections
Owner: frontend performance agent
Objective: Reduce terminal route chunk and improve maintainability.
Files:
- Modify/split: src/components/terminal/terminal-page.tsx
- Create components/hooks under src/components/terminal/
Tasks:
1. Extract useTerminalSearch/useTerminalAnalysis.
2. Extract sections: Overview, Chart, Scores, Value, Momentum, Peers, Cross, Scenario, Final.
3. Lazy-load non-default tabs and AI/news/chat panels where safe.
4. Improve disambiguation table keyboard accessibility while touching it.
Acceptance:
- terminal-page.tsx is substantially smaller.
- Existing /terminal and /terminal/AAPL behavior unchanged.
- Build passes and terminal route chunk decreases.

Card P3 [P1] Reduce Compare route chart cost
Owner: frontend performance agent
Objective: Lower compare route JS size from Recharts-heavy chunk.
Files:
- Modify: src/routes/compare.tsx
- Inspect: src/components/ui/chart.tsx
Tasks:
1. Replace simple radar chart with lightweight SVG if feasible.
2. Or lazy-load Recharts chart only when comparison data exists/enters viewport.
3. Remove unused chart primitive if truly unused.
Acceptance:
- compare initial chunk target <180 kB raw.
- Compare functionality unchanged.

Card P4 [P1] Lazy-load global optional UX features
Owner: frontend performance agent
Objective: Reduce entry/root chunk.
Files:
- Modify: src/routes/__root.tsx
- Modify: command bar/help/glossary components
Tasks:
1. Keep tiny keyboard listener globally.
2. Lazy-load CommandBar only when opened.
3. Lazy-load glossary/help only when ? overlay opens.
4. Consider route-scoping WhatsNewToast.
Acceptance:
- Entry chunk decreases.
- Keyboard shortcuts still work.

Card P5 [P1] Screener refactor and scalable client/server boundary
Owner: frontend/data integration agent
Objective: Make /app maintainable and ready for larger universes.
Files:
- Modify/split: src/routes/app.tsx
- Create: screener schema/filter/sort/preset modules
Tasks:
1. Extract pure filter/sort/preset logic.
2. Add unit tests for presets/filter/sort/pagination.
3. Split UI into FilterBar, PresetBar, ResultsTable, ResultsCards, Pager, ColumnMenu.
4. Fix refresh tooltip from 60s to actual 5 minutes.
5. Add plan for server-side filtering/pagination if universe grows.
Acceptance:
- app.tsx is smaller and easier to modify.
- Unit tests cover pure screener logic.

Lane 3: Auth, UX correctness, accessibility, and tests

Card Q1 [P0] Standardize auth gating
Owner: QA/auth agent
Objective: Protected routes behave consistently.
Files:
- Modify routes: portfolio, alerts, tasks, theses
- Create shared AuthGate/useRequireAuth if appropriate
Tasks:
1. Replace client-only null redirects with visible auth/loading gate.
2. Preserve intended redirect path.
3. Prevent protected data queries before auth exists.
4. Add e2e tests for /portfolio, /alerts, /tasks, /theses.
Acceptance:
- All protected routes have consistent unauthenticated UX.
- E2E verifies gating.

Card Q2 [P0] Expand Playwright behavior coverage
Owner: QA agent
Objective: Tests should catch broken core interactions, not just rendering.
Files:
- Modify/add tests/e2e/*.spec.ts
Tasks:
1. Screener: search, preset, sort, page size, URL state.
2. Watchlist: add/remove from screener and verify /watchlist.
3. Compare: add/remove and query deep link.
4. Terminal: tabs, symbol search/disambiguation, unknown ticker, export button visibility.
5. Free-data transparency: provider badges/disclaimer/data quality link visible.
Acceptance:
- Regression suite catches core workflow failures.
- Tests avoid brittle arbitrary sleeps.

Card Q3 [P1] Accessibility pass with axe smoke tests
Owner: accessibility agent
Objective: Make dense financial UI usable by keyboard/screen readers.
Files:
- Modify UI components/routes touched by core flows
- Add: @axe-core/playwright tests if dependency approved
Tasks:
1. Explicit labels for inputs/selects.
2. Table header scope attributes.
3. Convert clickable rows to keyboard-operable buttons/links.
4. Add aria-labels to glyph-only buttons.
5. Ensure focus-visible styles on nav/dropdown/buttons.
Acceptance:
- Axe critical/serious issues resolved on /, /app, /terminal/AAPL, /compare, /watchlist.
- Keyboard-only navigation works through core flows.

Card Q4 [P1] Loading/error/empty state consistency
Owner: frontend quality agent
Objective: Avoid silent empty states on backend errors.
Files:
- Create shared QueryState component if useful
- Modify portfolio/alerts/tasks/compare/watchlist as needed
Tasks:
1. Distinguish loading, empty, error, auth-required.
2. Stop swallowing backend errors into empty arrays without UI signal.
3. Add retry actions and logging/toasts where appropriate.
Acceptance:
- Users can tell no-data from API/auth failures.

Lane 4: Documentation and product clarity

Card DOC1 [P1] Route access matrix and watchlist behavior clarity
Owner: docs agent
Objective: Align README/user guide/tests with real behavior.
Files:
- Modify: README.md
- Modify: tests/README.md
- Modify in-app guide route if needed
Tasks:
1. Define public vs protected route matrix.
2. Clarify local watchlist vs account-synced watchlist behavior.
3. Update docs after auth route decisions.
Acceptance:
- Docs match code and tests.

Card DOC2 [P1] Free-provider caveats and source transparency docs
Owner: docs/data agent
Objective: Make free data limitations visible and honest.
Files:
- README.md
- sources/data-quality/system guide routes
- docs/data/free-source-matrix.md
Tasks:
1. Document provider limitations:
   - Yahoo-compatible source: unofficial/throttled/delayed; use only with clear reliability/terms caveats.
   - Stooq: EOD/delayed/historical; fundamentals-poor.
   - Alpha Vantage: keyed free tier with strict quota; useful for historical, indicators, FX/crypto depending endpoint.
   - FMP/Finimpulse: keyed plan/free-tier limitations and quota handling.
   - Finnhub/Twelve Data or other discovered sources: only if D0 confirms useful free coverage and acceptable terms.
2. Document stale/mock/mixed-source semantics.
3. Document zero-key mode explicitly: what still works, what degrades, and which views may show historical/EOD data.
4. Add user-facing copy that distinguishes "real-time where available" from "delayed/historical fallback".
Acceptance:
- User-facing docs match actual provider orchestration.
- Users are never led to believe historical/EOD data is live real-time data.

Suggested execution order
1. F1 runtime support and F2 bundle governance.
2. Q1/Q2 tests around current behavior before refactors.
3. D0 provider discovery matrix and source policy.
4. D1/D2 immediate data correctness fixes: keyed free-tier + zero-key + no production mock.
5. P1/P3/P4 quick bundle wins.
6. P2/P5 larger frontend refactors, protected by tests.
7. D3/D4 Supabase-backed durable cache/provider budget/quota-exhaustion system.
8. D5/D6 symbol/FX/provenance/freshness architecture.
9. Q3/Q4 accessibility and state consistency.
10. DOC1/DOC2 docs alignment.

Multi-agent operating model
- Coordinator: Hermes/default profile. Maintains plan, dispatches focused agents, runs final verification.
- Data agent: provider/caching/symbol/FX tasks.
- Frontend performance agent: bundle splitting, route/component refactors.
- QA/accessibility agent: Playwright/Vitest/a11y tests and auth gating checks.
- Docs agent: README/user guide/tests README alignment.

Available local Kanban note:
- Current Hermes profile discovery shows only one configured profile: default.
- Therefore a persistent Hermes Kanban board cannot fan out to named specialist profiles unless more profiles are configured.
- Until then, use delegate_task subagents or Claude Code print-mode agents for parallel work, and treat this file as the Kanban source of truth.

Review gates
- Pre-flight gate: branch clean, npm ci done, Node version known, tests/build baseline recorded.
- Revision gate: each card must include tests or a written reason tests are not applicable.
- Quality gate: after each card, run focused tests; after each lane, run npm run test:unit and npm run build.
- Final gate: run pre-publish/security checks if publishing.

Commands for future implementers
- npm ci
- npm run test:unit
- npm run build
- npm run test:e2e (requires Playwright browser install)
- npm run pre-publish
- npm run security-check

Resolved product decisions from Vikram
- Use real-time market data where and when it is available from free/keyed sources.
- Search and evaluate alternative free sources during implementation, but document their terms/limits/freshness before relying on them.
- Use historical/free public data when live data is unavailable, and label it explicitly as historical/EOD/delayed/stale as applicable.
- API keys are available for keyed free-tier providers.
- The app must still assume zero-key operation when keys are absent or free API quotas/limits are hit.
- Vikram approved the durable cache recommendation: Supabase Postgres first because the repo already uses Supabase and migrations; Cloudflare KV/R2/D1 only remains a no-cost optional phase-2 optimization if free-tier capacity is sufficient.
- Implementation should not start until Vikram explicitly approves starting code changes.

Open questions for Vikram
1. After review, should implementation begin with the suggested execution order or a specific lane/card?
