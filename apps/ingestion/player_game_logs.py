"""Leaguewide per-player game logs, used for the figures a traditional
boxscore doesn't carry.

One PlayerGameLogs call returns *every* player-game row for a whole season
segment — 26,651 rows for the 2025-26 regular season, verified live — keyed
by GAME_ID and PLAYER_ID, which map directly onto Game.nbaGameId and
Player.nbaPlayerId. Two measure types cover everything this project stores
beyond the traditional boxscore:

- "Base" carries PLUS_MINUS and the OREB/DREB split.
- "Advanced" carries USG_PCT, OFF_RATING and DEF_RATING — the three
  figures that genuinely cannot be derived from counting stats, since
  individual ratings need possession estimates and opponent context this
  schema doesn't hold.

Why this rather than BoxScoreAdvancedV3 per game: the per-game endpoint
needs one call per game (~900 for a full season plus postseason), while
this needs 2 per segment — 6 calls for the whole season. That is the
difference between adding ~15 minutes to every ingestion run and adding
about six seconds. The per-game endpoint returns the same figures; it is
simply the wrong granularity for a pipeline that already knows it wants a
whole season.

Coverage was checked against a populated database: all 1,230 real
regular-season games were present in the feed. A game the feed doesn't
carry keeps null advanced figures rather than blocking ingestion, and a
later run fills it in.
"""

from nba_api.stats.endpoints import playergamelogs

from throttle import call_with_rate_limit

# nba_api's measure_type values for this endpoint.
MEASURE_TYPE_BASE = "Base"
MEASURE_TYPE_ADVANCED = "Advanced"

# USG_PCT and friends come back as fractions (0.232 for 23.2%). Every
# percentage in this project is stored as a whole percent.
PERCENT_DECIMAL_PLACES = 1


def _to_whole_percent(fraction: float | None) -> float | None:
    """Converts an API fraction (0.232) to a whole percent (23.2), preserving None.

    None means the figure wasn't reported for that player-game, which is
    not the same as a rate of zero.
    """
    if fraction is None:
        return None
    return round(fraction * 100, PERCENT_DECIMAL_PLACES)


def _to_int_or_none(value) -> int | None:
    """Converts an API number to an int, preserving None.

    Plus/minus and rebound counts are whole numbers but the API types some
    of them as floats.
    """
    if value is None:
        return None
    return int(value)


def fetch_season_player_game_logs(season: str, nba_season_type: str) -> dict[tuple[str, int], dict]:
    """Fetches one season segment's per-player figures in two API calls.

    `nba_season_type` is one of games.py's NBA_SEASON_TYPE_* constants.

    Returns {(nba_game_id, nba_player_id): {plus_minus, offensive_rebounds,
    defensive_rebounds, usage_percentage, offensive_rating,
    defensive_rating}} — exactly the keys upsert_player_game_stat expects,
    so a caller can merge a lookup straight into a player's stat dict.

    Rows present in one measure type but not the other still appear, with
    the missing side's keys set to None. A player who didn't play has no
    row at all in either, which is correct: a DNP has no usage rate.
    """
    base_rows = _fetch_measure(season, nba_season_type, MEASURE_TYPE_BASE)
    advanced_rows = _fetch_measure(season, nba_season_type, MEASURE_TYPE_ADVANCED)

    figures_by_player_game: dict[tuple[str, int], dict] = {}

    for row in base_rows:
        figures_by_player_game[(row["GAME_ID"], row["PLAYER_ID"])] = {
            "plus_minus": _to_int_or_none(row.get("PLUS_MINUS")),
            "offensive_rebounds": _to_int_or_none(row.get("OREB")),
            "defensive_rebounds": _to_int_or_none(row.get("DREB")),
            "usage_percentage": None,
            "offensive_rating": None,
            "defensive_rating": None,
        }

    for row in advanced_rows:
        key = (row["GAME_ID"], row["PLAYER_ID"])
        advanced_figures = {
            "usage_percentage": _to_whole_percent(row.get("USG_PCT")),
            "offensive_rating": row.get("OFF_RATING"),
            "defensive_rating": row.get("DEF_RATING"),
        }
        if key in figures_by_player_game:
            figures_by_player_game[key].update(advanced_figures)
        else:
            figures_by_player_game[key] = {
                "plus_minus": None,
                "offensive_rebounds": None,
                "defensive_rebounds": None,
                **advanced_figures,
            }

    return figures_by_player_game


def _fetch_measure(season: str, nba_season_type: str, measure_type: str) -> list[dict]:
    """One PlayerGameLogs call for a given season segment and measure type."""
    result = call_with_rate_limit(
        lambda: playergamelogs.PlayerGameLogs(
            season_nullable=season,
            season_type_nullable=nba_season_type,
            measure_type_player_game_logs_nullable=measure_type,
            timeout=60,
        )
    )
    return result.get_normalized_dict()["PlayerGameLogs"]
