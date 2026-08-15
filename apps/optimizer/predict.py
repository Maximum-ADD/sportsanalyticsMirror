"""Predicts each player's next-game DraftKings-style fantasy points.

Deliberately simple: an exponentially recency-weighted average of each
player's own past fantasy-point games (more recent games count more). With
this project's current mock data (a handful of players, ~6 games each)
that's an honest, explainable "prediction" — a full regression model over
opponent strength, home/away, minutes trend etc. needs far more history per
player than exists yet. This becomes the natural next step once the real
nba_api ingestion pipeline is in place (see PROJECT_OVERVIEW.md's known
gaps) and there's enough games per player for that to mean something.

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


def calculate_salary(predicted_points: float) -> int:
    """Derives a synthetic DFS-style salary from a predicted-points value.

    Rounds to the nearest SALARY_ROUNDING_INCREMENT_IN_DOLLARS and clamps
    to [SALARY_FLOOR_IN_DOLLARS, SALARY_CEILING_IN_DOLLARS].
    """
    raw = SALARY_BASE_IN_DOLLARS + predicted_points * SALARY_PER_PREDICTED_POINT
    rounded = round(raw / SALARY_ROUNDING_INCREMENT_IN_DOLLARS) * SALARY_ROUNDING_INCREMENT_IN_DOLLARS
    return max(SALARY_FLOOR_IN_DOLLARS, min(SALARY_CEILING_IN_DOLLARS, rounded))


def fetch_game_logs(cursor) -> dict[str, list[float]]:
    """Reads every player's boxscore rows and scores each game.

    Returns a dict of playerId -> that player's fantasy points per game,
    oldest game first (the ordering calculate_recency_weighted_average
    requires).
    """
    cursor.execute(
        """
        SELECT p."id" AS player_id, pgs.points, pgs.rebounds, pgs.assists,
               pgs.steals, pgs.blocks, pgs.turnovers, pgs."threesMade",
               g."gameDate"
        FROM "Player" p
        JOIN "PlayerGameStat" pgs ON pgs."playerId" = p."id"
        JOIN "Game" g ON g."id" = pgs."gameId"
        ORDER BY p."id", g."gameDate" ASC
        """
    )
    game_logs: dict[str, list[float]] = {}
    for row in cursor.fetchall():
        game_logs.setdefault(row["player_id"], []).append(calculate_fantasy_points(row))
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
            for player_id, games in game_logs.items():
                predicted_points = round(
                    calculate_recency_weighted_average(games), PREDICTED_POINTS_DECIMAL_PLACES
                )
                predictions.append((player_id, predicted_points, calculate_salary(predicted_points)))

            save_predictions(cursor, predictions)

        connection.commit()
        print(f"Wrote {len(game_logs)} player predictions.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
