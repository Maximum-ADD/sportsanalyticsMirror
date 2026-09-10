"""Computes FiveThirtyEight-style Elo ratings and home win probability.

Deliberately the simplest model that's still principled: Elo only needs
Game.homeScore/awayScore/homeTeamId/awayTeamId history, no boxscore data.
Margin-of-victory K-scaling (weighting blowouts more than close wins, as
FiveThirtyEight's real NBA Elo does) remains a documented future step, not
implemented here.

K_FACTOR and HOME_COURT_ADVANTAGE_ELO below are tuned against this
project's own data, not literature defaults. History of that tuning:

- With a single season loaded (~1,300 games), a chronological 70/30
  train/validation grid search found a "best" (HCA, K) pair on the
  training split that validated *worse* than the FiveThirtyEight-derived
  defaults (HCA=75, K=20) on held-out data — a classic overfitting
  signature. One season wasn't enough evidence to beat a well-chosen
  prior, so the defaults were kept.
- With three seasons loaded (~3,780 games: 2023-24, 2024-25, 2025-26 —
  see apps/ingestion/ingest_historical_season.py), the same grid search
  was re-run and this time the winner (HCA=40, K=25) DID validate better
  than the defaults, confirmed two ways: stable across a wide grid
  (HCA 0-110, K 5-45, not sitting at either boundary) AND consistent
  across two different chronological train/validation split points
  (70/30: 0.2119 vs 0.2142 Brier; 60/40: 0.2101 vs 0.2123 Brier — tuned
  wins both times). This is what's shipped below. See docs/reports for
  the full grid-search writeup and both rounds' numbers.

Season-boundary reset: whenever a game's season differs from the
previous game's, every team's current rating regresses
SEASON_RESET_FRACTION of the way back toward STARTING_ELO before that
game (and the rest of the new season) is processed — the standard Elo
practice (FiveThirtyEight's own NBA model does this) of treating team
strength as partially, not fully, resetting over an NBA offseason
(trades, draft, free agency shift a roster without erasing everything
about it). Backtested the same way as HCA/K above, with those already-
tuned constants held fixed so this experiment isolated the reset
mechanism as its own variable: SEASON_RESET_FRACTION=0.5 beat no reset on
both the 70/30 and 60/40 validation splits (0.2092 vs 0.2119, and 0.2076
vs 0.2101 Brier), on 19 of 20 randomized split points spanning a wide
train-fraction range, and against a permutation-test null (p<0.001). A
full grid sweep from 0.0 (no reset, the previous behavior) to 1.0 (full
reset to STARTING_ELO) found the two validation splits' best individual
points didn't exactly agree (0.40 vs 0.45, with Brier still improving
some way past that toward ~0.5-0.7 before reversing on both) — 0.5 is the
value both splits' near-optimal regions overlap on, not either split's
single sharpest point, since the exact optimum wasn't sharply
identifiable and 0.5 generalized best across the robustness checks above.
See docs/reports for the full write-up.
"""

STARTING_ELO = 1500.0

# See module docstring's "Season-boundary reset" section for the full
# backtest. 0.0 would reproduce the pre-this-change behavior exactly
# (games treated as one continuous sequence with no reset).
SEASON_RESET_FRACTION = 0.5

# Grid-searched against this project's own 3-season dataset (~3,780 games)
# via a chronological train/validation split, confirmed to beat the
# FiveThirtyEight literature default (K=20) on two different held-out
# splits — see module docstring for the full tuning history.
K_FACTOR = 25.0

# Home-court advantage, expressed directly as Elo points added to the home
# team's rating before computing win probability. Grid-searched against
# this project's own 3-season dataset, confirmed to beat the
# FiveThirtyEight-derived literature default (HCA=75) on two different
# held-out splits — see module docstring for the full tuning history.
HOME_COURT_ADVANTAGE_ELO = 40.0

# The divisor in the logistic win-probability formula. 400 is the standard
# Elo constant (chosen historically so a 400-point rating gap implies a
# 10:1 win probability) and not something this project has reason to retune.
ELO_DIVISOR = 400.0


def expected_win_probability(elo_home: float, elo_away: float) -> float:
    """FiveThirtyEight-style logistic win-probability formula, home team's perspective.

    P(home wins) = 1 / (1 + 10^(-((elo_home + HCA - elo_away)) / 400))
    """
    rating_diff = (elo_home + HOME_COURT_ADVANTAGE_ELO) - elo_away
    return 1.0 / (1.0 + 10 ** (-rating_diff / ELO_DIVISOR))


def update_elo(rating: float, actual_result: float, expected_result: float) -> float:
    """One Elo update: R' = R + K * (actual - expected).

    actual_result is 1.0 for a win, 0.0 for a loss (no draws in the NBA).
    """
    return rating + K_FACTOR * (actual_result - expected_result)


def fetch_completed_games_chronological(cursor) -> list[dict]:
    """Reads every played game (both scores present) oldest game first.

    Chronological order is required by compute_elo_ratings, which processes
    games as a single forward pass, updating a running rating dict — Elo is
    inherently sequential (each game's rating update depends on the state
    left by the previous one), unlike the per-player independence
    predict.py's recency-weighted average relies on. season is included so
    compute_elo_ratings can detect and apply the season-boundary reset (see
    module docstring).
    """
    cursor.execute(
        """
        SELECT g."id" AS game_id, g."homeTeamId" AS home_team_id,
               g."awayTeamId" AS away_team_id, g."homeScore" AS home_score,
               g."awayScore" AS away_score, g."gameDate" AS game_date,
               g."season" AS season
        FROM "Game" g
        WHERE g."homeScore" IS NOT NULL AND g."awayScore" IS NOT NULL
        ORDER BY g."gameDate" ASC
        """
    )
    return cursor.fetchall()


def fetch_upcoming_games(cursor) -> list[dict]:
    """Reads every scheduled-but-not-yet-played game (either score missing).

    season is included so predict_upcoming_games can apply a season-
    boundary reset for upcoming games whose season hasn't been reached yet
    by any completed game (e.g. predicting the first games of a new season
    before any of them have been played) — see its own docstring.
    """
    cursor.execute(
        """
        SELECT g."id" AS game_id, g."homeTeamId" AS home_team_id,
               g."awayTeamId" AS away_team_id, g."season" AS season
        FROM "Game" g
        WHERE g."homeScore" IS NULL OR g."awayScore" IS NULL
        """
    )
    return cursor.fetchall()


def _apply_season_reset(ratings: dict[str, float]) -> None:
    """Regresses every team's current rating SEASON_RESET_FRACTION of the
    way back toward STARTING_ELO, in place. Called whenever a season
    boundary is crossed — see module docstring."""
    for team_id in list(ratings.keys()):
        ratings[team_id] = ratings[team_id] + SEASON_RESET_FRACTION * (STARTING_ELO - ratings[team_id])


def compute_elo_ratings(games_chronological: list[dict]) -> tuple[dict[str, float], dict[str, dict], str | None]:
    """Single forward pass over every completed game, updating a running Elo dict.

    Applies the season-boundary reset (see module docstring) whenever a
    game's season differs from the previous game's, before that game (and
    the rest of its season) is processed. A team with no rating yet (first
    game ever, still at the STARTING_ELO default) is unaffected by this,
    since regressing 1500 toward 1500 is a no-op.

    Returns (final_ratings, pre_game_state, final_season):
    - final_ratings: teamId -> its Elo rating after the last game in the input.
    - pre_game_state: gameId -> {home_elo_pre, away_elo_pre, home_win_probability},
      the rating/probability snapshot *before* that game was applied — the
      correct predictive quantity for a completed game, since using the
      post-game rating would leak the very outcome being predicted.
    - final_season: the season of the last game processed (None if
      games_chronological was empty) — predict_upcoming_games needs this to
      know whether an upcoming game's season is itself a new boundary that
      hasn't been crossed yet by any completed game.
    """
    ratings: dict[str, float] = {}
    pre_game_state: dict[str, dict] = {}
    previous_season: str | None = None

    for game in games_chronological:
        if previous_season is not None and game["season"] != previous_season:
            _apply_season_reset(ratings)
        previous_season = game["season"]

        home_id, away_id = game["home_team_id"], game["away_team_id"]
        elo_home = ratings.get(home_id, STARTING_ELO)
        elo_away = ratings.get(away_id, STARTING_ELO)

        home_win_probability = expected_win_probability(elo_home, elo_away)
        pre_game_state[game["game_id"]] = {
            "home_elo_pre": elo_home,
            "away_elo_pre": elo_away,
            "home_win_probability": home_win_probability,
        }

        home_won = 1.0 if game["home_score"] > game["away_score"] else 0.0
        ratings[home_id] = update_elo(elo_home, home_won, home_win_probability)
        ratings[away_id] = update_elo(elo_away, 1.0 - home_won, 1.0 - home_win_probability)

    return ratings, pre_game_state, previous_season


def predict_upcoming_games(upcoming_games: list[dict], final_ratings: dict[str, float], final_completed_season: str | None) -> dict[str, dict]:
    """Predicts every not-yet-played game from each team's current Elo rating.

    If every completed game so far belongs to an earlier season than an
    upcoming game (e.g. predicting the first games of a new season before
    any of them have been played), applies the same season-boundary reset
    compute_elo_ratings would have applied had that first new-season game
    already been played — otherwise a new season's very first predictions
    would use stale, un-reset ratings until the first real result came in
    and triggered the reset organically. Applied at most once here (all
    upcoming games are assumed to share one season, true for a normal
    schedule — NBA seasons don't interleave).

    Returns gameId -> {home_elo_pre, away_elo_pre, home_win_probability}, the
    same shape as compute_elo_ratings' pre_game_state, so both completed and
    upcoming games can be written through one save path. Teams with no
    completed games yet default to STARTING_ELO, same as mid-pass.
    """
    ratings = dict(final_ratings)
    if (
        final_completed_season is not None
        and upcoming_games
        and upcoming_games[0]["season"] != final_completed_season
    ):
        _apply_season_reset(ratings)

    predictions: dict[str, dict] = {}
    for game in upcoming_games:
        elo_home = ratings.get(game["home_team_id"], STARTING_ELO)
        elo_away = ratings.get(game["away_team_id"], STARTING_ELO)
        predictions[game["game_id"]] = {
            "home_elo_pre": elo_home,
            "away_elo_pre": elo_away,
            "home_win_probability": expected_win_probability(elo_home, elo_away),
        }
    return predictions
