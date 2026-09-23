# 2026-09-17 — Mandatory API-Key Rollout & Production Recovery

**Participants:** Owen (lead), AI coding assistant
**Scope:** Rolling out the mandatory API-key change (PRs #171/#172) to production, resolving the
production outage it caused, and bringing open PRs back up to date.

---

## Background

- **PR #171** (`feat-user-api-keys`) added user-owned API keys and wired the `ApiKeyGuard` into the
  public read endpoints (still passing anonymous calls through).
- **PR #172** (`api-key-access`) made keys **mandatory**: a request without a valid `X-API-Key`
  *or* a signed-in session gets `401 API_KEY_REQUIRED`. A new `OptionalSessionGuard` runs before the
  key guard on the five public read controllers (players, games, teams, analytics, datasets) so
  signed-in visitors pass via their session.
- **Hosting:** Render runs `apps/api` (boot command `npx prisma migrate deploy && npm start` from
  `main`). Cloudflare Pages hosts `apps/web` (static) plus Pages Functions that proxy `/api/*` to
  the API (stripping the `/api` prefix) and `/auth/*` to better-auth. The local dev server mirrors
  this with a Vite proxy.

## What Happened

### 1. CI red push on `api-key-access`

The CI coverage job runs the full Vitest suite, including `test/**` e2e specs. All ~200 anonymous
Supertest call sites started returning 401 under the mandatory-key guard (local-only verification
had used a src-scoped config, hiding the e2e breakage).

**Fix (commit `ae072be`):** the e2e harness now stands in for the production first-party proxy:

- `apps/api/test/create-test-app.ts` stamps a fixed `TEST_SITE_PROXY_KEY` onto keyless requests
  (a caller's own `X-API-Key` still wins, exactly as in production).
- `apps/api/test/test-db.ts` seeds the `test-site-proxy` consumer after every `resetDatabase()`
  (which truncates the consumer/key tables) and `apps/api/test/global-setup.ts` seeds it once
  after migrations.

Verified with CI's exact commands: API **704/704** (coverage 87.5/87.2/85.3/80.9 vs 80% gates),
web **491/491**.

### 2. Deployed site outage — "loading forever"

**Symptom:** the deployed site rendered its shell, then spun forever; the sign-in box stayed grey.
Diagnosis (via a real browser session) showed every *signed-out* data call failing with
`401 API_KEY_REQUIRED` while auth itself was healthy.

**Root cause:** merging PR #172 auto-deployed the mandatory-key API to Render, but the Cloudflare
Pages project had no `SITE_PROXY_API_KEY`, so the `/api` proxy could not inject the first-party
site key. Every signed-out visitor was rejected.

**Red herrings ruled out:**

- A Vite watcher "reload storm": running the web coverage suite writes ~200 HTML files into
  `apps/web/coverage`, and Vite fired a full-page reload per file at every open tab. Fixed locally
  with `server.watch.ignored: ['**/coverage/**']` in `vite.config.ts` (**still uncommitted**).
- A suspected hang on `GET /v1/games?status=completed` was not a hang — the same endpoint returns
  200 in ~3.3s with a valid key; the "pending forever" observation was just the unauthenticated
  path.

### 3. Production fix

**Key insight:** development and production share a single Supabase database, and the first-party
consumer ("NBA Analytics Web App (first-party)", 1000 req/min, 1M req/day) with its `site-proxy`
key **already existed** in that database — it had been created for the local dev proxy. So no
database change was needed; the only missing piece was the Pages environment variable.

**Action taken:** `SITE_PROXY_API_KEY` was added as an encrypted **Secret** (Production
environment) in the Pages project → *Settings → Variables and secrets* → **Add** → *Secret*, then
a deployment was retried so the new variable bound. The value is the raw site key stored in the
gitignored `apps/web/.env`.

### 4. Render redeploys blocked — Prisma P3009

After the outage was understood, Render's boot-time `prisma migrate deploy` failed with **P3009**
("migrate found failed migrations in the target database") and every redeploy was refused.

**Root cause:** migration `20260917153000_add_user_api_keys` (add `ApiConsumer.userId` column +
unique index + foreign key) failed with Postgres `42701` — *column "userId" already exists*. The
`ApiConsumer`/`ApiKey`/`ApiUsageLog` tables had originally been created through the hand-written
DDL path (applied with psycopg2 because direct Node TLS to the database is unreliable from dev
machines) using the full final schema, so the migration's first statement was redundant. Prisma
marked the migration FAILED in `_prisma_migrations` and blocked all subsequent deploys.

**Fix:** the `prisma migrate resolve --applied` equivalent, applied via SQL: verified the column,
unique index, and foreign key all exist (nothing needed re-applying), then marked the migration as
finished in `_prisma_migrations`. The next deploy succeeded.

**Lesson:** whenever DDL is applied by hand, reconcile the Prisma migration ledger immediately for
any checked-in migration that covers the same objects — otherwise the next deploy dies with P3009.

### 5. Post-deploy verification (production)

| Probe | Result |
|---|---|
| `GET /api/v1/players` via site (proxy injects site key) | 200 |
| `GET /v1/players` direct to API, keyless | 401 (mandatory guard live) |
| `GET /api/v1/me/api-keys` unsigned | 401 → confirms the route exists (`SessionAuthGuard`) |
| `GET /api/health` | 200 |
| `/api-keys` page, signed in | loads |

### 6. PR maintenance — rebasing out-of-date branches

**PR #170 `fix-ingestion-schedule-availability`** → rebased onto current `main` (`8296e9c`):

- `admin-ingestion.service.spec.ts`: union merge — kept both main's new `triggerPull` describe and
  the branch's `ingestion availability` describe.
- `AdminPage.spec.tsx`: union merge — main's consumer-delete mocks + the branch's schedule mocks.
- Dropped the branch's compare-spec flake-fix commit: main's a11y rewrite of
  `ComparePage.spec.tsx` (combobox roles) supersedes it.
- Verified: API spec 16/16, AdminPage spec 23/23. Force-pushed with `--force-with-lease`.

**PR #173 `custom-statistics`** → rebased onto current `main` (3 commits, `f406181` tip): only
conflict was the same superseded compare-spec commit (dropped). Verified: 18/18 API specs.
Force-pushed with `--force-with-lease`.

Neither PR was merged — both await team review.

## Decisions

- **The site key stays server-side only.** It lives in the Cloudflare Pages secret store (and the
  gitignored `apps/web/.env` for the dev proxy) and is attached by the proxy function to keyless
  `/api` requests. It is never shipped in the browser bundle — anyone with it could consume the
  site's quota (1000/min, 1M/day).
- **One shared consumer for dev and production** (justified by the shared database). If dev/prod
  databases are ever split, create a separate production consumer and key.
- **Rebase + `--force-with-lease`** (not merge commits) to keep PR history linear, matching the
  team's existing convention for updating PR branches.

## How the key model works (reference)

| Caller | Credential |
|---|---|
| Signed-out website visitor | The site's first-party key, injected server-side by the Pages proxy |
| Signed-in user browsing the site | Their session cookie (`OptionalSessionGuard`) |
| External developer / integration | Their own user-created or admin-created `X-API-Key` |
| No key, no session | `401 API_KEY_REQUIRED` — the rule holds for every request |

## Open Items

- `apps/web/vite.config.ts` coverage-watch ignore — **uncommitted** local change (7 lines).
- Owen's local edits removing the `ingestion availability` tests from
  `admin-ingestion.service.spec.ts` / `AdminPage.spec.tsx` — not applied or pushed; open decision,
  since dropping them reduces coverage of the new `ingestionAvailable` branches against the 80%
  CI gate.
- PRs **#170** and **#173** are rebased and mergeable, awaiting review.
- **Rotation note:** if the site key ever leaks, create a replacement key via
  Admin → API Keys, update the Pages secret, redeploy, then revoke the old key.

## Where Things Live

- Site-key injection (prod): `functions/api/[[path]].ts`, `functions/_shared/proxy.ts`
- Site-key injection (dev): `apps/web/vite.config.ts` proxy block
- Test harness stamping: `apps/api/test/create-test-app.ts`, `test-db.ts`, `global-setup.ts`
- Guard: `apps/api/src/common/api-key.guard.ts` (+ `OptionalSessionGuard` on the five public
  read controllers)
- User key routes: `apps/api/src/me/api-keys/`
- Deploy config: `render.yaml` (Render service, boot-time migrations)

---

*Sensitive information (raw API keys, database credentials, session secrets, personal account
details) has been intentionally omitted from this summary. Secrets live in the Cloudflare Pages
secret store, the Render dashboard environment variables, and gitignored `.env` files.*
