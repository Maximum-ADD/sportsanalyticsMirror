# Using the public API

The platform has a REST API that serves the same NBA data as the web app:
players, teams, games, play-by-play, the stats added up from it, game
predictions and how accurate they have been, and versioned dataset
downloads. It answers in JSON, or CSV for exports. Outside callers can only
read.

Some routes need no account. The rest need an API key, which you get by
signing in.

## Addresses

| What | URL |
|---|---|
| API | `https://sportsanalytics-api.onrender.com` |
| API reference (Swagger UI) | <https://sportsanalytics-api.onrender.com/api/docs> |
| OpenAPI document (JSON) | <https://sportsanalytics-api.onrender.com/api-json> |
| Running it locally | `http://localhost:4000` (see the [root README](../README.md#getting-started)) |

Every route starts with `/v1/`. Hosting is described in
[ADR-003](decisions/ADR-003-hosting-topology.md).

Things to know:

- **The first request can be slow.** The API runs on Render's free plan,
  which stops it after 15 minutes without traffic. The next request wakes it
  and can take about 30 seconds.
- **Call the API from a script or a server, not from a web page on another
  site.** The API only allows browser requests (CORS) from this project's
  own web app.
- **Don't build on the web app's `/api` path.** `https://sportsanalytics.pages.dev/api/...`
  is the web app's own proxy. It shares one key and one rate limit with
  every signed-out visitor to the site, so heavy use there slows the site
  for everyone, and it may be locked down.

## Without an account

These routes need no key and no sign-in:

| Route | What you get |
|---|---|
| `GET /v1/live/games` | Games in progress, starting in the next 24 hours, and finished in the last 18 hours, read from the NBA's live feed |
| `GET /v1/live/games/{gameId}` | One live or recently finished game's box score, plus the last five minutes of plays while it is live. `gameId` is the NBA's ten-digit id, such as `0012600028`, from the list above |
| `GET /v1/health` | `{ "status": "ok" }` when the API is up |

```sh
curl -s https://sportsanalytics-api.onrender.com/v1/live/games
curl -s https://sportsanalytics-api.onrender.com/v1/live/games/0012600028
```

You can also read the whole API reference in Swagger UI without an account,
and use "Try it out" on the routes above. Any other data route answers
`401 API_KEY_REQUIRED` until you add a key or sign in; the personal and
admin routes need a signed-in session.

On Windows PowerShell, type `curl.exe` instead of `curl`, because `curl` is
an alias for a different command there.

## Getting a key

1. Go to <https://sportsanalytics.pages.dev> and sign in with Google (the
   only sign-in option). A new account picks a username first.
2. Open your Profile page (<https://sportsanalytics.pages.dev/profile>) and
   find **API keys**.
3. Type a label if you want one (for example "laptop") and click
   **Generate Key**.
4. Copy the key straight away. It is shown once. The API keeps only a hash
   of it, so nobody can show it to you again. A key looks like `nba_`
   followed by 43 letters, digits, `-` and `_`.

Send the key in the **`X-API-Key`** header on every request:

```sh
curl -s -H "X-API-Key: nba_your_key_here" \
  "https://sportsanalytics-api.onrender.com/v1/teams"
```

The same table on the Profile page shows your usage and limits, and lets
you **Revoke** a key (it stops working at once but stays listed) or
**Delete** it. Keep keys out of code you commit: put them in an environment
variable instead.

In Swagger UI, click **Authorize**, paste the key under `apiKey`, and every
"Try it out" request will send it.

## What a key unlocks

A key works on these read routes. A signed-in browser can use them too.

| Area | Routes |
|---|---|
| Players | `/v1/players` (search, filter, rank), `/v1/players/{id}`, `/v1/players/{id}/stats`, `/stats/splits`, `/stats/career`, `/matchup-projection`, `/archetype`, `/v1/players/compare`, `/v1/players/stats-batch`, `/v1/players/leaders`, `/v1/players/league-averages`, `/v1/players/aggregates`, `/v1/players/export` (CSV) |
| Archetypes | `/v1/archetypes`, `/v1/archetypes/map` |
| Teams | `/v1/teams`, `/v1/teams/{id}`, `/v1/teams/records`, `/v1/teams/elo-ratings`, `/v1/teams/{id}/suggested-players` |
| Games | `/v1/games`, `/v1/games/seasons`, `/v1/games/{id}`, `/v1/games/{id}/prediction`, `/v1/games/{id}/prediction/history`, `/v1/games/{id}/events` (play-by-play), `/v1/games/{id}/live`, `/v1/games/export` (CSV) |
| Analytics | `/v1/analytics/model-accuracy`, `/v1/analytics/leaderboard` |
| Datasets | `/v1/datasets`, `/v1/datasets/{version}`, `/v1/datasets/diff`, `/v1/datasets/changes`, `/v1/datasets/{version}/download` (CSV) |

A key never reaches personal or admin routes: `/v1/me/...`, `/v1/admin/...`,
`/v1/optimizer/...` and `/v1/custom-statistics/...` need a signed-in
session, and a key alone gets `401 UNAUTHENTICATED`. The full list, and a
proposal to change which routes need a key, is in the
[route audit](API_ROUTE_AUDIT.md).

## Examples

Set two variables once, then copy the commands below.

```sh
export API=https://sportsanalytics-api.onrender.com
export NBA_API_KEY=nba_your_key_here
```

In PowerShell: `$API = "https://sportsanalytics-api.onrender.com"` and
`$NBA_API_KEY = "nba_your_key_here"`, then use `curl.exe` and
`"$API/v1/..."` the same way.

**Find a player.** `search` matches first or last names. Lists are paged:
`page` starts at 1, and `pageSize` defaults to 25 with a maximum of 100. A
page looks like `{ "data": [...], "page": 1, "pageSize": 5, "total": 2 }`.

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/players?search=curry&pageSize=5"
```

**A player's season.** Use the `id` (a UUID) from the search. `seasonType`
is `REGULAR` (the default), `PLAY_IN`, `PLAYOFFS` or `FINALS`. Add
`asOf=2026-01-01T00:00:00Z` to see the figures as they stood on that date.

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/players/PLAYER_ID/stats?seasonType=REGULAR"
```

**Compare two to four players.**

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/players/compare?ids=PLAYER_ID_1,PLAYER_ID_2"
```

**Team records and Elo ratings.**

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/teams/records"
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/teams/elo-ratings"
```

**Upcoming games and their predictions.** `status` is `upcoming` or
`completed`; leave it out for both. Each game carries its `prediction`, with
`homeWinProbability` (0 to 1) and `predictedMarginHome` (points, home minus
away).

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/games?status=upcoming&pageSize=10"
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/games/GAME_ID/prediction"
```

**How accurate the predictions have been.**

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/analytics/model-accuracy"
```

**A game's play-by-play,** 100 events a page.

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/games/GAME_ID/events?pageSize=100&page=1"
```

**Datasets.** List the releases, then download one as CSV. The
`X-Checksum-SHA256` response header lets you check the file.

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" "$API/v1/datasets"
curl -s -H "X-API-Key: $NBA_API_KEY" -o dataset.csv "$API/v1/datasets/VERSION/download"
```

**CSV exports** of players (up to 5,000 rows) and games (up to 5,000 games,
newest first). Both take the same filters as their list routes.

```sh
curl -s -H "X-API-Key: $NBA_API_KEY" -o players.csv "$API/v1/players/export?position=C"
curl -s -H "X-API-Key: $NBA_API_KEY" -o games.csv "$API/v1/games/export?season=2025-26"
```

Swagger UI lists every query parameter for each route.

## Rate limits and quotas

Limits belong to your account, not to each key: all your keys share one
budget.

| Who | Per minute | Per day |
|---|---|---|
| A key from your Profile page | 60 requests | 5,000 requests |
| A key an admin made for an outside service | 100 requests by default | 10,000 requests by default |

- The minute limit counts your requests in the last 60 seconds.
- The day limit resets at midnight on the API server's clock.
- Every request the key check lets through counts, even one that then
  returns 404. A request turned away with 429 does not count.
- An admin can raise an account's limits if there is a real need.
- The routes that need no key have no limit today. Please poll the live
  routes no more than every 15 seconds, as the web app does.

A 429 response has no `Retry-After` header. If you hit the minute limit,
wait up to a minute and try again, with a longer wait each time it repeats.
If you hit the daily quota, wait until the next day.

## Errors

Every error has the same JSON shape:

```json
{ "error": { "code": "API_KEY_REQUIRED", "message": "An API key or a signed-in session is required" } }
```

Check `code` in your code. The `message` is for people and can change.

| Status | `code` | When |
|---|---|---|
| 401 | `API_KEY_REQUIRED` | The route needs a key and you sent none |
| 401 | `UNAUTHORIZED` | The key is wrong, revoked or deleted (message: "Invalid or inactive API key") |
| 401 | `UNAUTHENTICATED` | The route needs a signed-in session, such as `/v1/me`; a key does not help (message: "Sign in required") |
| 403 | `FORBIDDEN` | You are signed in but lack the role the route needs (message: "Insufficient permissions"), or a write came from a website the API does not trust |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests this minute (message: "Rate limit of 60 requests per minute exceeded") |
| 429 | `DAILY_QUOTA_EXCEEDED` | Too many requests today (message: "Daily quota of 5000 requests exceeded") |
| 400 | `BAD_REQUEST` | A query parameter is wrong, such as an unknown `seasonType` |
| 404 | `NOT_FOUND` | No such player, team, game or release, or no such route |
| 406 | `UNSUPPORTED_API_VERSION` | You sent an `Accept-Version` other than `1` |
| 503 | `LIVE_DATA_UNAVAILABLE` | The NBA's live feed could not be read (live routes only) |
| 500 | `INTERNAL_ERROR` | Something went wrong on our side |

With a key, a 403 is unlikely: routes that need a role also need a session,
so a key alone gets 401 there first.

## Versions and deprecation

The version is in the path: `/v1/...`. You can also send
`Accept-Version: 1`. Every `/v1` response has an `API-Version: 1` header. A
request for any other version gets 406 instead of an answer in a shape you
didn't expect. See [API versioning](API_VERSIONING.md).

When a route is retired, it keeps working for a notice period and its
responses carry `Deprecation`, `Sunset` and `Link` headers. The `Link`
points to the replacement. Right now only `GET /health` is deprecated: use
`GET /v1/health`; the old route works until 31 March 2027. See the
[deprecation policy](API_DEPRECATION.md).
