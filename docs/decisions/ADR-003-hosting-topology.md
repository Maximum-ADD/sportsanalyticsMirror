# ADR-003: Hosting topology

- **Status:** Proposed — awaiting team review before acceptance. Do not
  implement until the team has signed off (see
  [`GIT_METHODOLOGY.md`](../GIT_METHODOLOGY.md), "Requirements for merging").
- **Date:** 2026-08-19
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

**Host the whole stack on Microsoft Azure**, split across three Azure services
that map one-to-one onto the three runtime shapes the platform already has.

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
        | PostgreSQL    |   | Batch jobs                  |
        | Flexible      |   | Azure Container Apps         |
        | Server        |   | (scheduled) — ingestion,    |
        | (managed,     |   | optimizer, predictor        |
        |  PITR, VNet   |   | (write straight to Postgres)|
        |  integration) |   +-----------------------------+
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
| Postgres | Azure Database for PostgreSQL — Flexible Server | Managed Postgres 16 with automated backups, point-in-time restore, and VNet/private-endpoint integration so the DB is reachable only from the App Service and Container Apps, not the public internet. |
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
- DB access → private endpoint/VNet; the App Service and Container Apps sit in
  the same region and reach Postgres privately, the public internet does not.
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

Rejected. Managed Flexible Server gives backups, PITR, and patching for a
student project where nobody is on call. The DB is the one piece where
"managed" is worth the (small) cost.

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
- Postgres is managed and backed up; the DB is off the public internet.
- One provider, one identity, one networking boundary (VNet + Key Vault + ACR).
- Local development stays exactly as it is; production is a parallel managed
  set, not a replacement.

**Negative**

- Cost: Azure's free tiers are thinner than Vercel's hobby tier (App Service F1
  is limited, Flexible Server free is 3 months). Mitigated by Azure for
  Students credits; flagged as the main cost risk.
- More moving parts to configure than "deploy to Vercel" — VNet, private
  endpoint, Key Vault references, ACR, a Gitea Actions deploy step (the GitHub-
  Actions-only SWA deploy action can't be used as-is against the Gitea remote).
- Cross-origin cookies need `SameSite=None; Secure`, which must be set correctly
  or sign-in silently breaks in production.

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

## References

- [`apps/api/src/main.ts`](../../apps/api/src/main.ts) — the Express/BetterAuth
  bootstrap that drives the long-running-server requirement.
- [`docker-compose.yml`](../../docker-compose.yml) — local Postgres setup this
  parallels.
- [`docs/PROJECT_OVERVIEW.md`](../PROJECT_OVERVIEW.md) — tech stack and the
  "Production deployment — not done" known gap.
- [`docs/GIT_METHODOLOGY.md`](../GIT_METHODOLOGY.md) — review gate this ADR's
  *Proposed* status respects.
