#!/usr/bin/env node
// Creates (or updates) this repository's issue labels on Gitea via the API.
//
// Gitea has no file-based label config — a repo cannot ship its labels the way
// it ships .gitea/ISSUE_TEMPLATE (go-gitea/gitea#27003 proposes it, but it is
// still an open proposal, not a feature). Instance-wide label templates exist
// but live in $GITEA_CUSTOM/options/label on the server, which needs admin
// access to sdp.ms.wits.ac.za that we don't have. So this script is how the
// label scheme stays in version control and reproducible instead of being
// clicked in by hand and drifting.
//
// Safe to re-run: it creates what's missing and patches what has drifted, and
// never deletes a label it doesn't know about — the repo's existing 15 labels
// (ui, backend, database, auth, ...) are untouched by this.
//
//   GITEA_TOKEN=<token> node scripts/setup-gitea-labels.mjs [--dry-run]
//
// Generate the token at Settings -> Applications -> Generate New Token with
// the `write:issue` scope. Never commit it.

const GITEA_BASE_URL = process.env.GITEA_URL ?? "https://sdp.ms.wits.ac.za";
const GITEA_REPO = process.env.GITEA_REPO ?? "innovation/sportsanalytics";
const GITEA_TOKEN = process.env.GITEA_TOKEN;

// Gitea's label list is paginated; one page this size covers a scheme far
// larger than ours, so there is no second-page handling to get wrong.
const LABEL_PAGE_SIZE = 100;

const isDryRun = process.argv.includes("--dry-run");

// The additions. A name containing "/" gives the label a *scope* (everything
// before the last slash); `exclusive: true` then makes Gitea enforce at most
// one label per scope on an issue.
const LABELS = [
  // The repo already has a working component vocabulary — ui, backend,
  // api-service, database, auth, models, ci/cd, deployment, testing, git,
  // process, documentation, stat-submission, product-owner, user-feedback.
  // Those are left alone: this script only fills the axes nothing covered.
  //
  // Flat vs scoped is a deliberate split. Component and type labels stay flat
  // to match what is already there, and because you often want two at once.
  // priority/ and status/ are scoped because a scope is what lets Gitea make
  // a label exclusive, and those are exactly the axes where an issue should
  // carry at most one.

  // Type. The repo has `documentation` but no bug label at all, and the issue
  // form applies this one by name, so it has to exist.
  { name: "bug", color: "#d73a4a", exclusive: false, description: "Something works differently from how it should" },

  // Priority. Nothing existing expresses urgency. Set by the reporter when
  // they file, from the sidebar; triage does not re-rank.
  { name: "priority/critical", color: "#b60205", exclusive: true, description: "Production is down, or the whole team is blocked" },
  { name: "priority/high", color: "#d93f0b", exclusive: true, description: "Needed for this sprint's demo" },
  { name: "priority/medium", color: "#fbca04", exclusive: true, description: "Should be fixed this sprint if there is room" },
  { name: "priority/low", color: "#c2e0c6", exclusive: true, description: "Nice to have; safe to carry to a later sprint" },

  // The one component gap: apps/ingestion had no label, despite being a whole
  // app and the source of the 2026-09-02 production bio-data problem.
  { name: "ingestion", color: "#006b75", exclusive: false, description: "apps/ingestion — nba_api scripts writing into Postgres" },

  // Cross-cutting. Worth finding fast: a regression means something merged
  // that should not have.
  { name: "regression", color: "#e99695", exclusive: false, description: "Used to work; a change broke it" },

  // Exceptions only — an issue on the normal path carries no status/ label.
  // Deliberately no "needs triage": auto-applied to everything it would say
  // nothing, and would need manually removing later.
  { name: "status/blocked", color: "#b60205", exclusive: true, description: "Cannot proceed until something else lands" },
  { name: "status/needs-info", color: "#d876e3", exclusive: true, description: "Waiting on the reporter before it can be worked" },
  { name: "status/duplicate", color: "#cfd3d7", exclusive: true, description: "Already tracked in another issue" },
  { name: "status/wontfix", color: "#e6e6e6", exclusive: true, description: "Valid, but a deliberate decision not to fix" },
];

/**
 * Calls the Gitea API and returns the parsed JSON body.
 *
 * Throws with the response body included on any non-2xx status — Gitea puts
 * the useful part of an error (bad scope, duplicate name) in the body, not the
 * status text, so swallowing it makes failures much harder to diagnose.
 */
async function callGiteaApi(method, path, body) {
  const response = await fetch(`${GITEA_BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `token ${GITEA_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${method} ${path} failed with ${response.status}: ${errorBody}`);
  }
  return response.status === 204 ? null : response.json();
}

/** Fetches every label currently on the repo, keyed by name for lookup. */
async function getExistingLabelsByName() {
  const labels = await callGiteaApi("GET", `/repos/${GITEA_REPO}/labels?limit=${LABEL_PAGE_SIZE}`);
  return new Map(labels.map((label) => [label.name, label]));
}

// Gitea stores colors without the leading "#" and is inconsistent about case,
// so comparing the raw strings would report drift on every run and patch
// labels that are already correct.
function normalizeColor(color) {
  return color.replace(/^#/, "").toLowerCase();
}

/** True when the live label already matches what the scheme asks for. */
function matchesScheme(existingLabel, desiredLabel) {
  return (
    normalizeColor(existingLabel.color) === normalizeColor(desiredLabel.color) &&
    (existingLabel.description ?? "") === desiredLabel.description &&
    Boolean(existingLabel.exclusive) === desiredLabel.exclusive
  );
}

function toLabelPayload(label) {
  return {
    name: label.name,
    color: label.color,
    description: label.description,
    exclusive: label.exclusive,
  };
}

async function createLabel(label) {
  await callGiteaApi("POST", `/repos/${GITEA_REPO}/labels`, toLabelPayload(label));
}

async function updateLabel(labelId, label) {
  await callGiteaApi("PATCH", `/repos/${GITEA_REPO}/labels/${labelId}`, toLabelPayload(label));
}

async function main() {
  if (!GITEA_TOKEN) {
    throw new Error(
      "GITEA_TOKEN is not set. Generate one at Settings -> Applications with the " +
        "`write:issue` scope, then re-run:  GITEA_TOKEN=<token> node scripts/setup-gitea-labels.mjs"
    );
  }

  console.log(`${isDryRun ? "[dry run] " : ""}Syncing ${LABELS.length} labels to ${GITEA_REPO} on ${GITEA_BASE_URL}\n`);

  const existingLabelsByName = await getExistingLabelsByName();
  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;

  for (const label of LABELS) {
    const existingLabel = existingLabelsByName.get(label.name);

    if (!existingLabel) {
      if (!isDryRun) await createLabel(label);
      console.log(`  create   ${label.name}`);
      createdCount += 1;
    } else if (!matchesScheme(existingLabel, label)) {
      if (!isDryRun) await updateLabel(existingLabel.id, label);
      console.log(`  update   ${label.name}`);
      updatedCount += 1;
    } else {
      unchangedCount += 1;
    }
  }

  console.log(
    `\n${isDryRun ? "Would create" : "Created"} ${createdCount}, ` +
      `${isDryRun ? "would update" : "updated"} ${updatedCount}, ` +
      `${unchangedCount} already correct.`
  );

  const unknownLabelNames = [...existingLabelsByName.keys()].filter(
    (name) => !LABELS.some((label) => label.name === name)
  );
  if (unknownLabelNames.length > 0) {
    console.log(
      `\nLeft alone (not in this scheme): ${unknownLabelNames.join(", ")}` +
        "\nDelete these in the Gitea UI if they are Gitea's defaults and you don't want them."
    );
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
