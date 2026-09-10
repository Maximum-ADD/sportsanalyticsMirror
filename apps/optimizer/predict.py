"""Predicts each player's next-game DraftKings-style fantasy points.

Deliberately simple: an exponentially recency-weighted average of each
player's own past fantasy-point games (more recent games count more). With
this project's current mock data (a handful of players, ~6 games each)
that's an honest, explainable "prediction" — a full regression model over
opponent strength, home/away, minutes trend etc. needs far more history per
player than exists yet. This becomes the natural next step once the real
nba_api ingestion pipeline is in place (see PROJECT_OVERVIEW.md's known
gaps) and there's enough games per player for that to mean something.

A simple opponent-defense adjustment was tried and backtested against a
full season (scaling this prediction by the ratio of the upcoming
opponent's leak-free running points-allowed average to the leaguewide
average at that point in the season) and deliberately left out: it
improved MAE by only 0.006 fantasy points over the full season and the
edge did not reliably hold on a chronological validation split (see
docs/reports for the full write-up). Team-level points-allowed only spans
about +/-9% across the whole league, which is too small a signal relative
to a single player's game-to-game variance (RMSE ~10 fantasy points here)
to move individual predictions meaningfully. A position-specific or
per-player opponent adjustment might do better, but wasn't justified by
this result — revisit if a stronger opponent-strength signal becomes
available (e.g. defensive rating by position, not just team-wide).

Minutes-aware prediction (predicting minutes and points-per-minute
separately, both via the same recency-weighting technique below, then
multiplying, instead of averaging fantasy points directly) was also
backtested and not shipped: -0.008 MAE full-season, +0.004 on a
chronological validation split — inconsistent, and RMSE was worse than the
plain average in both cases (two multiplied noisy estimates compounding
their error), unlike a simple average's single source of noise. See
apps/api/src/games/game-detail.service.ts's matching note — the same idea
was tried there too, where an initial backtest looked like a clean win
before a bug in how the backtest handled DNP (0-minute) games was found
and corrected, after which the edge vanished.

A DIFFERENT minutes signal was tried next and shipped:
calculate_minutes_trend_adjustment below nudges the plain recency-weighted
prediction by a small amount based on whether a player's minutes have
recently trended away from their own longer-run baseline (new starter,
back from injury, etc.) — rather than replacing the prediction with a
minutes*rate multiply the way the rejected attempt above did. Backtested
on a chronological train/validation split: a consistent MAE improvement on
both a 70/30 and 60/40 split (+0.0149 / +0.0208 full-validation-set edge),
notably larger on players with an actual minutes swing specifically
(+0.0672 / +0.0796 edge on |trend ratio - 1| > 0.3), with the same winning
ADJUSTMENT_STRENGTH (0.15) on both splits. The same adjustment was also
tried on apps/api/src/games/game-detail.service.ts's scorer-points
predictor and NOT shipped there — its edge was negligible to zero (one
split's grid search picked strength=0.0 as optimal), plausibly because
that predictor's capped 10-game window is already more locally responsive
to minutes changes than this predictor's unbounded window, leaving less
room for a separate trend signal to add. See docs/reports for the full
write-up.

Writes one PlayerPrediction row per player with stats. Salary is a
synthetic DFS-style cost derived from the same prediction — there's no
public API for real DraftKings/FanDuel pricing.
"""

import uuid

from db import get_connection

# DraftKings' published NBA classic scoring rules.
POINTS_WEIGHT = 1.0
THREE_MADE_WEIGHT = 0.5
REBOUND_WEIGHT = 1.25
ASSIST_WEIGHT = 1.5
STEAL_WEIGHT = 2.0
BLOCK_WEIGHT = 2.0
TURNOVER_WEIGHT = -0.5
DOUBLE_DOUBLE_BONUS = 1.5
TRIPLE_DOUBLE_BONUS = 3.0
DOUBLE_DOUBLE_THRESHOLD = 10

# More recent games are weighted higher; this is the decay per game going
# backwards from the most recent one (0.8 == each game back counts 80% as
# much as the one after it).
RECENCY_DECAY = 0.8

# Minutes-trend adjustment (see module docstring for the backtest behind
# these values): compares a player's mean minutes over their last
# MINUTES_TREND_RECENT_WINDOW games against their last
# MINUTES_TREND_BASELINE_WINDOW games, and nudges the fantasy-point
# prediction by MINUTES_TREND_ADJUSTMENT_STRENGTH times that ratio's
# deviation from 1.0 (clamped to +/-MINUTES_TREND_DEVIATION_CAP so one
# extreme recent game can't dominate). A player whose minutes just went up
# gets a small upward nudge on top of the existing recency-weighted
# prediction; a player whose minutes just went down gets a small downward
# one. Requires at least MINUTES_TREND_BASELINE_WINDOW games of history —
# a player with less is left unadjusted (trend is undefined with too
# little baseline to compare against).
MINUTES_TREND_RECENT_WINDOW = 3
MINUTES_TREND_BASELINE_WINDOW = 10
MINUTES_TREND_ADJUSTMENT_STRENGTH = 0.15
MINUTES_TREND_DEVIATION_CAP = 1.0

# Calibrated so this mock dataset's predicted-points range (roughly 20-45)
# maps onto a DraftKings-like salary spread ($4,000-$10,500), not derived
# from any real pricing model.
SALARY_BASE_IN_DOLLARS = 3000
SALARY_PER_PREDICTED_POINT = 160
SALARY_FLOOR_IN_DOLLARS = 3000
SALARY_CEILING_IN_DOLLARS = 11000
SALARY_ROUNDING_INCREMENT_IN_DOLLARS = 100

PREDICTED_POINTS_DECIMAL_PLACES = 2


def calculate_fantasy_points(stat_line: dict) -> float:
    """Scores one boxscore row under DraftKings' NBA classic rules.

    stat_line must have points/rebounds/assists/steals/blocks/turnovers/
    threesMade keys (a row from PlayerGameStat). Returns the DraftKings
    fantasy-point value for that single game, including the double-double/
    triple-double bonus if earned.
    """
    categories_over_10 = sum(
        1
        for value in (
            stat_line["points"],
            stat_line["rebounds"],
            stat_line["assists"],
            stat_line["steals"],
            stat_line["blocks"],
        )
        if value >= DOUBLE_DOUBLE_THRESHOLD
    )
    bonus = 0.0
    if categories_over_10 >= 3:
        bonus = TRIPLE_DOUBLE_BONUS
    elif categories_over_10 >= 2:
        bonus = DOUBLE_DOUBLE_BONUS

    return (
        stat_line["points"] * POINTS_WEIGHT
        + stat_line["threesMade"] * THREE_MADE_WEIGHT
        + stat_line["rebounds"] * REBOUND_WEIGHT
        + stat_line["assists"] * ASSIST_WEIGHT
        + stat_line["steals"] * STEAL_WEIGHT
        + stat_line["blocks"] * BLOCK_WEIGHT
        + stat_line["turnovers"] * TURNOVER_WEIGHT
        + bonus
    )


def calculate_recency_weighted_average(fantasy_points_oldest_first: list[float]) -> float:
    """Averages a player's past fantasy-point games, weighting recent ones more.

    fantasy_points_oldest_first must already be in chronological order
    (oldest game first). Returns 0.0 for an empty list rather than raising,
    since a player with no games yet is a normal case, not an error.
    """
    if not fantasy_points_oldest_first:
        return 0.0

    weight = 1.0
    weighted_sum = 0.0
    total_weight = 0.0
    for points in reversed(fantasy_points_oldest_first):
        weighted_sum += points * weight
        total_weight += weight
        weight *= RECENCY_DECAY

    return weighted_sum / total_weight


def calculate_minutes_trend_ratio(minutes_oldest_first: list[int]) -> float | None:
    """Ratio of a player's recent mean minutes to their longer-run baseline
    mean minutes. Returns None if there's less than
    MINUTES_TREND_BASELINE_WINDOW games of history, or if the baseline
    mean is 0 (no minutes played at all in that window — an undefined
    trend, not an infinite one), matching predict_margin's None-
    propagation convention in four_factors.py for "not enough data yet."
    """
    if len(minutes_oldest_first) < MINUTES_TREND_BASELINE_WINDOW:
        return None
    baseline_window = minutes_oldest_first[-MINUTES_TREND_BASELINE_WINDOW:]
    recent_window = minutes_oldest_first[-MINUTES_TREND_RECENT_WINDOW:]
    baseline_mean = sum(baseline_window) / len(baseline_window)
    if baseline_mean == 0:
        return None
    recent_mean = sum(recent_window) / len(recent_window)
    return recent_mean / baseline_mean


def apply_minutes_trend_adjustment(predicted_points: float, trend_ratio: float | None) -> float:
    """Nudges a recency-weighted fantasy-point prediction by a small amount
    based on how far a player's minutes trend ratio deviates from 1.0 (see
    module docstring for the backtest behind this). trend_ratio=None
    (not enough history to compute a trend) leaves the prediction
    unchanged.
    """
    if trend_ratio is None:
        return predicted_points
    deviation = max(-MINUTES_TREND_DEVIATION_CAP, min(MINUTES_TREND_DEVIATION_CAP, trend_ratio - 1.0))
    return predicted_points * (1.0 + MINUTES_TREND_ADJUSTMENT_STRENGTH * deviation)


def calculate_salary(predicted_points: float) -> int:
    """Derives a synthetic DFS-style salary from a predicted-points value.

    Rounds to the nearest SALARY_ROUNDING_INCREMENT_IN_DOLLARS and clamps
    to [SALARY_FLOOR_IN_DOLLARS, SALARY_CEILING_IN_DOLLARS].
    """
    raw = SALARY_BASE_IN_DOLLARS + predicted_points * SALARY_PER_PREDICTED_POINT
    rounded = round(raw / SALARY_ROUNDING_INCREMENT_IN_DOLLARS) * SALARY_ROUNDING_INCREMENT_IN_DOLLARS
    return max(SALARY_FLOOR_IN_DOLLARS, min(SALARY_CEILING_IN_DOLLARS, rounded))


def fetch_game_logs(cursor) -> dict[str, dict[str, list]]:
    """Reads every player's boxscore rows and scores each game.

    Returns a dict of playerId -> {"fantasy_points": [...], "minutes": [...]},
    both oldest game first (the ordering calculate_recency_weighted_average
    and calculate_minutes_trend_ratio require) and index-aligned (game i's
    fantasy points and minutes are the same game for both lists).
    """
    cursor.execute(
        """
        SELECT p."id" AS player_id, pgs.points, pgs.rebounds, pgs.assists,
               pgs.steals, pgs.blocks, pgs.turnovers, pgs."threesMade",
               pgs.minutes, g."gameDate"
        FROM "Player" p
        JOIN "PlayerGameStat" pgs ON pgs."playerId" = p."id"
        JOIN "Game" g ON g."id" = pgs."gameId"
        ORDER BY p."id", g."gameDate" ASC
        """
    )
    game_logs: dict[str, dict[str, list]] = {}
    for row in cursor.fetchall():
        player_log = game_logs.setdefault(row["player_id"], {"fantasy_points": [], "minutes": []})
        player_log["fantasy_points"].append(calculate_fantasy_points(row))
        player_log["minutes"].append(row["minutes"])
    return game_logs


def save_predictions(cursor, predictions: list[tuple[str, float, int]]) -> None:
    """Writes one PlayerPrediction row per (playerId, predictedPoints, salary) tuple."""
    for player_id, predicted_points, salary in predictions:
        cursor.execute(
            """
            INSERT INTO "PlayerPrediction" ("id", "playerId", "predictedFantasyPoints", "salary")
            VALUES (%s, %s, %s, %s)
            """,
            (str(uuid.uuid4()), player_id, predicted_points, salary),
        )


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            game_logs = fetch_game_logs(cursor)

            predictions = []
            for player_id, player_log in game_logs.items():
                baseline_points = calculate_recency_weighted_average(player_log["fantasy_points"])
                trend_ratio = calculate_minutes_trend_ratio(player_log["minutes"])
                predicted_points = round(
                    apply_minutes_trend_adjustment(baseline_points, trend_ratio), PREDICTED_POINTS_DECIMAL_PLACES
                )
                predictions.append((player_id, predicted_points, calculate_salary(predicted_points)))

            save_predictions(cursor, predictions)

        connection.commit()
        print(f"Wrote {len(game_logs)} player predictions.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
