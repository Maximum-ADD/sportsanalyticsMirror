#!/usr/bin/env node
// Posts (or updates) one comment on the current merge request summarising
// coverage for both apps. Requires GitLab CI's predefined variables
// (CI_SERVER_URL, CI_PROJECT_ID, CI_MERGE_REQUEST_IID, CI_JOB_TOKEN) — set
// automatically on merge request pipelines, so this is a no-op outside one.
// Never fails the pipeline: this is a nice-to-have, not a build gate.
import { combineTotals, loadAllPackages, METRICS } from "./lib/coverage-data.mjs";

const MARKER = "<!-- coverage-summary-comment -->";

function pct(metric) {
  return metric ? `${metric.pct}%` : "—";
}

function testsCell(tests) {
  if (!tests) return "no report";
  return tests.failed > 0 ? `${tests.failed} failing / ${tests.total} total` : `${tests.passed} passed`;
}

function buildCommentBody(packages) {
  const combined = combineTotals(packages);
  const anyFailing = packages.some((pkg) => pkg.tests && pkg.tests.failed > 0);

  const rows = packages
    .map(
      (pkg) =>
        `| ${pkg.label} | ${METRICS.map((metric) => pct(pkg.totals?.[metric])).join(" | ")} | ${testsCell(pkg.tests)} |`
    )
    .join("\n");

  const combinedRow = `| **Combined** | ${METRICS.map((metric) => `**${pct(combined[metric])}**`).join(" | ")} | |`;

  return [
    MARKER,
    "### Test coverage summary",
    anyFailing ? "\n**Some tests are failing on this branch — see the pipeline for details.**" : "",
    "",
    `| Package | Lines | Statements | Functions | Branches | Tests |`,
    `| --- | --- | --- | --- | --- | --- |`,
    rows,
    combinedRow,
    "",
    `Full report: this pipeline's \`coverage-report\` job artifacts.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function findExistingNoteId(apiBase, headers) {
  const response = await fetch(`${apiBase}/notes?per_page=100&order_by=created_at&sort=desc`, { headers });
  if (!response.ok) return null;
  const notes = await response.json();
  const existing = notes.find((note) => typeof note.body === "string" && note.body.includes(MARKER));
  return existing?.id ?? null;
}

async function main() {
  const { CI_SERVER_URL, CI_PROJECT_ID, CI_MERGE_REQUEST_IID, CI_JOB_TOKEN, MR_COMMENT_TOKEN } = process.env;

  if (!CI_MERGE_REQUEST_IID) {
    console.log("Not a merge request pipeline — skipping coverage comment.");
    return;
  }

  const headers = MR_COMMENT_TOKEN
    ? { "PRIVATE-TOKEN": MR_COMMENT_TOKEN, "Content-Type": "application/json" }
    : { "JOB-TOKEN": CI_JOB_TOKEN, "Content-Type": "application/json" };

  const apiBase = `${CI_SERVER_URL}/api/v4/projects/${CI_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}`;
  const packages = loadAllPackages();
  const body = buildCommentBody(packages);

  try {
    const existingNoteId = await findExistingNoteId(apiBase, headers);
    const url = existingNoteId ? `${apiBase}/notes/${existingNoteId}` : `${apiBase}/notes`;
    const method = existingNoteId ? "PUT" : "POST";

    const response = await fetch(url, { method, headers, body: JSON.stringify({ body }) });
    if (!response.ok) {
      console.warn(
        `Could not post coverage comment (${response.status} ${response.statusText}). ` +
          `If this is a permissions issue, set a project CI/CD variable MR_COMMENT_TOKEN ` +
          `(an access token with 'api' scope) and re-run.`
      );
      return;
    }
    console.log(`Coverage comment ${existingNoteId ? "updated" : "posted"} on MR !${CI_MERGE_REQUEST_IID}.`);
  } catch (error) {
    console.warn(`Could not post coverage comment: ${error.message}`);
  }
}

main();
