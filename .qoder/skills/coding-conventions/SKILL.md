---
name: coding-conventions
description: Owen's personal coding style and naming conventions. Use this skill whenever writing, reviewing, or refactoring code for Owen, to make sure variable names, function names, and function structure follow his conventions. Applies to any programming language.
---
 
# Coding Conventions
 
Apply these conventions when writing or reviewing code.
 
## Design
 
- Follow **SOLID** object-oriented design principles where applicable:
  Single Responsibility, Open/Closed, Liskov Substitution, Interface
  Segregation, Dependency Inversion.
## Naming
 
- **Variables are nouns.** Prefer `elapsed_time_in_days = 0` over `d = 0`.
- **Functions are verbs.** Prefer `update_item_price()` over `item_updater()`.
- **Avoid disinformation.** Don't name something in a way that misrepresents
  what it is — e.g. don't call a `list` an "array", don't name a variable
  `accountList` if it's actually a `Map`.
- **Include units of measurement in variable names** when the variable
  measures something. Prefer `time_in_milliseconds` over `time`.
## Functions
 
- **Keep functions small.** Each function should do one thing, contain few
  lines, and prefer a single level of indentation. Treat this as a strong
  preference, not a hard limit — don't over-extract trivial one-line helpers
  just to satisfy the rule.
## General
 
- **Avoid magic numbers and strings.** Use named constants instead of
  unexplained literals.
- **Use consistent casing per language convention** — e.g. snake_case for
  Python, camelCase for JavaScript/Java — matching the idiomatic style of
  the language in use.
## Documentation
 
- **Document code as it's written, not after.** Add docstrings/comments in
  the same pass as writing the function, not as a cleanup step later.
- **Be descriptive about how functions work** — explain what the function
  does, its parameters, return value, and any non-obvious behavior or edge
  cases, not just a one-line restatement of the function name.
## CRUD Methodology
 
- **Adhere to CRUD (Create, Read, Update, Delete) methodology** when
  designing functions and data-handling code. Each function should map
  clearly to one of these operations rather than mixing several — e.g.
  keep `create_user()`, `get_user()`, `update_user()`, and `delete_user()`
  as separate functions instead of one function that both creates and
  updates records.
