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
4. **`check_accuracy.py`** — read-only accuracy monitor. Backtests both
   models against whatever completed games are currently in the database
   (Brier score / accuracy for Elo, MAE for Four Factors, each compared
   against a naive baseline) and prints a summary. Writes nothing — safe to
   run any time, and worth re-running after a batch of new games/results
   lands to catch model drift.
5. **`ingest_historical_season.py`** (in `apps/ingestion`) — pulls one
   fully completed prior season's games/boxscores (not capped at a
   recent-N window the way the current season's pull is, and deliberately
   not touching rosters — see its module docstring). This is how the
   dataset below grew from one season to three.

## Accuracy (read before trusting the numbers)

With three full seasons of real data now loaded (2023-24, 2024-25,
2025-26 — ~3,780 games, 30 teams, ~83,000 player-game rows), both models
have been properly backtested — walk-forward, against realized outcomes,
with permutation tests establishing the results aren't chance. Full
methodology: `docs/reports/prediction-accuracy-report.pdf` (single-season
baseline), `-v2.pdf` (first round of follow-up tuning attempts), `-v3.pdf`
(multi-season data pull + the Elo HCA/K re-tuning that came from it), and
`-v4.pdf` (the season-boundary reset covered below), same directory.
Current headline numbers (re-run via `check_accuracy.py` against the live
database, not stale copy):

- **Elo win probability**: Brier score 0.2130 vs. 0.25 for a coin flip.
  `HOME_COURT_ADVANTAGE_ELO` (40) and `K_FACTOR` (25) are tuned against
  this project's own 3-season data — a single season's data couldn't beat
  the FiveThirtyEight-derived defaults (75/20) on held-out validation
  (overfitting), but three seasons' worth could, confirmed across two
  validation splits. `SEASON_RESET_FRACTION` (0.5) regresses every team's
  rating halfway back toward the 1500 starting point at each season
  boundary (trades/draft/free agency shift a roster without fully
  resetting it) — validated separately from the HCA/K tuning (those held
  fixed while only the reset fraction was searched), confirmed on 19 of 20
  randomized validation splits and a permutation test (p<0.001). See
  `elo.py`'s module docstring for the full tuning history of both. Elo
  calibration is also meaningfully better than the single-season report's
  numbers — the earlier overconfidence in the 0.2-0.5 predicted-probability
  range is largely gone.
- **Four Factors margin**: 12.30 points MAE vs. 12.91 for the naive
  "always predict the leaguewide average margin" baseline — still a
  modest edge (statistically real, permutation-tested), improved slightly
  from the single-season number but not transformed by more data the way
  Elo was. Frontend surfaces label this "low confidence" and visually
  de-emphasize it relative to win probability.
- **Player-point predictors** (`apps/optimizer/predict.py`'s fantasy
  points, `game-detail.service.ts`'s scorer points): recency-weighting's
  edge over a naive running mean roughly *doubled* with more data (fantasy
  points: +0.52 -> +0.94 MAE edge; scorer points: +0.20 -> +0.36) — with
  more career-length history per player, an unweighted mean gets diluted
  by increasingly stale games while the recency-weighted version keeps
  tracking current form, so the gap between them widens rather than
  narrows as more data comes in.
- The regression path (`fit_or_fallback_margin_model`'s fitted-OLS branch)
  is what actually runs in production — the heuristic fallback is now a
  cold-start path for a near-empty database, not the common case.
- `PlayerGameStat.teamId` (the team a player suited up for in a specific
  game, not their current roster team) was added to fix a real
  correctness bug: the query `four_factors.py` used to join on
  `Player.teamId` silently misattributed every traded player's past games
  to whichever team they play for now (~7.7% of rows, confirmed live).
  Backtested impact was small (12.52 -> 12.51 MAE on the original
  single-season data) since the schema fix and the data-volume increase
  are separate changes, but it matters more with real multi-season trade
  history now loaded, and was worth fixing on correctness grounds alone.
- An opponent-defense adjustment for the player-point predictors, and a
  minutes-aware prediction variant, were both backtested and found not to
  help enough to justify shipping — see `predict.py`/
  `game-detail.service.ts`'s module comments for the full results
  (including one case where an initial "win" turned out to be a bug in
  the backtest script itself, caught before shipping).

Run `python check_accuracy.py` any time to see these numbers recomputed
against the database's current state, rather than relying on the
point-in-time numbers above.

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
