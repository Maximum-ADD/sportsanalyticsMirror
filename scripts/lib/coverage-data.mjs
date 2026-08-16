// Shared by build-coverage-report.mjs and post-mr-coverage-comment.mjs so
// both read the same coverage-summary.json / test-report.json shape the
// same way.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PACKAGES = [
  { key: "api", label: "Backend API", dir: join(ROOT, "apps/api") },
  { key: "web", label: "Frontend Web", dir: join(ROOT, "apps/web") },
];

export const METRICS = ["lines", "statements", "functions", "branches"];

export function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function loadPackage(pkg, { weakFileThreshold = 80, maxWeakFiles = 10 } = {}) {
  const summary = loadJson(join(pkg.dir, "coverage", "coverage-summary.json"));
  const testReport = loadJson(join(pkg.dir, "test-report.json"));

  const weakFiles = summary
    ? Object.entries(summary)
        .filter(([file]) => file !== "total")
        .map(([file, metrics]) => ({
          file: file.replace(pkg.dir, "").replace(/^[\\/]/, ""),
          pct: metrics.lines.pct,
        }))
        .filter((entry) => entry.pct < weakFileThreshold)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, maxWeakFiles)
    : [];

  return {
    ...pkg,
    totals: summary?.total ?? null,
    tests: testReport
      ? {
          total: testReport.numTotalTests,
          passed: testReport.numPassedTests,
          failed: testReport.numFailedTests,
          pending: testReport.numPendingTests,
          success: testReport.success,
        }
      : null,
    weakFiles,
  };
}

export function combineTotals(packages) {
  const combined = {};
  for (const metric of METRICS) {
    let covered = 0;
    let total = 0;
    for (const pkg of packages) {
      if (!pkg.totals) continue;
      covered += pkg.totals[metric].covered;
      total += pkg.totals[metric].total;
    }
    combined[metric] = { covered, total, pct: total === 0 ? 0 : Math.round((covered / total) * 1000) / 10 };
  }
  return combined;
}

export function loadAllPackages(options) {
  return PACKAGES.map((pkg) => loadPackage(pkg, options));
}
