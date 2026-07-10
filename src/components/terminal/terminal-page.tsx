import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { analyzeTicker, searchTickers } from "@/server/analyze";
import { fmtNum, fmtPct, fmtMcap, fmtMcapUsd, fmtVol, fmtPrice, fmtPriceDisplay, fmtMcapDisplay, colorFor, trendArrow, vsMA } from "@/lib/format";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { SiteNav, Disclaimer as SharedDisclaimer } from "@/components/site-nav";
import { PriceChart } from "@/components/price-chart";
import { VolumeChart } from "@/components/volume-chart";
import { useWatchlist } from "@/hooks/use-watchlist";
import { scoreRow } from "@/lib/scores";
import { backtestMaCross, computeHistoricalReturns } from "@/lib/backtest";
import { SourcedCell } from "@/components/sourced-value";
import { provenanceFor } from "@/lib/sourced";
import { onAction } from "@/lib/action-bus";
import { AiNarrative } from "@/components/ai-narrative";
import { AskTerminal } from "@/components/ask-terminal";
import { NewsCatalysts } from "@/components/news-catalysts";
import { MetricLabel } from "@/components/metric-label";
import { ProviderBadge } from "@/components/provider-badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const routeApi = getRouteApi("/terminal");


type AnalysisResult = Awaited<ReturnType<typeof analyzeTicker>>;
type Success = Extract<AnalysisResult, { target: any }>;
type SearchResult = Awaited<ReturnType<typeof searchTickers>>;
type Match = SearchResult["matches"][number];

async function exportTerminalPdf(result: Success): Promise<void> {
  const { downloadTerminalPdf } = await import("@/lib/pdf-report");
  downloadTerminalPdf(result);
}

export function TerminalPage({ initialTicker: initialTickerProp }: { initialTicker?: string } = {}) {
  // When mounted from /terminal/$symbol, the prop wins. When mounted from /terminal,
  // fall back to the ?t= search param. Wrap useSearch in a try so the route api
  // doesn't throw when this component is rendered outside the /terminal route.
  let searchTicker: string | undefined;
  try { searchTicker = (routeApi.useSearch() as { t?: string }).t; } catch { searchTicker = undefined; }
  const initialTicker = initialTickerProp ?? searchTicker;
  const [query, setQuery] = useState(initialTicker ?? "");
  const [tab, setTab] = useState<"overview" | "chart" | "scores" | "value" | "momentum" | "peers" | "cross" | "scenario" | "final">("overview");

  const search = useMutation({ mutationFn: (q: string) => searchTickers({ data: { q } }) });
  const analyze = useMutation({ mutationFn: (t: string) => analyzeTicker({ data: { ticker: t } }) });

  const lastAutoRan = useRef<string | null>(null);
  useEffect(() => {
    if (initialTicker && lastAutoRan.current !== initialTicker) {
      lastAutoRan.current = initialTicker;
      analyze.mutate(initialTicker);
    }
  }, [initialTicker, analyze]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setTab("overview");
    analyze.reset();
    search.reset();
    // ISIN: 12 chars, 2-letter country + 9 alphanumerics + 1 check digit.
    // The server now validates ISINs properly using the Luhn algorithm.
    const isIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/i.test(q);
    // Fast-path only for inputs that clearly look like a ticker:
    //  - contains an exchange suffix dot (e.g. RELIANCE.NS, 7203.T)
    //  - contains a digit (e.g. 7203, 005930.KS)
    //  - is short ALL-CAPS letters (e.g. AAPL, MSFT) — typed deliberately
    // Plain lowercase words like "adani" or "reliance" must go through search
    // so we can disambiguate to the right exchange listing.
    const looksLikeSymbol =
      !isIsin &&
      /^[A-Za-z0-9.\-]{1,15}$/.test(q) &&
      (q.includes(".") || /\d/.test(q) || (/^[A-Z]{1,6}$/.test(q)));
    if (looksLikeSymbol) {
      analyze.mutate(q.toUpperCase());
    } else {
      // For ISINs and company names, route through search which now handles
      // ISIN validation and resolution server-side
      search.mutate(q, {
        onSuccess: (res) => {
          const m = res?.matches ?? [];
          if (m.length === 0) {
            // No name matches — for ISINs there's nothing useful to fall back to.
            if (!isIsin) analyze.mutate(q.toUpperCase());
          } else if (m.length === 1) {
            analyze.mutate(m[0].symbol);
          }
        },
      });
    }
  };

  const onPickMatch = (sym: string) => {
    setTab("overview");
    analyze.mutate(sym);
  };

  const matches = search.data?.matches ?? [];
  const showPicker = !analyze.isPending && !analyze.data && matches.length > 1;
  const data = analyze.data;
  const isError = data && "error" in data;
  const result = data && !("error" in data) ? data : null;

  // Press "e" to download the PDF report when a result is loaded
  useEffect(() => {
    if (!result) return;
    return onAction("export", () => {
      void exportTerminalPdf(result);
    });
  }, [result]);

  return (
    <div className="min-h-screen">
      <SiteNav />
      <SubHeader query={query} setQuery={setQuery} onSubmit={onSubmit} loading={search.isPending || analyze.isPending} />

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {!search.data && !analyze.data && !search.isPending && !analyze.isPending && <EmptyState />}
        {(search.isPending || analyze.isPending) && <LoadingState label={analyze.isPending ? "Analyzing" : "Searching"} value={query} />}
        {search.isError && <ErrorPanel message="Search failed. Please try again." />}
        {analyze.isError && <ErrorPanel message="Analysis failed. Please try again." />}
        {isError && <ErrorPanel message={(data as any).error} />}

        {showPicker && (
          <DisambiguationPanel matches={matches} onPick={onPickMatch} query={query} />
        )}

        {result && (
          <>
            <SnapshotBar r={result} />
            <Tabs tab={tab} setTab={setTab} />
            <div className="mt-4">
              {tab === "overview" && <OverviewSection r={result} />}
              {tab === "chart" && <ChartSection r={result} />}
              {tab === "scores" && <ScoresSection r={result} />}
              {tab === "value" && <ValueSection r={result} />}
              {tab === "momentum" && <MomentumSection r={result} />}
              {tab === "peers" && <PeersSection r={result} />}
              {tab === "cross" && <CrossSection r={result} />}
              {tab === "scenario" && <ScenarioSection r={result} />}
              {tab === "final" && <FinalSection r={result} />}
            </div>
            <SharedDisclaimer />
          </>
        )}
      </main>
    </div>
  );
}

function SubHeader({ query, setQuery, onSubmit, loading }: { query: string; setQuery: (s: string) => void; onSubmit: (e: React.FormEvent) => void; loading: boolean }) {
  return (
    <div className="border-b border-border bg-card/50">
      <div className="max-w-[1400px] mx-auto px-4 py-2">
        <form onSubmit={onSubmit} className="flex items-center gap-2 max-w-3xl">
          <div className="flex items-center gap-2 flex-1 bg-input border border-border rounded px-3 py-1.5 focus-within:border-primary">
            <span className="text-xs text-muted-foreground font-mono">{">"}</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="TICKER · COMPANY · ISIN (AAPL · RELIANCE.NS · 7203.T · US0378331005)"
              maxLength={80}
              className="flex-1 bg-transparent outline-none font-mono text-sm placeholder:text-muted-foreground/60"
            />
          </div>
          <button type="submit" disabled={loading} className="bg-primary text-primary-foreground font-mono text-xs px-4 py-2 rounded hover:opacity-90 disabled:opacity-50 uppercase tracking-wider">
            {loading ? "Running…" : "Analyze"}
          </button>
        </form>
      </div>
    </div>
  );
}

function EmptyState() {
  const examples = [
    ["AAPL", "Apple — NASDAQ"],
    ["RELIANCE.NS", "Reliance — NSE"],
    ["7203.T", "Toyota — Tokyo"],
    ["0700.HK", "Tencent — HKEX"],
    ["BMW.DE", "BMW — Xetra"],
    ["BHP.AX", "BHP — ASX"],
    ["005930.KS", "Samsung — KRX"],
    ["TSM", "TSMC ADR — NYSE"],
  ];
  return (
    <div className="panel p-10 mt-12">
      <div className="text-center">
        <h2 className="text-lg font-mono text-primary tracking-wider">GLOBAL EQUITY RESEARCH TERMINAL</h2>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl mx-auto">
          Search by ticker or company name across <span className="text-foreground">USA, India, Europe, Japan, Hong Kong, Korea, Taiwan, Singapore, Australia,</span> and Greater China. Run value screens, momentum analysis, and evidence-based recommendations against region-aware peer groups.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-3xl mx-auto">
        {examples.map(([t, l]) => (
          <div key={t} className="border border-border rounded p-2 text-center">
            <div className="font-mono text-primary text-xs">{t}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 text-left max-w-3xl mx-auto text-xs">
        {[
          ["Regional Filters", "Per-market thresholds for price, volume, and USD-equivalent market cap"],
          ["Local Currency", "Always shown in native currency; market cap normalized to USD for comparison"],
          ["Smart Peers", "Same industry → country → region → global fallback"],
        ].map(([h, d]) => (
          <div key={h} className="border border-border rounded p-3">
            <div className="text-primary font-mono uppercase tracking-wider">{h}</div>
            <div className="text-muted-foreground mt-1">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingState({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-10 mt-8 text-center">
      <div className="font-mono text-sm text-primary animate-pulse">{label.toUpperCase()} · {value}</div>
      <div className="text-xs text-muted-foreground mt-3">Resolving listing · fetching peers · computing indicators…</div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="panel mt-8 border-destructive/50">
      <div className="panel-header text-destructive">Error</div>
      <div className="p-6 text-sm">
        <p>{message}</p>
        <ul className="mt-4 text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li>Use exchange suffix for non-US listings (e.g. <span className="font-mono">RELIANCE.NS</span>, <span className="font-mono">7203.T</span>, <span className="font-mono">BMW.DE</span>)</li>
          <li>Try a company name search instead of a ticker</li>
          <li>ETFs, funds, and warrants are not supported</li>
        </ul>
      </div>
    </div>
  );
}

function DisambiguationPanel({ matches, onPick, query }: { matches: Match[]; onPick: (s: string) => void; query: string }) {
  // If single exact match, auto-pick by user clicking. We always show picker so user confirms exchange.
  return (
    <div className="panel mt-6">
      <div className="panel-header">Select Listing · {matches.length} match{matches.length === 1 ? "" : "es"} for "{query}"</div>
      <div className="overflow-x-auto">
        <table className="term">
          <thead>
            <tr><th>Company</th><th>Ticker</th><th>Exchange</th><th>Country</th><th>Currency</th><th>Sector</th><th>Industry</th><th>Mcap (USD)</th><th></th></tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.symbol} className="hover:bg-primary/5 cursor-pointer" onClick={() => onPick(m.symbol)}>
                <td>{m.companyName}</td>
                <td className="text-primary">{m.symbol}</td>
                <td>{m.fullExchange ?? m.exchange ?? "—"}</td>
                <td className="text-muted-foreground">{m.country ?? "—"}</td>
                <td className="text-muted-foreground">{m.currency}</td>
                <td className="text-muted-foreground">{m.sector ?? "—"}</td>
                <td className="text-muted-foreground">{m.industry ?? "—"}</td>
                <td className="num">{fmtMcapUsd(m.marketCapUsd)}</td>
                <td>
                  <button onClick={(e) => { e.stopPropagation(); onPick(m.symbol); }}
                    className="font-mono text-[10px] uppercase tracking-wider border border-primary/50 text-primary px-2 py-1 rounded hover:bg-primary/10">
                    Analyze
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
        Multiple listings of the same company may trade in different currencies and exchanges. Select the one you want to analyze.
      </div>
    </div>
  );
}

function SnapshotBar({ r }: { r: Success }) {
  const t = r.target;
  const wl = useWatchlist();
  const inList = wl.has(t.symbol);
  return (
    <div className="panel mb-4">
      <div className="p-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t.sector ?? "—"} · {t.industry ?? "—"}</div>
          <div className="flex items-baseline gap-3 mt-1 flex-wrap">
            <span className="font-mono text-2xl text-primary font-semibold">{t.symbol}</span>
            <span className="text-sm text-muted-foreground">{t.companyName}</span>
            <span className="text-[10px] font-mono uppercase border border-border rounded px-1.5 py-0.5 text-muted-foreground">
              {t.fullExchange ?? t.exchange ?? "—"} · {t.country ?? t.region} · {t.currency}
            </span>
            <ProviderBadge source={t.source} />
            <button
              onClick={() => (inList ? wl.remove(t.symbol) : wl.add([t.symbol]))}
              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border transition-colors ${inList ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {inList ? "★ In Watchlist" : "☆ Add to Watchlist"}
            </button>
            <button
              onClick={() => {
                void exportTerminalPdf(r);
              }}
              title="Download PDF report (press E)"
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              ⬇ Download Report
            </button>
          </div>
        </div>
        <SnapshotStats t={t} />
      </div>
      <div className="px-4 py-2 flex flex-wrap gap-3 text-xs font-mono">
        <Pill ok={t.passesGlobal} label={`Liquidity (${t.region}): ${t.passesGlobal ? "PASS" : "FAIL"}`} />
        <Pill ok={t.passesValue} label={`Value Screen: ${t.passesValue ? "PASS" : "FAIL"}`} />
        <Pill ok={t.recommendation.rec === "Buy"} warn={t.recommendation.rec === "Watch"} label={`Rec: ${t.recommendation.rec}`} />
        <span className="text-muted-foreground">Outlook: <span className="text-foreground">{t.outlook}</span> · Conf: {t.confidence}</span>
      </div>
    </div>
  );
}

function SnapshotStats({ t }: { t: any }) {
  const [mode] = useDisplayCurrency();
  return (
    <div className="ml-auto flex items-baseline gap-6 font-mono">
      <Stat
        label="PRICE"
        value={fmtPriceDisplay(t.price, t.currency, t.marketCap, t.marketCapUsd, mode)}
        sub={mode === "USD" && (t.currency ?? "").toUpperCase() !== "USD" ? fmtPrice(t.price, t.currency) : undefined}
      />
      <Stat label="5D" value={fmtPct(t.perf5d)} cls={colorFor(t.perf5d)} />
      <Stat label="RSI" value={fmtNum(t.rsi14, 1)} cls={t.rsi14 == null ? "" : t.rsi14 > 70 ? "text-[color:var(--bear)]" : t.rsi14 < 30 ? "text-[color:var(--bull)]" : ""} />
      <Stat
        label="MCAP"
        value={fmtMcapDisplay(t.marketCap, t.marketCapUsd, t.currency, mode)}
        sub={mode === "local" && t.marketCapUsd ? fmtMcapUsd(t.marketCapUsd) : undefined}
      />
    </div>
  );
}

function Stat({ label, value, cls = "", sub }: { label: string; value: string; cls?: string; sub?: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] text-muted-foreground tracking-wider">{label}</div>
      <div className={`text-sm ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">≈ {sub}</div>}
    </div>
  );
}

function Pill({ ok, warn, label }: { ok?: boolean; warn?: boolean; label: string }) {
  const cls = ok ? "border-[color:var(--bull)]/50 text-[color:var(--bull)]"
    : warn ? "border-primary/50 text-primary"
    : "border-[color:var(--bear)]/50 text-[color:var(--bear)]";
  return <span className={`px-2 py-0.5 rounded border ${cls}`}>{label}</span>;
}

function Tabs({ tab, setTab }: { tab: string; setTab: (t: any) => void }) {
  const tabs: Array<[string, string]> = [
    ["overview", "Overview"],
    ["chart", "Chart"],
    ["scores", "Scores"],
    ["value", "Value Screen"],
    ["momentum", "Momentum"],
    ["peers", "Peers"],
    ["cross", "Cross-Analysis"],
    ["scenario", "Scenario"],
    ["final", "Final Recommendation"],
  ];
  return (
    <div className="flex border-b border-border overflow-x-auto">
      {tabs.map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)}
          className={`px-4 py-2 text-xs font-mono uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

// Helper function for contextual advice
function getContextualAdvice(t: Success["target"]): React.ReactNode {
  const advice: Array<{ type: "bullish" | "bearish" | "neutral"; title: string; content: string }> = [];

  // Value + Momentum combination analysis
  if (t.passesValue && (t.perf5d ?? 0) > 0) {
    advice.push({
      type: "bullish",
      title: "Value + Momentum Alignment",
      content: "Stock qualifies as value candidate AND showing positive momentum. This rare combination suggests the market may be recognizing undervaluation. Consider entry with stop loss below recent lows."
    });
  }

  // Oversold RSI with value
  if ((t.rsi14 ?? 50) < 30 && t.passesValue) {
    advice.push({
      type: "bullish",
      title: "Deep Value Opportunity",
      content: `RSI of ${(t.rsi14 ?? 50).toFixed(1)} indicates oversold conditions combined with attractive valuation. Historical data shows this setup often precedes mean reversion, but confirm trend direction before positioning.`
    });
  }

  // Overbought warning
  if ((t.rsi14 ?? 50) > 70) {
    advice.push({
      type: "bearish",
      title: "Overbought Warning",
      content: `RSI of ${(t.rsi14 ?? 50).toFixed(1)} suggests overextended upside. Consider taking partial profits or waiting for pullback before new entries. Watch for negative divergence.`
    });
  }

  // High P/E with weak momentum
  if ((t.pe ?? 0) > 30 && (t.perf5d ?? 0) < 0) {
    advice.push({
      type: "bearish",
      title: "Valuation Risk",
      content: `High P/E of ${(t.pe ?? 0).toFixed(1)} combined with negative momentum raises concern about growth expectations. Avoid until valuation compresses or momentum improves.`
    });
  }

  // Strong momentum trend
  const above20 = !!(t.price && t.ma20 && t.price > t.ma20);
  const above50 = !!(t.price && t.ma50 && t.price > t.ma50);
  const above200 = !!(t.price && t.ma200 && t.price > t.ma200);

  if (above20 && above50 && above200) {
    advice.push({
      type: "bullish",
      title: "Trend Confirmation",
      content: "Price above all key moving averages (20D, 50D, 200D) confirms strong uptrend. This is technically constructive for long positions. Use pullbacks to MA levels as entry opportunities."
    });
  }

  if (!above20 && !above50 && !above200) {
    advice.push({
      type: "bearish",
      title: "Trend Breakdown",
      content: "Price below all key moving averages indicates broken trend. Avoid long positions until price reclaim at least the 50D MA. This could be a value trap or the start of a deeper decline."
    });
  }

  // Near 52W low analysis
  if ((t.pctFromLow ?? 100) < 10) {
    if (t.passesValue) {
      advice.push({
        type: "bullish",
        title: "52W Low Proximity",
        content: `Trading only ${(t.pctFromLow ?? 100).toFixed(1)}% above 52W low with value metrics. This could be a底部ing opportunity if fundamentals remain intact. Watch for volume confirmation on reversal.`
      });
    } else {
      advice.push({
        type: "neutral",
        title: "52W Low Risk",
        content: `Near 52W low but valuation doesn't support value thesis. Could be a value trap - investigate fundamental deterioration before considering.`
      });
    }
  }

  // Momentum shift detection
  const roc14 = t.roc14 ?? 0;
  const roc21 = t.roc21 ?? 0;
  if (roc14 > 0 && roc21 < 0) {
    advice.push({
      type: "bullish",
      title: "Momentum Shift",
      content: "Short-term ROC (14D) turned positive while medium-term (21D) remains negative. This early bullish divergence suggests potential trend reversal forming. Monitor for confirmation."
    });
  }

  if (roc14 < 0 && roc21 > 0) {
    advice.push({
      type: "bearish",
      title: "Momentum Deterioration",
      content: "Short-term ROC (14D) turned negative while medium-term (21D) remains positive. This bearish divergence suggests trend may be weakening. Consider defensive positioning."
    });
  }

  // If no specific advice, provide general guidance
  if (advice.length === 0) {
    advice.push({
      type: "neutral",
      title: "Mixed Signals",
      content: "No strong directional bias from current metric combination. Market appears to be in wait-and-see mode. Consider waiting for clearer catalyst or indicator convergence before taking large positions."
    });
  }

  return (
    <>
      {advice.map((item, index) => (
        <div key={index} className={`flex items-start gap-3 p-3 rounded-lg border ${
          item.type === "bullish" ? "bg-[color:var(--bull)]/5 border-[color:var(--bull)]/20" :
          item.type === "bearish" ? "bg-[color:var(--bear)]/5 border-[color:var(--bear)]/20" :
          "bg-primary/5 border-primary/20"
        }`}>
          <div className={`mt-0.5 flex-shrink-0 ${
            item.type === "bullish" ? "text-[color:var(--bull)]" :
            item.type === "bearish" ? "text-[color:var(--bear)]" :
            "text-primary"
          }`}>
            {item.type === "bullish" ? "▲" : item.type === "bearish" ? "▼" : "◆"}
          </div>
          <div className="flex-1">
            <div className={`font-semibold mb-1 ${
              item.type === "bullish" ? "text-[color:var(--bull)]" :
              item.type === "bearish" ? "text-[color:var(--bear)]" :
              "text-primary"
            }`}>
              {item.title}
            </div>
            <div className="text-muted-foreground leading-relaxed">{item.content}</div>
          </div>
        </div>
      ))}
    </>
  );
}

// Helper function for peer comparison highlights
function getPeerComparison(t: Success["target"], peers: Success["peers"]): React.ReactNode {
  const allPeers = peers || [];
  if (!allPeers || allPeers.length === 0) return <div className="text-muted-foreground">No peer data available for comparison</div>;

  // Calculate peer averages with defensive checks
  const avgPE = allPeers.reduce((sum, p) => sum + (p.pe ?? 0), 0) / allPeers.length;
  const avgMcapUsd = allPeers.reduce((sum, p) => sum + (p.marketCapUsd ?? 0), 0) / allPeers.length;
  const avgRSI = allPeers.reduce((sum, p) => sum + (p.rsi14 ?? 50), 0) / allPeers.length;
  const avgPerf5d = allPeers.reduce((sum, p) => sum + (p.perf5d ?? 0), 0) / allPeers.length;

  const comparisons: Array<{ metric: string; target: number; peerAvg: number; better: boolean; interpretation: string }> = [];

  // P/E comparison
  if (t.pe && avgPE > 0) {
    const better = t.pe < avgPE;
    comparisons.push({
      metric: "P/E Ratio",
      target: t.pe,
      peerAvg: avgPE,
      better,
      interpretation: better
        ? `Trading at ${(t.pe / avgPE * 100).toFixed(0)}% of sector average - potentially undervalued vs peers`
        : `Trading at ${(t.pe / avgPE * 100).toFixed(0)}% of sector average - premium valuation suggests growth expectations`
    });
  }

  // Market cap comparison
  if (t.marketCapUsd && avgMcapUsd > 0) {
    const better = t.marketCapUsd > avgMcapUsd;
    comparisons.push({
      metric: "Market Cap",
      target: t.marketCapUsd,
      peerAvg: avgMcapUsd,
      better,
      interpretation: better
        ? `Larger than peers by ${(t.marketCapUsd / avgMcapUsd).toFixed(1)}x - industry leader with potential stability premium`
        : `Smaller than peers by ${(avgMcapUsd / t.marketCapUsd).toFixed(1)}x - higher growth potential but also higher risk`
    });
  }

  // RSI comparison
  if (t.rsi14) {
    const better = t.rsi14 < avgRSI && t.rsi14 < 50;
    comparisons.push({
      metric: "RSI (14D)",
      target: t.rsi14,
      peerAvg: avgRSI,
      better,
      interpretation: better
        ? `RSI ${(avgRSI - t.rsi14).toFixed(1)} points below peer average - potentially oversold relative to sector`
        : `RSI ${(t.rsi14 - avgRSI).toFixed(1)} points above peer average - stronger momentum or overextended`
    });
  }

  // 5D performance comparison
  if (t.perf5d != null) {
    const better = t.perf5d > avgPerf5d;
    comparisons.push({
      metric: "5D Performance",
      target: t.perf5d,
      peerAvg: avgPerf5d,
      better,
      interpretation: better
        ? `Outperforming peers by ${(t.perf5d - avgPerf5d).toFixed(1)}% - strong relative strength`
        : `Underperforming peers by ${(avgPerf5d - t.perf5d).toFixed(1)}% - relative weakness or sector rotation`
    });
  }

  if (comparisons.length === 0) {
    return <div className="text-muted-foreground">Insufficient peer data for comparison</div>;
  }

  return (
    <>
      {comparisons.map((comp, index) => (
        <div key={index} className={`flex items-start gap-2 p-2 rounded ${
          comp.better ? "bg-[color:var(--bull)]/5" : "bg-[color:var(--bear)]/5"
        }`}>
          <div className={`flex-shrink-0 ${comp.better ? "text-[color:var(--bull)]" : "text-[color:var(--bear)]"}`}>
            {comp.better ? "✓" : "✗"}
          </div>
          <div className="flex-1">
            <div className="font-medium text-foreground">
              {comp.metric}: {comp.better ? "Better than peers" : "Worse than peers"}
            </div>
            <div className="text-muted-foreground">
              {comp.metric}: {fmtNum(comp.target, 1)} vs peer avg {fmtNum(comp.peerAvg, 1)}
            </div>
            <div className="text-muted-foreground italic">
              {comp.interpretation}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

// Helper function for actionable insights
function getActionableInsights(t: Success["target"]): React.ReactNode {
  const watchItems: Array<{ priority: "high" | "medium" | "low"; metric: string; alert: string; action: string }> = [];

  // High priority alerts
  if ((t.rsi14 ?? 50) > 75) {
    watchItems.push({
      priority: "high",
      metric: "RSI",
      alert: `RSI at ${(t.rsi14 ?? 50).toFixed(1)} is extremely overbought`,
      action: "Consider taking profits or setting tighter stop-losses. Watch for negative divergence where price makes new highs but RSI doesn't."
    });
  }

  if ((t.rsi14 ?? 50) < 25) {
    watchItems.push({
      priority: "high",
      metric: "RSI",
      alert: `RSI at ${(t.rsi14 ?? 50).toFixed(1)} is deeply oversold`,
      action: "Monitor for reversal signals with volume confirmation. Could be accumulation phase or fundamental deterioration - verify with earnings and news."
    });
  }

  if ((t.pe ?? 0) > 40) {
    watchItems.push({
      priority: "high",
      metric: "Valuation",
      alert: `P/E of ${(t.pe ?? 0).toFixed(1)} is very high`,
      action: "Ensure growth expectations are supported by fundamentals. High P/E stocks are vulnerable to disappointments. Consider position sizing."
    });
  }

  // Medium priority alerts
  const above20 = !!(t.price && t.ma20 && t.price > t.ma20);
  const above50 = !!(t.price && t.ma50 && t.price > t.ma50);
  const above200 = !!(t.price && t.ma200 && t.price > t.ma200);

  if (!above50 && above200) {
    watchItems.push({
      priority: "medium",
      metric: "Moving Averages",
      alert: "Price below 50D MA but above 200D MA",
      action: "Intermediate-term correction within long-term uptrend. Watch for support at 200D MA. This could be buying opportunity if trend remains intact."
    });
  }

  if (above50 && !above200) {
    watchItems.push({
      priority: "medium",
      metric: "Moving Averages",
      alert: "Price above 50D MA but below 200D MA",
      action: "Short-term rebound but long-term trend still questionable. Wait for 200D MA crossover confirmation before committing significant capital."
    });
  }

  if ((t.perf5d ?? 0) < -5) {
    watchItems.push({
      priority: "medium",
      metric: "Momentum",
      alert: `5D performance of ${(t.perf5d ?? 0).toFixed(1)}% is weak`,
      action: "Investigate cause of decline - check news, earnings guidance, or sector issues. Determine if this is overreaction or fundamental change."
    });
  }

  if ((t.pctFromLow ?? 100) > 80) {
    watchItems.push({
      priority: "medium",
      metric: "52W Range",
      alert: `Trading ${(t.pctFromLow ?? 100).toFixed(1)}% above 52W low`,
      action: "Stock is extended from lows - risk of pullback increases. Consider partial profit-taking and wait for better entry on pullbacks to support levels."
    });
  }

  // Low priority alerts
  if ((t.pe ?? 0) < 10 && !t.passesValue) {
    watchItems.push({
      priority: "low",
      metric: "Valuation",
      alert: `Low P/E of ${(t.pe ?? 0).toFixed(1)} but doesn't pass value screen`,
      action: "Investigate why value screen failed - may be due to weak fundamentals, liquidity issues, or technical concerns. Could be value trap."
    });
  }

  if (t.avgVolume && t.avgVolume < 100000) {
    watchItems.push({
      priority: "low",
      metric: "Liquidity",
      alert: "Low average daily volume",
      action: "Be cautious with position sizing - low volume stocks can be volatile and have wide bid-ask spreads. Consider limit orders."
    });
  }

  if (watchItems.length === 0) {
    return (
      <div className="text-muted-foreground p-3 bg-primary/5 rounded-lg">
        <div className="font-medium text-foreground mb-1">No Immediate Concerns</div>
        <div>Current metrics don't trigger any watch alerts. Stock appears to be in normal trading range. Continue monitoring for changes in key indicators.</div>
      </div>
    );
  }

  return (
    <>
      {watchItems.map((item, index) => (
        <div key={index} className={`flex items-start gap-3 p-3 rounded-lg border ${
          item.priority === "high" ? "bg-[color:var(--bear)]/5 border-[color:var(--bear)]/20" :
          item.priority === "medium" ? "bg-primary/5 border-primary/20" :
          "bg-muted/5 border-muted/20"
        }`}>
          <div className={`mt-0.5 flex-shrink-0 font-bold ${
            item.priority === "high" ? "text-[color:var(--bear)]" :
            item.priority === "medium" ? "text-primary" :
            "text-muted-foreground"
          }`}>
            {item.priority === "high" ? "⚠" : item.priority === "medium" ? "◆" : "○"}
          </div>
          <div className="flex-1">
            <div className="font-medium text-foreground">
              {item.metric}: {item.alert}
            </div>
            <div className="text-muted-foreground mt-1">{item.action}</div>
          </div>
        </div>
      ))}
    </>
  );
}

// Helper function for metric trend indicators
function getMetricTrends(t: Success["target"]): React.ReactNode {
  const trends: Array<{ metric: string; trend: "improving" | "deteriorating" | "stable"; description: string }> = [];
  const closes = t.closes ?? [];

  // Early return if insufficient data
  if (!closes || closes.length < 5) {
    return <div className="text-muted-foreground">Insufficient historical data for trend analysis</div>;
  }
  
  // Price trend based on recent closes
  if (closes.length >= 10) {
    const recent5 = closes.slice(-5);
    const previous5 = closes.slice(-10, -5);
    const avgRecent = recent5.reduce((a, b) => a + b, 0) / recent5.length;
    const avgPrevious = previous5.reduce((a, b) => a + b, 0) / previous5.length;
    
    if (avgRecent > avgPrevious * 1.02) {
      trends.push({
        metric: "Price Action",
        trend: "improving",
        description: `Recent 5-day average (+${((avgRecent / avgPrevious - 1) * 100).toFixed(1)}%) higher than previous 5 days - short-term uptrend intact`
      });
    } else if (avgRecent < avgPrevious * 0.98) {
      trends.push({
        metric: "Price Action",
        trend: "deteriorating",
        description: `Recent 5-day average (${((avgRecent / avgPrevious - 1) * 100).toFixed(1)}%) lower than previous 5 days - short-term weakening`
      });
    } else {
      trends.push({
        metric: "Price Action",
        trend: "stable",
        description: "Price action is consolidating with no clear directional bias in recent sessions"
      });
    }
  }

  // RSI trend
  if (closes.length >= 20 && t.rsi14) {
    const recentRSI = t.rsi14;
    // Calculate RSI from 5 days ago by using closes from that period
    const closes5DaysAgo = closes.slice(-20, -15);
    if (closes5DaysAgo.length >= 14) {
      const rsi5DaysAgo = calculateRSI(closes5DaysAgo, 14);
      if (rsi5DaysAgo !== null) {
        if (recentRSI > rsi5DaysAgo + 5) {
          trends.push({
            metric: "RSI Momentum",
            trend: "improving",
            description: `RSI increased from ${rsi5DaysAgo.toFixed(1)} to ${recentRSI.toFixed(1)} over 5 days - gaining bullish momentum`
          });
        } else if (recentRSI < rsi5DaysAgo - 5) {
          trends.push({
            metric: "RSI Momentum",
            trend: "deteriorating",
            description: `RSI decreased from ${rsi5DaysAgo.toFixed(1)} to ${recentRSI.toFixed(1)} over 5 days - losing bullish momentum`
          });
        } else {
          trends.push({
            metric: "RSI Momentum",
            trend: "stable",
            description: `RSI stable around ${recentRSI.toFixed(1)} over recent sessions - no momentum shift detected`
          });
        }
      }
    }
  }

  // Moving average relationship trend
  const above20 = !!(t.price && t.ma20 && t.price > t.ma20);
  const above50 = !!(t.price && t.ma50 && t.price > t.ma50);
  
  if (above20 && above50) {
    if (t.ma20 && t.ma50 && t.ma20 > t.ma50) {
      trends.push({
        metric: "MA Structure",
        trend: "improving",
        description: "Golden cross pattern (20D MA above 50D MA) with price above both - strong bullish structure"
      });
    } else {
      trends.push({
        metric: "MA Structure",
        trend: "stable",
        description: "Price above key MAs but 20D MA still below 50D MA - waiting for bullish MA crossover confirmation"
      });
    }
  } else if (!above20 && !above50) {
    trends.push({
      metric: "MA Structure",
      trend: "deteriorating",
      description: "Price below key moving averages - bearish structure, wait for MA crossover reversal signal"
    });
  } else {
    trends.push({
      metric: "MA Structure",
      trend: "stable",
      description: "Mixed MA signals - price between moving averages suggests consolidation phase"
    });
  }

  // Volatility trend (using range expansion)
  if (closes.length >= 20) {
    const recent10 = closes.slice(-10);
    const recentRange = Math.max(...recent10) - Math.min(...recent10);
    const previous10 = closes.slice(-20, -10);
    const previousRange = Math.max(...previous10) - Math.min(...previous10);
    
    if (recentRange > previousRange * 1.3) {
      trends.push({
        metric: "Volatility",
        trend: "deteriorating",
        description: "Volatility expanding significantly - increased risk and potential for sharp moves in either direction"
      });
    } else if (recentRange < previousRange * 0.7) {
      trends.push({
        metric: "Volatility",
        trend: "improving",
        description: "Volatility contracting - price action becoming more stable, potentially coiling for breakout"
      });
    }
  }

  if (trends.length === 0) {
    return (
      <div className="text-muted-foreground p-3 bg-primary/5 rounded-lg">
        <div className="font-medium text-foreground mb-1">Insufficient Trend Data</div>
        <div>Not enough historical data to determine metric trends. Continue monitoring for pattern development.</div>
      </div>
    );
  }

  return (
    <>
      {trends.map((trend, index) => (
        <div key={index} className={`flex items-start gap-2 p-2 rounded ${
          trend.trend === "improving" ? "bg-[color:var(--bull)]/5" :
          trend.trend === "deteriorating" ? "bg-[color:var(--bear)]/5" :
          "bg-primary/5"
        }`}>
          <div className={`mt-0.5 flex-shrink-0 ${
            trend.trend === "improving" ? "text-[color:var(--bull)]" :
            trend.trend === "deteriorating" ? "text-[color:var(--bear)]" :
            "text-primary"
          }`}>
            {trend.trend === "improving" ? "↑" : trend.trend === "deteriorating" ? "↓" : "→"}
          </div>
          <div className="flex-1">
            <div className={`font-medium text-foreground ${
              trend.trend === "improving" ? "text-[color:var(--bull)]" :
              trend.trend === "deteriorating" ? "text-[color:var(--bear)]" :
              "text-primary"
            }`}>
              {trend.metric}: {trend.trend === "improving" ? "Improving" : trend.trend === "deteriorating" ? "Deteriorating" : "Stable"}
            </div>
            <div className="text-muted-foreground italic">{trend.description}</div>
          </div>
        </div>
      ))}
    </>
  );
}

// Simple RSI calculation helper
function calculateRSI(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Helper function for historical context
function getHistoricalContext(t: Success["target"]): React.ReactNode {
  const contexts: Array<{ metric: string; context: string; percentile: string; interpretation: string }> = [];
  const closes = t.closes ?? [];

  // Early return if insufficient data
  if (!closes || closes.length < 20) {
    return <div className="text-muted-foreground">Insufficient historical data for context analysis (need 20+ data points)</div>;
  }

  // Current price vs historical range
  if (closes.length >= 20) {
    const currentPrice = t.price;
    const recentHigh = Math.max(...closes);
    const recentLow = Math.min(...closes);
    const percentile = currentPrice && recentHigh > recentLow 
      ? ((currentPrice - recentLow) / (recentHigh - recentLow)) * 100 
      : null;
    
    if (currentPrice && percentile !== null) {
      let context = "";
      if (percentile > 80) context = "Near historical highs - potentially overextended";
      else if (percentile > 60) context = "In upper portion of historical range";
      else if (percentile < 20) context = "Near historical lows - potentially undervalued";
      else if (percentile < 40) context = "In lower portion of historical range";
      else context = "Trading in middle of historical range";
      
      contexts.push({
        metric: "Price Level",
        context,
        percentile: `At ${percentile.toFixed(0)}th percentile of recent range`,
        interpretation: percentile < 30 
          ? "Current price is in lower 30% of recent range - could be value opportunity if fundamentals support" 
          : percentile > 70 
          ? "Current price is in upper 30% of recent range - ensure fundamentals justify premium or consider waiting for pullback" 
          : "Current price is in middle of recent range - no extreme positioning"
      });
    }
  }

  // RSI historical context
  if (closes.length >= 50) {
    const rsiHistory: number[] = [];
    for (let i = 14; i < closes.length; i++) {
      const windowCloses = closes.slice(i - 14, i + 1);
      const rsi = calculateRSI(windowCloses, 14);
      if (rsi !== null) rsiHistory.push(rsi);
    }
    
    if (rsiHistory.length > 10 && t.rsi14) {
      const highRSI = Math.max(...rsiHistory);
      const lowRSI = Math.min(...rsiHistory);
      const rsiPercentile = highRSI > lowRSI ? ((t.rsi14 - lowRSI) / (highRSI - lowRSI)) * 100 : 50;
      
      let context = "";
      if (rsiPercentile > 75) context = "RSI near historical highs - stock is technically stretched";
      else if (rsiPercentile > 50) context = "RSI in upper half of historical range";
      else if (rsiPercentile < 25) context = "RSI near historical lows - oversold conditions relative to recent history";
      else if (rsiPercentile < 50) context = "RSI in lower half of historical range";
      else context = "RSI at middle of historical range";
      
      contexts.push({
        metric: "RSI Context",
        context,
        percentile: `At ${rsiPercentile.toFixed(0)}th percentile of recent RSI range (${lowRSI.toFixed(0)}-${highRSI.toFixed(0)})`,
        interpretation: rsiPercentile < 20
          ? "RSI is in lowest 20% of recent readings - historically this has preceded reversals, but confirm with other indicators"
          : rsiPercentile > 80
          ? "RSI is in highest 20% of recent readings - historically elevated momentum often precedes pullbacks"
          : "RSI is within normal historical range - no extreme positioning"
      });
    }
  }

  // Volatility context
  if (closes.length >= 30) {
    const recentVolatility = calculateVolatility(closes.slice(-20));
    const historicalVolatility = calculateVolatility(closes.slice(-60, -20));
    
    if (recentVolatility && historicalVolatility) {
      const volRatio = recentVolatility / historicalVolatility;
      let context = "";
      if (volRatio > 1.5) context = "Recent volatility significantly elevated - stock in high-volatility regime";
      else if (volRatio > 1.2) context = "Recent volatility above historical average - increased uncertainty";
      else if (volRatio < 0.7) context = "Recent volatility below historical average - stock stabilizing";
      else if (volRatio < 0.5) context = "Recent volatility much lower than historical - unusually calm period";
      else context = "Recent volatility around historical average";
      
      contexts.push({
        metric: "Volatility Regime",
        context,
        percentile: volRatio > 1 ? `${(volRatio * 100).toFixed(0)}% of historical average` : `${(volRatio * 100).toFixed(0)}% of historical average`,
        interpretation: volRatio > 1.3
          ? "Elevated volatility increases risk but also opportunity - consider position sizing and use wider stops"
          : volRatio < 0.7
          ? "Low volatility could indicate consolidation before directional move - be prepared for breakout or breakdown"
          : "Normal volatility environment - standard risk management applies"
      });
    }
  }

  if (contexts.length === 0) {
    return (
      <div className="text-muted-foreground p-3 bg-primary/5 rounded-lg">
        <div className="font-medium text-foreground mb-1">Insufficient Historical Data</div>
        <div>Need more historical data to provide context. Continue monitoring as data accumulates.</div>
      </div>
    );
  }

  return (
    <>
      {contexts.map((ctx, index) => (
        <div key={index} className="flex items-start gap-3 p-3 rounded-lg border border-border">
          <div className="mt-0.5 flex-shrink-0 text-primary">
            <MetricLabel term={ctx.metric.toLowerCase().replace(" ", "")}>{ctx.metric}</MetricLabel>
          </div>
          <div className="flex-1">
            <div className="font-medium text-foreground mb-1">{ctx.context}</div>
            <div className="text-muted-foreground mb-1">{ctx.percentile}</div>
            <div className="text-muted-foreground italic">{ctx.interpretation}</div>
          </div>
        </div>
      ))}
    </>
  );
}

// Simple volatility calculation helper
function calculateVolatility(closes: number[]): number | null {
  if (closes.length < 2) return null;
  
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  
  if (returns.length === 0) return null;
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized volatility in percent
}

function OverviewSection({ r }: { r: Success }) {
  const t = r.target;
  const f = t.filter;
  
  // Customizable metric views state
  const [visibleGroups, setVisibleGroups] = useState<string[]>(["fundamentals", "technicals", "momentum", "valuation"]);
  
  const toggleGroup = (group: string) => {
    setVisibleGroups(prev => 
      prev.includes(group) 
        ? prev.filter(g => g !== group)
        : [...prev, group]
    );
  };

  // Treat analyze target as live data (analyze never returns mock).
  const provRow = { isMock: false, source: t.source ?? "Finimpulse", retrievedAt: new Date().toISOString(), closes: t.closes };
  const sv = (field: Parameters<typeof provenanceFor>[1], value: number | null) => provenanceFor(provRow, field, value);

  // Helper to determine metric health
  const getMetricHealth = (metric: string, value: number | null): "good" | "neutral" | "bad" | null => {
    if (value == null) return null;
    switch (metric) {
      case "pe":
        return value < 15 ? "good" : value < 25 ? "neutral" : "bad";
      case "rsi14":
        return value < 30 ? "good" : value < 70 ? "neutral" : "bad";
      case "pctFromLow":
        return value < 10 ? "good" : value < 50 ? "neutral" : "bad";
      case "perf5d":
        return value > 2 ? "good" : value > -2 ? "neutral" : "bad";
      case "roc14":
        return value > 3 ? "good" : value > -3 ? "neutral" : "bad";
      case "roc21":
        return value > 5 ? "good" : value > -5 ? "neutral" : "bad";
      default:
        return null;
    }
  };

  // Helper to get metric-specific tooltip message
  const getMetricTooltip = (metric: string, value: number | null): string => {
    if (value == null) return "Data not available";
    switch (metric) {
      case "pe":
        if (value < 10) return `P/E of ${value.toFixed(1)} is very low - stock may be undervalued or facing fundamental issues`;
        if (value < 15) return `P/E of ${value.toFixed(1)} suggests attractive valuation - compare with sector average`;
        if (value < 25) return `P/E of ${value.toFixed(1)} is reasonable - growth expectations are moderate`;
        if (value < 35) return `P/E of ${value.toFixed(1)} is elevated - stock priced for growth`;
        return `P/E of ${value.toFixed(1)} is high - ensure growth justifies premium`;
      case "rsi14":
        if (value < 20) return `RSI of ${value.toFixed(1)} is deeply oversold - potential bounce opportunity but watch for trend`;
        if (value < 30) return `RSI of ${value.toFixed(1)} is oversold - consider accumulation if other signals align`;
        if (value < 45) return `RSI of ${value.toFixed(1)} is in neutral zone - no strong momentum signal`;
        if (value < 55) return `RSI of ${value.toFixed(1)} is balanced - wait for directional confirmation`;
        if (value < 70) return `RSI of ${value.toFixed(1)} is in neutral zone - momentum is neither strong nor weak`;
        if (value < 80) return `RSI of ${value.toFixed(1)} is overbought - consider taking profits or waiting for pullback`;
        return `RSI of ${value.toFixed(1)} is extremely overbought - high risk of short-term reversal`;
      case "pctFromLow":
        if (value < 5) return `Trading only ${value.toFixed(1)}% above 52W low - could be value opportunity or value trap`;
        if (value < 15) return `Trading ${value.toFixed(1)}% above 52W low - attractive if fundamentals are sound`;
        if (value < 35) return `Trading ${value.toFixed(1)}% above 52W low - reasonable entry point for long-term holders`;
        if (value < 60) return `Trading ${value.toFixed(1)}% above 52W low - waiting for better entry may be prudent`;
        return `Trading ${value.toFixed(1)}% above 52W low - stock has moved significantly from lows`;
      case "perf5d":
        if (value > 5) return `Strong ${value.toFixed(1)}% gain in 5 days - momentum is bullish but watch for exhaustion`;
        if (value > 2) return `Positive ${value.toFixed(1)}% in 5 days - short-term momentum is favorable`;
        if (value > -2) return `Flat ${value.toFixed(1)}% in 5 days - stock is consolidating, waiting for catalyst`;
        if (value > -5) return `Negative ${value.toFixed(1)}% in 5 days - short-term weakness, assess if overreaction`;
        return `Significant ${value.toFixed(1)}% drop in 5 days - either opportunity or deteriorating fundamentals`;
      case "roc14":
        if (value > 8) return `ROC14 of ${value.toFixed(1)}% shows strong momentum - monitor for divergence`;
        if (value > 3) return `ROC14 of ${value.toFixed(1)}% indicates positive momentum - trend is intact`;
        if (value > -3) return `ROC14 of ${value.toFixed(1)}% is neutral - no clear directional bias`;
        if (value > -8) return `ROC14 of ${value.toFixed(1)}% shows weakening momentum - trend may be reversing`;
        return `ROC14 of ${value.toFixed(1)}% indicates strong negative momentum - avoid until stabilization`;
      case "roc21":
        if (value > 10) return `ROC21 of ${value.toFixed(1)}% shows very strong medium-term momentum`;
        if (value > 5) return `ROC21 of ${value.toFixed(1)}% indicates healthy medium-term uptrend`;
        if (value > -5) return `ROC21 of ${value.toFixed(1)}% is neutral - medium-term trend is flat`;
        if (value > -10) return `ROC21 of ${value.toFixed(1)}% shows medium-term weakness`;
        return `ROC21 of ${value.toFixed(1)}% indicates strong medium-term downtrend`;
      default:
        return "";
    }
  };

  const healthColor = (health: "good" | "neutral" | "bad" | null) => {
    if (!health) return "";
    return health === "good" ? "text-[color:var(--bull)]" : health === "bad" ? "text-[color:var(--bear)]" : "text-primary";
  };

  const healthIndicator = (health: "good" | "neutral" | "bad" | null) => {
    if (!health) return null;
    const color = health === "good" ? "bg-[color:var(--bull)]" : health === "bad" ? "bg-[color:var(--bear)]" : "bg-primary";
    return <span className={`w-2 h-2 rounded-full ${color}`} />;
  };

  // Grouped metrics for better organization
  const fundamentalMetrics = [
    { k: "Price", v: <SourcedCell provenance={sv("price", t.price)}>{fmtPrice(t.price, t.currency)}</SourcedCell>, health: null, metricKey: "price", value: t.price },
    { k: "Market Cap (USD)", v: <SourcedCell provenance={sv("marketCapUsd", t.marketCapUsd)}>{fmtMcapUsd(t.marketCapUsd)}</SourcedCell>, health: null, metricKey: "marketCapUsd", value: t.marketCapUsd },
    { k: "Trailing P/E", v: <SourcedCell provenance={sv("pe", t.pe)}>{fmtNum(t.pe)}</SourcedCell>, health: getMetricHealth("pe", t.pe), metricKey: "pe", value: t.pe },
    { k: "Avg Daily Volume", v: <SourcedCell provenance={sv("avgVolume", t.avgVolume)}>{fmtVol(t.avgVolume)}</SourcedCell>, health: null, metricKey: "avgVolume", value: t.avgVolume },
  ];

  const technicalMetrics = [
    { k: "RSI 14D", v: <SourcedCell provenance={sv("rsi14", t.rsi14)}>{fmtNum(t.rsi14, 1)} ({t.rsiLabel})</SourcedCell>, health: getMetricHealth("rsi14", t.rsi14), metricKey: "rsi14", value: t.rsi14 },
    { k: "Price vs 20D MA", v: <SourcedCell provenance={sv("ma20", t.ma20)}>{vsMA(t.price, t.ma20).label} ({fmtPrice(t.ma20, t.currency)})</SourcedCell>, health: null, metricKey: "ma20", value: t.ma20 },
    { k: "Price vs 50D MA", v: <SourcedCell provenance={sv("ma50", t.ma50)}>{vsMA(t.price, t.ma50).label} ({fmtPrice(t.ma50, t.currency)})</SourcedCell>, health: null, metricKey: "ma50", value: t.ma50 },
    { k: "Price vs 200D MA", v: <SourcedCell provenance={sv("ma200", t.ma200)}>{vsMA(t.price, t.ma200).label} ({fmtPrice(t.ma200, t.currency)})</SourcedCell>, health: null, metricKey: "ma200", value: t.ma200 },
  ];

  const momentumMetrics = [
    { k: "5D Performance", v: <SourcedCell provenance={sv("perf5d", t.perf5d)}>{fmtPct(t.perf5d)}</SourcedCell>, health: getMetricHealth("perf5d", t.perf5d), metricKey: "perf5d", value: t.perf5d },
    { k: "ROC 14D", v: <SourcedCell provenance={sv("roc14", t.roc14)}>{fmtPct(t.roc14)}</SourcedCell>, health: getMetricHealth("roc14", t.roc14), metricKey: "roc14", value: t.roc14 },
    { k: "ROC 21D", v: <SourcedCell provenance={sv("roc21", t.roc21)}>{fmtPct(t.roc21)}</SourcedCell>, health: getMetricHealth("roc21", t.roc21), metricKey: "roc21", value: t.roc21 },
  ];

  const valuationMetrics = [
    { k: "52W Low", v: <SourcedCell provenance={sv("low52", t.low52)}>{fmtPrice(t.low52, t.currency)}</SourcedCell>, health: null, metricKey: "low52", value: t.low52 },
    { k: "52W High", v: <SourcedCell provenance={sv("high52", t.high52)}>{fmtPrice(t.high52, t.currency)}</SourcedCell>, health: null, metricKey: "high52", value: t.high52 },
    { k: "% From 52W Low", v: <SourcedCell provenance={sv("pctFromLow", t.pctFromLow)}>{fmtPct(t.pctFromLow)}</SourcedCell>, health: getMetricHealth("pctFromLow", t.pctFromLow), metricKey: "pctFromLow", value: t.pctFromLow },
  ];

  // Helper to render metric group with tooltips
  const renderMetricGroup = (title: string, metrics: Array<{ k: string; v: React.ReactNode; health: "good" | "neutral" | "bad" | null; metricKey?: string; value?: number | null }>) => (
    <div className="panel">
      <div className="panel-header">{title}</div>
      <table className="term">
        <tbody>
          {metrics.map(({ k, v, health, metricKey, value }) => (
            <tr key={k}>
              <td className="flex items-center gap-2">
                {healthIndicator(health)}
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`cursor-help ${healthColor(health)}`}>{k}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="text-[11px] leading-relaxed">
                        <div className="font-semibold mb-1">{k}</div>
                        <div>{metricKey && value ? getMetricTooltip(metricKey, value) : "Hover for more details"}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </td>
              <td className={`num ${healthColor(health)}`}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Compact, factual snapshot to feed the AI narrative — only fields the user
  // can already see on the page. No external data, no forward-looking metrics.
  const facts = [
    `Company: ${t.companyName} (${t.symbol})`,
    `Sector / Industry: ${t.sector ?? "—"} / ${t.industry ?? "—"}`,
    `Listing: ${t.fullExchange ?? t.exchange ?? "—"} · ${t.country ?? t.region} · ${t.currency}`,
    `Price: ${fmtPrice(t.price, t.currency)}`,
    `Market Cap (USD): ${fmtMcapUsd(t.marketCapUsd)}`,
    `52W range: ${fmtPrice(t.low52, t.currency)} – ${fmtPrice(t.high52, t.currency)} (${fmtPct(t.pctFromLow)} from low)`,
    `Trailing P/E: ${fmtNum(t.pe)}`,
    `5D performance: ${fmtPct(t.perf5d)}`,
    `RSI 14: ${fmtNum(t.rsi14, 1)} (${t.rsiLabel})`,
    `ROC 14 / 21: ${fmtPct(t.roc14)} / ${fmtPct(t.roc21)}`,
    `vs MA20 / MA50 / MA200: ${vsMA(t.price, t.ma20).label} / ${vsMA(t.price, t.ma50).label} / ${vsMA(t.price, t.ma200).label}`,
    `Recommendation: ${t.recommendation.rec} · Outlook: ${t.outlook} · Confidence: ${t.confidence}`,
    `Passes regional liquidity filter: ${t.passesGlobal ? "yes" : "no"} · Passes value screen: ${t.passesValue ? "yes" : "no"}`,
    t.dataMissing.length > 0 ? `Missing data: ${t.dataMissing.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="panel lg:col-span-2">
          <div className="panel-header flex items-center justify-between">
            <span>Snapshot · {t.symbol}</span>
            <span className="text-[10px] font-normal normal-case tracking-normal text-muted-foreground flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bull)]" />Favorable</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary" />Neutral</span>
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[color:var(--bear)]" />Concerning</span>
              <span className="text-muted-foreground/60">· hover for source</span>
            </span>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Company Info */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Company</div>
              <div className="text-sm font-mono">{t.symbol} · {t.companyName}</div>
              <div className="text-xs text-muted-foreground">{t.fullExchange ?? t.exchange ?? "—"} · {t.country ?? t.region} · {t.currency}</div>
              <div className="text-xs text-muted-foreground">{t.sector ?? "—"} · {t.industry ?? "—"}</div>
              <div className="text-xs text-muted-foreground">Earnings: {t.earningsDate ? new Date(t.earningsDate).toLocaleDateString() : "—"}</div>
            </div>

            {/* Key Highlights */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Key Highlights</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rec:</span>
                <span className={`font-mono text-sm font-semibold ${t.recommendation.rec === "Buy" ? "text-[color:var(--bull)]" : t.recommendation.rec === "Avoid" ? "text-[color:var(--bear)]" : "text-primary"}`}>
                  {t.recommendation.rec.toUpperCase()}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{t.outlook}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Value:</span>
                <span className={t.passesValue ? "text-[color:var(--bull)]" : "text-primary"}>
                  {t.passesValue ? "Qualifies" : "Does not qualify"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Liquidity:</span>
                <span className={t.passesGlobal ? "text-[color:var(--bull)]" : "text-[color:var(--bear)]"}>
                  {t.passesGlobal ? "Passes" : "Fails"} {t.region} filters
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Explained Panel */}
        <div className="panel">
          <div className="panel-header">Metrics Explained</div>
          <div className="p-5 text-xs text-muted-foreground space-y-3">
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[color:var(--bull)] mt-1 flex-shrink-0" />
              <div>
                <div className="text-foreground font-medium">Favorable (Green)</div>
                <div>P/E &lt; 15, RSI &lt; 30 (oversold), near 52W low, positive momentum</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-primary mt-1 flex-shrink-0" />
              <div>
                <div className="text-foreground font-medium">Neutral (Yellow)</div>
                <div>Mixed signals, mid-range values, no clear direction</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 rounded-full bg-[color:var(--bear)] mt-1 flex-shrink-0" />
              <div>
                <div className="text-foreground font-medium">Concerning (Red)</div>
                <div>P/E &gt; 25, RSI &gt; 70 (overbought), far from 52W low, negative momentum</div>
              </div>
            </div>
            <div className="border-t border-border pt-3 mt-3">
              <div className="text-foreground font-medium mb-1">Quick Guide</div>
              <div>Lower P/E = cheaper valuation. RSI &lt; 30 = oversold opportunity. &gt; 70 = overbought risk.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Metrics with Customizable Views */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span>Key Metrics</span>
          <div className="flex gap-2">
            <button 
              onClick={() => toggleGroup("fundamentals")}
              className={`text-[10px] font-mono px-2 py-1 rounded transition-colors ${visibleGroups.includes("fundamentals") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Fundamentals
            </button>
            <button 
              onClick={() => toggleGroup("technicals")}
              className={`text-[10px] font-mono px-2 py-1 rounded transition-colors ${visibleGroups.includes("technicals") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Technicals
            </button>
            <button 
              onClick={() => toggleGroup("momentum")}
              className={`text-[10px] font-mono px-2 py-1 rounded transition-colors ${visibleGroups.includes("momentum") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Momentum
            </button>
            <button 
              onClick={() => toggleGroup("valuation")}
              className={`text-[10px] font-mono px-2 py-1 rounded transition-colors ${visibleGroups.includes("valuation") ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              Valuation
            </button>
          </div>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleGroups.includes("fundamentals") && renderMetricGroup("Fundamentals", fundamentalMetrics)}
          {visibleGroups.includes("technicals") && renderMetricGroup("Technicals", technicalMetrics)}
          {visibleGroups.includes("momentum") && renderMetricGroup("Momentum", momentumMetrics)}
          {visibleGroups.includes("valuation") && renderMetricGroup("Valuation", valuationMetrics)}
        </div>
      </div>

      {/* Contextual Advice Panel */}
      <div className="panel">
        <div className="panel-header">Contextual Analysis</div>
        <div className="p-5 text-xs space-y-3">
          {getContextualAdvice(t)}
        </div>
      </div>

      {/* Peer Comparison Highlights */}
      {r.peers && r.peers.length > 0 && (
        <div className="panel">
          <div className="panel-header">Peer Comparison · {r.peers.length} peers</div>
          <div className="p-5 text-xs space-y-2">
            {getPeerComparison(t, r.peers)}
          </div>
        </div>
      )}

      {/* Actionable Insights Panel */}
      <div className="panel">
        <div className="panel-header">What to Watch</div>
        <div className="p-5 text-xs space-y-2">
          {getActionableInsights(t)}
        </div>
      </div>

      {/* Metric Trend Indicators */}
      <div className="panel">
        <div className="panel-header">Metric Trends</div>
        <div className="p-5 text-xs space-y-2">
          {getMetricTrends(t)}
        </div>
      </div>

      {/* Historical Context */}
      <div className="panel">
        <div className="panel-header">Historical Context (6 Months)</div>
        <div className="p-5 text-xs space-y-2">
          {getHistoricalContext(t)}
        </div>
      </div>

      {/* Full Details Toggle */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between cursor-pointer" onClick={() => document.getElementById("fullDetails")?.classList.toggle("hidden")}>
          <span>Full Details · {t.symbol}</span>
          <span className="text-[10px] text-muted-foreground">Click to expand</span>
        </div>
        <div id="fullDetails" className="hidden">
          <table className="term">
            <tbody>
              <tr><td>Company</td><td>{t.companyName}</td></tr>
              <tr><td>Exchange</td><td>{t.fullExchange ?? t.exchange ?? "—"}</td></tr>
              <tr><td>Country / Region</td><td>{t.country ?? "—"} · {t.region}</td></tr>
              <tr><td>Currency</td><td>{t.currency}</td></tr>
              <tr><td>Sector</td><td>{t.sector ?? "—"}</td></tr>
              <tr><td>Industry</td><td>{t.industry ?? "—"}</td></tr>
              <tr><td>Price</td><td><SourcedCell provenance={sv("price", t.price)}>{fmtPrice(t.price, t.currency)}</SourcedCell></td></tr>
              <tr><td>Market Cap (Local)</td><td><SourcedCell provenance={sv("marketCap", t.marketCap)}>{fmtMcap(t.marketCap, t.currency)}</SourcedCell></td></tr>
              <tr><td>Market Cap (USD)</td><td><SourcedCell provenance={sv("marketCapUsd", t.marketCapUsd)}>{fmtMcapUsd(t.marketCapUsd)}</SourcedCell></td></tr>
              <tr><td>Avg Daily Volume</td><td><SourcedCell provenance={sv("avgVolume", t.avgVolume)}>{fmtVol(t.avgVolume)}</SourcedCell></td></tr>
              <tr><td>52W Low</td><td><SourcedCell provenance={sv("low52", t.low52)}>{fmtPrice(t.low52, t.currency)}</SourcedCell></td></tr>
              <tr><td>52W High</td><td><SourcedCell provenance={sv("high52", t.high52)}>{fmtPrice(t.high52, t.currency)}</SourcedCell></td></tr>
              <tr><td>% From 52W Low</td><td><SourcedCell provenance={sv("pctFromLow", t.pctFromLow)}>{fmtPct(t.pctFromLow)}</SourcedCell></td></tr>
              <tr><td>Trailing P/E</td><td><SourcedCell provenance={sv("pe", t.pe)}>{fmtNum(t.pe)}</SourcedCell></td></tr>
              <tr><td>5D Performance</td><td><SourcedCell provenance={sv("perf5d", t.perf5d)}>{fmtPct(t.perf5d)}</SourcedCell></td></tr>
              <tr><td>RSI 14D</td><td><SourcedCell provenance={sv("rsi14", t.rsi14)}>{fmtNum(t.rsi14, 1)} ({t.rsiLabel})</SourcedCell></td></tr>
              <tr><td>ROC 14D</td><td><SourcedCell provenance={sv("roc14", t.roc14)}>{fmtPct(t.roc14)}</SourcedCell></td></tr>
              <tr><td>ROC 21D</td><td><SourcedCell provenance={sv("roc21", t.roc21)}>{fmtPct(t.roc21)}</SourcedCell></td></tr>
              <tr><td>Price vs 20D MA</td><td><SourcedCell provenance={sv("ma20", t.ma20)}>{vsMA(t.price, t.ma20).label} ({fmtPrice(t.ma20, t.currency)})</SourcedCell></td></tr>
              <tr><td>Price vs 50D MA</td><td><SourcedCell provenance={sv("ma50", t.ma50)}>{vsMA(t.price, t.ma50).label} ({fmtPrice(t.ma50, t.currency)})</SourcedCell></td></tr>
              <tr><td>Price vs 200D MA</td><td><SourcedCell provenance={sv("ma200", t.ma200)}>{vsMA(t.price, t.ma200).label} ({fmtPrice(t.ma200, t.currency)})</SourcedCell></td></tr>
              <tr><td>Earnings Date</td><td>{t.earningsDate ? new Date(t.earningsDate).toLocaleDateString() : "—"}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Indicator({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}

function ValueSection({ r }: { r: Success }) {
  const rows = r.valueQualifiers;
  const includeTarget = r.target.passesValue;
  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-header">Value Screen · Qualifying Peers ({rows.length})</div>
        <div className="overflow-x-auto">
          <table className="term">
            <thead>
              <tr><th>Company</th><th>Ticker</th><th>Exch</th><th>Ccy</th><th>Price</th><th>52W Low</th><th><MetricLabel term="pctFromLow">% From Low</MetricLabel></th><th><MetricLabel term="peRatio">P/E</MetricLabel></th><th><MetricLabel term="marketCap">Mcap (USD)</MetricLabel></th><th>Avg Vol</th><th>Industry</th></tr>
            </thead>
            <tbody>
              {includeTarget && <ValueRow m={r.target} highlight />}
              {rows.length === 0 && !includeTarget && (
                <tr><td colSpan={11} className="text-center text-muted-foreground py-8">No peers passed the value screen.</td></tr>
              )}
              {rows.map((m) => <ValueRow key={m.symbol} m={m} />)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Commentary</div>
        <div className="p-5 text-sm space-y-3 max-w-4xl">
          <p><span className="text-muted-foreground">Input stock status:</span> <span className={r.target.passesValue ? "text-[color:var(--bull)]" : "text-[color:var(--bear)]"}>{r.target.passesValue ? "✅ Qualifies" : "❌ Does not qualify"}</span> for the value screen.</p>
          {rows.length > 0 ? (
            <p>Qualifying peers trade within 10% of their 52-week low with trailing P/E ≤ 10. {rows.length >= 3 ? "Multiple peers clearing the screen suggests a sector-wide valuation reset." : "The small number of qualifiers points to a more company-specific drawdown rather than a broad sector move."}</p>
          ) : (
            <p>No peers cleared the value screen. The sector is either trading near highs, or earnings/multiples don't satisfy the strict P/E ≤ 10 + near-low constraint.</p>
          )}
          <div className="text-xs text-muted-foreground border-t border-border pt-3">
            <strong>Caveats:</strong> low P/E can signal value traps, declining margins, secular decline, cyclical earnings peaks, or pending earnings revisions. Cross-currency price comparisons are avoided — only USD-equivalent market cap is used for sizing comparisons.
          </div>
        </div>
      </div>
    </div>
  );
}

function ValueRow({ m, highlight = false }: { m: any; highlight?: boolean }) {
  return (
    <tr className={highlight ? "bg-primary/5" : ""}>
      <td>{highlight && "▶ "}{m.companyName}</td>
      <td className="text-primary">{m.symbol}</td>
      <td className="text-muted-foreground">{m.exchange ?? "—"}</td>
      <td className="text-muted-foreground">{m.currency}</td>
      <td className="num">{fmtPrice(m.price, m.currency)}</td>
      <td className="num">{fmtPrice(m.low52, m.currency)}</td>
      <td className={`num ${colorFor(-(m.pctFromLow ?? 0))}`}>{fmtPct(m.pctFromLow)}</td>
      <td className="num">{fmtNum(m.pe)}</td>
      <td className="num">{fmtMcapUsd(m.marketCapUsd)}</td>
      <td className="num">{fmtVol(m.avgVolume)}</td>
      <td className="text-muted-foreground">{m.industry ?? "—"}</td>
    </tr>
  );
}

function MomentumSection({ r }: { r: Success }) {
  const rows = r.momentumTop;
  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-header">Momentum · Top {rows.length} Peers by 5D Performance</div>
        <div className="overflow-x-auto">
          <table className="term">
            <thead>
              <tr><th>#</th><th>Company</th><th>Ticker</th><th>Exch</th><th><MetricLabel term="perf5d">5D %</MetricLabel></th><th><MetricLabel term="roc">ROC14</MetricLabel></th><th><MetricLabel term="roc">ROC21</MetricLabel></th><th><MetricLabel term="rsi">RSI</MetricLabel></th><th>RSI Label</th><th>20D</th><th>50D</th><th>200D</th><th>Signal</th><th>Outlook</th><th><MetricLabel term="confidence">Conf</MetricLabel></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={15} className="text-center text-muted-foreground py-8">No peers qualified for momentum ranking.</td></tr>}
              {rows.map((m, i) => {
                const v20 = vsMA(m.price, m.ma20);
                const v50 = vsMA(m.price, m.ma50);
                const v200 = vsMA(m.price, m.ma200);
                return (
                  <tr key={m.symbol}>
                    <td className="text-muted-foreground">{i + 1}</td>
                    <td>{m.companyName}</td>
                    <td className="text-primary">{m.symbol}</td>
                    <td className="text-muted-foreground">{m.exchange ?? "—"}</td>
                    <td className={`num ${colorFor(m.perf5d)}`}>{fmtPct(m.perf5d)}</td>
                    <td className={`num ${colorFor(m.roc14)}`}>{fmtPct(m.roc14)}</td>
                    <td className={`num ${colorFor(m.roc21)}`}>{fmtPct(m.roc21)}</td>
                    <td className="num">{fmtNum(m.rsi14, 1)}</td>
                    <td className={m.rsiLabel === "Overbought" ? "text-[color:var(--bear)]" : m.rsiLabel === "Oversold" ? "text-[color:var(--bull)]" : "text-muted-foreground"}>{m.rsiLabel}</td>
                    <td className={v20.cls}>{v20.label}</td>
                    <td className={v50.cls}>{v50.label}</td>
                    <td className={v200.cls}>{v200.label}</td>
                    <td className={m.signal === "Momentum continuation" ? "text-[color:var(--bull)]" : m.signal === "Potential reversal" ? "text-primary" : "text-muted-foreground"}>{m.signal}</td>
                    <td className={m.outlook === "Bullish" ? "text-[color:var(--bull)]" : m.outlook === "Bearish" ? "text-[color:var(--bear)]" : ""}>{m.outlook}</td>
                    <td className="text-muted-foreground">{m.confidence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">Methodology</div>
        <div className="p-5 text-xs text-muted-foreground space-y-2 max-w-3xl">
          <p>Universe filtered using region-specific liquidity thresholds, then ranked by 5-day price performance.</p>
          <p><span className="text-foreground">Continuation:</span> positive 5D + ROC14/21 positive + RSI &lt; 70 + price above 20D &amp; 50D MAs.</p>
          <p><span className="text-foreground">Potential reversal:</span> strong recent move but RSI &gt; 70 or weakening ROC.</p>
          <p><span className="text-foreground">Mixed:</span> indicator confluence is unclear or conflicting.</p>
        </div>
      </div>
    </div>
  );
}

function CrossSection({ r }: { r: Success }) {
  const overlap = r.overlap;
  const detail = r.valueQualifiers.filter((v) => overlap.includes(v.symbol)).map((v) => {
    const m = r.momentumTop.find((x) => x.symbol === v.symbol);
    return { ...v, momentum: m };
  });
  return (
    <div className="panel">
      <div className="panel-header">Cross-Analysis · Value ∩ Momentum</div>
      <div className="p-5">
        {overlap.length === 0 ? (
          <p className="text-sm text-muted-foreground">No peer passed both the value screen and the momentum top-10. This is common when sectors are either deeply oversold (no momentum) or trading near highs (no value qualifiers).</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">{overlap.length} ticker{overlap.length > 1 ? "s" : ""} appear in both screens — these combine compressed valuation with improving short-term price action and may represent higher-conviction setups.</p>
            {detail.map((d) => (
              <div key={d.symbol} className="border border-border rounded p-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="font-mono text-primary text-lg">{d.symbol}</span>
                  <span className="text-sm">{d.companyName}</span>
                  <span className="text-[10px] font-mono uppercase border border-border rounded px-1.5 py-0.5 text-muted-foreground">{d.exchange} · {d.currency}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{d.industry}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div><span className="text-muted-foreground">P/E </span>{fmtNum(d.pe)}</div>
                  <div><span className="text-muted-foreground">% from low </span>{fmtPct(d.pctFromLow)}</div>
                  <div><span className="text-muted-foreground">5D </span><span className={colorFor(d.perf5d)}>{fmtPct(d.perf5d)}</span></div>
                  <div><span className="text-muted-foreground">RSI </span>{fmtNum(d.rsi14, 1)}</div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Notable: undervalued by P/E and proximity to 52W low, yet exhibiting strong 5D performance among screened peers — a constructive setup for mean reversion. <span className="text-foreground">Risks:</span> the bounce may be short-lived; confirm with volume, earnings stability, and watch for breakdowns below 50D/200D MAs as invalidation triggers.</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FinalSection({ r }: { r: Success }) {
  const t = r.target;
  const rec = t.recommendation;
  const recColor = rec.rec === "Buy" ? "text-[color:var(--bull)] border-[color:var(--bull)]"
    : rec.rec === "Avoid" ? "text-[color:var(--bear)] border-[color:var(--bear)]"
    : "text-primary border-primary";
  const above200 = t.price && t.ma200 && t.price > t.ma200;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className={`panel lg:col-span-1 border-2 ${recColor.split(" ")[1]}`}>
        <div className="panel-header">Final Recommendation</div>
        <div className="p-6 text-center">
          <div className={`font-mono text-5xl font-semibold ${recColor.split(" ")[0]}`}>{rec.rec.toUpperCase()}</div>
          <div className="mt-3 text-xs font-mono text-muted-foreground">CONFIDENCE: <span className="text-foreground">{rec.confidence}</span></div>
          <div className="text-xs font-mono text-muted-foreground">HORIZON: <span className="text-foreground">{rec.horizon}</span></div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-xs font-mono border-t border-border pt-4">
            <div><div className="text-muted-foreground"><MetricLabel term="valueScore">Value</MetricLabel></div><div className="text-[color:var(--bull)] text-lg">{rec.valueScore}/3</div></div>
            <div><div className="text-muted-foreground"><MetricLabel term="momentumScore">Mom.</MetricLabel></div><div className="text-primary text-lg">{rec.momentumScore}/7</div></div>
            <div><div className="text-muted-foreground"><MetricLabel term="riskScore">Penalty</MetricLabel></div><div className="text-[color:var(--bear)] text-lg">−{rec.penalties}</div></div>
          </div>
          <p className="mt-5 text-xs text-left">
            {t.companyName} ({t.symbol}) on {t.fullExchange ?? t.exchange} currently {t.passesGlobal ? "meets" : "fails"} {t.region} liquidity/size filters and {t.passesValue ? "qualifies" : "does not qualify"} as a value candidate. Momentum is <span className="text-foreground">{t.outlook.toLowerCase()}</span> with {t.signal.toLowerCase()} signals. Net composite score is {rec.net}/10. {rec.rec === "Buy" ? "Setup combines favorable risk/reward across both screens." : rec.rec === "Avoid" ? "Risk indicators outweigh constructive signals." : "Mixed signals warrant patience for clearer confirmation."}
          </p>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="panel">
          <div className="panel-header">Investment Thesis</div>
          <div className="p-5 text-sm space-y-4">
            <Thesis title="Bull Case" cls="text-[color:var(--bull)]">
              {t.passesValue && "Trades near 52W low with single-digit P/E — pricing in significant pessimism. "}
              {(t.perf5d ?? 0) > 0 && "Recent 5D price action is positive, suggesting accumulation. "}
              {above200 && "Price above 200D MA confirms primary uptrend. "}
              Sector ({t.sector ?? "—"}) tailwinds, multiple expansion, or earnings beats could re-rate the stock.
            </Thesis>
            <Thesis title="Bear Case" cls="text-[color:var(--bear)]">
              {(t.rsi14 ?? 0) > 70 && "RSI in overbought territory raises near-term pullback risk. "}
              {!above200 && "Price below 200D MA indicates broken long-term trend. "}
              {(t.roc14 ?? 0) < 0 && (t.roc21 ?? 0) < 0 && "Negative ROC across both windows signals deteriorating momentum. "}
              Risks include margin compression, weakening guidance, sector derating, FX headwinds, and macro shocks.
            </Thesis>
            <Thesis title="Base Case" cls="text-primary">
              Range-bound trading as the market awaits the next catalyst. Indicator confluence is {t.confidence.toLowerCase()}, suggesting a wait-and-see posture is appropriate until valuation, momentum, or fundamentals decisively shift.
            </Thesis>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel">
            <div className="panel-header">Catalysts</div>
            <ul className="p-5 text-xs space-y-2 text-muted-foreground list-disc pl-8">
              <li>Next earnings release {t.earningsDate ? `(${new Date(t.earningsDate).toLocaleDateString()})` : "(date TBD)"}</li>
              <li>Forward guidance revisions</li>
              <li>{t.sector ?? "Sector"} demand and pricing trends</li>
              <li>Macro: rates, inflation, FX ({t.currency})</li>
              <li>Regulatory developments and product launches</li>
            </ul>
          </div>
          <div className="panel">
            <div className="panel-header">Risks</div>
            <ul className="p-5 text-xs space-y-2 text-muted-foreground list-disc pl-8">
              <li><span className="text-foreground">Fundamental:</span> revenue decline, margin compression, leverage, value-trap risk</li>
              <li><span className="text-foreground">Technical:</span> {(t.rsi14 ?? 0) > 70 ? "overbought RSI" : "RSI within range"}, {above200 ? "trend intact" : "broken 200D MA"}, breakdown below {t.ma50 ? `${fmtPrice(t.ma50, t.currency)} (50D)` : "key MA"}</li>
              <li>Liquidity: {t.passesGlobal ? "passes" : "FAILS"} {t.region} thresholds</li>
              <li>Currency: returns subject to {t.currency}/USD FX moves for non-local investors</li>
              {t.dataMissing.length > 0 && <li className="text-primary">Data quality: missing {t.dataMissing.join(", ")} — confidence reduced</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Thesis({ title, cls, children }: { title: string; cls: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-xs font-mono uppercase tracking-wider ${cls}`}>{title}</div>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

// ---------------- Chart Section ----------------
function ChartSection({ r }: { r: Success }) {
  const t = r.target;
  return (
    <div className="space-y-4">
      <PriceChart
        closes={t.closes ?? []}
        ma20={t.ma20}
        ma50={t.ma50}
        ma200={t.ma200}
        high52={t.high52}
        low52={t.low52}
        rsi={t.rsi14}
        currency={t.currency}
      />
      <VolumeChart
        volumes={t.volumes ?? []}
        closes={t.closes ?? []}
      />
      <div className="panel">
        <div className="panel-header">Technical Summary</div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <Indicator label="Price" value={fmtPrice(t.price, t.currency)} />
          <Indicator label="52W Low" value={fmtPrice(t.low52, t.currency)} />
          <Indicator label="52W High" value={fmtPrice(t.high52, t.currency)} />
          <Indicator label="% From Low" value={fmtPct(t.pctFromLow)} />
          <Indicator label="MA 20" value={fmtPrice(t.ma20, t.currency)} />
          <Indicator label="MA 50" value={fmtPrice(t.ma50, t.currency)} />
          <Indicator label="MA 200" value={fmtPrice(t.ma200, t.currency)} />
          <Indicator label="RSI 14" value={`${fmtNum(t.rsi14, 1)} (${t.rsiLabel})`} />
        </div>
      </div>
    </div>
  );
}

// ---------------- Scores Section ----------------
function ScoresSection({ r }: { r: Success }) {
  const t = r.target;
  // Adapt StockMetrics to ScreenerRow-like shape for scoreRow
  const scoreInput = useMemo(() => ({
    symbol: t.symbol, name: t.companyName, exchange: t.exchange ?? "",
    country: t.country ?? "", region: t.region, currency: t.currency,
    sector: t.sector ?? "", industry: t.industry ?? "",
    price: t.price, marketCap: t.marketCap, marketCapUsd: t.marketCapUsd,
    avgVolume: t.avgVolume, pe: t.pe, high52: t.high52, low52: t.low52,
    pctFromLow: t.pctFromLow, pctFromHigh: null,
    perf5d: t.perf5d, rsi14: t.rsi14, roc14: t.roc14, roc21: t.roc21,
    ma20: t.ma20, ma50: t.ma50, ma200: t.ma200,
    closes: t.closes ?? [], isMock: false, source: t.source ?? "Finimpulse",
    retrievedAt: new Date().toISOString(),
  }), [t]);
  const s = scoreRow(scoreInput as any);

  const cards = [
    { label: "Value", val: s.value, b: s.valueLabel, reasons: s.valueReasons, color: "var(--bull)" },
    { label: "Momentum", val: s.momentum, b: s.momentumLabel, reasons: s.momentumReasons, color: "var(--primary)" },
    { label: "Quality", val: s.quality, b: s.qualityLabel, reasons: s.qualityReasons, color: "var(--cyan)" },
    { label: "Risk", val: s.risk, b: s.riskLabel, reasons: s.riskReasons, color: "var(--bear)" },
    { label: "Confidence", val: s.confidence, b: s.confidenceLabel, reasons: s.confidenceReasons, color: "var(--primary)" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="panel">
          <div className="panel-header flex items-center justify-between">
            <span>{c.label}</span>
            <span className="text-xs text-muted-foreground">{c.b}</span>
          </div>
          <div className="p-4">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl" style={{ color: c.color }}>{c.val}</span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-muted rounded overflow-hidden">
              <div className="h-full" style={{ width: `${c.val}%`, background: c.color }} />
            </div>
            <ul className="mt-3 text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
              {c.reasons.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- Peers Section ----------------
function PeersSection({ r }: { r: Success }) {
  const t = r.target;
  const peers = r.peers;
  if (!peers.length) {
    return (
      <div className="panel p-10 text-center">
        <div className="font-mono text-xs text-muted-foreground">No peers identified for {t.industry || t.sector || "this stock"}.</div>
      </div>
    );
  }

  const all = [t, ...peers];
  type Dir = "high" | "low";
  const metrics: Array<{ key: string; label: string; get: (m: any) => number | null; dir: Dir; fmt: (m: any) => string }> = [
    { key: "pe", label: "P/E", get: (m) => m.pe, dir: "low", fmt: (m) => fmtNum(m.pe, 1) },
    { key: "pctFromLow", label: "% From Low", get: (m) => m.pctFromLow, dir: "low", fmt: (m) => fmtPct(m.pctFromLow) },
    { key: "perf5d", label: "5D %", get: (m) => m.perf5d, dir: "high", fmt: (m) => fmtPct(m.perf5d) },
    { key: "roc14", label: "ROC14", get: (m) => m.roc14, dir: "high", fmt: (m) => fmtPct(m.roc14) },
    { key: "roc21", label: "ROC21", get: (m) => m.roc21, dir: "high", fmt: (m) => fmtPct(m.roc21) },
    { key: "rsi14", label: "RSI", get: (m) => m.rsi14, dir: "high", fmt: (m) => fmtNum(m.rsi14, 0) },
    { key: "marketCapUsd", label: "Mcap (USD)", get: (m) => m.marketCapUsd, dir: "high", fmt: (m) => fmtMcapUsd(m.marketCapUsd) },
    { key: "avgVolume", label: "Avg Vol", get: (m) => m.avgVolume, dir: "high", fmt: (m) => fmtVol(m.avgVolume) },
  ];
  const winners: Record<string, { best?: string; worst?: string }> = {};
  for (const mt of metrics) {
    let best: string | undefined, worst: string | undefined, bv = -Infinity, wv = Infinity;
    for (const m of all) {
      const v = mt.get(m);
      if (v == null || !isFinite(v)) continue;
      const sc = mt.dir === "high" ? v : -v;
      if (sc > bv) { bv = sc; best = m.symbol; }
      if (sc < wv) { wv = sc; worst = m.symbol; }
    }
    winners[mt.key] = { best, worst };
  }
  const cls = (k: string, sym: string) => {
    const w = winners[k]; if (!w) return "";
    if (w.best === sym) return "text-[color:var(--bull)] font-semibold";
    if (w.worst === sym && all.length > 2) return "text-[color:var(--bear)]";
    return "";
  };

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-header">Peer Matrix · {t.industry ?? t.sector ?? "Sector"} ({peers.length} peers, region-aware)</div>
        <div className="overflow-x-auto">
          <table className="term">
            <thead>
              <tr>
                <th>Ticker</th><th>Company</th><th>Exch</th>
                {metrics.map((m) => <th key={m.key} className="text-right">{m.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {all.map((m, i) => (
                <tr key={m.symbol} className={i === 0 ? "bg-primary/5" : "hover:bg-muted/30"}>
                  <td className="text-primary font-mono">{i === 0 ? "▶ " : ""}{m.symbol}</td>
                  <td>{m.companyName}</td>
                  <td className="text-muted-foreground text-xs">{m.exchange ?? "—"}</td>
                  {metrics.map((mt) => (
                    <td key={mt.key} className={`num ${cls(mt.key, m.symbol)}`}>{mt.fmt(m)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">Reading the Matrix</div>
        <div className="p-5 text-xs text-muted-foreground space-y-2 max-w-3xl">
          <p><span className="text-[color:var(--bull)]">Green bold</span> = best in cohort for that metric. <span className="text-[color:var(--bear)]">Red</span> = worst (when ≥3 peers).</p>
          <p>Lower-is-better for P/E and % from 52W low; higher-is-better for momentum, RSI, mcap, and volume.</p>
          <p>{t.symbol} is highlighted as the target row. Peers are sourced via industry → country → region → global fallback.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------- Scenario Recommendation ----------------
function ScenarioSection({ r }: { r: Success }) {
  const t = r.target;
  const above20 = !!(t.price && t.ma20 && t.price > t.ma20);
  const above50 = !!(t.price && t.ma50 && t.price > t.ma50);
  const above200 = !!(t.price && t.ma200 && t.price > t.ma200);
  const rsi = t.rsi14 ?? 50;
  const valueOk = t.passesValue;
  const mom = t.recommendation.momentumScore;
  const pen = t.recommendation.penalties;

  type Action = "Buy" | "Accumulate" | "Hold" | "Trim" | "Avoid";
  let action: Action = "Hold";
  let rationale = "";
  if (valueOk && mom >= 5 && pen <= 1 && above50) {
    action = "Buy"; rationale = "Value qualifier with confirmed momentum (above 50D MA, low penalties).";
  } else if (mom >= 5 && above200 && rsi < 70 && pen <= 1) {
    action = "Accumulate"; rationale = "Strong primary trend with healthy RSI; scale in on dips.";
  } else if (rsi > 75 && above20 && t.recommendation.rec === "Buy") {
    action = "Trim"; rationale = "Overbought RSI on top of large gains — trim into strength to lock partial profits.";
  } else if (!above200 && pen >= 2 && mom <= 3) {
    action = "Avoid"; rationale = "Below 200D MA with multiple negative momentum signals; trend is broken.";
  } else if (mom <= 2 || rsi > 80 || !t.passesGlobal) {
    action = "Avoid"; rationale = !t.passesGlobal ? "Fails regional liquidity/size filters." : "Weak momentum or extreme RSI — wait for cleaner setup.";
  } else {
    action = "Hold"; rationale = "Mixed signals — neither valuation nor momentum offers a high-conviction edge.";
  }

  const colors: Record<Action, string> = {
    Buy: "text-[color:var(--bull)] border-[color:var(--bull)]",
    Accumulate: "text-[color:var(--bull)] border-[color:var(--bull)]/60",
    Hold: "text-primary border-primary",
    Trim: "text-primary border-primary",
    Avoid: "text-[color:var(--bear)] border-[color:var(--bear)]",
  };

  const entry = t.ma20 ? +(t.ma20 * 1.005).toFixed(2) : t.price;
  const stop = t.ma50 ? +(t.ma50 * 0.97).toFixed(2) : (t.price ? +(t.price * 0.92).toFixed(2) : null);
  const target1 = t.high52 ?? (t.price ? +(t.price * 1.15).toFixed(2) : null);
  const target2 = t.high52 ? +(t.high52 * 1.10).toFixed(2) : (t.price ? +(t.price * 1.30).toFixed(2) : null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className={`panel border-2 ${colors[action].split(" ").slice(1).join(" ")}`}>
        <div className="panel-header">Scenario Action</div>
        <div className="p-6 text-center">
          <div className={`font-mono text-5xl font-semibold ${colors[action].split(" ")[0]}`}>{action.toUpperCase()}</div>
          <div className="mt-3 text-xs font-mono text-muted-foreground">CONFIDENCE: <span className="text-foreground">{t.recommendation.confidence}</span></div>
          <div className="text-xs font-mono text-muted-foreground">HORIZON: <span className="text-foreground">{t.recommendation.horizon}</span></div>
          <p className="mt-5 text-xs text-left">{rationale}</p>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="panel">
          <div className="panel-header">Trade Plan · Levels</div>
          <table className="term">
            <tbody>
              <tr><td className="text-muted-foreground">Suggested entry zone</td><td className="num">{fmtPrice(entry, t.currency)} <span className="text-[10px] text-muted-foreground">(near 20D MA)</span></td></tr>
              <tr><td className="text-muted-foreground">Stop / invalidation</td><td className="num text-[color:var(--bear)]">{fmtPrice(stop, t.currency)} <span className="text-[10px] text-muted-foreground">(below 50D MA)</span></td></tr>
              <tr><td className="text-muted-foreground">Target 1</td><td className="num text-[color:var(--bull)]">{fmtPrice(target1, t.currency)} <span className="text-[10px] text-muted-foreground">(52W high)</span></td></tr>
              <tr><td className="text-muted-foreground">Target 2</td><td className="num text-[color:var(--bull)]">{fmtPrice(target2, t.currency)} <span className="text-[10px] text-muted-foreground">(stretch)</span></td></tr>
              <tr><td className="text-muted-foreground">Position sizing hint</td><td>{action === "Buy" ? "Full size" : action === "Accumulate" ? "Scale in 1/3rds" : action === "Trim" ? "Reduce 25–50%" : action === "Hold" ? "No change" : "Zero / exit"}</td></tr>
            </tbody>
          </table>
          <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">
            Levels are derived heuristics from MAs and 52W range — not professional trade signals.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel">
            <div className="panel-header text-[color:var(--bull)]">Bullish Triggers</div>
            <ul className="p-5 text-xs space-y-2 list-disc pl-8 text-muted-foreground">
              <li>Close above 50D MA on rising volume</li>
              <li>RSI cross above 50 from below</li>
              <li>Earnings beat with raised guidance</li>
              <li>Sector rotation into {t.sector ?? "the sector"}</li>
            </ul>
          </div>
          <div className="panel">
            <div className="panel-header text-[color:var(--bear)]">Bearish Triggers</div>
            <ul className="p-5 text-xs space-y-2 list-disc pl-8 text-muted-foreground">
              <li>Close below 200D MA → trend break</li>
              <li>RSI {">"} 80 with negative price/RSI divergence</li>
              <li>Earnings miss or guide-down</li>
              <li>Sector-wide derating or FX headwind ({t.currency})</li>
            </ul>
          </div>
        </div>

        <BacktestPanel closes={t.closes ?? []} symbol={t.symbol} />
      </div>
    </div>
  );
}

// ---------------- Historical Performance + MA Cross Backtest ----------------
function BacktestPanel({ closes, symbol }: { closes: number[]; symbol: string }) {
  const hist = useMemo(() => computeHistoricalReturns(closes), [closes]);
  const bt = useMemo(() => backtestMaCross(closes, 50, 200), [closes]);

  const fmtSigned = (n: number | null, digits = 1) => {
    if (n == null || !Number.isFinite(n)) return "—";
    const s = n >= 0 ? "+" : "";
    return `${s}${n.toFixed(digits)}%`;
  };
  const cls = (n: number | null) => (n == null ? "" : n >= 0 ? "text-[color:var(--bull)]" : "text-[color:var(--bear)]");

  return (
    <>
      <div className="panel">
        <div className="panel-header">Historical Performance · {symbol}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
          {hist.windows.map((w) => (
            <div key={w.label} className="bg-card p-4 text-center">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{w.label} return</div>
              <div className={`font-mono text-lg mt-1 ${cls(w.returnPct)}`}>{fmtSigned(w.returnPct)}</div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">
          Computed from {hist.observations} daily closes (adjusted). Windows that exceed available history show "—".
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Backtest · 50D/200D MA Cross (Long-Only)</div>
        {bt.insufficientData ? (
          <div className="p-5 text-xs text-muted-foreground">
            Need at least ~210 daily closes to evaluate the 50/200 cross. Currently have {bt.observations}.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-border">
              <Metric label="Strategy total return" value={fmtSigned(bt.totalReturnPct)} cls={cls(bt.totalReturnPct)} />
              <Metric label="Annualized" value={fmtSigned(bt.annualizedReturnPct)} cls={cls(bt.annualizedReturnPct)} />
              <Metric label="Max drawdown" value={fmtSigned(bt.maxDrawdownPct)} cls="text-[color:var(--bear)]" />
              <Metric label="Win rate" value={bt.winRatePct == null ? "—" : `${bt.winRatePct.toFixed(0)}%`} />
              <Metric label="Avg trade" value={fmtSigned(bt.avgTradeReturnPct)} cls={cls(bt.avgTradeReturnPct)} />
              <Metric label="Time in market" value={bt.exposurePct == null ? "—" : `${bt.exposurePct.toFixed(0)}%`} />
            </div>
            <div className="border-t border-border p-4 text-xs">
              <div className="font-mono uppercase tracking-wider text-muted-foreground mb-2">Buy &amp; hold reference</div>
              <div className="grid grid-cols-3 gap-3 font-mono">
                <div><span className="text-muted-foreground">Total: </span><span className={cls(bt.buyHoldReturnPct)}>{fmtSigned(bt.buyHoldReturnPct)}</span></div>
                <div><span className="text-muted-foreground">Annualized: </span><span className={cls(bt.buyHoldAnnualizedPct)}>{fmtSigned(bt.buyHoldAnnualizedPct)}</span></div>
                <div><span className="text-muted-foreground">Max DD: </span><span className="text-[color:var(--bear)]">{fmtSigned(bt.buyHoldMaxDrawdownPct)}</span></div>
              </div>
            </div>
            {bt.trades.length > 0 && (
              <div className="border-t border-border overflow-x-auto">
                <table className="term">
                  <thead>
                    <tr><th>#</th><th>Entry idx</th><th>Entry</th><th>Exit idx</th><th>Exit</th><th>Bars</th><th>Return</th></tr>
                  </thead>
                  <tbody>
                    {bt.trades.map((tr, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="num text-muted-foreground">{tr.entryIdx}</td>
                        <td className="num">{tr.entryPrice.toFixed(2)}</td>
                        <td className="num text-muted-foreground">{tr.exitIdx}</td>
                        <td className="num">{tr.exitPrice.toFixed(2)}</td>
                        <td className="num">{tr.bars}</td>
                        <td className={`num ${cls(tr.returnPct)}`}>{fmtSigned(tr.returnPct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border">
              Long-only. Enter on 50D MA crossing above 200D MA; exit on cross-down. No fees, no slippage, no compounding across cash periods. Indicative only.
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Metric({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="bg-card p-4 text-center">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-base mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

