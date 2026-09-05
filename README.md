# NBA Analytics Platform

COMS3011A Project 3 (Sport Analytics Tool), built for the NBA.

An event-derived stats platform: every published statistic (points per game,
shooting splits, etc.) is computed from per-game boxscore rows rather than
typed in directly, satisfying the brief's core requirement that statistics
trace back to underlying event records.

## Documentation

Full docs (architecture, ADRs, methodology, sprint log, tech stack, security,
etc.) live on the
[documentation site](https://sports-analytics-innovation-platform.github.io/Innovation-Documentation-Website/),
not in this repo.

## Structure

Non-monolithic front-end/back-end, per the brief's key requirements:

```
apps/
  api/         NestJS + TypeScript + Prisma + Postgres — REST API
  web/         React + Vite + TypeScript + Tailwind — frontend SPA
  ingestion/   Python — pulls real NBA data (nba_api) into Postgres
  predictor/   Python — Elo win probability + Four Factors margin predictions
  optimizer/   Python — MILP lineup optimizer (PuLP + CBC)
```

`apps/web` and the Python services only ever communicate with `apps/api` over
HTTP or by writing straight into the shared Postgres database — `apps/web` is
a plain Vite SPA (not Next.js/SvelteKit), so there is no framework-level
coupling between front and back end.

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
   Without them the API still runs and public player/team pages work, but
   protected games, predictions, and optimizer features cannot be used. A
   startup warning is logged when the Google credentials are absent.

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
- **Ingestion**: `prisma/seed.ts` still seeds a handful of mock players/games
  for local dev, but `apps/ingestion` now pulls real NBA data (all 30
  current teams, their rosters, and each team's ~15 most recent games with
  real boxscores) from `nba_api` into the same Postgres database — a
  separate Python process, with the NestJS API remaining the only thing
  that talks to the database over HTTP-facing requests.
- **Frontend**: dark-themed dashboard shell — sidebar nav, players list,
  and a player profile page (stat tiles, a traits radar chart, a points
  trend line chart) built with Recharts + Tailwind.

## What's not done yet (follow-up tasks for the team)

- Second external API integration (brief requirement — e.g. an
  injury/news feed).
- `axe-core` automated accessibility checks — not wired in anywhere yet,
  despite being listed as done in an earlier draft of this file. Some
  responsive breakpoints and keyboard/focus handling exist (`Navbar.tsx`,
  `App.tsx`, `RecentResultWidget.tsx`) but haven't had a real audit pass.
- Coverage thresholds are not enforced yet. CI reports the current API and
  Web coverage without failing builds for a minimum percentage.

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
not GitHub Actions or GitLab CI. On every push and PR it lints and typechecks
both apps, runs both test suites with coverage, and tests the API against a
disposable PostgreSQL service. It then uses `scripts/build-coverage-report.mjs`
to merge the API and Web results into a downloadable `coverage-report`
artifact. After downloading and extracting the artifact, open `index.html`
to view the combined dashboard and links to each app's detailed HTML report.

The same dashboard can be built locally after both coverage suites have run:

```bash
npm run coverage:report
```

## AI usage

See the [AI Usage Ledger](https://sports-analytics-innovation-platform.github.io/Innovation-Documentation-Website/ai-usage/)
on the documentation site for the attribution log, per the brief's AI
attribution requirement.
