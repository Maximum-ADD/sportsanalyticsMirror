"""Reads one season of player box scores out of Postgres and turns them
into the eligible-player feature matrix the model is fit on.

Two scoping decisions live here rather than in the caller, because getting
either wrong produces a model that still runs and is quietly meaningless:

  1. ONE SEASON AT A TIME, and every game in it. The database holds several
     complete seasons. Aggregating across them would average a player
     through a change of role — a bench guard who became a starter two
     years later lands between the two, describing a player who never
     existed. So the unit is the season, and PlayerArchetype carries one.

     Within a season, all four segments count as one. An archetype
     describes how someone played that year, and a player whose team went
     deep in the playoffs simply has more games behind their figures. This
     deliberately differs from the per-segment stat views, which never mix
     segments: those answer "what were this player's playoff numbers",
     which is a different question from "how did this player play this
     season". Fitting the segments separately was considered and rejected
     — the postseason has 61 eligible players against the regular season's
     341, which is far too few to place nine centroids, and separate fits
     would produce clusters that mean different things while sharing
     names.

     It also differs from elo.py, four_factors.py and optimizer/predict.py,
     which are regular-season only. Their stated reason does not apply
     here: they exclude the postseason because playoff games are a
     player's MOST RECENT games and would dominate a recency-weighted
     PROJECTION. This service projects nothing and weights nothing by
     recency. It describes a completed season.

  2. SEASONS WITH NO BOX SCORES ARE NOT SEASONS. A scheduled but unplayed
     season has a full slate of Game rows and no PlayerGameStat rows at
     all. Every read here starts FROM PlayerGameStat and joins to Game, so
     an unplayed season contributes nothing instead of contributing
     several hundred players with zero minutes.
"""

from features import (
    aggregate_player_season_totals,
    build_feature_row,
    is_eligible_for_archetype,
    standardize_feature_matrix,
)

# Why a player is absent from the fit. Stored alongside the results so the
# API can tell "no such player" apart from "this player exists but has no
# archetype", which the profile page renders as a real empty state rather
# than as a 404 (see the two-step 404 in PlayersController.getPlayerStats).
EXCLUDED_NOT_ENOUGH_MINUTES = "not_enough_minutes"
EXCLUDED_INCOMPLETE_DATA = "incomplete_data"


def fetch_available_seasons(connection) -> list[dict]:
    """Reads the seasons that have box scores, newest first.

    This is what populates a season picker. A scheduled but unplayed season
    is absent entirely, because the query starts from PlayerGameStat rather
    than from Game.

    `rows_with_usage` is reported because it is the column most likely to
    be missing wholesale: it arrived later than the counting stats, and a
    season ingested before it existed carries none. Such a season produces
    zero eligible players — every one of them fails on an uncomputable
    feature — so a caller can warn about it instead of presenting an empty
    fit as a modelling failure. apps/ingestion/backfill_advanced_stats.py
    is what fills it in.

    Args:
        connection: an open psycopg2 connection.

    Returns:
        One dict per season with `season`, `game_count`, `stat_rows`,
        `player_count` and `rows_with_usage`, newest season first.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT g.season,
                   count(DISTINCT g.id) AS game_count,
                   count(*) AS stat_rows,
                   count(DISTINCT s."playerId") AS player_count,
                   count(s."usagePercentage") AS rows_with_usage
            FROM "PlayerGameStat" s
            JOIN "Game" g ON g.id = s."gameId"
            GROUP BY g.season
            ORDER BY g.season DESC
            """
        )
        return [dict(row) for row in cursor.fetchall()]


def fetch_latest_season_with_box_scores(connection) -> str:
    """Reads the newest season that has box scores.

    Args:
        connection: an open psycopg2 connection.

    Returns:
        The season string to fit on by default.

    Raises:
        RuntimeError: when no season has any box scores, which means an
            empty or unseeded database rather than an unusual one.
    """
    seasons = fetch_available_seasons(connection)
    if not seasons:
        raise RuntimeError(
            "No season has any PlayerGameStat rows. Point DATABASE_URL at a "
            "database with an ingested season — see apps/similarity/.env.example."
        )
    return seasons[0]["season"]


def fetch_player_box_scores(connection, season: str, season_type: str = None) -> dict:
    """Reads every box score for one season, grouped by player.

    Args:
        connection: an open psycopg2 connection.
        season: the season string to scope to, e.g. "2025-26".
        season_type: normally None, meaning the whole season — every
            segment, which is what the model is fit on. A segment name
            restricts the read to that segment, which exists for
            diagnosing a season's data rather than for fitting: a single
            segment does not carry enough games to place centroids.

    Returns:
        A dict keyed by player id. Each value is
        {"player": <Player fields>, "game_stat_rows": [<PlayerGameStat rows>]}.
        Players with no box scores in the season are simply absent.
    """
    conditions = ['g.season = %s']
    parameters = [season]
    if season_type is not None:
        conditions.append('g."seasonType" = %s')
        parameters.append(season_type)

    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT s."playerId",
                   p."firstName", p."lastName", p."heightInches", p."weightLbs",
                   s.minutes, s.points, s.assists, s.steals, s.blocks, s.turnovers,
                   s."fieldGoalsAttempted", s."threesAttempted", s."freeThrowsAttempted",
                   s."offensiveRebounds", s."defensiveRebounds", s."usagePercentage"
            FROM "PlayerGameStat" s
            JOIN "Game" g ON g.id = s."gameId"
            JOIN "Player" p ON p.id = s."playerId"
            WHERE {' AND '.join(conditions)}
            """,
            parameters,
        )
        rows = cursor.fetchall()

    box_scores_by_player = {}
    for row in rows:
        player_id = row["playerId"]
        if player_id not in box_scores_by_player:
            box_scores_by_player[player_id] = {
                "player": {
                    "id": player_id,
                    "firstName": row["firstName"],
                    "lastName": row["lastName"],
                    "heightInches": row["heightInches"],
                    "weightLbs": row["weightLbs"],
                },
                "game_stat_rows": [],
            }
        box_scores_by_player[player_id]["game_stat_rows"].append(row)
    return box_scores_by_player


def build_season_feature_matrix(box_scores_by_player: dict) -> dict:
    """Turns a season of box scores into the standardized matrix the model
    is fit on, plus a record of who was left out and why.

    Standardization happens AFTER the eligibility filter, not before, and
    the order matters: z-scores are relative to whoever is in the matrix,
    so including several hundred deep-bench players would drag every mean
    toward garbage time and compress the rotation players — the only ones
    the feature actually describes — into a narrow band.

    Args:
        box_scores_by_player: the output of fetch_player_box_scores.

    Returns:
        A dict with:
          player_ids: eligible player ids, in matrix row order.
          players: the matching Player fields, same order.
          feature_matrix: raw features, for describing centroids in real units.
          standardized_matrix: z-scored features, what the model consumes.
          column_means / column_standard_deviations: the standardization,
            kept so a centroid can be translated back into real units.
          excluded_by_player_id: player id -> one of the EXCLUDED_* reasons.
    """
    eligible_player_ids = []
    eligible_players = []
    feature_matrix = []
    excluded_by_player_id = {}

    for player_id, entry in box_scores_by_player.items():
        season_totals = aggregate_player_season_totals(entry["game_stat_rows"])
        if not is_eligible_for_archetype(season_totals):
            excluded_by_player_id[player_id] = EXCLUDED_NOT_ENOUGH_MINUTES
            continue

        feature_row = build_feature_row(season_totals, entry["player"])
        if feature_row is None:
            # Cleared the minutes floor but something could not be computed
            # — most often usagePercentage missing for a whole season that
            # predates the column, occasionally a missing weight.
            # Distinguished from the case above because this one is a data
            # gap to fix in ingestion, not a player who did not play enough.
            excluded_by_player_id[player_id] = EXCLUDED_INCOMPLETE_DATA
            continue

        eligible_player_ids.append(player_id)
        eligible_players.append(entry["player"])
        feature_matrix.append(feature_row)

    standardized_matrix, column_means, column_standard_deviations = standardize_feature_matrix(
        feature_matrix
    )

    return {
        "player_ids": eligible_player_ids,
        "players": eligible_players,
        "feature_matrix": feature_matrix,
        "standardized_matrix": standardized_matrix,
        "column_means": column_means,
        "column_standard_deviations": column_standard_deviations,
        "excluded_by_player_id": excluded_by_player_id,
    }
