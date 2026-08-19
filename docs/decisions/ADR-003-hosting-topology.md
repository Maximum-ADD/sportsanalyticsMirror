# ADR-003: Hosting topology

- **Status:** Proposed — awaiting team review before acceptance. Do not
  implement until the team has signed off (see
  [`GIT_METHODOLOGY.md`](../GIT_METHODOLOGY.md), "Requirements for merging").
- **Date:** 2026-08-19
- **Updated:** 2026-08-19 — database moved from Azure PostgreSQL Flexible
  Server to Supabase; frontend and compute moved from Azure to Cloudflare Pages
  (SPA) and Fly.io (API + batch jobs) after Azure for Students' region policy
  blocked Static Web Apps in every available region.
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
creation wizard, making Azure an unreliable path for the frontend and putting
App Service/Container Apps at risk of the same policy. The team therefore
pivoted to providers that are not constrained by that policy.

We need to pick where each of these components runs in production and how they
are wired together, so that a deploy stage can be added to CI and the platform
can actually be hosted.

## Decision

**Host the static frontend on Cloudflare Pages, the NestJS API and Python batch
jobs on Fly.io Machines, and the Postgres database on Supabase** (managed
Postgres — Supabase's auto REST/Auth/Storage APIs deliberately unused). Keeping
Supabase's HTTP API off means the NestJS API stays the only HTTP path to the
data, per the brief.

### Topology

```
                        Internet (HTTPS)
                             |
        +--------------------+--------------------+
        |                                         |
  +-----------+                          +-----------------+
  | Web SPA   |  Cloudflare Pages        | API             |  Fly.io
  | (Vite ->  |  (global static CDN,     | (NestJS/Express |  (always-on
  |  dist/)   |   managed TLS,           |  +BetterAuth)   |   Machine)
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
        | Postgres      |   | Fly.io Machines             |
        | (managed;     |   | (scheduled) — ingestion,    |
        | REST APIs     |   | optimizer, predictor        |
        | unused;       |   | (write straight to Postgres)|
        | pooled+TLS)   |   +-----------------------------+
        +---------------+
```

### Component mapping

| Layer | Service | Why this service |
|---|---|---|
| Frontend SPA | Cloudflare Pages | `apps/web` builds to static `dist/`. Cloudflare Pages gives a global CDN, managed TLS, custom domain support, and a generous free tier. The repo is on Gitea, so deploy is a local build followed by Wrangler CLI upload or dashboard drag-and-drop — no Git-provider integration required. |
| NestJS API | Fly.io Machine (Docker container) | Fly.io Machines run the API as a long-running container with `min_machines_running = 1` and `auto_stop_machines = off`, so there is no cold start and the Express/BetterAuth bootstrap stays warm. The API ships in a Dockerfile at [`apps/api/Dockerfile`](../../apps/api/Dockerfile); Fly.io's remote builder produces the image. |
| Postgres | Supabase (managed Postgres) | Managed Postgres with a generous free tier and built-in connection pooling. Supabase's auto REST/Auth/Storage APIs are deliberately unused — the NestJS API stays the only HTTP path to the data, per the brief. Reached over TLS via the pooled connection string. |
| Python batch apps | Fly.io Machines (scheduled) | `apps/ingestion`/`optimizer`/`predictor` are scripts that write straight to Postgres. They run as Fly.io Machines on a schedule (e.g., `fly machines run` triggered by a scheduler Machine or external cron) — no long-running web server needed, and they stay off the API's HTTP path as the brief requires. |
| Secrets | Fly.io secrets + Cloudflare Pages env vars | `DATABASE_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `WEB_ORIGIN` are set via `fly secrets set` for the API and via Cloudflare Pages dashboard/environment variables for the build-time `VITE_API_BASE_URL`. They are never in the repo or the image. |
| Container images | Built by Fly.io remote builder | `fly deploy` builds [`apps/api/Dockerfile`](../../apps/api/Dockerfile) using Fly.io's remote builder. No separate registry is required. |

### Environment / networking that this implies

- `VITE_API_BASE_URL` (build-time, for `apps/web`) → the Fly.io API URL
  (`https://<api-app>.fly.dev` or custom domain).
- `WEB_ORIGIN` (API CORS) → the Cloudflare Pages production URL
  (`https://<site>.pages.dev` or custom domain).
- `BETTER_AUTH_URL` → the Fly.io API origin (same as `VITE_API_BASE_URL` without
  a path prefix).
- BetterAuth Google OAuth authorised redirect URI →
  `https://<api-domain>/auth/callback/google` (add alongside the existing
  `http://localhost:4000/auth/callback/google`).
- Session cookies → `Secure` + `SameSite=None` so they survive the
  cross-origin (web-domain ↔ api-domain) `credentials: true` flow.
- DB access → Supabase pooled connection string (PgBouncer, transaction mode)
  over TLS; the API and batch Machines reach Supabase over the public internet
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

### Render

Considered for the API and batch jobs. Render's free Web Service tier spins
down after 15 minutes of inactivity, causing ~30-second cold starts that are
bad for BetterAuth session UX. The $7/month Starter plan fixes this, but Fly.io
offers an always-on Machine on its free tier, so Fly.io was chosen for cost
efficiency. Render Static Sites were also considered for the frontend, but
Cloudflare Pages is simpler to deploy from a Gitea repo (direct upload) and has
a larger global CDN.

### Railway

Considered as a PaaS alternative. Railway's free tier is usage-based ($5/month
credit) and could be exceeded by a long-running API plus scheduled batch jobs.
Not chosen because Fly.io's free-tier limits are clearer for this workload.

### Vercel

Considered first for the SPA because of its simple DX. Vercel's compute model
is serverless functions, which is a poor fit for the long-running NestJS API.
Vercel *could* host the static frontend, but Cloudflare Pages offers the same
benefits with a simpler Gitea-compatible deploy path, so Vercel was not chosen.

## Consequences

**Positive**

- No cold starts: the API stays warm on a Fly.io Machine with
  `min_machines_running = 1` and `auto_stop_machines = off`.
- The API runs as the long-running process `main.ts` was written to be — no
  serverless rewrites.
- Postgres is managed and backed up on Supabase, with built-in connection
  pooling and a free tier.
- Frontend is served from Cloudflare's global edge network.
- Local development stays exactly as it is; production is a parallel managed
  set, not a replacement.
- The Azure region-policy problem is completely avoided.

**Negative**

- Multi-provider stack (Cloudflare + Fly.io + Supabase) means three dashboards
  and three secret stores instead of one.
- Fly.io free tier limits: 3 shared-cpu-1x Machines, 3GB persistent volumes.
  The API uses one Machine; the three batch scripts plus any scheduler must
  fit in the remaining free quota or the project moves to a paid plan.
- More Docker/DevOps surface than a pure PaaS deploy — the API needs a
  Dockerfile and `fly.toml`.
- Cross-origin cookies need `SameSite=None; Secure`, which must be set
  correctly or sign-in silently breaks in production.
- No Git-provider auto-deploy because the repo is on Gitea — deploys start
  from a local build or a Gitea Actions workflow that calls the Fly.io/Cloudflare
  CLIs.

**Neutral / follow-ups (out of scope for this ADR)**

- A deploy stage in `.gitea/workflows/ci.yml` (build web → upload to
  Cloudflare Pages; build API image → `fly deploy`; build batch images → `fly
  machines run`) — separate work once this ADR is accepted.
- `Dockerfile`s for `apps/ingestion`, `apps/optimizer`, and `apps/predictor`
  plus a scheduling strategy (cron Machine vs. one scheduler Machine).
- Production env/secrets mapping (`DATABASE_URL`, `WEB_ORIGIN`,
  `GOOGLE_CLIENT_*`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PORT`,
  `VITE_API_BASE_URL`).
- Updating [`PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) "Known gaps" and
  [`README.md`](../../README.md) to mark hosting as decided once accepted.

## Open questions for the team

1. Fly.io region: `jnb` (Johannesburg) is preferred for latency, but is it
   available on the free tier? Fallback to `lhr` or `ams`.
2. Batch scheduling: one small "scheduler" Fly Machine that runs the three
   Python scripts on a cron schedule, or three separate Machines triggered by
   an external cron?
3. Domains: custom domains for both apps, or `*.fly.dev` + `*.pages.dev` for
   the demo?
4. Supabase free tier caps the DB at ~500 MB and pauses after inactivity —
   enough for the demo/mock data, but does real full-league ingestion need a
   paid Supabase plan?

## References

- [`apps/api/src/main.ts`](../../apps/api/src/main.ts) — the Express/BetterAuth
  bootstrap that drives the long-running-server requirement.
- [`apps/api/Dockerfile`](../../apps/api/Dockerfile) and
  [`apps/api/fly.toml`](../../apps/api/fly.toml) — the Fly.io deployment
  artefacts for the API.
- [`docker-compose.yml`](../../docker-compose.yml) — local Postgres setup this
  parallels.
- [`docs/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) — tech stack and the
  "Production deployment — not done" known gap.
- [`docs/GIT_METHODOLOGY.md`](../GIT_METHODOLOGY.md) — review gate this ADR's
  *Proposed* status respects.
