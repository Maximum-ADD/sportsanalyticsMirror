# Project Overview

A living reference for everything this codebase does and how it's built —
tech stack, architecture, API surface, database schema, testing, and CI.
Kept up to date as the project grows; if you change something structural,
update this file in the same commit.

For team git conventions see [`GIT_METHODOLOGY.md`](./GIT_METHODOLOGY.md).
For the AI attribution ledger see [`ai-usage.md`](./ai-usage.md). For
step-by-step local setup see the root [`README.md`](../README.md) — this
doc explains *how things work*, the README explains *how to run them*.

## What this is

COMS3011A Project 3 (Sport Analytics Tool), built for the NBA. An
event-derived stats platform: every published statistic (points per game,
shooting splits, etc.) is computed from per-game boxscore rows rather than
typed in directly — the brief's core requirement that statistics trace
back to underlying event records. Not scoped to one team — the API and UI
work over however many teams/players are in the database, since the goal
is a platform other tools (e.g. large-scale analysis, or a betting product)
could build on, not a single-team dashboard.

## Repo structure

```
apps/
  api/    NestJS + TypeScript + Prisma + Postgres — hand-written REST API
  web/    React + Vite + TypeScript + Tailwind — frontend SPA
docs/     This file, GIT_METHODOLOGY.md, PROJECT_METHODOLOGY.md, ai-usage.md
scripts/  Coverage-report build/post scripts used by CI
```

Non-monolithic front-end/back-end per the brief's key requirements: the two
apps only ever talk over HTTP, `apps/web` is a plain Vite SPA (not
Next.js/SvelteKit), so there's no framework-level coupling between them.

## Tech stack

**Backend** (`apps/api`)
- NestJS 10 (modules/controllers/services/guards), running on Express 5
  under the hood
- Prisma 5 + PostgreSQL
- [BetterAuth](https://better-auth.com) — Google OAuth
- Zod — request validation
- Vitest + Supertest — testing

**Frontend** (`apps/web`)
- React 19 + Vite + TypeScript
- Tailwind CSS v4
- TanStack Query — server-state/data-fetching
- shadcn/ui components (hand-set-up, see "shadcn/ui setup" below) +
  Radix primitives + `class-variance-authority`
- Recharts — charts
- react-router-dom — routing
- lucide-react — icons
- BetterAuth React client — auth
- Vitest + React Testing Library — testing

**Infra**
- Docker Compose — local Postgres (dev + a separate disposable test DB)
- Gitea Actions — lint/typecheck/test pipeline via a self-hosted runner
  (this repo's remote is `sdp.ms.wits.ac.za`, i.e. Gitea, not GitHub)

## Backend architecture (`apps/api`)

### Module layout

```
src/
  main.ts                  bootstrap — see "Why BetterAuth is mounted specially" below
  app.module.ts             root module: Prisma, Players, Teams, NotFound modules + Health controller
  auth/
    auth.config.ts          the BetterAuth instance (Prisma adapter, Google provider, role field)
  common/
    api-exception.ts        ApiException — throws map to the { error: { code, message } } envelope
    all-exceptions.filter.ts  global filter: formats every thrown error into that envelope
    session-auth.guard.ts   requires a valid BetterAuth session; attaches it to request.user
    roles.guard.ts          requires request.user.role to be one of @Roles(...)'s allowed roles
    roles.decorator.ts      @Roles(...) — reads via Reflector in roles.guard.ts
    pagination.ts           parsePageParams() — shared page/pageSize query parsing
  health/health.controller.ts       GET /health
  players/                  players.controller/service.ts, stats.service.ts (derived season averages)
  teams/                    teams.controller/service.ts
  not-found/                catch-all 404 controller, registered last in app.module.ts
  prisma/                   PrismaService (Nest-managed) + PrismaModule (@Global)
```

### Why BetterAuth is mounted the way it is

`main.ts` does **not** just call `NestFactory.create(AppModule)`. NestJS
attaches its own router (including the catch-all `NotFoundController`) to
the Express instance *during* `NestFactory.create()` — so anything mounted
on that instance afterwards is registered too late to ever be reached.
BetterAuth needs to own everything under `/auth/*` (session cookies, the
Google OAuth redirect dance) ahead of Nest's routing, so `main.ts` instead:

1. builds a plain `express()` instance itself,
2. mounts `helmet`, `cors`, then the BetterAuth handler at `/auth/*splat`
   (raw body — mounted before `express.json()`),
3. mounts `express.json()` for everything else,
4. only then hands that instance to `NestFactory.create(AppModule, new ExpressAdapter(server), { bodyParser: false })`.

BetterAuth's `basePath` is `/auth` (not its default `/api/auth`) to match
the frontend's Vite dev proxy, which strips a leading `/api` before
forwarding to the API (see `apps/web/vite.config.ts`) — so the frontend
calls `/api/auth/...` and it lands on the API's real `/auth/...` route,
same pattern as every other endpoint.

### Auth / RBAC

- Sign-in is Google OAuth only (no username/password) via BetterAuth.
- `role` (`PUBLIC` | `USER` | `ANALYST` | `ADMIN`, Prisma enum, default
  `USER`) is a custom BetterAuth user field with `input: false` — neither a
  sign-up payload nor a Google profile sync can set/overwrite it, only a
  direct database update can.
- `SessionAuthGuard` calls `auth.api.getSession(...)`; if there's no
  session it throws `401 UNAUTHENTICATED`, otherwise it sets
  `request.user` for downstream guards/controllers.
- `RolesGuard` reads `@Roles(...)` metadata off the handler/class via
  `Reflector` and throws `403 FORBIDDEN` unless `request.user.role` is in
  that list. A handler with no `@Roles(...)` is unrestricted.
- **Nothing currently requires a role above the default `USER`** — the
  guards exist and are tested, but no route uses `@Roles(...)` yet. That's
  expected to change once submissions/moderation features land.

### Error handling

Every thrown error is normalised by `AllExceptionsFilter` into
`{ error: { code, message } }`. `ApiException` (extends `HttpException`)
is how application code throws with a specific status/code/message — HTTP
status codes always go through the `HttpStatus` enum, never a bare number.

### Data model philosophy

`GameEvent` rows are meant to be the source of truth (raw play-by-play),
with `PlayerGameStat` boxscore rows and season averages derived from them.
**Current reality**: `PlayerGameStat` rows are seeded directly and
`statsService.ts` derives season averages from *those* at request time —
the seed doesn't yet derive boxscores from `GameEvent` rows themselves.
Closing that gap (real event → boxscore derivation) is still open; see
"Known gaps" below.

## Database schema (Prisma)

- **Team** — `nbaTeamId`, `name`, `abbreviation`, `city`, `conference`,
  `division`, `logoUrl` (always `null` currently — no logo assets)
- **Player** — `nbaPlayerId`, name, `position`, physical attributes,
  `jerseyNumber`, belongs to a `Team`
- **Game** — home/away `Team`, `gameDate`, `season`, scores
- **GameEvent** — raw play-by-play row belonging to a `Game` (sequence,
  period, clock, eventType, description) — the intended derivation source,
  see above
- **PlayerGameStat** — one row per player per game (points, rebounds,
  assists, shooting splits, etc.) — what `statsService.ts` actually
  aggregates into season averages today
- **User / Session / Account / Verification** — BetterAuth's required core
  schema (see [better-auth.com/docs/concepts/database](https://better-auth.com/docs/concepts/database)).
  `User.role` is the one project-specific addition (see RBAC above).

Mock seed data (`apps/api/prisma/seed.ts`): 4 teams (Lakers, Celtics,
Warriors, Bucks), 3 players each. Every pair of teams plays a full
home-and-away round robin (12 games), so **every** seeded team/player has
real derived stats — not just whichever team happened to be seeded first.
Real NBA-wide data (all 30 teams) is intentionally not hand-seeded; that's
what the planned `nba_api` ingestion pipeline is for (see "Known gaps").

## API reference

Base: `http://localhost:4000` in dev. All error responses share the
envelope `{ error: { code, message } }`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ status: "ok" }` |
| ALL | `/auth/*` | BetterAuth — sign-in/callback/session/sign-out etc. |
| GET | `/v1/players` | Query: `page`, `pageSize`, `teamId`, `position` |
| GET | `/v1/players/:id` | |
| GET | `/v1/players/:id/stats` | Derived season averages + game log |
| GET | `/v1/teams` | Query: `page`, `pageSize` |
| GET | `/v1/teams/:id` | |
| ALL | `*` | Catch-all → `404 NOT_FOUND` |

Pagination shape: `{ data: T[], page, pageSize, total }`.

No route currently requires authentication — `SessionAuthGuard`/
`RolesGuard` exist and are unit-tested but aren't applied anywhere yet.

## Frontend architecture (`apps/web`)

### Routing & pages (`src/App.tsx`, `src/pages/`)

| Route | Page | Purpose |
|---|---|---|
| `/` | `HomePage` | Hero + links into Players/Teams |
| `/players` | `PlayersListPage` | Filter (team/position) + sort (name/PPG) + paginated table |
| `/players/:playerId` | `PlayerProfilePage` | Stat tiles, traits radar, points trend chart, shooting splits |
| `/teams` | `TeamsListPage` | Paginated team cards |
| `/teams/:teamId` | `TeamProfilePage` | Team header + roster table |

### Data fetching

`src/lib/nbaApi.ts` wraps the API (`src/lib/apiClient.ts`'s `fetchJson`,
which always sends `credentials: "include"` for session cookies). Every
page uses TanStack Query (`useQuery`/`useQueries`) rather than manual
`useEffect`/`useState` fetching — gives retry, caching, and loading/error
state for free. `ErrorState` (retry button) and `Pagination` are shared
components used across the list pages.

`PlayersListPage`'s PPG sort is a deliberate, documented tradeoff: the
`/v1/players` list endpoint doesn't return derived stats, so sorting by PPG
fetches each visible row's `/stats` via `useQueries` and only sorts what's
on the current page. A real cross-roster leaderboard sort would need a
backend endpoint returning aggregates in bulk — not built yet.

### shadcn/ui setup

`npx shadcn init` hit a real CLI bug on this repo's `apps/*` layout on
Windows — it wrote a literal `@/components/...` folder instead of
resolving the path alias (see `apps/web/components.json` for the config
that *would* drive the CLI). Components (`src/components/ui/`:
`button.tsx`, `card.tsx`, `badge.tsx`, `table.tsx`, `skeleton.tsx`) were
instead hand-written in shadcn's standard structure/API, styled with this
project's own theme tokens instead of shadcn's generic defaults. Adding a
new shadcn component means copying its reference source manually and
re-theming it the same way, not running `npx shadcn add`.

### Theme

Dark, hardwood-court-and-basketball-orange palette, defined as CSS
variables in `src/index.css`'s `@theme` block (`--color-surface-*`,
`--color-text-*`, `--color-brand-accent*`) — every component references
these tokens, never a hardcoded hex value, so retheming only ever touches
that one file. Note: solid-fill buttons use
`--color-brand-accent-foreground` (dark, not white) specifically because
white-on-orange measures ~2.8:1 contrast (fails WCAG AA); the dark
foreground measures ~6.7:1.

`TeamBadge` colors real teams (Lakers/Celtics/Warriors/Bucks) with their
actual brand colors; any team not in that hand-picked list gets a stable
color derived from hashing its abbreviation, rather than one flat
placeholder — scales automatically as more teams are added.

## Testing

Both apps use Vitest.

**Backend** (`apps/api`): unit tests for pagination, derived-stats math,
`RolesGuard`, and the exception filter; Supertest e2e tests
(`apps/api/test/`) for players/teams/health/404 run against a **real,
disposable Postgres database** (`postgres-test` docker-compose service,
port 55433, tmpfs — not persisted) rather than a mocked Prisma client, so
they exercise actual queries. `apps/api/test/global-setup.ts` runs
`prisma migrate deploy` against it before the suite starts.

**Frontend** (`apps/web`): component/page tests with React Testing Library
— `lib/utils`, `lib/nbaApi`, key components (`Pagination`, `StatTile`,
`TeamBadge`, `ErrorState`, `PlayersFilterBar`, `AuthStatus`), and a
page-level test of `PlayersListPage` with mocked API calls.

Run locally:

```bash
npm run db:up:test              # one-off: start the disposable test DB

cd apps/api
cp .env.test.example .env.test  # one-off
npm test                        # or npm run test:cov

cd apps/web
npm test                        # or npm run test:cov
```

## CI/CD (`.gitea/workflows/ci.yml`)

Targets **Gitea Actions** (this repo's remote is `sdp.ms.wits.ac.za`), run
via a self-hosted `act_runner`, not GitHub Actions or GitLab CI. On every
push and PR:

1. `api` — lint and typecheck.
2. `web` — lint and typecheck.
3. `coverage` — run the API suite against a disposable PostgreSQL service,
   run the Web suite, and generate coverage for both without rerunning the
   suites separately.

The coverage job builds `scripts/build-coverage-report.mjs`'s combined HTML
dashboard and uploads it as a downloadable `coverage-report` Gitea Actions
artifact. The dashboard contains overall API/Web metrics and links to each
app's detailed HTML report. Coverage is reported but no minimum thresholds
are enforced yet.

An earlier `.gitlab-ci.yml` attempted similar reporting against a different
platform before the team settled on Gitea; it was removed rather than kept
as a stale reference. The GitLab-specific merge-request comment script was
also removed because it has no working equivalent under Gitea.

A deploy stage isn't wired into CI yet. See `GIT_METHODOLOGY.md` for the
checks and review required before merging.

## Known gaps

- No route requires authentication yet (guards exist, unused in practice).
- `PlayerGameStat` is seeded directly rather than derived from `GameEvent`
  rows — the event-sourcing story isn't fully real yet.
- Real NBA data ingestion (`nba_api`, Python) into Postgres — not started.
- A second external API integration (brief requirement) — not started.
- Public documentation site (Docusaurus/MkDocs, deployed via static
  hosting) — not started. This file lives in-repo; it isn't that site.
- Lint/typecheck aren't enforced in CI yet, only run manually.
- Responsiveness/accessibility pass (beyond the one contrast fix already
  made) — not done.
- Production deployment — not done.
