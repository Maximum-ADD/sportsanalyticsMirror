# apps/api

The platform's REST API: NestJS + TypeScript + Prisma + PostgreSQL. It serves
fixtures, play-by-play events and the statistics derived from them under
`/v1/`, plus the admin, personal and dataset routes. Every route is
hand-written; Swagger UI is generated from the controllers at `/api/docs`
(live: <https://sportsanalytics-api.onrender.com/api/docs>).

Setup from a clean clone is in the [root README](../../README.md#getting-started).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Builds and serves on <http://localhost:4000>, rebuilding on change |
| `npm run prisma:migrate` | Applies migrations to the dev database (creates new ones from `schema.prisma` changes) |
| `npm run prisma:seed` | Loads mock teams, players and games, and prints a local site-proxy API key for `apps/web/.env` |
| `npm test` | Unit specs (`src/**/*.spec.ts`) and end-to-end specs (`test/*.e2e-spec.ts`) |
| `npm run test:cov` | The same, with coverage; CI fails under 80% lines, statements, functions or branches |
| `npm run lint` | ESLint |
| `npm run load-test` | Load-tests a running API against the stated response-time target (see `scripts/load-test.mjs`) |

The end-to-end specs boot the real `AppModule` against a disposable Postgres
named in `.env.test` (copy `.env.test.example`; `npm run db:up:test` at the
repo root starts one), and run its migrations first.

## Layout

One Nest module per area under `src/`:

| Folder | Covers |
|---|---|
| `players`, `teams`, `games` | Public reads: lists, detail, play-by-play, derived stats, `asOf`, splits, career, aggregates, CSV export |
| `datasets` | Versioned dataset releases: list, diff, change feed, CSV download, publish (admin) |
| `custom-statistics` | Analyst-defined statistics, every version kept |
| `analytics` | Model accuracy and the Beat the Model leaderboard |
| `admin` | Batch review, event corrections with recompute and undo, anomaly flags, ingestion pulls, API consumers, users |
| `me` | The signed-in user's profile, follows, picks, saved items and API keys |
| `become-pro`, `optimizer`, `live` | Become Pro, the lineup optimizer and the live-games feed |
| `injuries` | Injuries and expected return dates from ESPN's injury report, matched to this app's teams and players; nothing stored |
| `common` | Guards (session, API key, roles, version, origin), the error filter, pagination, OpenAPI helpers |
| `cache` | The in-memory response cache for public reads |

Public read controllers take a session or an `X-API-Key`. Keys are checked
by `ApiKeyGuard`, which caches lookups and counts rate limits and quotas in
memory (see `common/api-key-lookup.service.ts` and
`common/consumer-rate-limiter.service.ts`). Architecture, the ERD and the
ADRs are on the
[docs site](https://sports-analytics-innovation-platform.github.io/Innovation-Documentation-Website/).
