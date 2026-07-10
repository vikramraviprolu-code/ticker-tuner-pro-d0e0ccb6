import { createFileRoute } from "@tanstack/react-router";
import { SiteNav, Disclaimer } from "@/components/site-nav";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Data Sources — Global Equity Terminal v2" },
      { name: "description", content: "Free, public, keyed, and zero-key data sources powering price, fundamentals, and corporate events in Global Equity Terminal v2." },
      { property: "og:title", content: "Data Sources — Global Equity Terminal v2" },
      { property: "og:description", content: "Free, public, keyed, and zero-key data sources powering price, fundamentals, and corporate events in Global Equity Terminal v2." },
    ],
    links: [{ rel: "canonical", href: "https://rankaisolutions.tech/sources" }],
  }),
  component: SourcesPage,
});

const SOURCES = [
  {
    name: "Finimpulse API",
    role: "Preferred keyed provider",
    metrics: ["Quote / price", "Trailing P/E", "Market cap (local + USD)", "Avg volume", "52W high / low", "MA50 / MA200", "Sector / industry", "Earnings date"],
    freshness: "Real-time or delayed depending market / plan",
    reliability: "High when key and quota are healthy",
    notes: "Used first for market data where configured. If the key is missing, quota is exhausted, or an endpoint fails, the app should fall back to cache or lower-freshness public sources with visible provenance labels.",
    rights: "Data displayed under Finimpulse's terms of service. All market data remains the property of the originating exchanges and Finimpulse.",
    url: "https://api.finimpulse.com/",
  },
  {
    name: "Financial Modeling Prep / Alpha Vantage / Finnhub",
    role: "Keyed fallback candidates",
    metrics: ["Fundamentals", "Historical prices", "Ratios", "Profiles", "FX / indicators where available"],
    freshness: "Delayed, historical, or fundamentals-only by endpoint",
    reliability: "Medium — endpoint and free-tier coverage vary",
    notes: "Used only where configured and within free-tier limits. Quota exhaustion should enter provider cooldown quickly rather than blocking interactive pages.",
    rights: "Each upstream provider's terms, attribution, and exchange restrictions apply. Verify endpoint-specific terms before production reliance.",
  },
  {
    name: "Yahoo-compatible public endpoints",
    role: "Zero-key opportunistic fallback",
    metrics: ["Delayed quotes", "Chart history", "Basic metadata"],
    freshness: "Delayed / unofficial",
    reliability: "Medium-low — undocumented schemas can change",
    notes: "Helpful in zero-key mode, but must be treated as opportunistic and labeled with caveats rather than as an official live feed.",
    rights: "Use only where permitted by applicable terms. Do not redistribute bulk market data.",
  },
  {
    name: "Stooq CSV",
    role: "Zero-key historical fallback",
    metrics: ["EOD prices", "Historical price series", "Indices where available"],
    freshness: "Historical/EOD",
    reliability: "Medium — symbol coverage and mappings vary",
    notes: "Good public fallback for charts and historical/EOD data. Historical/EOD values are never presented as real-time quotes.",
    rights: "Public source terms and attribution requirements must be respected before production reliance.",
    url: "https://stooq.com/",
  },
  {
    name: "SEC EDGAR companyfacts / submissions",
    role: "Zero-key US fundamentals fallback",
    metrics: ["US company facts", "Filings metadata", "Fundamental line items"],
    freshness: "Fundamentals-only, filing-lagged",
    reliability: "High for US filers; not global",
    notes: "Useful for US fundamentals when keyed providers are unavailable. Filing-lagged values should be labeled as historical fundamentals, not live financial estimates.",
    rights: "Public SEC data. Respect fair-access guidance, user-agent requirements, and caching etiquette.",
    url: "https://www.sec.gov/edgar/sec-api-documentation",
  },
  {
    name: "Perplexity / cited web sources",
    role: "News & catalysts",
    metrics: ["AI-summarized news", "Citations to source articles"],
    freshness: "On-demand web retrieval",
    reliability: "Medium — AI-summarized; verify with cited sources",
    notes: "Powers the News & Catalysts panel where configured. We never store or redistribute headlines or article text — only paraphrases plus links back to original publishers.",
    rights: "Cited articles remain the property of their original publishers. Click citations to read at the source.",
    url: "https://www.perplexity.ai/",
  },
  {
    name: "Supabase Postgres cache",
    role: "Durable L2 cache",
    metrics: ["Cached provider responses", "Source provenance", "Retrieved timestamps", "Stale-on-error data"],
    freshness: "Fresh, stale-cache, or expired by field group TTL",
    reliability: "High if cache bounds stay within free-tier limits",
    notes: "Preferred durable cache because the app already uses Supabase. Cached values must keep source, retrievedAt, freshness class, and fallback reason metadata.",
    rights: "Cache only what provider terms permit; do not expose bulk cache export APIs.",
  },
  {
    name: "Curated Universe",
    role: "Discovery seed",
    metrics: ["Ticker", "Exchange", "Region", "Country", "Currency", "Sector", "Industry"],
    freshness: "Static — curated list",
    reliability: "High",
    notes: "Hand-picked liquid global names across US, India, EU, JP, HK, KR, TW, AU, SG. Used for symbol discovery and display metadata, not market prices.",
    rights: "Ticker symbols and company names are factual identifiers used for reference. Trademarks belong to their respective owners.",
  },
  {
    name: "Demo / mock provider",
    role: "Explicit demo mode only",
    metrics: ["Synthetic demo metrics derived from ticker hash"],
    freshness: "Demo/mock",
    reliability: "Synthetic — not market data",
    notes: "Demo/mock data is allowed only behind explicit demo mode or fixtures. It must be visibly labeled demo/mock and never silently substitute for production market data.",
    rights: "Synthetic data generated by the terminal — no third-party rights apply.",
  },
] as const;

const FRESHNESS_LABELS = [
  "real-time",
  "delayed",
  "historical/EOD",
  "stale-cache",
  "mixed-source",
  "unavailable",
  "demo/mock",
] as const;

function SourcesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-4 py-6 w-full">
        <h1 className="text-xl font-semibold tracking-tight">Data Sources</h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
          The terminal blends keyed free-tier providers, public zero-key mode fallbacks, and durable cache reads. Lower-freshness data is useful, but it is always labeled: historical/EOD data is never presented as real-time, stale cache is marked stale, and demo/mock data is reserved for explicit demo mode only.
        </p>

        <div className="panel mt-4 p-4 text-xs text-muted-foreground leading-relaxed">
          <div className="font-mono text-primary uppercase tracking-widest mb-2">Freshness semantics</div>
          <div className="flex flex-wrap gap-1.5">
            {FRESHNESS_LABELS.map((label) => (
              <span key={label} className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5 text-muted-foreground">{label}</span>
            ))}
          </div>
          <p className="mt-3">
            In zero-key mode the app should first use fresh cache, then stale-cache on provider failure, then public delayed or historical/EOD sources such as Stooq and SEC EDGAR where appropriate. Production pages should show unavailable fields instead of silently inventing values.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {SOURCES.map((s) => (
            <div key={s.name} className="panel p-4">
              <div className="flex items-baseline justify-between flex-wrap gap-2">
                <div className="font-mono text-primary text-sm">{s.name}</div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border border-border rounded px-2 py-0.5">{s.role}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="text-muted-foreground">Freshness</div><div>{s.freshness}</div>
                <div className="text-muted-foreground">Reliability</div><div>{s.reliability}</div>
              </div>
              <div className="mt-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Provides</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.metrics.map((m) => (
                    <span key={m} className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5 text-muted-foreground">{m}</span>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{s.notes}</p>
              {"rights" in s && s.rights && (
                <p className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed border-l-2 border-border pl-2 italic">
                  {s.rights}
                </p>
              )}
              {"url" in s && s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[10px] font-mono text-primary hover:underline">
                  {s.url} ↗
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="panel mt-6 p-5 text-xs text-muted-foreground leading-relaxed">
          <div className="font-mono text-primary uppercase tracking-widest mb-2">Source priority</div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Configured keyed providers with matching entitlement, quota, and freshness.</li>
            <li>Fresh Supabase Postgres or in-memory cache with preserved provenance.</li>
            <li>Stale cache on provider errors or quota exhaustion, clearly labeled stale-cache.</li>
            <li>Zero-key public fallbacks for delayed, historical/EOD, fundamentals-only, or metadata-only fields.</li>
            <li>Unavailable fields when no honest data source exists.</li>
          </ol>
        </div>

        <div className="panel mt-3 p-5 text-xs text-muted-foreground leading-relaxed">
          <div className="font-mono text-primary uppercase tracking-widest mb-2">Data rights & attribution</div>
          <p>
            Market data, fundamentals, and news content are provided by third-party sources and remain
            the property of their original publishers and exchanges. The terminal displays this data to
            you under the terms of service of each upstream provider. We do not redistribute, resell,
            cache, or expose bulk market data via public APIs. News snippets are AI-paraphrased with
            citations linking back to the original publishers — please follow citations to read source
            articles in full. See <a href="/legal" className="text-primary hover:underline">Legal &amp; Disclaimers</a> for the complete notice.
          </p>
        </div>

        <Disclaimer />
      </main>
    </div>
  );
}
