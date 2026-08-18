# Predictor service

A small Python service, separate from the NestJS API, that predicts NBA
game outcomes:

1. **`elo.py`** — a FiveThirtyEight-style Elo rating system. Processes
   every completed game in chronological order, updating each team's
   rating after every result, and converts a rating gap (plus a fixed
   home-court-advantage bonus) into a home win probability via the
   standard logistic Elo formula. Needs only game results and scores — no
   boxscore data.
2. **`four_factors.py`** — predicts point margin (home minus away) from
   Dean Oliver's Four Factors methodology (*Basketball on Paper*), using 3
   of the 4 factors (effective FG%, turnover rate, free throw rate — see
   the module docstring for why offensive rebound rate and the defensive
   factors are left out). Fits an OLS regression once there's enough game
   history (`MINIMUM_GAMES_FOR_REGRESSION`), otherwise falls back to fixed,
   literature-informed weights rather than presenting an overfit
   regression as reliable.
3. **`predict_games.py`** — the orchestrator. Runs both models and writes
   one `GamePrediction` row per game (both completed and upcoming), into
   the same Postgres database Prisma/NestJS manages. NestJS only ever
   *reads* this table, via `GET /v1/games/:id/prediction`.

## Honest limitations (read before trusting the numbers)

This project's seed data is tiny — 4 teams, ~6 games each. Two things fall
out of that, on purpose, not as bugs:

- **Elo barely moves.** With only 6 games per team, ratings stay close to
  the 1500 starting point; predictions will look close to 50/50 (plus
  home-court advantage) for almost every matchup. Elo needs many games to
  produce a meaningfully differentiated rating.
- **The margin model uses the heuristic fallback, not a fitted
  regression.** 12 total games isn't enough to fit a 3-feature OLS
  regression without overfitting, so `four_factors.py` uses fixed weights
  instead (see its module docstring). `GamePrediction.marginMethod` records
  which path produced a given prediction (`"heuristic"` vs `"regression"`)
  so this is never silently hidden from anything reading the table.

Both of these improve automatically once more real game history exists
(see the root `PROJECT_OVERVIEW.md`'s note on the planned `nba_api`
ingestion pipeline) — no code change needed, just more rows in `Game` and
`PlayerGameStat`.

## Setup

```bash
cd apps/predictor
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # point DATABASE_URL at your Postgres instance
```

## Run

```bash
python predict_games.py   # writes one GamePrediction row per game
```

Run again any time the underlying game data changes (e.g. after
reseeding, or once new games are added to the schedule).
