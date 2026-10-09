# NBA Analytics Platform

COMS3011A Project 3 (Sport Analytics Tool), built for the NBA.

An event-derived stats platform: every published statistic (points per game,
shooting splits, etc.) is computed from per-game boxscore rows, which are
themselves aggregated from real per-play `GameEvent` records
(`apps/ingestion/derive_player_game_stats.py`) rather than typed in
directly — satisfying the brief's core requirement that statistics trace
back to underlying event records.

## Live

- Web app: <https://sportsanalytics.pages.dev/>
- API reference (Swagger UI): <https://sportsanalytics-api.onrender.com/api/docs>.
  The public read endpoints need an `X-API-Key` header (create one on your
  profile page) or a signed-in session; "Authorize" in Swagger UI takes the key.
- Documentation site: <https://sports-analytics-innovation-platform.github.io/Innovation-Documentation-Website/>

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
  valuation/   Python — trains the Become Pro draft-slot model on NBA rookie seasons
  similarity/  Python — player archetypes (clustering) and similar players
```

`apps/web` and the Python services only ever communicate with `apps/api` over
HTTP or by writing straight into the shared Postgres database — `apps/web` is
a plain Vite SPA (not Next.js/SvelteKit), so there is no framework-level
coupling between front and back end.

## Prerequisites

- Node.js 24 (the version CI runs)
- Docker (for local Postgres)
- Python 3.12, only to work on one of the Python services

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

   The seed ends by printing a `SITE_PROXY_API_KEY=...` line. Keep it for
   step 3: the API's public read endpoints need an API key or a session, and
   the web app's dev proxy sends this key for signed-out visitors.

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
   cp .env.example .env      # then paste the SITE_PROXY_API_KEY line from the seed
   npm install
   npm run dev               # starts on http://localhost:5173
   ```

   The Vite dev server proxies `/api/*` to `http://localhost:4000`, so the
   frontend never needs to know the API's real port.

4. Open http://localhost:5173 and browse to **Players** to see seeded mock
   NBA data (LeBron James, Stephen Curry, Jayson Tatum, Giannis
   Antetokounmpo) with derived season averages.

## What's built

The brief's three tiers are tracked requirement by requirement on the docs
site's [Feature Tiers](https://sports-analytics-innovation-platform.github.io/Innovation-Documentation-Website/design/feature-tiers/)
page. In short:

- **Statistics derived from events.** Real NBA play-by-play is stored as
  ordered `GameEvent` rows, each tagged with the `IngestionBatch` that wrote
  it. Per-game box scores are summed from those events
  (`apps/ingestion/derive_player_game_stats.py`), and season, career and
  league figures are derived from the box scores at request time. Correcting
  an event (`/v1/admin/games/:gameId/events/:sequence/correct`) re-derives
  only the affected players' lines, records the change in `EventCorrection`
  and marks the season's dataset releases stale.
- **Submission pipeline.** Each game's ingestion run is a batch, validated
  against the event schema (`apps/ingestion/event_validation.py`) with every
  rejection counted by reason. Re-runs upsert instead of double counting, a
  failed batch resumes from its checkpoint, and a game stays hidden from
  every public read until its batches pass admin review.
- **API.** Hand-written NestJS under `/v1/`: fixtures, play-by-play events
  and derived stats, with filtering, pagination, `asOf` figures, CSV export,
  aggregates, versioned dataset releases (field schema and SHA-256 checksum),
  `Accept-Version` negotiation and `Deprecation`/`Sunset` headers. Consumers
  use API keys with per-minute rate limits and daily quotas.
- **Custom statistics.** Analysts define a statistic as a formula over the
  event-derived per-game averages. Formulas are parsed without `eval`, and
  every version is kept, so a figure computed under an earlier version can
  be reproduced with `?version=`.
- **Beyond the brief.** Elo and Four Factors game predictions beside
  bookmakers' odds (The Odds API), a MILP fantasy lineup optimizer, Beat the
  Model, Become Pro, player archetypes, a live-games tab and injury reports
  with expected return dates on team and player pages.
- **Auth.** Google sign-in through BetterAuth, with account deletion and
  `USER`, `ANALYST` and `ADMIN` roles enforced by `RolesGuard`. Password
  reset doesn't apply to Google-only accounts; the lecturer confirmed it
  isn't needed (see ADR-002 on the docs site).

## Known gaps

- Data arrives only through the automated `nba_api` ingestion pipeline,
  which acts as the platform's one approved submitter. There is no upload
  endpoint for a human submitter, so there are no competing submissions to
  reconcile.
- Large consumer requests run to completion rather than being handed off as
  jobs; only admin ingestion pulls are queued.
- Anomaly flags catch impossible box-score lines, not outliers against a
  player's history.
- Injury reports come from ESPN's public but undocumented site API, read live
  and cached for half an hour. It isn't licensed for reuse and can change
  without notice; the pages credit ESPN and label return dates as its
  estimates.

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
both apps, runs both test suites with coverage, tests the API against a
disposable PostgreSQL service, and runs the Python services’ pytest suites. It then uses `scripts/build-coverage-report.mjs`
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
