# Project Methodology

How this team plans, tracks, and reviews work over the course of the
project. For git-specific conventions (commits, branches, merges,
versioning) see [`GIT_METHODOLOGY.md`](./GIT_METHODOLOGY.md); for what the
codebase actually does see [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).

## Team

Owen, Josh, Adrian, Daniel, Kiran, Sanele. Work is split **feature by
feature**, not by fixed frontend/backend roles — whoever picks up a
feature owns it end-to-end (backend, frontend, and tests for that
feature), following the one-branch-per-feature convention in
`GIT_METHODOLOGY.md`.

## Methodology: Scrum, adapted to the brief's 3-sprint cadence

We follow Scrum, mapped directly onto the milestones the brief already
imposes rather than an independent sprint calendar:

| Sprint | Ends | Focus |
|---|---|---|
| Sprint 1 | 2026-08-25 | Project setup, biggest blockers, direction for the rest of the semester |
| Sprint 2 | 2026-09-15 | Core features implemented, moving toward a stable product |
| Sprint 3 | 2026-09-29 | Near-complete: most features implemented and working, qualitative review |
| Submission | 2026-10-11 | Final polish |

This is a deliberate fit, not an arbitrary choice: the brief's own
milestones are already sprint-shaped (each with a review/marking point at
the end), and the assigned tutor already plays a stakeholder role close to
a Scrum client — so adapting Scrum onto that structure means the
ceremonies below produce the same evidence the rubric asks for (regular
stakeholder interaction, a used and evidenced methodology, work tracked
over time) rather than layering a separate process on top of it.

## Ceremonies

- **Sprint planning** — at the start of each sprint, the team picks which
  backlog items to take on, prioritized basic-tier requirements first,
  then intermediate, then advanced (matching how the brief itself tiers
  requirements — see `PROJECT_OVERVIEW.md`). Each item is assigned to
  whoever is picking up that feature.
- **Weekly team sync** — a weekly check-in among the team: progress since
  last sync, anything blocked, any re-prioritization needed before the
  next tutor check-in.
- **Weekly tutor check-in** — a weekly session with our assigned tutor
  (client). We demo progress, get a decision on whether a feature counts
  as "complete," and bring back any feedback into the backlog. This is
  the primary channel for the "Stakeholder Interaction" / "Stakeholder
  Reviews" rubric criteria — feedback from these sessions should be
  visibly reflected in later backlog changes, not just noted and dropped.
- **Sprint review** — at the end of each sprint (i.e. at each milestone),
  a look back at what got done against what was planned, feeding directly
  into the next sprint's planning.

## Work tracking

Gitea's built-in **Projects** board (same host as the repo,
`sdp.ms.wits.ac.za`) — a Kanban-style board with columns tracking each
item's status (e.g. Sprint Log → In Progress → done), rather than a
separate tool. Keeping it on Gitea means an item can link directly to the
branch/PR that closes it, so the work tracker and the git history stay in
sync rather than needing to be updated in two places.

## Definition of done

A feature is "done" when:

1. It's on its own branch, per `GIT_METHODOLOGY.md`.
2. It typechecks, lints, and builds cleanly.
3. It has a PR the team has reviewed and agreed is finished (see
   `GIT_METHODOLOGY.md`'s merge requirements).
4. The tutor has seen it (or it's queued for the next weekly check-in) and
   nothing they flagged is still outstanding.
5. It's merged to `main`.

Only at that point does the work-tracker item move to done — not when code
is written, but when it's actually merged and reviewed.

## Known gap

Tutor/stakeholder feedback currently lives in whoever attended that
week's check-in's memory, not written down anywhere. Worth fixing (e.g. a
short note per check-in on the Gitea Project or wiki) so "evaluated and
integrated stakeholder feedback" is something we can actually point to as
evidence later, not just something we did.
