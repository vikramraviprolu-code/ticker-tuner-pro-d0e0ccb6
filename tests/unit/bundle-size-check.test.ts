import { describe, expect, it } from "vitest";

import {
  DEFAULT_BUDGETS,
  evaluateBudgets,
  formatBytes,
  mergeBudgetOverrides,
  renderReport,
} from "../../scripts/bundle-size-check.mjs";

describe("bundle-size-check", () => {
  it("selects the largest matching asset and reports target gaps without failing below temporary max", () => {
    const results = evaluateBudgets([
      { name: "index-small.js", bytes: 100_000 },
      { name: "index-current.js", bytes: 700_000 },
      { name: "terminal-page-current.js", bytes: 100_000 },
      { name: "compare-current.js", bytes: 370_000 },
    ]);

    expect(results.map((result) => result.status)).toEqual(["pass", "pass", "pass"]);
    expect(results[0].asset?.name).toBe("index-current.js");
    expect(results[0].overTargetBytes).toBe(450_000);
    expect(renderReport(results)).toContain("target gap 450.0 kB");
  });

  it("fails when an asset exceeds the temporary max budget", () => {
    const budgets = [
      {
        name: "entry",
        description: "entry",
        pattern: /^index-[\w-]+\.js$/,
        targetBytes: 250_000,
        maxBytes: 300_000,
      },
    ];

    const [result] = evaluateBudgets([{ name: "index-large.js", bytes: 300_001 }], budgets);

    expect(result.status).toBe("fail");
    expect(result.overMaxBytes).toBe(1);
  });

  it("supports environment overrides for temporary max budgets", () => {
    const [entry] = mergeBudgetOverrides(DEFAULT_BUDGETS, {
      BUNDLE_MAX_ENTRY_BYTES: "800000",
    });

    expect(entry.maxBytes).toBe(800_000);
  });

  it("formats bytes as decimal kilobytes", () => {
    expect(formatBytes(250_000)).toBe("250.0 kB");
  });
});
