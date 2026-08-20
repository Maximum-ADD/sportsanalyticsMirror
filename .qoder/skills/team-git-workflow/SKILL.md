---
name: team-git-workflow
description: Git branching and commit conventions for team projects. Use whenever the user is committing code, creating branches, opening a PR, or merging work on any team codebase. Always ask for confirmation before running a commit, check staged changes for secrets/sensitive info before committing, and never merge a feature branch to main without confirming the team has reviewed and agreed it's done.
---
 
# Team Git Workflow
 
Standard git workflow for team projects. Applies any time Claude is helping with git operations — commits, branches, merges, PRs — on a team codebase.
 
## Branches
 
- `main` — the stable, always-up-to-date version of the code. Nothing goes here until it's reviewed and agreed on.
- Feature branches — one per feature (e.g. a new page, a new endpoint). Branch off `main`.
  - Examples: `applicant-profile-page`, `cv-upload`, `nqf-dropdown`
  - Keep names short, lowercase, hyphenated.
## Committing
 
**Always ask before committing.** Never run `git commit` (or `git push`) without first showing the proposed commit message(s) and getting an explicit go-ahead. This applies even if the work is clearly finished.
 
**One commit per independent unit of work.** A unit of work is a single feature, a single bug fix, a single refactor, etc. — things that don't depend on each other. If a change touches two unrelated things, split it into two commits (and ask about each separately if needed). Don't bundle "add CV upload" and "fix typo in nav" into one commit.
 
**Scoped commits, simple humanized tags.** Format:
 
```
tag: short plain-English description
```
 
- Tag is one lowercase word, no parentheses/scopes (skip `feat(auth):` style — keep it simple)
- Common tags: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`
- Description is imperative, no trailing period: `feat: add CV upload button`, not `feat: Added CV upload button.`
- No walls of text in the subject line — if more detail is needed, put it in the commit body, not the tag line
Examples:
- `feat: add NQF qualification dropdown`
- `fix: correct SAQA lookup validation`
- `refactor: simplify applicant form state`
- `chore: bump supabase client version`
## Checking for sensitive info before committing
 
Before proposing any commit, check the staged changes for secrets or sensitive data — don't just trust `.gitignore`. Look for things like:
 
- API keys, tokens, or credentials (e.g. Supabase service role keys, JWT secrets)
- `.env` files or hardcoded connection strings/passwords
- Private keys or certificates (`.pem`, `.key`, etc.)
- Any personal data that shouldn't be in the repo
Practically:
 
1. Run `git diff --staged` (or check `git status` for files about to be added) and scan it yourself before writing the commit message.
2. If something sensitive shows up, stop and flag it — don't commit it, and suggest moving it to a `.env` file (added to `.gitignore`) or an untracked config file instead.
3. If a secret has already been committed in an earlier commit, flag that separately — removing it from the latest commit isn't enough, it's still in git history and the key should be rotated.
## Merging back to main
 
Only merge a feature branch into `main` once **all team members have reviewed the code and agree it's good and finished.** Before merging:
 
1. Confirm the branch has actually been reviewed (don't assume — ask the user if the team has signed off).
2. If there's no confirmation that everyone agrees, don't merge — flag it and suggest opening/continuing a PR for review instead.
## Quick workflow summary
 
1. Branch off `main` for the feature.
2. Do the work.
3. When a self-contained unit of work is done, check the staged changes for secrets/sensitive info, then propose a commit message using the tag format above and **ask before committing**.
4. Push the feature branch.
5. Open for team review (PR or equivalent).
6. Merge to `main` only once everyone has reviewed and agreed it's finished.
