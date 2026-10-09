# API route audit

This is a review of every route in `apps/api`: who can call it today, what
it returns, and whether it really needs an API key. The "Proposed" column is
a **proposal for the team to decide on**. No guard has been changed.

How to use the API as it works today is in
[Using the public API](PUBLIC_API.md).

Reviewed against `main` on 2026-10-09.

## How access works today

Two guards run on every route: `ApiVersionGuard` (rejects an unsupported
`Accept-Version`) and `OriginCheckGuard` (rejects writes from an untrusted
`Origin`; it never blocks a GET). On top of those, each controller uses one
of four rules:

| Rule | Guards | Who gets in |
|---|---|---|
| None | none | Anyone |
| Key or session | `OptionalSessionGuard`, `ApiKeyGuard` | A signed-in browser, or any request with a valid `X-API-Key` |
| Session | `SessionAuthGuard` | A signed-in browser only. A key alone gets 401 |
| Session + role | `SessionAuthGuard`, `RolesGuard` | A signed-in user with the listed role |

Rate limits and quotas are applied only by `ApiKeyGuard`, per consumer.
Requests with a session skip it, so they are not limited. Routes with no
guard have no limit at all. There is no per-IP rate limiting anywhere in the
API.

Outside Nest: `/auth/*` is BetterAuth's sign-in handler, and Swagger serves
`/api/docs` and `/api-json`. None of these take a key.

## Findings

1. **The site proxy lends its key to anyone.** The web app reaches the API
   through a Cloudflare Pages Function (`functions/api/[[path]].ts`, using
   `functions/_shared/proxy.ts`). It adds the site's own key to every request
   that arrives without one, and does not check who sent it. So, going by the
   code, `https://sportsanalytics.pages.dev/api/v1/players` works from curl
   with no key. Today's "key or session" routes are keyless in practice. All
   such callers also share the site's one budget (100 requests a minute and
   10,000 a day by default), so one heavy script through the proxy can make
   the site return 429 for every signed-out visitor.
2. **Keyless routes have no limit.** `/v1/live/games` and
   `/v1/live/games/:gameId` are open by design (see the comment in
   `live-games.controller.ts`). Their reads of the NBA feed are cached, so
   the cost is bounded, but nothing stops one client calling them in a tight
   loop.
3. **429 responses have no `Retry-After` header.** Clients have to guess how
   long to wait.
4. **Signed-in sessions are never rate limited.** That is fine for the
   browser, but it means a copied session cookie gets unlimited reads.
5. **Swagger's tag labels were wrong.** "players (public)" and
   "teams (public)" needed a key, and "games (auth required)" also takes a
   key. Fixed on this branch (text only, see `apps/api/src/main.ts`).
6. **The optimizer is session-only, but cheap.** It returns a lineup and
   projections that the Python optimizer computed earlier, read from a
   5-minute cache. Nothing in it is personal.

## Proposal

Public sports data is what the brief calls the public API. The proposal is
to treat it that way, and to keep keys for the routes where a key really
controls cost or exposure:

- **No key, with a per-IP limit:** cheap reads of public sports data. These
  are mostly cached for 5 to 60 minutes, and the site shows the same data to
  signed-out visitors anyway. A per-IP limit (a starting figure such as 60
  requests a minute per IP) protects the API without a key. It has to read
  the real client IP: everything through the site proxy reaches Render from
  Cloudflare, so the proxy would need to forward the visitor's IP and the API
  would need to trust that header only from the proxy.
- **Key (or session):** bulk and costly routes (CSV exports, dataset
  downloads, the 50-player batch) and the Beat the Model leaderboard, which
  shows other users' display names. Here the per-consumer quota is the right
  control, and the key tells us who is downloading. A signed-in browser keeps
  working, as it does today. The optimizer's precomputed lineup and
  projections could join this group (see below).
- **Session:** anything personal (`/v1/me/**`), anything that writes, and
  everything admin or analyst-only. No change.

If the team prefers to keep keys on all data reads, the proxy finding still
needs fixing. The proxy should stop adding its key for callers that are not
the site, and get a per-IP limit of its own.

## Every route

"Cached" means the response comes from the API's in-memory cache
(`src/cache`) for up to 5 minutes (derived data) or 60 minutes (reference
data). In the Proposed column, "Key" means a key or a signed-in session, as
"key or session" does today.

### Health, live, docs

| Method | Path | Guards today | Returns | Proposed | Why |
|---|---|---|---|---|---|
| GET | `/v1/health` | None | `{ "status": "ok" }` | No key | Uptime checks must work without credentials |
| GET | `/health` | None | Same; deprecated until 31 Mar 2027 | No key | Same as above |
| GET | `/v1/live/games` | None | Live, upcoming and recent games from the NBA feed | No key + per-IP limit | Public data; NBA reads are cached, but the route has no limit at all |
| GET | `/v1/live/games/:gameId` | None | One live or recent game's box score | No key + per-IP limit | Same as above |
| GET | `/api/docs`, `/api-json` | None | Swagger UI and the OpenAPI document | No key | People need to read the docs before they have a key |
| ALL | `/auth/*` | BetterAuth | Google sign-in and sessions | No change | This is how you get a session |

### Players and archetypes

| Method | Path | Guards today | Returns | Proposed | Why |
|---|---|---|---|---|---|
| GET | `/v1/players` | Key or session | Paginated players; ranked league-wide when `sort`, `order` or `minGames` is set | No key + per-IP limit | Public data, at most 100 rows a page, ranking base cached |
| GET | `/v1/players/export` | Key or session | CSV of up to 5,000 players (bio fields) | Key | Bulk download; the quota should count it |
| GET | `/v1/players/compare` | Key or session | Season lines for 2 to 4 players | No key + per-IP limit | Bounded: two queries whatever the count |
| GET | `/v1/players/stats-batch` | Key or session | Averages and game logs for up to 50 players | Key | Heaviest player read, uncached |
| GET | `/v1/players/leaders` | Key or session | Season leaders by category | No key + per-IP limit | Public data, one fixed-size answer |
| GET | `/v1/players/league-averages` | Key or session | League averages for a season segment | No key + per-IP limit | Public data, cached |
| GET | `/v1/players/aggregates` | Key or session | A metric averaged by team or position | No key + per-IP limit | Public data, small answer |
| GET | `/v1/players/:id` | Key or session | One player | No key + per-IP limit | Public data, cached |
| GET | `/v1/players/:id/stats` | Key or session | Season averages and game log (`asOf` optional) | No key + per-IP limit | Public data, cached without `asOf` |
| GET | `/v1/players/:id/stats/splits` | Key or session | Averages for every season segment | No key + per-IP limit | Public data, one player |
| GET | `/v1/players/:id/stats/career` | Key or session | Career totals and per-season lines | No key + per-IP limit | Public data, cached |
| GET | `/v1/players/:id/matchup-projection` | Key or session | Opponent splits and scoring projections | No key + per-IP limit | Public data, cached |
| GET | `/v1/players/:id/archetype` | Key or session | Playing-style archetype and similar players | No key + per-IP limit | Public data, one player |
| GET | `/v1/archetypes` | Key or session | A season's archetypes with member counts | No key + per-IP limit | Public data, small |
| GET | `/v1/archetypes/map` | Key or session | Every placed player's style-map position | No key + per-IP limit | Public data; a few hundred thin rows |

### Teams

| Method | Path | Guards today | Returns | Proposed | Why |
|---|---|---|---|---|---|
| GET | `/v1/teams` | Key or session | Paginated teams | No key + per-IP limit | Public data, cached |
| GET | `/v1/teams/elo-ratings` | Key or session | Every team's Elo rating | No key + per-IP limit | Public data, cached |
| GET | `/v1/teams/records` | Key or session | Every team's record and recent form | No key + per-IP limit | Public data, cached |
| GET | `/v1/teams/:id` | Key or session | One team | No key + per-IP limit | Public data, cached |
| GET | `/v1/teams/:id/suggested-players` | Key or session | A team's roster ranked by usage | No key + per-IP limit | Public data, at most 20 rows, cached |

### Games and predictions

| Method | Path | Guards today | Returns | Proposed | Why |
|---|---|---|---|---|---|
| GET | `/v1/games` | Key or session | Paginated games with predictions | No key + per-IP limit | Public data, cached |
| GET | `/v1/games/export` | Key or session | CSV of up to 5,000 games | Key | Bulk download; the quota should count it |
| GET | `/v1/games/seasons` | Key or session | Seasons that have games | No key + per-IP limit | Public data, cached |
| GET | `/v1/games/:id` | Key or session | Game detail, prediction, odds, predicted scorers | No key + per-IP limit | Public data, cached |
| GET | `/v1/games/:id/prediction` | Key or session | Elo win chance and Four Factors margin | No key + per-IP limit | Predictions are a core part of the public API |
| GET | `/v1/games/:id/prediction/history` | Key or session | Every model version's prediction for the game | No key + per-IP limit | Public data, one game |
| GET | `/v1/games/:id/events` | Key or session | Paginated play-by-play | No key + per-IP limit | Public data, at most 100 rows a page, cached |
| GET | `/v1/games/:id/live` | Key or session | New events since a cursor; clients poll every 5 s | No key + per-IP limit | Polling on a shared key drains it fast (the reason the live routes are keyless) |

### Analytics

| Method | Path | Guards today | Returns | Proposed | Why |
|---|---|---|---|---|---|
| GET | `/v1/analytics/model-accuracy` | Key or session | Hit rate, Brier score, calibration | No key + per-IP limit | Describes the model, not a person; input is cached |
| GET | `/v1/analytics/leaderboard` | Key or session | Beat the Model rankings with users' display names | Key or session (no change) | Shows other users' names; keep them off an anonymous tier |

### Datasets

| Method | Path | Guards today | Returns | Proposed | Why |
|---|---|---|---|---|---|
| GET | `/v1/datasets` | Key or session | Paginated dataset releases | No key + per-IP limit | Metadata only |
| GET | `/v1/datasets/diff` | Key or session | Differences between two releases | No key + per-IP limit | Metadata only |
| GET | `/v1/datasets/changes` | Key or session | Releases published after a cursor | No key + per-IP limit | Metadata only |
| GET | `/v1/datasets/:version` | Key or session | One release's schema and checksum | No key + per-IP limit | Metadata only |
| GET | `/v1/datasets/:version/download` | Key or session | The release as CSV; older releases are rebuilt on request | Key | Large file, and a rebuild is costly |
| POST | `/v1/datasets/admin/publish` | Key or session, then session + ADMIN | Creates a release (write) | Session + ADMIN (no change) | Admin write |

### Optimizer

| Method | Path | Guards today | Returns | Proposed | Why |
|---|---|---|---|---|---|
| GET | `/v1/optimizer/lineup` | Session | Latest optimized fantasy lineup | Key or session | Precomputed and cached, nothing personal (product decision) |
| GET | `/v1/optimizer/predictions` | Session | Every player's latest fantasy projection | Key or session | Same as above |
| GET | `/v1/optimizer/predictions/:playerId` | Session | One player's projection | Key or session | Same as above |

The optimizer itself (the MILP solve) runs in `apps/optimizer`, not in the
API, so these routes are not the costly part. Opening them is a product
choice: the web app shows lineups only to signed-in users.

### Your account (`/v1/me`)

All session-only today. Proposed: **no change**. These routes read or change
one user's own data, so they must stay behind a session.

| Method | Path | Returns |
|---|---|---|
| GET | `/v1/me` | Your profile |
| PATCH | `/v1/me` | Updates username, favourite team, tutorial setting (write) |
| POST | `/v1/me/avatar` | Uploads an avatar (write) |
| PUT, DELETE | `/v1/me/followed-players/:playerId` | Follows or unfollows a player (write) |
| PUT | `/v1/me/seen-tutorials/:tutorialId` | Marks a tutorial as seen (write) |
| GET | `/v1/me/export` | Everything stored about your account, as JSON |
| GET | `/v1/me/teams/results` | Recent results for your followed teams |
| GET | `/v1/me/watchlist` | Your followed players with their stats |
| GET, POST | `/v1/me/lineups` | Your saved lineups; saves one (write) |
| DELETE | `/v1/me/lineups/:lineupId` | Deletes a saved lineup (write) |
| GET, POST | `/v1/me/saved/comparisons` | Your saved comparisons; saves one (write) |
| DELETE | `/v1/me/saved/comparisons/:id` | Deletes a saved comparison (write) |
| GET | `/v1/me/challenge/next` | Your next Beat the Model game |
| GET | `/v1/me/picks/record` | Your Beat the Model record |
| POST | `/v1/me/picks` | Submits a pick (write) |
| GET, POST | `/v1/me/api-keys` | Your keys and usage; creates a key (write) |
| DELETE | `/v1/me/api-keys/:keyId` | Revokes a key (write) |
| DELETE | `/v1/me/api-keys/:keyId/purge` | Deletes a key (write) |
| GET | `/v1/me/become-pro` | Your Become Pro seasons |
| GET | `/v1/me/become-pro/summary` | Your projected value |
| POST | `/v1/me/become-pro/seasons` | Starts a season (write) |
| PATCH, DELETE | `/v1/me/become-pro/seasons/:seasonId` | Edits or deletes a season (write) |
| POST | `/v1/me/become-pro/seasons/:seasonId/games` | Logs a game (write) |
| PATCH, DELETE | `/v1/me/become-pro/games/:gameId` | Edits or removes a logged game (write) |

### Custom statistics

Session + ANALYST or ADMIN today. Proposed: **no change**. The statistics
belong to the analyst who wrote them, and evaluating one runs a formula on
request.

| Method | Path | Returns |
|---|---|---|
| GET | `/v1/custom-statistics` | Your custom statistics |
| GET | `/v1/custom-statistics/:id/value` | A statistic evaluated for one player |
| GET | `/v1/custom-statistics/:id/versions` | A statistic's version history |
| POST | `/v1/custom-statistics` | Defines a statistic (write) |
| PUT | `/v1/custom-statistics/:id` | Saves a new version (write) |

### Admin (`/v1/admin`)

Session + ADMIN today. Proposed: **no change**. These routes manage data,
users and API consumers.

| Method | Path | Returns |
|---|---|---|
| GET | `/v1/admin/games` | Games with admin detail |
| GET | `/v1/admin/games/:gameId/events` | A game's raw events |
| GET | `/v1/admin/games/:gameId/anomalies` | Box-score rows that fail sanity checks |
| GET | `/v1/admin/events/corrections` | Event corrections |
| GET | `/v1/admin/games/:gameId/corrections` | One game's corrections |
| POST | `/v1/admin/games/:gameId/events/:sequence/correct` | Corrects an event (write) |
| POST | `/v1/admin/games/:gameId/events/:sequence/preview` | Dry run of a correction |
| POST | `/v1/admin/corrections/:id/revert` | Undoes a correction (write) |
| POST | `/v1/admin/games/:gameId/replay` | Re-derives a game's stats (write) |
| GET | `/v1/admin/batches`, `/v1/admin/batches/:id` | Ingestion batches |
| POST | `/v1/admin/batches/:id/approve`, `/v1/admin/batches/:id/reject` | Approves or rejects a batch (write) |
| GET, PUT | `/v1/admin/ingestion/schedule` | Reads or sets the ingestion schedule |
| POST | `/v1/admin/ingestion/pull` | Queues a data pull (write) |
| GET | `/v1/admin/ingestion/requests` | Recent pulls |
| POST | `/v1/admin/ingestion/requests/:id/cancel` | Cancels a queued pull (write) |
| DELETE | `/v1/admin/ingestion/batches/:id` | Soft-deletes a batch (write) |
| GET | `/v1/admin/players`, `/v1/admin/teams` | Players and teams for editing |
| PATCH | `/v1/admin/players/:id`, `/v1/admin/teams/:id` | Edits a player or team (write) |
| GET | `/v1/admin/users` | Users |
| DELETE | `/v1/admin/users/:id` | Deletes a user (write) |
| PATCH | `/v1/admin/users/:id/role` | Changes a user's role (write) |
| GET, POST | `/v1/admin/consumers` | API consumers; creates one (write) |
| PATCH, DELETE | `/v1/admin/consumers/:id` | Edits or deletes a consumer (write) |
| POST | `/v1/admin/consumers/:id/keys` | Creates a key for a consumer (write) |
| DELETE | `/v1/admin/consumers/:id/keys/:keyId` | Revokes a key (write) |
| DELETE | `/v1/admin/consumers/:id/keys/:keyId/purge` | Deletes a key (write) |

Any other path returns 404 `NOT_FOUND` from the catch-all
`NotFoundController`.
