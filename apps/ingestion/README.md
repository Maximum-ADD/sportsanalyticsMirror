# Ingestion service

A small Python service, separate from the NestJS API, that pulls **real**
NBA data from [`nba_api`](https://github.com/swar/nba_api) (a wrapper
around stats.nba.com's endpoints) and writes it into the same Postgres
database Prisma/NestJS manages: all 30 current NBA teams, their current
rosters, each team's ~15 most recent games with real per-player boxscores,
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

**Expect this to take 25-35 minutes.** Teams are free (bundled static
data), rosters are 30 calls, player bios are the largest phase by call
count, and boxscores are the bulk of the remaining runtime — see
`ingest.py`'s module docstring for the exact call-budget breakdown. The
postseason phase adds roughly 5 minutes: 2 leaguewide `LeagueGameLog`
calls for the game ids, then ~90 boxscores.

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

### Single-phase scripts

Two phases can be run on their own against a database that already has
teams, rosters and games, so you don't pay for the whole pipeline to redo
one step:

```bash
python ingest_postseason.py     # play-in, playoffs and finals only (~5 min)
python backfill_player_bios.py  # CommonPlayerInfo bio fields only
```

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
