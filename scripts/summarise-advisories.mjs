#!/usr/bin/env node
/**
 * Turn a Trivy JSON report into a human summary plus step outputs.
 *
 *   node scripts/summarise-advisories.mjs trivy.json
 *
 * Writes a markdown table to the GitHub Actions job summary and exposes:
 *   critical  — count of CRITICAL advisories with a published fix (hard gate)
 *   high      — count of HIGH advisories with a published fix (tracked, not gating)
 *   body      — markdown body for the rolling tracking issue
 *
 * Exits 0 whenever the report was understood, however many advisories it holds —
 * deciding what blocks the build is the workflow's job. An unreadable or
 * unrecognised report exits non-zero instead, so a broken scan fails the job
 * rather than looking indistinguishable from a clean one.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const reportPath = process.argv[2] ?? "trivy.json";

const fatal = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  fatal(`Could not read the Trivy report at ${reportPath}: ${err.message}`);
}

if (!Array.isArray(report?.Results)) {
  fatal(`${reportPath} has no Results array — the scan did not produce a usable report.`);
}

const findings = [];
for (const result of report.Results) {
  for (const v of result.Vulnerabilities ?? []) {
    findings.push({
      target: result.Target,
      pkg: v.PkgName,
      installed: v.InstalledVersion,
      fixed: v.FixedVersion ?? "",
      id: v.VulnerabilityID,
      severity: v.Severity,
      url: v.PrimaryURL ?? "",
      title: (v.Title ?? "").replace(/\s+/g, " ").trim(),
    });
  }
}

const bySeverity = (s) => findings.filter((f) => f.severity === s);
const critical = bySeverity("CRITICAL");
const high = bySeverity("HIGH");

const table = (rows) =>
  [
    "| Severity | Package | Installed | Fixed in | Advisory |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (f) =>
        `| ${f.severity} | \`${f.pkg}\` | ${f.installed} | ${f.fixed || "—"} | ${
          f.url ? `[${f.id}](${f.url})` : f.id
        } |`,
    ),
  ].join("\n");

const lines = [];
if (findings.length === 0) {
  lines.push("### Dependency advisories", "", "No fixable CRITICAL or HIGH advisories.");
} else {
  lines.push(
    "### Dependency advisories",
    "",
    `${critical.length} CRITICAL, ${high.length} HIGH with a published fix.`,
    "",
    table([...critical, ...high]),
    "",
    "Refresh the lockfile with `npm update` (or merge the open Dependabot PRs) to pull the fixed versions in.",
  );
}
const summary = lines.join("\n");

console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (process.env.GITHUB_OUTPUT) {
  const delimiter = `EOF_${randomUUID()}`;
  const body = [
    summary,
    "",
    "_Maintained automatically by the `Dependency advisories` job; closed once the lockfile is clean._",
  ].join("\n");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `critical=${critical.length}`,
      `high=${high.length}`,
      `body<<${delimiter}`,
      body,
      delimiter,
      "",
    ].join("\n"),
  );
}
