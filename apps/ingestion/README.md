# Ingestion service

A small Python service, separate from the NestJS API, that pulls **real**
NBA data from [`nba_api`](https://github.com/swar/nba_api) (a wrapper
around stats.nba.com's endpoints) and writes it into the same Postgres
database Prisma/NestJS manages: all 30 current NBA teams, their current
rosters, and each team's ~15 most recent games with real per-player
boxscores.

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

**Expect this to take 10-15 minutes.** Teams are free (bundled static
data), rosters are 30 calls, and boxscores are the bulk of the runtime —
see `ingest.py`'s module docstring for the exact call-budget breakdown.

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

After it finishes, re-run the downstream Python services so their outputs
reflect the real data instead of the old mock dataset:

```bash
cd ../predictor && python predict_games.py
cd ../optimizer && python predict.py && python optimize.py
```
