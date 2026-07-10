#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_BUDGETS = [
  {
    name: "entry",
    description: "largest index entry chunk",
    pattern: /^index-[\w-]+\.js$/,
    targetBytes: 250_000,
    maxBytes: 738_000,
  },
  {
    name: "terminal",
    description: "terminal initial route chunk",
    pattern: /^terminal-page-[\w-]+\.js$/,
    targetBytes: 250_000,
    maxBytes: 110_000,
  },
  {
    name: "compare",
    description: "compare initial route chunk",
    pattern: /^compare-[\w-]+\.js$/,
    targetBytes: 180_000,
    maxBytes: 394_000,
  },
];

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  return `${(bytes / 1000).toFixed(1)} kB`;
}

export function mergeBudgetOverrides(budgets, env = process.env) {
  return budgets.map((budget) => {
    const key = `BUNDLE_MAX_${budget.name.toUpperCase()}_BYTES`;
    const override = env[key];
    if (override === undefined) return budget;

    const maxBytes = Number.parseInt(override, 10);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new Error(`${key} must be a positive integer byte count.`);
    }

    return { ...budget, maxBytes };
  });
}

export function evaluateBudgets(assets, budgets = DEFAULT_BUDGETS) {
  return budgets.map((budget) => {
    const matches = assets
      .filter((asset) => budget.pattern.test(asset.name))
      .sort((a, b) => b.bytes - a.bytes);
    const asset = matches[0] ?? null;
    const bytes = asset?.bytes ?? 0;
    const overMaxBytes = asset ? Math.max(0, bytes - budget.maxBytes) : null;
    const overTargetBytes = asset ? Math.max(0, bytes - budget.targetBytes) : null;

    return {
      ...budget,
      asset,
      bytes,
      overMaxBytes,
      overTargetBytes,
      status: !asset ? "missing" : overMaxBytes > 0 ? "fail" : "pass",
    };
  });
}

export async function readClientAssets(clientAssetsDir) {
  const entries = await readdir(clientAssetsDir, { withFileTypes: true });
  const assets = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .map(async (entry) => {
        const filePath = path.join(clientAssetsDir, entry.name);
        const stats = await stat(filePath);
        return { name: entry.name, path: filePath, bytes: stats.size };
      }),
  );

  return assets.sort((a, b) => b.bytes - a.bytes);
}

export function renderReport(results) {
  const lines = [
    "Bundle size governance (raw JS sizes)",
    "Temporary max budgets are set to current baseline + cushion; target budgets show the optimization gap.",
    "",
  ];

  for (const result of results) {
    if (result.status === "missing") {
      lines.push(
        `FAIL ${result.name}: no asset matched ${result.pattern} (${result.description})`,
      );
      continue;
    }

    const targetGap = result.overTargetBytes > 0 ? `, target gap ${formatBytes(result.overTargetBytes)}` : "";
    const maxGap = result.overMaxBytes > 0 ? `, over max by ${formatBytes(result.overMaxBytes)}` : "";
    const marker = result.status === "pass" ? "PASS" : "FAIL";
    lines.push(
      `${marker} ${result.name}: ${result.asset.name} ${formatBytes(result.bytes)} ` +
        `(target ${formatBytes(result.targetBytes)}, temp max ${formatBytes(result.maxBytes)}${targetGap}${maxGap})`,
    );
  }

  lines.push("");
  lines.push("Override temporary max budgets with BUNDLE_MAX_ENTRY_BYTES, BUNDLE_MAX_TERMINAL_BYTES, or BUNDLE_MAX_COMPARE_BYTES when intentionally rebasing.");
  return lines.join("\n");
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const clientAssetsDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "dist/client/assets"));
  const budgets = mergeBudgetOverrides(DEFAULT_BUDGETS);
  const assets = await readClientAssets(clientAssetsDir);
  const results = evaluateBudgets(assets, budgets);

  console.log(renderReport(results));

  if (results.some((result) => result.status !== "pass")) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Bundle size check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
