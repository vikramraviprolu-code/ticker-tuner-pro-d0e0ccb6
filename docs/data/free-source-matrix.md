# Free Market Data Source Matrix

Purpose: keep provider decisions explicit before changing fallback code. The app should use real-time market data where legally and technically available, but must degrade to delayed, EOD/historical, stale cache, or unavailable states with honest labels. It must also continue to operate in zero-key mode when API keys are absent or free-tier quotas are exhausted.

Last reviewed: 2026-05-26

## User-visible freshness labels

Use these labels consistently in rows, tooltips, source badges, and data-quality pages:

- `real-time`: provider states live/real-time feed is available for that market and account tier.
- `delayed`: provider data is delayed or exchange-delayed.
- `historical-eod`: end-of-day or historical values; never present as live quotes.
- `stale-cache`: previously retrieved value served after normal expiry because live providers failed or quota was exhausted.
- `mixed-source`: row combines field groups from multiple providers.
- `unavailable`: no reliable value available for the field.
- `demo-mock`: synthetic/demo data; allowed only behind explicit demo mode, never production default.

## Provider matrix

| Provider/source | Key required | Freshness class | Best field groups | Coverage notes | Quota/rate/terms notes | Reliability risks | Recommended use |
|---|---:|---|---|---|---|---|---|
| Finimpulse | Yes | real-time or delayed depending plan/market; verify per endpoint | quotes, screener rows, fundamentals if plan allows | Existing primary source in app; verify global exchange coverage | Keyed plan/free-tier constraints; enforce budget and circuit breaker | quota exhaustion, plan limits, endpoint variance | Preferred keyed provider when healthy and within quota |
| Financial Modeling Prep (FMP) | Yes | delayed/historical/fundamentals depending endpoint/tier | fundamentals, profiles, ratios, historical, some quotes | Broad global support but free-tier coverage can vary | Keyed free tier; strict request budgets; verify commercial restrictions before production reliance | rate limits, partial market coverage | Secondary keyed provider for fundamentals/history and quote fallback |
| Alpha Vantage | Yes | delayed, historical, indicators, FX depending endpoint | daily/intraday time series, FX, indicators | Broad symbol support; endpoint-specific global coverage | Keyed free tier with strict quota; do not use demo key in production | quota exhaustion, throttling, inconsistent symbols | Use as keyed fallback, especially historical/FX/indicator data |
| Finnhub | Yes | real-time/delayed/EOD depending endpoint and exchange | quotes, candles, company profile, news where available | Global stocks API exists; free coverage varies by endpoint/exchange | Keyed free tier; verify rate limits and exchange restrictions before relying | quota limits, exchange entitlements | Candidate keyed fallback after D0 verification |
| Twelve Data | Yes | real-time/delayed/historical depending plan/market | quotes, time series, FX | Broad multi-asset support; verify free-tier exchange coverage | Keyed free tier; verify free quota and attribution/terms | quota limits, plan gating | Candidate only if free global coverage beats existing sources |
| Yahoo-compatible public endpoints | No | delayed/unofficial; sometimes recent intraday | quotes, chart history, metadata | Broad ticker support including many suffix symbols | Unofficial/undocumented for app use; terms and throttling risk must be reviewed | breakage, throttling, schema changes | Zero-key opportunistic fallback with clear caveats |
| Stooq CSV | No | historical-eod / delayed | EOD prices, simple history | Useful for many equities and indices; fundamentals-poor | Public/free CSV-style access; verify attribution/terms | EOD only, symbol mapping gaps | Primary zero-key historical/EOD fallback |
| SEC EDGAR companyfacts/submissions | No | fundamentals-only, filing-lagged | US company metadata and fundamentals | US-listed companies/filers only | Public API; respect fair-access guidance and user-agent requirements | filing lag, taxonomy complexity, US-only | Zero-key fundamentals fallback for US tickers |
| Public FX feeds / central banks | Usually no | delayed/EOD FX | FX normalization | Coverage depends on source | Verify terms per source; cache daily | holidays, missing pairs | Daily cached FX fallback; never high-frequency FX |
| Exchange/public datasets | Usually no | delayed/EOD/metadata | exchange calendars, metadata, maybe EOD | Market-specific | Verify per exchange terms and redistribution | inconsistent formats, licensing | Add selectively when terms and coverage are clear |

## Field-group preference policy

Provider choice should be by field group, not by a single global row source:

1. Quote fields (`price`, `change`, `volume`, intraday timestamp)
   - Prefer healthy keyed provider with real-time/delayed quote entitlement.
   - If keyed provider quota is exhausted, use L1/L2 cache within TTL, then stale-on-error, then zero-key delayed/historical sources.
   - If only EOD data exists, label as `historical-eod` and avoid live-price wording.

2. Price history / charts
   - Prefer keyed historical/intraday provider when available.
   - Use Yahoo-compatible chart or Stooq EOD as zero-key fallback only with freshness labels.
   - Cache chart payloads aggressively by interval.

3. Fundamentals / ratios
   - Prefer Finimpulse/FMP/Alpha Vantage if keyed and within quota.
   - Use SEC EDGAR for US fallback where mappings are reliable.
   - Treat filing-lagged or annual/quarterly values as historical fundamentals.

4. Metadata / symbol profiles
   - Prefer provider metadata when keyed calls are already required.
   - Use local symbol registry for canonical exchange, MIC, currency, country, provider symbol transforms, and display labels.

5. FX normalization
   - Use daily cached FX rates.
   - Store native values and USD-normalized values separately.
   - Label FX provider and `retrievedAt`.

6. News/events
   - Do not add a provider until D0 verification confirms free-tier terms and attribution.
   - If using public RSS/news/search, cite source and timestamp.

## Zero-key mode order

When no keys are configured, disabled, exhausted, or rate-limited:

1. Serve valid L1 memory cache if fresh enough for the field group.
2. Serve Supabase Postgres L2 cache if fresh.
3. Serve stale L2 cache on provider errors/quota exhaustion with `stale-cache` label.
4. Query zero-key sources in this order where appropriate:
   - Yahoo-compatible public endpoint for delayed/recent quotes or chart data, if permitted and available.
   - Stooq CSV for EOD/historical prices.
   - SEC EDGAR companyfacts/submissions for US fundamentals.
   - Daily public FX source for currency conversion.
5. Return partial/unavailable fields with explicit `unavailable` labels.
6. Never substitute production mock data unless explicit demo mode is enabled.

## Quota-exhaustion behavior

- Treat quota exhaustion separately from transient provider failure.
- Honor `Retry-After` headers where present.
- Put exhausted providers into cooldown state by provider and endpoint.
- Skip exhausted keyed providers quickly for interactive requests.
- Prefer cached/stale/historical data with labels over waiting on slow fallback chains.
- Record fallback reason in provenance metadata: `quota-exhausted`, `missing-key`, `provider-error`, `timeout`, `stale-on-error`, or `zero-key-mode`.

## Durable cache recommendation

Use Supabase Postgres as the first durable L2 cache because the repo already uses Supabase clients, auth middleware, migrations, and server-side service-role access. This avoids adding another datastore and fits the no-additional-cost requirement if bounded under the Supabase Free database limit.

Cloudflare KV/R2/D1 remains optional phase 2 only if free-tier capacity is sufficient and a benchmark proves the added complexity is worthwhile:

- KV: ultra-hot edge key/value reads.
- R2: large immutable snapshots.
- D1: Workers-local SQL if moving cache fully into Cloudflare.

## Provider registry requirements for implementation

Runtime provider code should read from a central registry rather than scattering rules across providers. Each provider entry should declare:

- provider id and display name
- key requirement and env var name, if any
- supported field groups
- freshness class by endpoint/field group
- quota budget and cooldown strategy
- zero-key eligibility
- attribution/caveat text
- source URL/API family
- symbol mapping requirements

## Acceptance checklist before fallback-code changes

- Every used provider has a declared key/quota policy.
- Every field group has a preferred keyed and zero-key path.
- UI can distinguish real-time, delayed, historical/EOD, stale cache, mixed-source, unavailable, and demo/mock.
- Tests cover keyed mode, missing-key mode, quota-exhausted mode, stale-cache mode, and no-production-mock behavior.
- Docs and source badges match the actual provider orchestration.
