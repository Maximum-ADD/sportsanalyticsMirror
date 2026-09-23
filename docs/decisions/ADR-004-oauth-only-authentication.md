# ADR-004: OAuth-only authentication, no password reset flow

- **Status:** Accepted — implemented since the project's first auth commit
  (see `ai-usage.md`, 2026-08-06). This ADR is written retroactively to
  close a documentation gap: the brief's key requirement ("sign up, sign
  in, reset their passwords, and delete their accounts") reads, taken
  literally, as if a password-reset flow is missing. It isn't missing —
  there are no passwords to reset. That reasoning was never written down
  until now.
- **Date:** 2026-08-06 (implemented); **ADR filed:** 2026-09-23
- **Numbering note:** this repo's `docs/decisions/` only carries ADR-003
  locally; ADR-001/002 apparently live only on the public docs site. If
  ADR-004 already exists there, renumber this file to match rather than
  leaving two different ADR-004s.

## Context

The brief's Key Requirements (§2.1) state: "Users must be able to sign up,
sign in, reset their passwords, and delete their accounts. You may not
write your own authentication system, instead you must rely on established
practices and libraries."

`apps/api/src/auth/auth.config.ts` configures [BetterAuth](https://better-auth.com)
— an established library — with exactly one sign-in method:
`socialProviders: { google: {...} }`. No `emailAndPassword` plugin is
configured anywhere. This means the platform never creates, stores, or
asks a user for a password at any point: sign-up and sign-in are both the
same Google OAuth redirect. A "reset your password" flow is inapplicable
by construction, not an oversight — there is no password on either side of
the reset.

## Decision

Authenticate exclusively via Google OAuth through BetterAuth. Do not add a
parallel email/password credential path solely to have something to
"reset" — that would mean maintaining two authentication systems (and the
password-reset email deliverability, token-expiry, and rate-limiting
surface that comes with the second one) for a requirement that the
single-credential design already satisfies by not needing it.

Account deletion, the other half of the key requirement, is a real,
separate feature: `auth.config.ts`'s `user.deleteUser.enabled: true` turns
on BetterAuth's own `POST /auth/delete-user`, exposed to the user via
`DeleteAccountControl` on `apps/web/src/pages/ProfilePage.tsx`.

## Alternatives considered

- **Add BetterAuth's `emailAndPassword` plugin alongside Google OAuth.**
  Rejected: it would satisfy the brief's literal wording at the cost of a
  second credential store, a password-reset email flow to build and test,
  and two ways for the same account to end up authenticated — none of
  which this project's actual users (Google-account holders, in practice
  every likely user) need. Revisit only if a real user without a Google
  account is turned away.
- **Roll a custom "no password to reset" explanation into the sign-in UI
  copy instead of an ADR.** Rejected as the only fix: a marker reading the
  brief against this codebase needs the reasoning to be findable in
  `docs/decisions/`, not inferred from the absence of a feature.

## Consequences

- **Positive:** one credential source, one place sessions/roles are
  managed, no password-reset email infrastructure (deliverability,
  token expiry, rate limiting) to build, test, or get wrong.
- **Negative:** a user without a Google account cannot use the platform at
  all. Not addressed here; would need a second ADR if it becomes a real
  requirement.
- **Documentation:** this ADR is the citable answer to "where's the
  password reset flow" — link it from `README.md`'s auth section and the
  public docs site's Decisions index the next time either is touched.

## References

- `apps/api/src/auth/auth.config.ts`
- `apps/web/src/pages/ProfilePage.tsx` (`DeleteAccountControl`)
- Brief §2.1, Key Requirements — Authentication & Security
