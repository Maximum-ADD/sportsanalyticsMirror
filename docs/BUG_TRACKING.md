# Bug Tracking

How this team files, triages and closes bugs using Gitea Issues. For
branching and merge conventions see
[`GIT_METHODOLOGY.md`](./GIT_METHODOLOGY.md); for how sprints and the
Projects board work see [`PROJECT_METHODOLOGY.md`](./PROJECT_METHODOLOGY.md).

## How it fits together

Four pieces, each doing one job:

| Piece | What it is | Where it lives |
|---|---|---|
| **Labels** | The vocabulary — the repo's existing component labels, plus priority and status | Created in Gitea's UI, per repo |
| **Bug report form** | The questions every bug report has to answer | `.gitea/ISSUE_TEMPLATE/bug_report.yaml` |
| **Issue-picker config** | What the "New Issue" screen offers | `.gitea/ISSUE_TEMPLATE/config.yaml` |
| **Label sync script** | Optional shortcut for creating the labels | `scripts/setup-gitea-labels.mjs` |

The flow when someone hits a bug:

```
Issues -> New Issue -> "Bug report"
      |
      |  the form asks: environment, commit, steps, expected,
      |  actual, logs
      |
      |  the reporter picks a priority/ label and component
      |  labels from the sidebar on the same page
      |
      v
Issue created, already carrying bug
      |
      |  triage confirms it reproduces, adds regression if it
      |  applies, puts it on the board
      |
      v
Branch off main -> fix -> PR with "Closes #N" -> merge closes the issue
```

The labels and the form are independent. Labels work on their own the
moment they exist; the form is what makes sure a report arrives with
enough information to act on.

## The labels

The repo already had a working vocabulary of 15 labels, most of them naming a
part of the system. Those are kept exactly as they are — they are in active
use, and they are finer-grained than anything worth replacing them with
(`database` and `auth` are useful distinctions that a single "backend" label
would lose).

| Already here | What it covers |
|---|---|
| `ui`, `backend`, `api-service`, `database`, `auth`, `models`, `testing` | Which part of the system |
| `ci/cd`, `deployment`, `git` | Tooling and delivery |
| `documentation`, `process` | Type of work |
| `stat-submission`, `product-owner`, `user-feedback` | Feature area and stakeholder input |

Between them these cover the **component** axis well. Three axes were missing
entirely, and one component had no label at all.

### Labels to add

**Issues → Labels → New Label.** Scoped names (`priority/`, `status/`) get the
**Exclusive** tick; the flat ones do not.

| Name | Colour | Exclusive | Description |
|---|---|---|---|
| `bug` | `#d73a4a` | No | Something works differently from how it should |
| `priority/critical` | `#b60205` | Yes | Production is down, or the whole team is blocked |
| `priority/high` | `#d93f0b` | Yes | Needed for this sprint's demo |
| `priority/medium` | `#fbca04` | Yes | Should be fixed this sprint if there is room |
| `priority/low` | `#c2e0c6` | Yes | Nice to have; safe to carry to a later sprint |
| `ingestion` | `#006b75` | No | `apps/ingestion` — nba_api scripts writing into Postgres |
| `regression` | `#e99695` | No | Used to work; a change broke it |
| `status/blocked` | `#b60205` | Yes | Cannot proceed until something else lands |
| `status/needs-info` | `#d876e3` | Yes | Waiting on the reporter before it can be worked |
| `status/duplicate` | `#cfd3d7` | Yes | Already tracked in another issue |
| `status/wontfix` | `#e6e6e6` | Yes | Valid, but a deliberate decision not to fix |

If you are adding these in a hurry, the first six matter most: **`bug`** and
the four **`priority/`** labels are what the bug form and the triage flow
actually depend on, and **`ingestion`** closes the one real component gap. The
four `status/` labels can follow later — nothing breaks without them.

### Why these, and why some are scoped

**`bug` had to be added.** The repo has `documentation` but no bug label at
all, and the issue form applies `bug` by name — it has to exist, or every
report arrives unlabelled.

**Nothing expressed priority.** This is the biggest gap: there was no way to
say a bug is blocking the demo rather than merely annoying, so sprint planning
had nothing to sort on.

**`ingestion` was the only missing component.** `apps/ingestion` is a whole
application with no label, despite being the source of the 2 September
production bio-data problem. Everything else was already covered.

**Flat versus scoped is deliberate.** The existing labels are flat, and the new
component and type labels match them — you often want two at once (`backend`
*and* `database`), so exclusivity would be wrong there. `priority/` and
`status/` are scoped because **a scope is what lets Gitea make a label
exclusive**, and those are precisely the axes where an issue should carry at
most one. An issue cannot be both `priority/critical` and `priority/low`;
picking a new one clears the old.

**`priority/` is the reporter's to set.** Whoever hit the bug knows how badly
it is blocking them. Making every report wait for someone else to grade it
puts a queue in front of the tracker for no benefit. Triage does not re-rank;
if a priority looks wrong, that is a conversation on the issue, not a silent
relabel.

**`status/` marks exceptions only.** An issue on the normal path carries no
`status/` label; these four mean something has gone sideways. There is
deliberately no "needs triage" status — a label applied to every new issue
tells you nothing its creation date does not, and it has to be manually
removed later, so it rots. "Has anyone looked at this?" is already answered by
whether the issue is on the Projects board.

### One thing to decide

`backend` and `api-service` overlap, and both overlap `database` and `auth`.
That is pre-existing and this change does not touch it, but it is worth five
minutes at a sync to agree which one a new API bug gets — otherwise the
component axis drifts.

## How labels get applied

Two routes, and it is worth knowing which is which:

- **Automatically, by the form.** The `labels:` key at the top of
  `bug_report.yaml` applies `bug` to every issue filed through it.
  It is true of every bug by definition, so the form sets it without
  asking.
- **By the reporter, from the label selector** in the sidebar of the New
  Issue page. This is where `priority/` and the component labels get set,
  chosen from the labels that already exist on the repo.

Everything else in the form — environment, steps, logs — is prose in the
issue body.

That split is the whole design, so it is worth stating the rule plainly:

> **If you want to filter, sort or group by it, it has to be a label.
> Anything else is a form field.**

This is why priority and component are labels rather than form dropdowns. A
dropdown answer is text in the issue body: you could read it, but you could
not filter the issue list by it or group the board on it. `environment`
stays a form field precisely because nobody needs to filter on it — it is
context for whoever picks the bug up.

## The bug report form

`.gitea/ISSUE_TEMPLATE/bug_report.yaml` asks for: environment, commit or
branch, steps to reproduce, expected result, actual result, and logs. It
auto-applies `bug`, and prompts the reporter to set a `priority/` label and
any component labels from the sidebar before submitting.

The first question is **"Where did you see it?"** — deployed, local, both,
or not sure. That is first on purpose. Local and production run against
completely separate databases, and production data is loaded by hand from a
team member's machine rather than by any deploy (see
[`ADR-003`](./decisions/ADR-003-hosting-topology.md)). "Works locally,
broken on the deployed site" is therefore usually a data or deploy problem,
not a code problem. On 2 September 2026 the player bio fields appeared
broken in production and turned out to be an empty set of columns in
Supabase — the code was correct throughout. Answering that one question
would have pointed straight at it.

`config.yaml` controls the New Issue screen: it keeps blank issues enabled
(a quick task or question should not have to go through the bug form) and
adds links to `GIT_METHODOLOGY.md` and the docs site for process questions.

## Using it

### Filing a bug

Issues → New Issue → **Bug report**. Fill in every required field, and
**set a `priority/` label and any component labels in the sidebar before you
submit**. Those are yours — you do not need anyone's agreement, and nobody
will change them without talking to you. If you cannot judge one of them,
leave it off and say so in the issue.

If it is a **security** problem (a leaked credential, an auth bypass,
exposed data), do not file it. Raise it with the team directly so it is not
published first.

### Triaging

Whoever triages — in practice at the weekly team sync, or sooner for
anything that looks urgent — confirms the report and records what has
happened to it. It is a lighter job than it sounds, because the reporter
has already classified the bug:

1. Confirm it reproduces. If it does not, apply `status/needs-info` and
   ask; if it is already tracked, `status/duplicate` and link the original.
2. Apply a `status/` label only if something is off the normal path —
   waiting on the reporter, blocked, a duplicate. A healthy issue carries
   none. Because `status/` is exclusive, applying a new one clears the old
   automatically.
3. Leave `priority/` and the component labels alone — the reporter set them
   and they
   stand. If one looks wrong, raise it on the issue; do not relabel
   silently. Fill one in only where the reporter said they could not tell.
4. Add `regression` if it used to work. These are worth finding fast — a
   regression means something merged that should not have.

Then add it to the Projects board so it is visible against the sprint's
other work.

### Fixing

Follow the normal flow in [`GIT_METHODOLOGY.md`](./GIT_METHODOLOGY.md):
branch off `main`, one branch per fix, PR back. Put `Closes #<number>` in
the PR description so merging the PR closes the issue and leaves the link
in the history.

An issue is done when the fix is merged — the same bar as
`PROJECT_METHODOLOGY.md`'s definition of done, not when the code is
written.

## Trying it before it merges

Gitea reads issue templates from a repository's **default branch**. Pushing
a branch will not make the form appear anywhere, so the template cannot be
tested in place on this repo before it merges.

The two halves can be rolled out separately, which makes this easier than
it sounds.

**The labels can go in right now.** They are created through the UI and have
nothing to do with the template or any branch. Adding them early is safe:
worst case they sit unused. Do this first and the scheme is already working
before the form arrives.

**The form needs a scratch repo to test.** On `sdp.ms.wits.ac.za`:

1. Create a new repository — `<your-username>/bugtracker-test`, private,
   initialised with a README so it has a default branch.
2. Copy `.gitea/ISSUE_TEMPLATE/` from this branch into it and push to its
   default branch.
3. Create at least `bug` there, since the form applies it by name and it has
   to exist. Or seed the additions in one command:
   `GITEA_REPO=<your-username>/bugtracker-test npm run labels:sync`
4. Go to Issues → New Issue. "Bug report" should appear as an option
   alongside the blank issue and the two contact links.
5. File a test issue and check: the fields render in order, submitting with
   a required field empty is refused, `bug` lands on the created issue
   automatically, and the sidebar lets you add `priority/` and component
   labels while filing.
6. Delete the scratch repo when you are satisfied.

That exercises everything except the contact links, which point at this
repo's docs and will 404 from a scratch repo — expected, not a fault.

If a template has a YAML error, Gitea does not show an error: the entry
simply does not appear on the New Issue screen. So "Bug report is missing"
almost always means malformed YAML rather than a missing feature.

## Maintaining the labels

The additions table above is the source of truth; creating them by hand in
the UI is the normal path. `scripts/setup-gitea-labels.mjs` is an optional
shortcut that applies those additions through Gitea's API. It never touches
the 15 labels that were already there — useful for seeding a
scratch repo, or for putting a label change through review as a diff rather
than as a description of some clicks.

It needs a token from **Settings → Applications → Generate New Token**, with
the `write:issue` scope. It creates what is missing, patches what has
drifted, and never deletes a label it does not recognise.

```powershell
$env:GITEA_TOKEN = "<token>"
npm run labels:sync -- --dry-run   # lists every change, writes nothing
npm run labels:sync                # applies them
Remove-Item Env:\GITEA_TOKEN
```

`GITEA_URL` (default `https://sdp.ms.wits.ac.za`) and `GITEA_REPO` (default
`innovation/sportsanalytics`) override the target. The token is read from
the environment and never written to disk — do not paste it into a file in
the repo.

Renaming a label is the one case the script cannot handle: to Gitea a
rename looks like a new label, so the old one has to be deleted in the UI
afterwards.

***[AI Declaration: This document was generated using Claude Code: Opus 5]***
