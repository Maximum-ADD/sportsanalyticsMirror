"""Trains the Become Pro draft-slot model and stores it for the API to apply.

Run after an ingestion, whenever the NBA data changes:

    python train_valuation_model.py

Writes one ProspectValuationModel row. The API picks up the newest row on its
next read, re-values every season whose figure came from an older model, and
from then on values each prospect the instant their season changes. This
script never values a prospect itself — see ProspectValuationModel's schema
comment for why training and application are split where they are.

The pipeline:

 1. Read every drafted player whose ACTUAL rookie season is on record — the
    league year their draftYear puts them in, not simply the earliest season
    in the database (see fetch_rookie_training_rows for why that matters).
 2. Fit draft slot against rookie production (draft_slot_model.py).
 3. Write the fitted coefficients together with every other table the API
    needs to apply them — the published rookie scale, the competition-level
    factors and their stated bases, the interval widths, and the rookie index
    the comparables are drawn from — as one bundle. Each of those is defined
    once, here in Python, rather than hand-copied into TypeScript.

No language model is involved anywhere in this path.
"""

import json
import uuid

import draft_slot_model
from db import get_connection
from draft_slot_model import FEATURE_NAMES, MINIMUM_ROOKIE_GAMES, build_feature_row, fit_slot_model
from level_factors import LEVEL_FACTORS, UNKNOWN_LEVEL_FACTOR
from rookie_scale import (
    DRAFT_PICKS,
    FIRST_ROUND_PICKS,
    FIRST_ROUND_SCALE,
    ROOKIE_SCALE_YEAR,
    SECOND_ROUND_VALUE,
    UNDRAFTED_VALUE,
)

# Bumped whenever what this script writes changes shape or meaning. 2.x is the
# bundle format the API applies itself; 1.x wrote finished valuations directly.
MODEL_VERSION = "prospect-value-2.0.0"

# Must equal MINIMUM_GAMES_REQUIRED in apps/api/src/become-pro/valuation-state.ts,
# which is what the API actually enforces. Shipped in the bundle, where
# applyValuationModel checks it too, so a season is never valued under a
# different floor from the one the page explains.
MINIMUM_GAMES_REQUIRED = 10

FREE_THROW_POSSESSION_WEIGHT = 0.44
POINTS_PER_SCORING_POSSESSION = 2

# Mirrors UNPUBLISHED_BATCH_STATUSES in apps/api/src/common/game-visibility.ts.
# A game whose latest ingestion batch is in one of these states has not
# cleared review, and the API keeps it off every public read. The model has to
# keep it out of TRAINING for the same reason: a valuation is a published
# figure, and one fitted on data the site refuses to publish would smuggle
# unreviewed numbers onto a public page through the back door.
UNPUBLISHED_BATCH_STATUSES = ("PENDING_REVIEW", "RUNNING", "FAILED", "REJECTED")

# The SQL form of the API's PUBLISHED_GAME_FILTER, applied to a Game aliased
# `g`. A game with no batch row at all (anything ingested before batch
# tracking existed) is unaffected, exactly as the API treats it.
PUBLISHED_GAME_SQL = """
    NOT EXISTS (
        SELECT 1 FROM "IngestionBatch" b
        WHERE b."gameId" = g."id"
          AND b."status"::text IN %(unpublished_statuses)s
          AND b."deletedAt" IS NULL
    )
"""


def true_shooting(points: float, field_goals_attempted: float, free_throws_attempted: float) -> float:
    """TS% from totals, matching the API's own derivation exactly.

    The same formula and the same zero-attempt behaviour as
    apps/api/src/players/season-averages.ts. A prospect's efficiency is
    computed there and a rookie's here, and the two have to be the same
    measurement or the model is comparing different things.
    """
    attempts = field_goals_attempted + FREE_THROW_POSSESSION_WEIGHT * free_throws_attempted
    if attempts == 0:
        return 0.0
    return round((points / (POINTS_PER_SCORING_POSSESSION * attempts)) * 100, 1)


def rookie_season_label(draft_year: int) -> str:
    """The league year a player drafted in `draft_year` spends as a rookie.

    The NBA draft is held in June, so a 2023 draftee's first season is
    2023-24 — written in the same "YYYY-YY" form Game.season uses. Mirrors
    rookieSeasonLabel in apps/api/src/become-pro/rookie-season.ts.
    """
    return f"{draft_year}-{(draft_year + 1) % 100:02d}"


def fetch_rookie_training_rows(cursor) -> list[dict]:
    """Every drafted player whose ACTUAL rookie season is on record, with their pick.

    The rookie season is derived from Player.draftYear, not taken as the
    earliest season in the database. That distinction is the whole model: this
    database only holds a few recent seasons, so "earliest season on record"
    is a rookie year only for recent draftees — for a veteran it is some prime
    season years into their career. Pairing that with their draft pick would
    teach the model that a veteran's production is what a pick's rookie year
    looks like, and every projection built on it would be wrong.

    So only players whose draftYear puts their rookie season inside the data
    are used. That is a smaller training set, and the right one.
    """
    cursor.execute(
        """
        SELECT p."id" AS player_id,
               p."draftNumber" AS draft_number,
               COUNT(*) AS games,
               AVG(pgs.points) AS points_per_game,
               AVG(pgs.rebounds) AS rebounds_per_game,
               AVG(pgs.assists) AS assists_per_game,
               SUM(pgs.points) AS total_points,
               SUM(pgs."fieldGoalsAttempted") AS total_fga,
               SUM(pgs."freeThrowsAttempted") AS total_fta
        FROM "Player" p
        JOIN "PlayerGameStat" pgs ON pgs."playerId" = p."id"
        JOIN "Game" g ON g."id" = pgs."gameId"
        WHERE p."draftNumber" IS NOT NULL
          AND p."draftYear" IS NOT NULL
          AND g."seasonType" = 'REGULAR'
          -- The draft-year-derived rookie season: the SQL twin of
          -- rookie_season_label above.
          AND g."season" = p."draftYear"::text || '-' || lpad(((p."draftYear" + 1) %% 100)::text, 2, '0')
          AND """ + PUBLISHED_GAME_SQL + """
        GROUP BY p."id", p."draftNumber"
        HAVING COUNT(*) >= %(minimum_games)s
        """,
        {"minimum_games": MINIMUM_ROOKIE_GAMES, "unpublished_statuses": UNPUBLISHED_BATCH_STATUSES},
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


def build_bundle(model: dict, training_rows: list[dict]) -> dict:
    """Everything the API needs to apply the model, and nothing it would need to re-derive.

    The keys are camelCase because the consumer is TypeScript
    (ValuationModelBundle in apps/api/src/become-pro/valuation-model.ts); the
    two are pinned together by that type and by this module's tests.
    """
    return {
        "modelVersion": MODEL_VERSION,
        "featureNames": list(FEATURE_NAMES),
        "coefficients": model["coefficients"],
        "minimumGamesRequired": MINIMUM_GAMES_REQUIRED,
        "slotBounds": {
            "min": draft_slot_model.MIN_PROJECTED_SLOT,
            "max": draft_slot_model.MAX_PROJECTED_SLOT,
        },
        "rookieScale": {
            "year": ROOKIE_SCALE_YEAR,
            "firstRoundPicks": FIRST_ROUND_PICKS,
            "draftPicks": DRAFT_PICKS,
            # JSON object keys are strings; the API reads them back by pick.
            "firstRound": {str(pick): value for pick, value in FIRST_ROUND_SCALE.items()},
            "secondRoundValue": SECOND_ROUND_VALUE,
            "undraftedValue": UNDRAFTED_VALUE,
        },
        "levelFactors": {
            level: {"factor": factor, "basis": basis} for level, (factor, basis) in LEVEL_FACTORS.items()
        },
        "unknownLevelFactor": {"factor": UNKNOWN_LEVEL_FACTOR[0], "basis": UNKNOWN_LEVEL_FACTOR[1]},
        "interval": {
            "baseFraction": draft_slot_model.BASE_INTERVAL_FRACTION,
            "shortLogGames": draft_slot_model.SHORT_LOG_GAMES,
            "shortLogExtraFraction": draft_slot_model.SHORT_LOG_EXTRA_FRACTION,
        },
        # The rookie seasons the model was fitted on. The API draws a
        # prospect's comparables from exactly this set, so every comparable is
        # a real player whose real rookie line helped train the model.
        "comparableIndex": [
            {
                "playerId": row["player_id"],
                "draftNumber": row["draft_number"],
                "features": build_feature_row(row),
            }
            for row in training_rows
        ],
    }


def write_model(cursor, bundle: dict, model: dict) -> str:
    model_id = str(uuid.uuid4())
    cursor.execute(
        """
        INSERT INTO "ProspectValuationModel" (
            "id", "modelVersion", "bundle", "trainingRows", "mae", "rankCorrelation"
        ) VALUES (%(id)s, %(version)s, %(bundle)s, %(rows)s, %(mae)s, %(rank)s)
        """,
        {
            "id": model_id,
            "version": MODEL_VERSION,
            "bundle": json.dumps(bundle),
            "rows": model["training_rows"],
            "mae": model["mae"],
            "rank": model["rank_correlation"],
        },
    )
    return model_id


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            training_rows = fetch_rookie_training_rows(cursor)
            model = fit_slot_model(training_rows)
            model_id = write_model(cursor, build_bundle(model, training_rows), model)
        connection.commit()
        print(
            f"Trained draft-slot model {model_id} on {model['training_rows']} real rookie seasons "
            f"(MAE {model['mae']} picks, rank correlation {model['rank_correlation']}). "
            "The API applies it on its next read and re-values every season from an older model."
        )
    finally:
        connection.close()


if __name__ == "__main__":
    main()
