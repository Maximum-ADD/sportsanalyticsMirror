# Git Methodology

How this team uses git: when to commit, how to write commits, when to
branch, how to name branches, when to merge, what's required before a
merge, and when/how releases are versioned.

## When to commit

Commit once a single, independent unit of work is done — one feature, one
bug fix, one refactor. Don't bundle unrelated changes into the same commit
(e.g. "add Teams page" and "fix a typo in the README" are two commits, not
one). If a change touches two unrelated things, split it.

Before committing:

- Check the diff (`git diff --staged`) for secrets or sensitive data —
  API keys, tokens, `.env` contents, credentials, private keys, personal
  data. Don't trust `.gitignore` alone; actually look.
- If AI assistance (e.g. Claude Code) prepared the change, it shows the
  proposed commit message and waits for an explicit go-ahead before
  running `git commit` — never committed silently on its own.

## How to write commits

```
tag: short plain-English description
```

- **Tag**: one lowercase word, no scopes/parens (skip `feat(auth):` style).
  Common tags: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`.
- **Description**: imperative mood, no trailing period —
  `feat: add CV upload button`, not `feat: Added CV upload button.`
- Keep the subject line short. If more detail is needed, put it in the
  commit body, not the tag line.

Examples:

- `refactor: migrate API backend from Express to NestJS`
- `feat: replace Passport auth with BetterAuth (Google OAuth)`
- `fix: correct auth status codes and remove magic numbers in API`
- `chore: bump prisma client version`

## When to branch

Branch for every feature, fix, or other independent unit of work — never
commit directly to `main`. Branch off `main`.

## How to name branches

Short, lowercase, hyphenated. Name it after what it does, not who's doing
it or a ticket number.

Examples: `nestjs-migration`, `betterauth-google-oauth`, `frontend-ui-teams`.

## When to merge

Only once **every team member has reviewed the branch and agreed it's
good and finished** — never merge on the strength of one person's opinion,
including the author's. If there's no confirmation that everyone agrees,
don't merge; open (or keep open) a PR for review instead.

## Requirements for merging

Before a branch merges into `main`:

1. The team has actually reviewed it — confirmed, not assumed.
2. No secrets or sensitive data anywhere in the diff.
3. It typechecks, lints, and builds cleanly.
4. A PR exists on Gitea so the review has a record (`<branch> -> main`).

`main` stays the stable, always-working version of the code — nothing
lands there until the above is true.

## When to version

At the end of each sprint, once that sprint's approved work is merged into
`main`, tag the resulting commit as a release. Versioning isn't done
ad hoc between sprints — one tag per sprint keeps the release history easy
to follow and lines up with the SDP's own milestone cadence.

## How to version

Releases are tagged by date (CalVer), not semantic major/minor/patch
numbers — simpler to reason about than deciding what counts as "breaking"
on a project whose scope is still evolving sprint to sprint.

Format: `vYYYY.MM.DD`, the date the sprint's release is cut — e.g.
`v2026.08.13`. If more than one release lands on the same date (rare),
append `.1`, `.2`, etc.: `v2026.08.13.1`.

```bash
git checkout main
git pull origin main
git tag -a v2026.08.13 -m "Sprint 3: NestJS + BetterAuth migration, Teams UI"
git push origin v2026.08.13
```

The tag message is a one-line, plain-English summary of what shipped that
sprint — same tone as a commit description, not a changelog dump.
