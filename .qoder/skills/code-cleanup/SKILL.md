---
name: code-cleanup
description: Use this whenever Owen asks to "clean up", "tidy up", "declutter", or do a "touch-up pass" on a codebase or file — removing unnecessary/unused files and code, running linters/formatters, and fixing small formatting or naming issues. Trigger on phrases like "clear the clutter", "clean this up", "remove unused stuff", "tidy this codebase", or requests for a general polish pass that isn't about adding new functionality.
---
 
# Code Cleanup
 
A tidying pass over existing code: remove dead weight, run formatters/linters, and fix small formatting/naming issues — without changing behavior.
 
## Scope
 
This is for polish, not redesign. In scope:
- Unused imports, variables, functions, and dead files (nothing else references them, no dynamic/reflection-based usage found).
- Formatting inconsistencies (indentation, spacing, quote style, trailing whitespace).
- Small naming touch-ups (typos, inconsistent casing) — for anything beyond small touch-ups, defer to the `coding-conventions` skill (Owen's naming/style rules) rather than duplicating it here; apply both together when doing a cleanup pass on Owen's code.
- Commented-out dead code blocks.
Out of scope (flag instead of doing): behavior changes, API/interface changes, restructuring that would need review, anything the user would want a say in before it happens.
 
## Workflow
 
1. **Survey first.** Scan the target file(s)/repo before changing anything. Identify:
   - Unused imports/variables/functions
   - Files nothing references (check imports/requires across the whole project, not just the current file — a file can look unused locally but be entry-loaded elsewhere)
   - Formatting/lint issues
2. **Run linters/formatters when available.** Prefer the project's own tooling over hand-editing:
   - JS/TS: `eslint --fix`, `prettier --write` if configs are present
   - Python: `black`, `ruff --fix` / `isort`
   - Other languages: check for existing config files (`.eslintrc`, `pyproject.toml`, `.rustfmt.toml`, etc.) and use the matching tool
   - Only hand-edit formatting where no tool covers it or a project has no linter/formatter configured.
3. **Remove unused code and dead files.** Don't just comment things out — delete them. If something looks unused but you're not fully certain (e.g. possible dynamic reference, reflection, string-based lookup, or external config pointing to it), delete it anyway but flag it clearly in the summary rather than leaving it in place — see step 4.
4. **Summarize at the end.** After cleanup, give Owen a short summary of:
   - Files deleted
   - Notable unused code removed (functions/variables, not every trivial import)
   - Formatter/linter run and what it changed, at a high level
   - Anything deleted that you weren't fully certain was unused, called out explicitly so Owen can double check
5. **Don't silently change behavior.** If removing something "unused" would actually change runtime behavior (e.g. a side-effecting import, an unused-looking variable that's actually a re-export), leave it and flag it instead of deleting it.
