"""Prices every self-reported season against the NBA rookie salary scale.

Run after prospects have logged games:

    python value_prospects.py

Writes one ProspectValuation row per qualifying season. NestJS only ever reads
that table — the same arrangement apps/predictor and apps/optimizer have.

The pipeline, in order:

 1. Read every drafted NBA player's ROOKIE season production and the pick they
    were taken at, and fit draft slot against it (draft_slot_model.py — see its
    docstring for what that inversion does and does not claim).
 2. For each prospect season with at least MINIMUM_GAMES_REQUIRED logged games,
    derive its season line from the per-game rows, apply the competition-level
    factor (level_factors.py), and project a slot.
 3. Look the slot up in the published rookie scale (rookie_scale.py) and write
    the figure, an honest interval around it, the level factor with its stated
    basis, the model's own accuracy, and the closest NBA comparables.

A season below the floor still gets a row, with NULL figures. That is
deliberate: the API needs to distinguish "not valued yet" from "valued at
nothing", and a missing row cannot carry a model version or a scale year.

No language model is involved anywhere in this path.
"""

import json
import uuid

import numpy as np

from db import get_connection
from draft_slot_model import (
    MINIMUM_ROOKIE_GAMES,
    build_feature_row,
    describe_drivers,
    fit_slot_model,
    project_slot,
    value_interval,
)
from level_factors import factor_for
from rookie_scale import ROOKIE_SCALE_YEAR, value_for_slot

# Must match MINIMUM_GAMES_REQUIRED in
# apps/api/src/become-pro/prospect-ranking.ts. The API is the source of truth
# for who appears on the board; this constant only decides who gets a FIGURE,
# and the two must agree or a prospect could be ranked without a valuation.
MINIMUM_GAMES_REQUIRED = 10

MODEL_VERSION = "prospect-value-1.0.0"

# How many NBA players to offer as comparables per prospect.
COMPARABLE_COUNT = 3
# How many players actually drafted at the projected slot to name.
SLOT_ALUMNI_COUNT = 3

FREE_THROW_POSSESSION_WEIGHT = 0.44
POINTS_PER_SCORING_POSSESSION = 2


def true_shooting(points: float, field_goals_attempted: float, free_throws_attempted: float) -> float:
    """TS% from totals, matching the API's own derivation exactly.

    The same formula and the same zero-attempt behaviour as
    apps/api/src/players/season-averages.ts. A prospect's efficiency has to be
    computed the same way an NBA player's is, or the comparison the whole
    feature rests on is between two different measurements.
    """
    attempts = field_goals_attempted + FREE_THROW_POSSESSION_WEIGHT * free_throws_attempted
    if attempts == 0:
        return 0.0
    return round((points / (POINTS_PER_SCORING_POSSESSION * attempts)) * 100, 1)


def fetch_rookie_training_rows(cursor) -> list[dict]:
    """Every drafted player's rookie-season production, with their pick.

    The rookie season is taken as the EARLIEST league year the player has
    games in — this database does not store a career start date, and for a
    drafted player the first season on record is their rookie year.
    """
    cursor.execute(
        """
        WITH rookie_season AS (
            SELECT p."id" AS player_id,
                   p."draftNumber" AS draft_number,
                   MIN(g."season") AS season
            FROM "Player" p
            JOIN "PlayerGameStat" pgs ON pgs."playerId" = p."id"
            JOIN "Game" g ON g."id" = pgs."gameId"
            WHERE p."draftNumber" IS NOT NULL
              AND p."draftYear" IS NOT NULL
              AND g."seasonType" = 'REGULAR'
            GROUP BY p."id", p."draftNumber"
        )
        SELECT rs.player_id,
               rs.draft_number,
               COUNT(*) AS games,
               AVG(pgs.points) AS points_per_game,
               AVG(pgs.rebounds) AS rebounds_per_game,
               AVG(pgs.assists) AS assists_per_game,
               SUM(pgs.points) AS total_points,
               SUM(pgs."fieldGoalsAttempted") AS total_fga,
               SUM(pgs."freeThrowsAttempted") AS total_fta
        FROM rookie_season rs
        JOIN "PlayerGameStat" pgs ON pgs."playerId" = rs.player_id
        JOIN "Game" g ON g."id" = pgs."gameId"
        WHERE g."season" = rs.season AND g."seasonType" = 'REGULAR'
        GROUP BY rs.player_id, rs.draft_number
        HAVING COUNT(*) >= %(minimum_games)s
        """,
        {"minimum_games": MINIMUM_ROOKIE_GAMES},
    )

    rows = []
    for row in cursor.fetchall():
        rows.append(
            {
                "player_id": row["player_id"],
                "draft_number": row["draft_number"],
                "points_per_game": float(row["points_per_game"]),
                "rebounds_per_game": float(row["rebounds_per_game"]),
                "assists_per_game": float(row["assists_per_game"]),
                "true_shooting": true_shooting(
                    float(row["total_points"]), float(row["total_fga"]), float(row["total_fta"])
                ),
            }
        )
    return rows


def fetch_prospect_seasons(cursor) -> list[dict]:
    """Every prospect season with its derived line and game count."""
    cursor.execute(
        """
        SELECT s."id" AS season_id,
               s."competitionLevel" AS competition_level,
               COUNT(g."id") AS games,
               COALESCE(AVG(g.points), 0) AS points_per_game,
               COALESCE(AVG(g.rebounds), 0) AS rebounds_per_game,
               COALESCE(AVG(g.assists), 0) AS assists_per_game,
               COALESCE(SUM(g.points), 0) AS total_points,
               COALESCE(SUM(g."fieldGoalsAttempted"), 0) AS total_fga,
               COALESCE(SUM(g."freeThrowsAttempted"), 0) AS total_fta,
               COUNT(e."id") FILTER (WHERE e."status" = 'VERIFIED') AS verified_games
        FROM "ProspectSeason" s
        LEFT JOIN "ProspectGame" g ON g."seasonId" = s."id"
        LEFT JOIN "ProspectEvidence" e ON e."id" = g."evidenceId"
        GROUP BY s."id", s."competitionLevel"
        """
    )

    seasons = []
    for row in cursor.fetchall():
        seasons.append(
            {
                "season_id": row["season_id"],
                "competition_level": row["competition_level"],
                "games": int(row["games"]),
                "points_per_game": float(row["points_per_game"]),
                "rebounds_per_game": float(row["rebounds_per_game"]),
                "assists_per_game": float(row["assists_per_game"]),
                "true_shooting": true_shooting(
                    float(row["total_points"]), float(row["total_fga"]), float(row["total_fta"])
                ),
                "has_verified_evidence": int(row["verified_games"]) > 0,
            }
        )
    return seasons


def adjust_for_level(line: dict, level_factor: float) -> dict:
    """Scales production for competition level.

    True shooting is deliberately NOT scaled: it is a rate, and shooting 60%
    against weaker opposition still means the shots went in. The level factor
    discounts VOLUME — how much a player produced — which is what varies with
    who they were producing against.
    """
    return {
        "points_per_game": line["points_per_game"] * level_factor,
        "rebounds_per_game": line["rebounds_per_game"] * level_factor,
        "assists_per_game": line["assists_per_game"] * level_factor,
        "true_shooting": line["true_shooting"],
    }


def find_comparables(adjusted: dict, training_rows: list[dict], count: int) -> list[tuple[str, float]]:
    """The NBA rookie seasons whose shape is closest to this line.

    Distance is Euclidean over the standardised feature vector, so a stat with
    a wide spread (points) cannot swamp one with a narrow spread (assists)
    purely because of its units. Returns (player_id, similarity) with
    similarity in [0, 1], highest first — a SHAPE match, never a claim that
    the players are equivalent, which is exactly what the UI caption says.
    """
    if not training_rows:
        return []

    matrix = np.array([build_feature_row(row) for row in training_rows], dtype=float)
    spread = matrix.std(axis=0)
    # A constant feature would divide by zero; treat it as carrying no
    # information rather than infinite information.
    spread[spread == 0] = 1.0

    target = (np.array(build_feature_row(adjusted), dtype=float) - matrix.mean(axis=0)) / spread
    standardised = (matrix - matrix.mean(axis=0)) / spread
    distances = np.linalg.norm(standardised - target, axis=1)

    closest = distances.argsort()[:count]
    worst = float(distances.max()) or 1.0
    return [
        (training_rows[int(index)]["player_id"], round(1 - float(distances[int(index)]) / worst, 4))
        for index in closest
    ]


def fetch_slot_alumni(cursor, slot: int, count: int) -> list[str]:
    """Players actually drafted at this pick, most recent first.

    Turns an abstract slot into "Pick 24 — a real name, a real year", which is
    the cheapest way to make the figure legible.
    """
    cursor.execute(
        """
        SELECT "id" FROM "Player"
        WHERE "draftNumber" = %(slot)s AND "draftYear" IS NOT NULL
        ORDER BY "draftYear" DESC
        LIMIT %(count)s
        """,
        {"slot": slot, "count": count},
    )
    return [row["id"] for row in cursor.fetchall()]


def write_valuation(cursor, season_id: str, payload: dict) -> None:
    cursor.execute(
        """
        INSERT INTO "ProspectValuation" (
            "id", "seasonId", "projectedDraftSlot", "projectedValueUsd",
            "projectedValueLowUsd", "projectedValueHighUsd", "rookieScaleYear",
            "levelFactor", "levelFactorBasis", "drivers", "comparablePlayerIds",
            "comparableScores", "slotAlumniPlayerIds", "modelVersion"
        ) VALUES (
            %(id)s, %(season_id)s, %(slot)s, %(value)s, %(low)s, %(high)s,
            %(scale_year)s, %(level_factor)s, %(level_basis)s, %(drivers)s,
            %(comparable_ids)s, %(comparable_scores)s, %(alumni_ids)s, %(model_version)s
        )
        """,
        {
            "id": str(uuid.uuid4()),
            "season_id": season_id,
            "slot": payload["slot"],
            "value": payload["value"],
            "low": payload["low"],
            "high": payload["high"],
            "scale_year": ROOKIE_SCALE_YEAR,
            "level_factor": payload["level_factor"],
            "level_basis": payload["level_basis"],
            "drivers": json.dumps(payload["drivers"]),
            "comparable_ids": payload["comparable_ids"],
            "comparable_scores": payload["comparable_scores"],
            "alumni_ids": payload["alumni_ids"],
            "model_version": MODEL_VERSION,
        },
    )


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            training_rows = fetch_rookie_training_rows(cursor)
            model = fit_slot_model(training_rows)
            print(
                f"Fitted draft-slot model on {model['training_rows']} rookie seasons "
                f"(MAE {model['mae']} picks, rank correlation {model['rank_correlation']})."
            )

            seasons = fetch_prospect_seasons(cursor)
            valued = 0
            for season in seasons:
                level_factor, level_basis = factor_for(season["competition_level"])

                # Below the floor: a row with NULL figures, so the API can tell
                # "not valued" from "valued at nothing" and still report which
                # model and scale year were current.
                if season["games"] < MINIMUM_GAMES_REQUIRED:
                    write_valuation(
                        cursor,
                        season["season_id"],
                        {
                            "slot": None,
                            "value": None,
                            "low": None,
                            "high": None,
                            "level_factor": level_factor,
                            "level_basis": level_basis,
                            "drivers": [],
                            "comparable_ids": [],
                            "comparable_scores": [],
                            "alumni_ids": [],
                        },
                    )
                    continue

                adjusted = adjust_for_level(season, level_factor)
                slot = project_slot(model, adjusted)
                value = value_for_slot(slot)
                low, high = value_interval(value, season["games"], season["has_verified_evidence"])
                comparables = find_comparables(adjusted, training_rows, COMPARABLE_COUNT)

                write_valuation(
                    cursor,
                    season["season_id"],
                    {
                        "slot": slot,
                        "value": value,
                        "low": low,
                        "high": high,
                        "level_factor": level_factor,
                        "level_basis": level_basis,
                        "drivers": describe_drivers(season, level_factor, level_basis),
                        "comparable_ids": [player_id for player_id, _ in comparables],
                        "comparable_scores": [score for _, score in comparables],
                        "alumni_ids": fetch_slot_alumni(cursor, slot, SLOT_ALUMNI_COUNT),
                    },
                )
                valued += 1

        connection.commit()
        print(f"Valued {valued} of {len(seasons)} prospect seasons.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
