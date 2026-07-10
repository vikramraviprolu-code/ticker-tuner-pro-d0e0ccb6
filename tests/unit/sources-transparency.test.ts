import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sourcesRoute = readFileSync("src/routes/sources.tsx", "utf8");

describe("sources transparency copy", () => {
  it("documents keyed, zero-key, historical, stale-cache, and demo/mock semantics", () => {
    expect(sourcesRoute).toContain("zero-key mode");
    expect(sourcesRoute).toContain("historical/EOD");
    expect(sourcesRoute).toContain("stale-cache");
    expect(sourcesRoute).toContain("demo/mock");
    expect(sourcesRoute).toContain("never presented as real-time");
  });

  it("does not describe silent production mock fallback as the default resilience path", () => {
    expect(sourcesRoute).not.toMatch(/Falls back to mock when unavailable/i);
    expect(sourcesRoute).not.toMatch(/deterministic mock fallback for resilience/i);
  });
});
