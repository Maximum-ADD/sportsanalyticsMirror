#!/usr/bin/env node
// Merges the coverage-summary.json and test-report.json produced by each
// app's `vitest run --coverage` into one static HTML dashboard. Run after
// both apps' test suites so their coverage/ and test-report.json files
// exist; missing files degrade to a "no data" section instead of crashing,
// so a partial run (e.g. only one app changed) still produces a page.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { combineTotals, loadAllPackages, METRICS, ROOT } from "./lib/coverage-data.mjs";

const OUT_DIR = join(ROOT, "coverage-report");
const WEAK_FILE_THRESHOLD = 80;

function colorForPct(pct) {
  if (pct >= 80) return "#2fae5c";
  if (pct >= 60) return "#d9a12b";
  return "#e5484d";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function renderMetricTile(label, metric) {
  if (!metric) {
    return `<div class="tile tile-empty"><div class="tile-label">${escapeHtml(label)}</div><div class="tile-value">—</div></div>`;
  }
  const color = colorForPct(metric.pct);
  return `
    <div class="tile">
      <div class="tile-label">${escapeHtml(label)}</div>
      <div class="tile-value" style="color:${color}">${metric.pct}%</div>
      <div class="tile-sub">${metric.covered} / ${metric.total}</div>
      <div class="bar"><div class="bar-fill" style="width:${metric.pct}%;background:${color}"></div></div>
    </div>`;
}

function renderTestBadge(tests) {
  if (!tests) return `<span class="badge badge-muted">no test report</span>`;
  const cls = tests.failed > 0 ? "badge-fail" : "badge-pass";
  const label = tests.failed > 0 ? `${tests.failed} failing` : `${tests.passed} passing`;
  return `<span class="badge ${cls}">${label}</span><span class="badge badge-muted">${tests.total} total${tests.pending ? `, ${tests.pending} skipped` : ""}</span>`;
}

function renderWeakFiles(pkg) {
  if (pkg.weakFiles.length === 0) {
    return `<p class="muted">Every covered file is at or above ${WEAK_FILE_THRESHOLD}% line coverage.</p>`;
  }
  const rows = pkg.weakFiles
    .map(
      (entry) => `
      <tr>
        <td class="file-cell">${escapeHtml(entry.file)}</td>
        <td style="color:${colorForPct(entry.pct)}">${entry.pct}%</td>
      </tr>`
    )
    .join("");
  return `
    <table class="weak-table">
      <thead><tr><th>File</th><th>Lines</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderPackageSection(pkg) {
  return `
    <section class="package">
      <div class="package-header">
        <h2>${escapeHtml(pkg.label)}</h2>
        <div class="package-header-right">
          ${renderTestBadge(pkg.tests)}
          <a class="report-link" href="./${pkg.key}/index.html">Full HTML report →</a>
        </div>
      </div>
      ${
        pkg.totals
          ? `<div class="tiles">${METRICS.map((metric) => renderMetricTile(metric[0].toUpperCase() + metric.slice(1), pkg.totals[metric])).join("")}</div>`
          : `<p class="muted">No coverage data found for this package — run <code>npm run test:cov</code> in ${escapeHtml(pkg.key === "api" ? "apps/api" : "apps/web")} first.</p>`
      }
      <h3>Files below ${WEAK_FILE_THRESHOLD}% line coverage</h3>
      ${renderWeakFiles(pkg)}
    </section>`;
}

function renderPage(packages) {
  const combined = combineTotals(packages);
  const generatedAt = new Date().toISOString();
  const commit = process.env.CI_COMMIT_SHORT_SHA ?? "local";
  const branch = process.env.CI_COMMIT_REF_NAME ?? "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Test Coverage — NBA Analytics Platform</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f7f8fa; --surface: #ffffff; --border: #e2e4e9; --text: #1a1d23; --text-muted: #6b7280;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14161a; --surface: #1c1f26; --border: #2c303a; --text: #eef0f3; --text-muted: #9aa1ad; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2rem 1.25rem 4rem; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .meta { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 2rem; }
  .meta code { background: var(--border); padding: 0.1rem 0.35rem; border-radius: 4px; }
  h2 { font-size: 1.1rem; margin: 0; }
  h3 { font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; margin: 1.5rem 0 0.75rem; }
  .overall { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 2rem; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin-top: 0.75rem; }
  .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 0.85rem 1rem; }
  .overall .tile { background: var(--bg); }
  .tile-empty { opacity: 0.6; }
  .tile-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .tile-value { font-size: 1.5rem; font-weight: 600; margin-top: 0.15rem; }
  .tile-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.1rem; }
  .bar { height: 5px; background: var(--border); border-radius: 999px; margin-top: 0.5rem; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px; }
  .package { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1.25rem; }
  .package-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
  .package-header-right { display: flex; align-items: center; gap: 0.5rem; }
  .report-link { font-size: 0.85rem; color: inherit; }
  .badge { display: inline-block; font-size: 0.75rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-weight: 600; }
  .badge-pass { background: rgba(47,174,92,0.15); color: #2fae5c; }
  .badge-fail { background: rgba(229,72,77,0.15); color: #e5484d; }
  .badge-muted { background: var(--border); color: var(--text-muted); font-weight: 500; }
  .muted { color: var(--text-muted); font-size: 0.9rem; }
  .weak-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .weak-table th { text-align: left; color: var(--text-muted); font-weight: 500; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); }
  .weak-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); }
  .file-cell { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  .overflow { overflow-x: auto; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Test Coverage</h1>
    <p class="meta">Generated ${generatedAt} · commit <code>${escapeHtml(commit)}</code>${branch ? ` · branch <code>${escapeHtml(branch)}</code>` : ""}</p>

    <div class="overall">
      <h2>Overall (backend + frontend combined)</h2>
      <div class="tiles">${METRICS.map((metric) => renderMetricTile(metric[0].toUpperCase() + metric.slice(1), combined[metric])).join("")}</div>
    </div>

    ${packages.map(renderPackageSection).join("\n")}
  </div>
</body>
</html>`;
}

function copyHtmlReport(pkg) {
  const src = join(pkg.dir, "coverage");
  const dest = join(OUT_DIR, pkg.key);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  }
}

function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const packages = loadAllPackages({ weakFileThreshold: WEAK_FILE_THRESHOLD, maxWeakFiles: 10 });
  writeFileSync(join(OUT_DIR, "index.html"), renderPage(packages));
  for (const pkg of packages) copyHtmlReport(pkg);

  console.log(`Coverage report written to ${OUT_DIR}`);
  for (const pkg of packages) {
    console.log(`  ${pkg.label}: ${pkg.totals ? `${pkg.totals.lines.pct}% lines` : "no data"}`);
  }
}

main();
