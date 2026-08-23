# ADR-003: Hosting topology

- **Status:** Proposed — awaiting team review before acceptance. Do not
  implement until the team has signed off (see
  [`GIT_METHODOLOGY.md`](../GIT_METHODOLOGY.md), "Requirements for merging").
- **Date:** 2026-08-19
- **Updated:** 2026-08-19 — database moved from Azure PostgreSQL Flexible
  Server to Supabase; frontend moved to Cloudflare Pages; API and batch jobs
  moved to Render after Azure for Students' region policy blocked Azure Static
  Web Apps and Fly.io's free tier proved unreliable for long-running always-on
  compute.
- **Fills:** the `ADR-003` stub referenced in [`README.md`](../../README.md)
  ("production deployment/hosting generally — not decided") and on the public
  docs site's *Decisions* section.

## Context

The platform runs as two non-monolithic apps that only talk over HTTP, plus a
Postgres database and a set of Python batch processes — none of which is
deployed anywhere yet. Locally everything is run by hand:

| Component | Local | What it is |
|---|---|---|
| `apps/api` | NestJS on `localhost:4000` | Long-running Node/Express server |
| `apps/web` | Vite dev server on `localhost:5173` | React SPA (built output is static `dist/`) |
| Postgres | Docker container on `55432` | The only thing the API talks to over the network |
| `apps/ingestion`, `apps/optimizer`, `apps/predictor` | Run by hand | Python scripts that write **straight into Postgres**, never through the API |
| CI | Gitea Actions (`sdp.ms.wits.ac.za`) | Lint/typecheck/test; **no deploy stage** |

Two things about the API are decisive for hosting, and both come straight from
[`apps/api/src/main.ts`](../../apps/api/src/main.ts):

1. **It is a long-running server, not a stateless function.** `main.ts` builds a
   plain `express()` instance, mounts `helmet`, `cors`, the BetterAuth handler
   at `/auth/*splat` (raw body, ahead of `express.json()`), and *then* hands
   that instance to `NestFactory.create()`. That bootstrap assumes a single
   persistent process that owns its routes for the lifetime of the server.
2. **It relies on session cookies across origins.** CORS is configured with
   `credentials: true` and `origin: process.env.WEB_ORIGIN`, and BetterAuth
   issues session cookies and runs the Google OAuth redirect dance. Both assume
   a process that stays warm and a stable, addressable origin.

The database is Postgres 16 (currently `postgres:16-alpine` in
`docker-compose.yml`). The brief requires the API remain the only thing that
talks to the database over HTTP-facing requests; the Python apps write straight
into Postgres as separate processes. The repo's remote is Gitea, not GitHub, so
any CI/CD deploy step runs on the self-hosted `act_runner` — GitHub-Actions-only
deploy integrations are not directly usable.

An initial investigation picked Microsoft Azure for compute (Static Web Apps
for the SPA, App Service for the API, Container Apps for batch jobs). However,
the Azure for Students subscription is governed by a "best available regions"
policy that blocks Azure Static Web Apps in every region offered by the SWA
creation wizard (`RequestDisallowedByAzure`). Microsoft does not grant
region-policy exceptions for student subscriptions, and App Service / Container
Apps are at risk of the same restriction. A subsequent look at Fly.io showed
that its free tier is not a reliable long-term home for an always-on Machine
that must stay warm for the full duration of the course. The team therefore
pivoted to Render for compute.

We need to pick where each of these components runs in production and how they
are wired together, so that a deploy stage can be added to CI and the platform
can actually be hosted.

## Decision

**Host the static frontend on Cloudflare Pages, the NestJS API and Python batch
jobs on Render, and the Postgres database on Supabase** (managed Postgres —
Supabase's auto REST/Auth/Storage APIs deliberately unused). Keeping
Supabase's HTTP API off means the NestJS API stays the only HTTP path to the
data, per the brief.

### Topology

```
                        Internet (HTTPS)
                             |
        +--------------------+--------------------+
        |                                         |
  +-----------+                          +-----------------+
  | Web SPA   |  Cloudflare Pages        | API             |  Render
  | (Vite ->  |  (global static CDN,     | (NestJS/Express |  (free
  |  dist/)   |   managed TLS,           |  +BetterAuth)   |   web service)
  +-----------+   custom domain)         +-----------------+
        |                                         |
        |  /api/*  (CORS w/ credentials,          |
        |   session cookies, SameSite=None+Secure)|
        +-----------------+---------------------+
                          |
                +---------+---------+
                |                   |
        +---------------+   +-----------------------------+
        | Supabase      |   | Batch jobs                  |
        | Postgres      |   | Render Cron / Background    |
        | (managed;     |   | Worker — ingestion,         |
        | REST APIs     |   | optimizer, predictor        |
        | unused;       |   | (write straight to Postgres)|
        | pooled+TLS)   |   +-----------------------------+
        +---------------+
```

### Component mapping

| Layer | Service | Why this service |
|---|---|---|
| Frontend SPA | Cloudflare Pages | `apps/web` builds to static `dist/`. Cloudflare Pages gives a global CDN, managed TLS, custom domain support, and a generous free tier. The repo is on Gitea, so deploy is a local build followed by Wrangler CLI upload or dashboard drag-and-drop — no Git-provider integration required. |
| NestJS API | Render Web Service (Node.js runtime, free plan) | Render's free plan spins the API down after 15 minutes of inactivity; the team has accepted the resulting ~30-second cold start. BetterAuth sessions are stored in Supabase, so they survive a cold start. Render's Blueprint ([`render.yaml`](../../render.yaml)) declares the service and build/start commands. Prisma migrations must be run manually (or from CI) because `preDeployCommand` is not available on Render's free tier. |
| Postgres | Supabase (managed Postgres) | Managed Postgres with a generous free tier and built-in connection pooling. Supabase's auto REST/Auth/Storage APIs are deliberately unused — the NestJS API stays the only HTTP path to the data, per the brief. Reached over TLS via the pooled connection string. |
| Python batch apps | Render Cron Job or Background Worker | `apps/ingestion`/`optimizer`/`predictor` are scripts that write straight to Postgres. They run on a schedule (Render Cron) or as an always-on/off Worker — no long-running web server needed, and they stay off the API's HTTP path as the brief requires. |
| Secrets | Render env vars + Cloudflare Pages env vars | `DATABASE_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `WEB_ORIGIN` are set in the Render Dashboard for the API and via the Cloudflare Pages dashboard for the build-time `VITE_API_BASE_URL`. They are never in the repo or the image. |
| Deploy source | Gitea repo mirrored to GitHub, or Render deploy hook | Render does not natively integrate with Gitea. The simplest path is a Gitea → GitHub mirror (Gitea can keep it in sync) so Render auto-deploys on push; alternatively, trigger deploys via Render's deploy hook from a Gitea Actions workflow. |

### Environment / networking that this implies

- `VITE_API_BASE_URL` (build-time, for `apps/web`) → the Render API URL
  (`https://<api-app>.onrender.com` or custom domain).
- `WEB_ORIGIN` (API CORS) → the Cloudflare Pages production URL
  (`https://<site>.pages.dev` or custom domain).
- `BETTER_AUTH_URL` → the Render API origin (same as `VITE_API_BASE_URL`
  without a path prefix).
- BetterAuth Google OAuth authorised redirect URI →
  `https://<api-domain>/auth/callback/google` (add alongside the existing
  `http://localhost:4000/auth/callback/google`).
- Session cookies → `Secure` + `SameSite=None` so they survive the
  cross-origin (web-domain ↔ api-domain) `credentials: true` flow.
- DB access → Supabase pooled connection string (PgBouncer, transaction mode)
  over TLS; the API and batch workers reach Supabase over the public internet
  (Supabase IP allow-list optional). No private network because the DB is a
  separate provider.
- Local dev is unchanged — Docker Compose Postgres on `55432`/`55433`, `npm
  run dev` for both apps. Production is a parallel set of managed services, not
  a replacement for the local setup.

## Alternatives considered

### Azure

Originally chosen for the SPA (Static Web Apps), API (App Service), batch jobs
(Container Apps), secrets (Key Vault), and images (Container Registry). The
Azure for Students subscription has a "best available regions" policy that
blocks Static Web Apps in every region offered by the SWA creation wizard
(`RequestDisallowedByAzure`). Microsoft does not grant region-policy
exceptions for student subscriptions, and App Service / Container Apps are at
risk of the same restriction. Azure was therefore abandoned for compute.

### Fly.io

Considered for the API and batch jobs because its Machines can be configured
to stay always-on. However, Fly.io's free tier is an allowance, not a
guaranteed permanent free always-on compute tier; for a project that must stay
online longer than the free allowance covers, it would incur billing. The team
preferred Render's free tier and has accepted the ~30-second cold start after
15 minutes of inactivity.

### Render free tier

Render's free Web Service tier spins down after 15 minutes of inactivity and
takes ~30 seconds to cold-start on the next request. The team has accepted
this cold-start latency to keep the API hosting free. The Starter plan
($7/month) would eliminate cold starts but was not chosen.

### Vercel

Considered first for the SPA because of its simple DX. Vercel's compute model
is serverless functions, which is a poor fit for the long-running NestJS API.
Vercel *could* host the static frontend, but Cloudflare Pages offers the same
benefits with a simpler Gitea-compatible deploy path, so Vercel was not chosen.

## Consequences

**Positive**

- The API is free to host on Render's free tier; the team has accepted the
  ~30-second cold start after 15 minutes of inactivity. BetterAuth sessions
  are stored in Supabase, so they survive a cold start.
- The API runs as the long-running process `main.ts` was written to be — no
  serverless rewrites.
- Postgres is managed and backed up on Supabase, with built-in connection
  pooling and a free tier.
- Frontend is served from Cloudflare's global edge network.
- Local development stays exactly as it is; production is a parallel managed
  set, not a replacement.
- The Azure region-policy problem is completely avoided.

**Negative**

- Cost: the API is on Render's free tier. Batch jobs may add cost if they run
  as Render Cron Jobs / Background Workers. The frontend (Cloudflare Pages)
  and database (Supabase free tier) remain free.
- Multi-provider stack (Cloudflare + Render + Supabase) means three dashboards
  and three secret stores instead of one.
- No Git-provider auto-deploy because the repo is on Gitea — deploys need a
  Gitea → GitHub mirror or a Gitea Actions workflow that calls Render's deploy
  hook.
- Cross-origin cookies need `SameSite=None; Secure`, which must be set
  correctly or sign-in silently breaks in production.

**Neutral / follow-ups (out of scope for this ADR)**

- A deploy stage in `.gitea/workflows/ci.yml` (build web → upload to
  Cloudflare Pages; trigger Render deploy for the API; deploy batch jobs) —
  separate work once this ADR is accepted.
- `render.yaml` entries for the Python batch Cron Jobs / Background Workers.
- Production env/secrets mapping (`DATABASE_URL`, `WEB_ORIGIN`,
  `GOOGLE_CLIENT_*`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PORT`,
  `VITE_API_BASE_URL`).
- Prisma migrations: on the free tier Render does not run `preDeployCommand`,
  so `npx prisma migrate deploy` must be run manually or from a Gitea Actions
  workflow before the API deploy.
- Updating [`PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) "Known gaps" and
  [`README.md`](../../README.md) to mark hosting as decided once accepted.

## Open questions for the team

1. Render region: default is Oregon; does latency to South Africa warrant
   mirroring the Gitea repo to a GitHub org closer to the team, or choosing a
   Render region nearer to Europe?
2. Batch scheduling: one Render Background Worker that runs the three Python
   scripts on a cron schedule, or three separate Render Cron Jobs?
3. Domains: custom domains for both apps, or `*.onrender.com` +
   `*.pages.dev` for the demo?
4. Supabase free tier caps the DB at ~500 MB and pauses after inactivity —
   enough for the demo/mock data, but does real full-league ingestion need a
   paid Supabase plan?

## References

- [`apps/api/src/main.ts`](../../apps/api/src/main.ts) — the Express/BetterAuth
  bootstrap that drives the long-running-server requirement.
- [`render.yaml`](../../render.yaml) — the Render Blueprint for the API.
- [`docker-compose.yml`](../../docker-compose.yml) — local Postgres setup this
  parallels.
- [`docs/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) — tech stack and the
  "Production deployment — not done" known gap.
- [`docs/GIT_METHODOLOGY.md`](../GIT_METHODOLOGY.md) — review gate this ADR's
  *Proposed* status respects.
