"""Ingests games (regular season and postseason) and their real per-player boxscores.

Three endpoints, verified live against stats.nba.com during development
(plus PlayerGameLogs, which lives in player_game_logs.py)
(see module docstrings below for why the versions used here differ from
what nba_api's own docs suggest):

- LeagueGameFinder — one call per team, filtered to Regular Season, gives
  that team's games newest-first. Only used here to get each team's most
  recent GAMES_PER_TEAM game ids (see ingest.py's module docstring for the
  overall call-budget reasoning) — the same game id often comes up for two
  different teams (they played each other), so ingest.py deduplicates
  before fetching boxscores.
- LeagueGameLog — one call per *postseason segment* (play-in, playoffs),
  leaguewide. The postseason wants every game, not a recency window, and
  it's small enough (~6 play-in, ~85 playoff games) that one leaguewide
  call per segment beats 30 per-team calls. Its rows carry GAME_DATE, so
  it serves the same purpose LeagueGameFinder does above.
- BoxScoreTraditionalV3 — one call per unique game id, and (verified live)
  gives everything else needed for that game in one call: both teams'
  ids, both teams' final scores (each team's `statistics.points`), and
  every player's individual stat line — so home/away scores never need to
  be inferred from LeagueGameFinder's per-team MATCHUP/PTS fields at all.
  It takes only a game id and knows nothing about season types, so the
  postseason phase reuses it unchanged. It does NOT carry usage rate or
  offensive/defensive ratings — those come from the leaguewide feed in
  player_game_logs.py, one call per season segment rather than per game.

Which segment a game belongs to is derived from its game id by
classify_game(), never from whichever endpoint it arrived on — see that
function and the GAME_ID_* constants for the layout and how it was verified.

BoxScoreTraditionalV2 (what nba_api's own docs point to) is deprecated and
returns zero rows for the current season — confirmed by an actual failing
call during development, not assumed from docs. V3 is what stats.nba.com
now actually serves, but nba_api's bundled response parser for V3
(`get_normalized_dict()`) expects an older envelope shape and returns
nothing useful either — also confirmed live. This module parses V3's raw
JSON directly instead of trusting either endpoint's built-in normalizer,
matching what BoxScoreTraditionalV3's real (verified) response actually
looks like: `{"boxScoreTraditional": {"homeTeamId", "awayTeamId",
"homeTeam": {"statistics": {"points": ...}, "players": [...]}, "awayTeam":
{...}}}`, each player having a nested "statistics" dict — not the flat
structure the package's `expected_data` declares.
"""

import json

from nba_api.stats.endpoints import boxscoretraditionalv3, leaguegamefinder, leaguegamelog

from throttle import call_with_rate_limit

GAMES_PER_TEAM = 15

# nba_api's own season_type strings. Verified against the installed
# nba_api (1.11.4) via nba_api.stats.library.parameters.SeasonType, and
# then live against stats.nba.com for the 2025-26 season — this spelling
# has changed between nba_api releases ("Play-In" / "PlayIn Tournament" in
# older builds), so it is checked, not assumed. A live call returned 6
# PlayIn games and 85 Playoffs games for 2025-26, which is the right shape
# for a real postseason.
NBA_SEASON_TYPE_REGULAR = "Regular Season"
NBA_SEASON_TYPE_PLAYOFFS = "Playoffs"
NBA_SEASON_TYPE_PLAY_IN = "PlayIn"

# Game.seasonType enum values, as written to Postgres (see schema.prisma).
SEASON_TYPE_REGULAR = "REGULAR"
SEASON_TYPE_PLAY_IN = "PLAY_IN"
SEASON_TYPE_PLAYOFFS = "PLAYOFFS"
SEASON_TYPE_FINALS = "FINALS"

# An NBA game id is 10 characters: a 3-character season-type prefix, a
# 2-digit season year, then a 5-digit sequence. For playoff ids that
# sequence is {round}{series}{game} — e.g. 0042500401 is round 4, series 0,
# game 1: the 2025-26 Finals opener.
#
# Verified live for 2025-26 rather than taken on faith: the Playoffs game
# ids split 48/21/11/5 across round digits 1/2/3/4, which is exactly the
# shape of a real bracket (8 first-round series, 4, 2, then one Finals),
# and the five round-4 ids resolve to SAS vs. NYK across 3-13 June 2026.
# Play-In games carry their own 005 prefix, so they never need round
# parsing at all. If a future season's ids ever break this, the
# CommonPlayoffSeries endpoint gives round numbers directly as a fallback.
GAME_ID_LENGTH = 10
GAME_ID_PREFIX_PLAYOFFS = "004"
GAME_ID_PREFIX_PLAY_IN = "005"
PLAYOFF_ROUND_DIGIT_INDEX = 7
FINALS_ROUND = 4


def fetch_recent_games(nba_team_id: int, season: str) -> list[dict]:
    """Fetches a team's GAMES_PER_TEAM most recent completed Regular Season games.

    Returns {nba_game_id, game_date} pairs — fetch_game_boxscore is the
    single source of truth for everything else about a game (scores,
    teams, player stats; see module docstring), but BoxScoreTraditionalV3
    doesn't include the game's date, so that one field comes from here.
    A game shared between two teams in scope reports the same date from
    both teams' calls — ingest.py dedupes by nba_game_id regardless.
    """
    result = call_with_rate_limit(
        lambda: leaguegamefinder.LeagueGameFinder(
            team_id_nullable=nba_team_id, season_nullable=season, season_type_nullable="Regular Season", timeout=30
        )
    )
    rows = result.get_normalized_dict()["LeagueGameFinderResults"]
    return [{"nba_game_id": row["GAME_ID"], "game_date": row["GAME_DATE"]} for row in rows[:GAMES_PER_TEAM]]


def fetch_season_segment_games(season: str, nba_season_type: str) -> list[dict]:
    """Fetches every game in one segment of a season in a single API call.

    Unlike fetch_recent_games, which asks per team for that team's newest
    GAMES_PER_TEAM games, this uses LeagueGameLog to pull the whole segment
    leaguewide at once — the right shape for the postseason, where we want
    *all* the games (there are only ~6 play-in and ~85 playoff games in a
    season) rather than a recency window, and where 1 call beats 30.

    `nba_season_type` is one of the NBA_SEASON_TYPE_* constants. Returns
    {nba_game_id, game_date} pairs, deduplicated: LeagueGameLog returns one
    row per team per game, so both rows for a game collapse to one entry.
    """
    result = call_with_rate_limit(
        lambda: leaguegamelog.LeagueGameLog(season=season, season_type_all_star=nba_season_type, timeout=30)
    )
    rows = result.get_normalized_dict()["LeagueGameLog"]

    game_date_by_nba_game_id = {row["GAME_ID"]: row["GAME_DATE"] for row in rows}
    return [
        {"nba_game_id": nba_game_id, "game_date": game_date}
        for nba_game_id, game_date in game_date_by_nba_game_id.items()
    ]


def classify_game(nba_game_id: str) -> tuple[str, int | None]:
    """Derives a game's (Game.seasonType, Game.playoffRound) from its NBA game id.

    Classifying from the id rather than from whichever endpoint the game
    arrived on means a re-run always reclassifies a game the same way, and
    a game picked up by the regular-season phase can never be mislabelled
    by the postseason phase (or vice versa). See the GAME_ID_* constants
    for the id layout and how it was verified.

    Returns:
        (SEASON_TYPE_PLAY_IN, None) for a 005-prefixed play-in game.
        (SEASON_TYPE_FINALS, 4) for a playoff game whose round digit is 4.
        (SEASON_TYPE_PLAYOFFS, round) for playoff rounds 1-3.
        (SEASON_TYPE_REGULAR, None) for anything else — including a
        malformed or unexpectedly-prefixed id, which stays out of the
        postseason views rather than landing in one on a guess.
    """
    if len(nba_game_id) != GAME_ID_LENGTH:
        return SEASON_TYPE_REGULAR, None

    if nba_game_id.startswith(GAME_ID_PREFIX_PLAY_IN):
        return SEASON_TYPE_PLAY_IN, None

    if not nba_game_id.startswith(GAME_ID_PREFIX_PLAYOFFS):
        return SEASON_TYPE_REGULAR, None

    round_digit = nba_game_id[PLAYOFF_ROUND_DIGIT_INDEX]
    if not round_digit.isdigit():
        return SEASON_TYPE_REGULAR, None

    playoff_round = int(round_digit)
    if playoff_round == FINALS_ROUND:
        return SEASON_TYPE_FINALS, playoff_round
    return SEASON_TYPE_PLAYOFFS, playoff_round


def fetch_game_boxscore(nba_game_id: str) -> dict:
    """Fetches one game's full boxscore via BoxScoreTraditionalV3.

    Returns home_team_nba_id/away_team_nba_id/home_score/away_score plus
    players: a list of dicts with nba_player_id/minutes/points/rebounds/
    assists/steals/blocks/turnovers/field_goals_made/field_goals_attempted/
    threes_made/threes_attempted/free_throws_made/free_throws_attempted —
    everything Game and PlayerGameStat need for this one game. A player
    whose team isn't in this project's ingested rosters (e.g. a two-way/
    G-League call-up not on the standard roster endpoint) still gets a
    stat row here; ingest.py skips rows for any nba_player_id it doesn't
    recognize rather than failing the whole game.

    See module docstring for why this parses raw JSON instead of using
    get_normalized_dict().
    """
    response = call_with_rate_limit(lambda: boxscoretraditionalv3.BoxScoreTraditionalV3(game_id=nba_game_id, timeout=30))
    box = json.loads(response.nba_response.get_json())["boxScoreTraditional"]

    players = []
    for team in (box["homeTeam"], box["awayTeam"]):
        for player in team["players"]:
            stats = player["statistics"]
            players.append(
                {
                    "nba_player_id": player["personId"],
                    "minutes": _parse_minutes_to_int(stats["minutes"]),
                    "points": stats["points"],
                    "rebounds": stats["reboundsTotal"],
                    "assists": stats["assists"],
                    "steals": stats["steals"],
                    "blocks": stats["blocks"],
                    "turnovers": stats["turnovers"],
                    "field_goals_made": stats["fieldGoalsMade"],
                    "field_goals_attempted": stats["fieldGoalsAttempted"],
                    "threes_made": stats["threePointersMade"],
                    "threes_attempted": stats["threePointersAttempted"],
                    "free_throws_made": stats["freeThrowsMade"],
                    "free_throws_attempted": stats["freeThrowsAttempted"],
                    "offensive_rebounds": stats["reboundsOffensive"],
                    "defensive_rebounds": stats["reboundsDefensive"],
                    # Always a whole number in reality, but the API types it
                    # as a float (-13.0). Converted explicitly rather than
                    # left to Postgres's implicit cast into an INTEGER column.
                    "plus_minus": _to_int_or_none(stats["plusMinusPoints"]),
                }
            )

    return {
        "home_team_nba_id": box["homeTeamId"],
        "away_team_nba_id": box["awayTeamId"],
        "home_score": box["homeTeam"]["statistics"]["points"],
        "away_score": box["awayTeam"]["statistics"]["points"],
        "players": players,
    }


def _to_int_or_none(value) -> int | None:
    """Converts an API number to an int, passing None through untouched.

    None means "not recorded", which is not the same as zero — a 0 plus/minus
    is an even game, a null is a game we have no figure for.
    """
    if value is None:
        return None
    return int(value)


def _parse_minutes_to_int(minutes: str) -> int:
    """Converts the API's "MM:SS" minutes string to whole minutes played (rounded down).

    A player who didn't play has an empty string, not "0:00" — treated as 0.
    """
    if not minutes or ":" not in minutes:
        return 0
    whole_minutes, _, _seconds = minutes.partition(":")
    return int(whole_minutes)


def upsert_game(
    cursor,
    nba_game_id: str,
    game_date,
    season: str,
    home_team_id: str,
    away_team_id: str,
    home_score: int,
    away_score: int,
    season_type: str = SEASON_TYPE_REGULAR,
    playoff_round: int | None = None,
) -> str:
    """Upserts one Game row by its unique nbaGameId, returns its internal id.

    `season_type` is a Game.seasonType enum value and `playoff_round` its
    1-4 round number for playoff games — both normally come straight from
    classify_game(). They default to a regular-season game so existing
    callers keep their current behaviour.

    The conflict branch updates them too, so re-running ingestion after a
    classification fix corrects already-stored rows instead of leaving them
    on their first-seen value.
    """
    cursor.execute(
        """
        INSERT INTO "Game" ("id", "nbaGameId", "gameDate", "season", "homeTeamId", "awayTeamId", "homeScore",
                            "awayScore", "seasonType", "playoffRound")
        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT ("nbaGameId") DO UPDATE SET
            "gameDate" = EXCLUDED."gameDate",
            "homeScore" = EXCLUDED."homeScore",
            "awayScore" = EXCLUDED."awayScore",
            "seasonType" = EXCLUDED."seasonType",
            "playoffRound" = EXCLUDED."playoffRound"
        RETURNING "id"
        """,
        (nba_game_id, game_date, season, home_team_id, away_team_id, home_score, away_score, season_type, playoff_round),
    )
    return cursor.fetchone()["id"]


def upsert_period_bookend_events(cursor, game_internal_id: str) -> None:
    """Writes the same minimal period-start/end GameEvent bookend rows seed.ts writes.

    Real play-by-play ingestion (every made shot, foul, etc. as its own
    GameEvent) is a separate, much heavier endpoint (PlayByPlayV3) out of
    scope here — this matches the existing seed data's precedent of two
    bookend events per game rather than leaving GameEvent empty for real
    games while seed-generated games have entries.
    """
    cursor.execute(
        """
        INSERT INTO "GameEvent" ("id", "gameId", "sequence", "period", "clock", "eventType", "description")
        VALUES
            (gen_random_uuid(), %(game_id)s, 1, 1, '12:00', 'PERIOD_START', 'Period 1 start'),
            (gen_random_uuid(), %(game_id)s, 2, 4, '0:00', 'PERIOD_END', 'Game end')
        ON CONFLICT DO NOTHING
        """,
        {"game_id": game_internal_id},
    )


# Columns that may be absent from a caller's `stats` dict — either because
# the advanced endpoint wasn't fetched for this game, or because the row is
# being written by an older code path. Defaulted to None rather than 0 so a
# missing figure stays distinguishable from a measured zero.
OPTIONAL_STAT_KEYS = (
    "offensive_rebounds",
    "defensive_rebounds",
    "plus_minus",
    "usage_percentage",
    "offensive_rating",
    "defensive_rating",
)


def upsert_player_game_stat(cursor, player_internal_id: str, game_internal_id: str, stats: dict) -> None:
    """Upserts one PlayerGameStat row for (player, game).

    `stats` carries the traditional boxscore figures plus, when an advanced
    boxscore was fetched for this game, the advanced ones. Anything in
    OPTIONAL_STAT_KEYS defaults to None when absent, so this stays callable
    without them — a caller that skips the advanced endpoint writes real
    counting stats and honest nulls rather than zeros.
    """
    stats = {**{key: None for key in OPTIONAL_STAT_KEYS}, **stats}
    cursor.execute(
        """
        INSERT INTO "PlayerGameStat"
            ("id", "playerId", "gameId", "minutes", "points", "rebounds", "assists", "steals", "blocks",
             "turnovers", "fieldGoalsMade", "fieldGoalsAttempted", "threesMade", "threesAttempted",
             "freeThrowsMade", "freeThrowsAttempted", "offensiveRebounds", "defensiveRebounds", "plusMinus",
             "usagePercentage", "offensiveRating", "defensiveRating")
        VALUES
            (gen_random_uuid(), %(player_id)s, %(game_id)s, %(minutes)s, %(points)s, %(rebounds)s, %(assists)s,
             %(steals)s, %(blocks)s, %(turnovers)s, %(field_goals_made)s, %(field_goals_attempted)s,
             %(threes_made)s, %(threes_attempted)s, %(free_throws_made)s, %(free_throws_attempted)s,
             %(offensive_rebounds)s, %(defensive_rebounds)s, %(plus_minus)s,
             %(usage_percentage)s, %(offensive_rating)s, %(defensive_rating)s)
        ON CONFLICT ("playerId", "gameId") DO UPDATE SET
            "minutes" = EXCLUDED."minutes",
            "points" = EXCLUDED."points",
            "rebounds" = EXCLUDED."rebounds",
            "assists" = EXCLUDED."assists",
            "steals" = EXCLUDED."steals",
            "blocks" = EXCLUDED."blocks",
            "turnovers" = EXCLUDED."turnovers",
            "fieldGoalsMade" = EXCLUDED."fieldGoalsMade",
            "fieldGoalsAttempted" = EXCLUDED."fieldGoalsAttempted",
            "threesMade" = EXCLUDED."threesMade",
            "threesAttempted" = EXCLUDED."threesAttempted",
            "freeThrowsMade" = EXCLUDED."freeThrowsMade",
            "freeThrowsAttempted" = EXCLUDED."freeThrowsAttempted",
            "offensiveRebounds" = EXCLUDED."offensiveRebounds",
            "defensiveRebounds" = EXCLUDED."defensiveRebounds",
            "plusMinus" = EXCLUDED."plusMinus",
            -- COALESCE so a re-run that skips the advanced endpoint keeps
            -- previously-ingested advanced figures instead of nulling them.
            "usagePercentage" = COALESCE(EXCLUDED."usagePercentage", "PlayerGameStat"."usagePercentage"),
            "offensiveRating" = COALESCE(EXCLUDED."offensiveRating", "PlayerGameStat"."offensiveRating"),
            "defensiveRating" = COALESCE(EXCLUDED."defensiveRating", "PlayerGameStat"."defensiveRating")
        """,
        {"player_id": player_internal_id, "game_id": game_internal_id, **stats},
    )
