# ADR-003: Hosting topology

- **Status:** Proposed — awaiting team review before acceptance. Do not
  implement until the team has signed off (see
  [`GIT_METHODOLOGY.md`](../GIT_METHODOLOGY.md), "Requirements for merging").
- **Date:** 2026-08-19
- **Updated:** 2026-08-19 — database moved from Azure PostgreSQL Flexible
  Server to Supabase (managed Postgres; Supabase's HTTP/Auth/Storage APIs
  deliberately unused, so the NestJS API stays the only HTTP path to the DB).
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
deploy integrations (e.g. Azure Static Web Apps' built-in GitHub Action) are not
directly usable.

We need to pick where each of these components runs in production and how they
are wired together, so that a deploy stage can be added to CI and the platform
can actually be hosted.

## Decision

**Host the stack on Microsoft Azure, with the database on Supabase**
(managed Postgres — Supabase's auto REST/Auth/Storage APIs deliberately
unused), split across services that map one-to-one onto the three runtime
shapes the platform already has. Keeping Supabase's HTTP API off means the
NestJS API stays the only HTTP path to the data, per the brief.

### Topology

```
                        Internet (HTTPS)
                             |
        +--------------------+--------------------+
        |                                         |
  +-----------+                          +-----------------+
  | Web SPA   |  Azure Static Web Apps   | API             |  Azure App Service
  | (Vite ->  |  (Linux, CDN, managed    | (NestJS/Express|  (Linux, Node 20,
  |  dist/)   |   TLS, custom domain)    |  +BetterAuth)   |   custom domain)
  +-----------+                          +-----------------+
        |                                         |
        |  /api/*  (CORS w/ credentials,          |
        |   session cookies, SameSite=None+Secure)|
        +-----------------+---------------------+
                          |
                +---------+---------+
                |                   |
        +---------------+   +-----------------------------+
        | Supabase      |   | Batch jobs                  |
        | Postgres      |   | Azure Container Apps         |
        | (managed;     |   | (scheduled) — ingestion,    |
        | REST APIs     |   | optimizer, predictor        |
        | unused;       |   | (write straight to Postgres)|
        | pooled+TLS)   |   +-----------------------------+
        +---------------+              |
                |                      |
                +----------+-----------+
                           |
                 +-------------------+
                 | Azure Key Vault   |
                 | (secrets referenced|
                 |  by App Service    |
                 |  + Container Apps)|
                 +-------------------+
```

### Component mapping

| Layer | Service | Why this service |
|---|---|---|
| Frontend SPA | Azure Static Web Apps | `apps/web` builds to static `dist/`. SWA gives CDN, managed TLS, custom domain, and a free tier. The Python batch apps can optionally piggy-back on SWA's managed functions, but the SPA itself is just static files. |
| NestJS API | Azure App Service (Linux, Node 20 runtime, or container) | App Service runs a **persistent Node process** — exactly what the `main.ts` bootstrap expects. No cold-start re-init of Express/BetterAuth/Prisma, no per-request execution timeout, and the BetterAuth Express mounting works unmodified. |
| Postgres | Supabase (managed Postgres) | Managed Postgres with a generous free tier and built-in connection pooling. Supabase's auto REST/Auth/Storage APIs are deliberately unused — the NestJS API stays the only HTTP path to the data, per the brief. Reached over TLS via the pooled connection string. |
| Python batch apps | Azure Container Apps (scheduled) | `apps/ingestion`/`optimizer`/`predictor` are scripts that write straight to Postgres. Container Apps runs them on a schedule (cron) or on-demand as separate containers — no long-running web server needed, and they stay off the API's HTTP path as the brief requires. |
| Secrets | Azure Key Vault + App Service app settings | `DATABASE_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `WEB_ORIGIN` are stored as Key Vault secrets referenced by App Service and Container Apps app settings — never in the repo or the image. |
| Container images | Azure Container Registry (ACR) | If the API and Python apps are containerised, images push to ACR and deploy to App Service / Container Apps from there. Gitea Actions builds and pushes; deploy uses the Azure CLI from the self-hosted runner. |

### Environment / networking that this implies

- `WEB_ORIGIN` (API CORS) → the Static Web Apps production URL.
- BetterAuth Google OAuth authorised redirect URI →
  `https://<api-domain>/auth/callback/google` (add alongside the existing
  `http://localhost:4000/auth/callback/google`).
- Session cookies → `Secure` + `SameSite=None` so they survive the
  cross-origin (web-domain ↔ api-domain) `credentials: true` flow.
- DB access → Supabase pooled connection string (PgBouncer, transaction mode)
  over TLS; the API and Container Apps reach Supabase over the public internet
  (Supabase IP allow-list optional). No private endpoint/VNet to Azure because
  the DB is a separate provider — see Consequences.
- Local dev is unchanged — Docker Compose Postgres on `55432`/`55433`, `npm
  run dev` for both apps. Production is a parallel set of managed services, not
  a replacement for the local setup.

## Alternatives considered

### Vercel

Considered first because of its simple DX and generous free tier. **Rejected
for the API.** Vercel's compute model is serverless functions: each invocation
re-runs the Express/BetterAuth/Prisma bootstrap, cold starts add latency to
auth, and the per-function execution-time limits (and the assumption that each
function is a small stateless handler) fight the `main.ts` pattern of one
process owning `/auth/*` ahead of Nest's router with session cookies.
Vercel also no longer hosts Postgres natively (Vercel Postgres was superseded
by Neon), so the database would have to live elsewhere regardless.

Vercel *could* host the static frontend fine, but splitting the SPA onto Vercel
and everything else onto Azure gives two vendors for no real gain and adds a
cross-vendor CORS/cookie surface. Keeping the SPA on Azure Static Web Apps keeps
the stack on one provider.

### Azure Container Apps for the API (instead of App Service)

Viable — Container Apps can run a long-running container. It is a better fit
for the batch jobs than for the API, because App Service gives simpler
first-class Node support, easy custom-domain/TLS wiring, and VNet integration
without having to manage a container orchestrator. Container Apps is kept for
the scheduled Python jobs.

### Self-hosted Postgres on a VM

Rejected. Managed Postgres gives backups, PITR, and patching for a student
project where nobody is on call. The DB is the one piece where "managed" is
worth the (small) cost.

### Azure Database for PostgreSQL — Flexible Server (for the DB)

Was the original choice in this ADR. Superseded by Supabase for the database:
Supabase's managed Postgres free tier and built-in pooling are simpler to
stand up for a student project than provisioning a Flexible Server + VNet +
private endpoint, and the brief's "API is the only HTTP path to the DB" rule
is preserved by simply not turning on Supabase's REST API. Tradeoff: the DB is
now a separate provider from the rest of the stack (reached over TLS on the
public internet rather than a private VNet), so the "one provider" benefit
in Consequences no longer applies to the database.

### Render / Railway / Fly.io

Considered as PaaS middle ground. They would host the API and DB fine, but the
team already has Azure for Students credits available, and consolidating on
Azure gives one identity/billing/networking surface (VNet, Key Vault, ACR) that
the multi-provider options don't. Not chosen, but a reasonable fallback if
Azure credits run out before the course ends.

## Consequences

**Positive**

- The API runs as the long-running process `main.ts` was written to be — no
  serverless rewrites, no cold-start auth latency.
- Postgres is managed and backed up on Supabase, with built-in connection
  pooling and a free tier.
- One provider (Azure) for compute + secrets + images; the database is the one
  cross-provider piece (Supabase), accepted for its free tier and pooling.
- Local development stays exactly as it is; production is a parallel managed
  set, not a replacement.

**Negative**

- Cost: Azure for Students credits cover App Service / SWA / Container Apps;
  the DB is on Supabase's free tier (~500 MB, pauses after inactivity) — fine
  for mock/small data, likely needs a paid plan for full league data. The old
  project still hosted on the Azure account may be consuming credits — check
  the balance and which subscription it's on.
- More moving parts to configure than "deploy to Vercel" — Key Vault
  references, ACR, a cross-provider DB connection (Supabase over TLS), and a
  Gitea Actions deploy step (the GitHub-Actions-only SWA deploy action can't
  be used as-is against the Gitea remote). No VNet/private endpoint for the DB
  anymore (Supabase is the one piece off the Azure VNet).
- Cross-origin cookies need `SameSite=None; Secure`, which must be set
  correctly or sign-in silently breaks in production.

**Neutral / follow-ups (out of scope for this ADR)**

- A deploy stage in `.gitea/workflows/ci.yml` (build → push image to ACR →
  deploy to App Service / SWA) — separate work once this ADR is accepted.
- A `Dockerfile` for `apps/api` (and the Python apps) if we go the container
  route rather than App Service code deploy.
- Production `.env`/app-settings mapping (`DATABASE_URL`, `WEB_ORIGIN`,
  `GOOGLE_CLIENT_*`, `BETTER_AUTH_SECRET`, `PORT`).
- Updating [`PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) "Known gaps" and
  [`README.md`](../../README.md) to mark hosting as decided once accepted.

## Open questions for the team

1. Do we have / want to use Azure for Students credits, or is the team
   budget-constrained enough to reconsider a cheaper PaaS?
2. API as App Service *code* deploy vs. *container* deploy — pick one so the
   Dockerfile/deploy step can be written.
3. Domain: a custom domain for both apps, or `*.azurewebsites.net` /
   `*.staticweb.dev` for now?
4. Supabase free tier caps the DB at ~500 MB and pauses after inactivity —
   enough for the demo/mock data, but does real full-league ingestion need a
   paid Supabase plan (or a move back to Azure Flexible Server)?

## References

- [`apps/api/src/main.ts`](../../apps/api/src/main.ts) — the Express/BetterAuth
  bootstrap that drives the long-running-server requirement.
- [`docker-compose.yml`](../../docker-compose.yml) — local Postgres setup this
  parallels.
- [`docs/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) — tech stack and the
  "Production deployment — not done" known gap.
- [`docs/GIT_METHODOLOGY.md`](../GIT_METHODOLOGY.md) — review gate this ADR's
  *Proposed* status respects.
