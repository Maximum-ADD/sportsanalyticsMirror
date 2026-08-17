# NBA Analytics Platform

COMS3011A Project 3 (Sport Analytics Tool), built for the NBA.

An event-derived stats platform: every published statistic (points per game,
shooting splits, etc.) is computed from per-game boxscore rows rather than
typed in directly, satisfying the brief's core requirement that statistics
trace back to underlying event records.

## Structure

Non-monolithic front-end/back-end, per the brief's key requirements:

```
apps/
  api/    NestJS + TypeScript + Prisma + Postgres — REST API
  web/    React + Vite + TypeScript + Tailwind — frontend SPA
docs/     Documentation site (to be set up with Docusaurus/MkDocs)
```

The two apps only ever communicate over HTTP. `apps/web` is a plain Vite SPA
(not Next.js/SvelteKit), so there is no framework-level coupling between
front and back end.

## Prerequisites

- Node.js 20+
- Docker (for local Postgres)

## Getting started

1. **Start Postgres:**

   ```bash
   docker compose up -d postgres
   ```

   This runs Postgres on `localhost:55432` (not 5432, to avoid clashing with
   any Postgres already installed on your machine — see `docker-compose.yml`).

2. **Set up the API:**

   ```bash
   cd apps/api
   cp .env.example .env
   npm install
   npm run prisma:migrate   # creates tables
   npm run prisma:seed      # loads mock NBA players/teams/games/stats
   npm run dev              # starts on http://localhost:4000
   ```

   Sign-in uses Google OAuth via BetterAuth, which needs a client set up at
   the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (authorized redirect URI: `http://localhost:4000/auth/callback/google`) —
   put its ID/secret in `.env` as `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
   Without them the API still runs (everything except signing in works, and
   `/v1/*` currently doesn't require a session anyway), it just logs a
   startup warning.

3. **Set up the frontend** (in a separate terminal):

   ```bash
   cd apps/web
   npm install
   npm run dev               # starts on http://localhost:5173
   ```

   The Vite dev server proxies `/api/*` to `http://localhost:4000`, so the
   frontend never needs to know the API's real port.

4. Open http://localhost:5173 and browse to **Players** to see seeded mock
   NBA data (LeBron James, Stephen Curry, Jayson Tatum, Giannis
   Antetokounmpo) with derived season averages.

## Current state of this scaffold

This is a base scaffold, not the finished product. What's wired up:

- **Auth**: Google OAuth via [BetterAuth](https://better-auth.com), mounted
  at `/auth/*` directly on the Express instance (ahead of Nest's own
  routing — see `apps/api/src/main.ts`) so it owns session cookies and the
  OAuth redirect flow. A Nest `SessionAuthGuard` looks up the current
  BetterAuth session on protected routes; RBAC roles (`PUBLIC`, `USER`,
  `ANALYST`, `ADMIN`) live on the `User` model as a custom BetterAuth field
  (not settable via sign-up/OAuth profile) and are enforced by a Nest
  `RolesGuard`, not the database. No route currently requires a role above
  the default `USER`.
- **API**: versioned under `/v1/`, with pagination, a consistent JSON error
  envelope (`{ error: { code, message } }`) via a global Nest exception
  filter, and routes for players, teams, and derived per-player season
  stats.
- **Data**: Prisma schema models teams, players, games, raw `GameEvent`
  rows, and per-game `PlayerGameStat` boxscores. Season averages
  (`apps/api/src/services/statsService.ts`) are computed from those boxscore
  rows at request time — nothing is stored as a pre-computed total.
- **Mock data only.** `prisma/seed.ts` generates a handful of players and
  five games' worth of made-up boxscores so the UI has something to render.
  **Real NBA data ingestion via `nba_api` (Python) is not yet built** — see
  the NBA pitch doc for the intended approach (a separate Python ingestion
  script writing into this same Postgres database, keeping the NestJS API as
  the only thing that talks to the database over HTTP-facing requests).
- **Frontend**: dark-themed dashboard shell — sidebar nav, players list,
  and a player profile page (stat tiles, a traits radar chart, a points
  trend line chart) built with Recharts + Tailwind.

## What's not done yet (follow-up tasks for the team)

- Frontend: wire up the Google sign-in button/flow against BetterAuth (the
  backend is ready — see Auth above — but no UI calls it yet); adopt
  TanStack Query for data fetching and shadcn/ui for components (currently
  plain `fetch` + hand-rolled UI).
- Real `nba_api` ingestion pipeline (Python) writing into Postgres.
- Second external API integration (brief requirement — e.g. an
  injury/news feed).
- Documentation site (Docusaurus/MkDocs on GitHub Pages).
- CI/CD: tests + coverage run on every push (see Testing below); linting,
  typechecking, and a deploy stage are still not wired into CI.
- Responsiveness/accessibility pass (axe-core, keyboard nav).
- Production deployment.

## Testing

Both apps use Vitest. The backend's tests run against a real (disposable)
Postgres database rather than a mocked Prisma client, so they exercise
actual queries.

```bash
# one-off: start the disposable test database
npm run db:up:test

# backend — unit tests (pagination, derived-stats math, guards, exception
# filter) plus supertest e2e tests against a real Postgres instance
cd apps/api
cp .env.test.example .env.test   # only needed once
npm test              # or: npm run test:cov for coverage

# frontend — component/page tests with React Testing Library
cd apps/web
npm test               # or: npm run test:cov for coverage
```

CI is **Gitea Actions** (`.gitea/workflows/ci.yml` on `main`, run via a
self-hosted `act_runner`), matching this repo's `sdp.ms.wits.ac.za` remote —
not GitHub Actions or GitLab CI. It currently runs lint/typecheck/test for
both apps on every push and PR; it does not yet run against a real Postgres
instance or merge coverage into a dashboard the way the steps above do
locally. `scripts/build-coverage-report.mjs` (merges both apps' coverage
into one HTML dashboard) is still available as a manual command —
`npm run coverage:report` from the repo root — but isn't wired into CI yet.

## AI usage

See `docs/ai-usage.md` for the attribution ledger. This scaffold (backend,
schema, seed data, frontend, and this README) was generated with
Claude Code [Claude Sonnet 5], per the brief's AI attribution requirement.
Log any further AI-assisted changes there as you make them.
