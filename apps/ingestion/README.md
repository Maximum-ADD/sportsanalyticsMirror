# Ingestion service

A small Python service, separate from the NestJS API, that pulls **real**
NBA data from [`nba_api`](https://github.com/swar/nba_api) (a wrapper
around stats.nba.com's endpoints) and writes it into the same Postgres
database Prisma/NestJS manages: all 30 current NBA teams, their current
rosters, each team's ~15 most recent games with real per-player boxscores
*derived from that game's real play-by-play* (see "Play-by-play and
event-derived stats" below — this is the platform's actual "every
statistic traces back to events" story, not just a documented intention),
and the season's full postseason (play-in, playoffs and Finals).

This is the real ingestion pipeline the root `README.md`/`PROJECT_OVERVIEW.md`
described as a known gap — until now the only data in this database was
`apps/api/prisma/seed.ts`'s 4 hand-written mock teams.

## Read this before running it

**Must run from your own machine, not a cloud host.** stats.nba.com blocks
traffic from cloud-provider IP ranges (AWS, GCP, Azure, and others) — a
well-documented, repeatedly-reported issue in `nba_api`'s own GitHub
issues, not a guess. If every call fails immediately with the same error,
that's almost certainly why — run this from a normal residential/office
network instead.

**There is no official rate limit** — stats.nba.com's maintainers
explicitly decline to publish one. `throttle.py` uses a conservative 1
second delay between calls (the most concrete community-tested number
available is ~600ms; this rounds up for margin), plus automatic retries on
transient failures. Don't lower `RATE_LIMIT_DELAY_SECONDS` without a good
reason — this endpoint is unofficial and undocumented, and being
aggressive risks a temporary block.

**Expect this to take 35-45 minutes.** Teams are free (bundled static
data), rosters are 30 calls, player bios are the largest single phase by
call count, and boxscores plus their matching play-by-play calls (one
`PlayByPlayV3` alongside every `BoxScoreTraditionalV3`, see "Play-by-play
and event-derived stats" below) make up the bulk of the remaining runtime
— see `ingest.py`'s module docstring for the exact call-budget breakdown.

Plus/minus and the advanced figures (usage rate, offensive/defensive
ratings) come from leaguewide `PlayerGameLogs` — 2 calls per season
segment, not one per game. See `player_game_logs.py` for why that endpoint
rather than `BoxScoreAdvancedV3`: 6 calls for a whole season instead of
~900. The postseason phase adds roughly 5 minutes on top.

A player-game the feed doesn't carry keeps null advanced figures rather
than blocking ingestion. Most of those are DNPs, which genuinely have no
usage rate.

**Postseason classification is derived from game ids, not endpoints.**
`classify_game()` reads a game's segment out of its NBA game id (play-in
games carry a `005` prefix; playoff ids carry the round in digit 7, where
round 4 is the Finals) rather than trusting whichever endpoint returned it.
That keeps re-runs consistent and means a game can't be filed differently
by two phases. Both the `"PlayIn"`/`"Playoffs"` season-type spellings and
the id layout were verified live against stats.nba.com for 2025-26 — the
spellings have changed between `nba_api` releases, so check them against
the installed version if you bump it. `CommonPlayoffSeries` gives round
numbers directly if the id layout ever stops holding.

**Run this *before* `npm run prisma:seed`, not after — or don't run
prisma:seed again at all once you've ingested real data.** `seed.ts`
deletes and regenerates every `Game`/`GameEvent`/`PlayerGameStat` row on
every run (`resetGameData()`), which would wipe out everything this script
ingests. `seed.ts`'s 4 mock teams and 12 mock players use the *same* real
`nbaTeamId`/`nbaPlayerId` values as the real Lakers/Celtics/Warriors/Bucks
and their real players, so re-running ingestion after seeding just
refreshes those specific rows with real data rather than creating
duplicates — but the mock games/boxscores would still need to be
overwritten by re-running ingestion again afterward if you seed first.

## Play-by-play and event-derived stats

Every game's `PlayerGameStat` counting stats (points, shooting splits, the
rebound split, assists, steals, blocks, turnovers) are aggregated from
real per-play `PlayByPlayV3` data — see `play_by_play.py` (fetch +
validate + write `GameEvent`) and `derive_player_game_stats.py` (pure
event → boxscore aggregation, unit-testable with zero DB/network, same
split as `apps/predictor/four_factors.py`'s fetch/compute functions).
`minutes` and `plusMinus` stay sourced from the boxscore/`PlayerGameLogs`
endpoints instead — see `PlayerGameStat`'s schema doc comment for why.

Each run is recorded as an `IngestionBatch` (accepted/rejected event
counts, rejection reasons) — this pipeline's own "submission" a published
stat traces back to, alongside the events themselves. A raw action that
fails schema validation (`event_validation.py` — missing fields, an
out-of-order/duplicate `actionNumber`, an unrecognised `actionType`, an
unknown `personId`) is rejected with a structured reason, not silently
written or silently dropped; `ingest.py` prints a summary when any game
has rejections.

**The feed's vocabulary is translated first** (`feed_translation.py`).
`PlayByPlayV3` names plays differently from the platform's event schema
(`Made Shot` rather than `2pt`, `Free Throw` rather than `freethrow`), puts
offensive/defensive rebounds and missed free throws only in the
description, sends blocks and steals as separate rows sharing the number of
the shot or turnover they belong to, and uses a team's id as `personId` on
team plays. Until this translation existed, every one of those was
rejected: each game kept ~8 of its ~500 plays (the period markers) and every
stat fell back to the boxscore. See the module docstring for the full list.

**Checked against live data on 2026-09-18**, over 35 real 2025-26 games
(regular season, play-in and playoffs): 16,775 of 16,777 plays accepted,
and every one of the 14 counting stats on all 736 player lines derived from
those plays matched NBA's official boxscore exactly. The two rejections
were jump balls with a blank description.

If NBA changes its vocabulary, a new name is rejected as
`UNKNOWN_ACTION_TYPE` and named in `IngestionBatch.rejectionSummary` —
extend the translation table rather than widening the check.

Assist/steal/block credits are resolved by name: `PlayByPlayV3` gives the
assister only as a "(Name N AST)" suffix on the made shot. Names are matched
ignoring accents ("Jokic" in a credit is "Jokić" on the roster), honour the
first-name prefix NBA adds when teammates share a surname ("L. James",
"St. Curry"), and use team context when opponents do (an assist comes from
the shooter's team; a block or steal from the other side). A name that
still fits more than one player — two teammates with the same surname and
initial — is left uncounted rather than guessed; that player keeps their
boxscore figure. See `derive_player_game_stats.py`.

## Setup

```bash
cd apps/ingestion
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # point DATABASE_URL at your Postgres instance
```

## Run

```bash
python ingest.py
```

Safe to re-run: every write is an upsert keyed on the real NBA id
(`nbaTeamId`/`nbaPlayerId`/`nbaGameId`), so running it again refreshes
existing rows (rosters change, more recent games become available) rather
than creating duplicates.

### Options

```bash
python ingest.py --review                                   # land batches as PENDING_REVIEW
python ingest.py --season 2024-25                           # a season other than the default
python ingest.py --from-date 2026-04-14 --to-date 2026-04-18  # only games in this window
```

| Flag | Default | Effect |
|---|---|---|
| `--review` | off | Batches land as `PENDING_REVIEW` for approval in the admin Batches tab, instead of `COMPLETED`. The admin **Pull Data** button always passes this. |
| `--season` | `2025-26` | Which season to ingest, as `YYYY-YY`. |
| `--from-date` | none | Only games on or after this date (`YYYY-MM-DD`, inclusive). |
| `--to-date` | none | Only games on or before this date (`YYYY-MM-DD`, inclusive). |

Either date bound can be given alone. Malformed or inverted dates are
rejected at startup, before any API call. The admin Batches tab exposes the
same three options next to **Pull Data**.

**A windowed pull only pays for what it fetches.** With a date window:

- Games come from **one** leaguewide `LeagueGameLog` call, filtered to the
  window, instead of 30 per-team calls — and an older window can't miss
  games the way a "newest 15 per team" list would.
- Player bios are fetched **only for players who have never had one**
  (`birthDate` is null: new call-ups and signings), instead of all
  ~450-500 rostered players. Bios almost never change; refresh them all
  with an unwindowed pull or `backfill_player_bios.py`.
- Rosters (30 calls) still run in full, so traded and newly signed players
  are attached to the right team before their games are ingested.

On a database whose players already have bios, that leaves roughly 40
fixed calls — well under a minute at the 1s rate limit — plus about 2 calls
per game in the window (boxscore and play-by-play). That figure is an
estimate from the call budget.

The bio saving depends entirely on players already having bios. **Measured
on a fresh local database** (only the 14 seed players): a 14–18 April 2026
window, 10 games, took **16.9 minutes**, because rosters loaded 530 players
with no bios and every one of them was fetched. Expect that the first time
you pull into an empty or seed-only database; later pulls skip them.

Without a window, a pull behaves exactly as before.

### Pull worker (running pulls requested from the deployed site)

The deployed API can't reach stats.nba.com, so on the live site **Pull
Data** (and the admin pull schedule) don't run anything themselves — they
*queue* a pull. `pull_worker.py` runs those queued pulls from a machine that
can reach stats.nba.com:

```bash
python pull_worker.py            # keep running; checks for work every minute
python pull_worker.py --once     # run whatever is queued, then exit
python pull_worker.py --name home-pc   # how it appears on the admin page (default: hostname)
```

1. Point this folder's `.env` `DATABASE_URL` at the **same database the
   deployed API uses** — the worker reads the queue from it, and the pull
   writes its results there. **Only the `.env` file counts:** `db.py` loads
   it with `override=True` (see its comment for why), so a `DATABASE_URL`
   exported in your shell is ignored. The worker prints the database host
   it's using when it starts — check it.
2. Leave it running, or schedule `--once` (Windows Task Scheduler, cron) to
   run as often as you want queued pulls picked up.
3. Watch the **Pull queue** panel on the admin Batches tab: each request's
   status (queued, running, succeeded, failed, cancelled), which worker ran
   it, the tail of `ingest.py`'s output, and when a worker last checked in.

How it behaves:

- Each pull runs `ingest.py --review` with the request's season and dates,
  as its own process, so batches land as `PENDING_REVIEW` exactly as a pull
  started locally does.
- Two workers can safely run at once: claiming uses `FOR UPDATE SKIP LOCKED`,
  so a request is only ever taken by one.
- Only one pull is queued or running at a time; the admin page refuses
  another until it finishes or is cancelled. A queued pull can be cancelled
  from the admin page; a running one can't — it's on your machine.
- If the worker is stopped mid-pull, it marks that pull failed the next time
  it starts. A pull still marked running after 3 hours stops blocking new
  requests.

To try the whole flow locally:

1. **First point `apps/ingestion/.env` at your local database**, the same one
   `apps/api/.env` uses. If it still points at production, the worker will
   run production's queue, not the one you're testing — and a shell
   `DATABASE_URL` won't redirect it (see step 1 above).
2. Set `INGESTION_MODE="queue"` in `apps/api/.env` and restart the API; it
   then queues pulls instead of running them itself.
3. Queue a pull from the admin Batches tab, then run
   `python pull_worker.py --once` and confirm the startup line names your
   local database.

`test_pull_worker.py`'s database tests run only when
`INGESTION_TEST_DATABASE_URL` points at a disposable, migrated database —
e.g. the API's test database:

```bash
INGESTION_TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:55433/nba_analytics_test" python -m pytest test_pull_worker.py
```

### Single-phase scripts

Two phases can be run on their own against a database that already has
teams, rosters and games, so you don't pay for the whole pipeline to redo
one step:

```bash
python ingest_postseason.py       # play-in, playoffs and finals only (~5 min)
python backfill_advanced_stats.py # plus/minus, usage and ratings only (~seconds)
python backfill_player_bios.py    # CommonPlayerInfo bio fields only
```

`backfill_advanced_stats.py` fills the plus/minus and advanced-rating
columns on a database populated before those columns existed, including
production. Use it rather than re-running `ingest.py` for that purpose:
the regular-season phase is recency-windowed to each team's newest 15
games (~400 unique), so a re-run would leave the older two thirds of a
full season's ~1,240 games null forever. The backfill instead walks the
games already in the database. Deliberately does **not** touch the
offensive/defensive rebound split anymore — see its own module docstring
for why overwriting an event-derived split with the older leaguewide-feed
one would be a regression, not a backfill.

`ingest_postseason.py` is what to use when adding the postseason to a
database populated before `Game.seasonType` existed — including
production. It reads the team/player id maps straight out of the database
instead of re-fetching them, so it makes no calls beyond the postseason
data itself: 2 leaguewide `LeagueGameLog` calls plus ~90 boxscores.
Running the full `ingest.py` instead would re-fetch every player bio
(~450-500 calls) to reach the same result.

Existing regular-season rows are untouched either way — the migration
defaults them to `seasonType = REGULAR`, which is accurate, since they were
all ingested with `season_type_nullable="Regular Season"`.

After it finishes, re-run the downstream Python services so their outputs
reflect the real data instead of the old mock dataset:

```bash
cd ../predictor && python predict_games.py
cd ../optimizer && python predict.py && python optimize.py
```

## Market odds (second external API)

```bash
python fetch_market_odds.py
```

Fetches every upcoming NBA game's moneyline odds from
[The Odds API](https://the-odds-api.com/) (free tier, no card required —
500 credits/month; this script's single `regions=us&markets=h2h` request
costs a handful of credits, so even running it several times a day stays
comfortably inside the free tier) and stores a de-vigged,
bookmaker-averaged home win probability per game as `GameMarketOdds` — see
its schema doc comment and `fetch_market_odds.py`'s own module docstring
for the de-vig math and the team/game matching. This is the project's
second external API integration (the brief requirement `nba_api` alone
doesn't satisfy) and a genuine baseline for `predict_games.py`'s own
Elo-based win probability: a sportsbook's line is built from real money,
not this project's boxscore history, so it's a far more demanding "does
our model actually add anything" check than beating a coin flip.

Needs `ODDS_API_KEY` in `.env` — sign up free at the link above and copy
the key from your account page. Free-tier access only ever returns
current/upcoming lines (never historical closing lines), so this only
ever writes a snapshot for a game that hasn't been played yet, and simply
skips games it can't confidently match to one of its own upcoming rows.
Safe to re-run on a schedule (e.g. once or twice a day): re-running while
a game is still upcoming refreshes its snapshot with a fresher pre-tip-off
line; once the game is final, this script has nothing left to say about it
and leaves its row exactly as it was.
