"""Ingests each team's most recent games and their real per-player boxscores.

Two endpoints, verified live against stats.nba.com during development
(see module docstrings below for why the versions used here differ from
what nba_api's own docs suggest):

- LeagueGameFinder — one call per team, filtered to Regular Season, gives
  that team's games newest-first. Only used here to get each team's most
  recent GAMES_PER_TEAM game ids (see ingest.py's module docstring for the
  overall call-budget reasoning) — the same game id often comes up for two
  different teams (they played each other), so ingest.py deduplicates
  before fetching boxscores.
- BoxScoreTraditionalV3 — one call per unique game id, and (verified live)
  gives everything else needed for that game in one call: both teams'
  ids, both teams' final scores (each team's `statistics.points`), and
  every player's individual stat line — so home/away scores never need to
  be inferred from LeagueGameFinder's per-team MATCHUP/PTS fields at all.

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

from nba_api.stats.endpoints import boxscoretraditionalv3, leaguegamefinder

from throttle import call_with_rate_limit

GAMES_PER_TEAM = 15


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
                }
            )

    return {
        "home_team_nba_id": box["homeTeamId"],
        "away_team_nba_id": box["awayTeamId"],
        "home_score": box["homeTeam"]["statistics"]["points"],
        "away_score": box["awayTeam"]["statistics"]["points"],
        "players": players,
    }


def _parse_minutes_to_int(minutes: str) -> int:
    """Converts the API's "MM:SS" minutes string to whole minutes played (rounded down).

    A player who didn't play has an empty string, not "0:00" — treated as 0.
    """
    if not minutes or ":" not in minutes:
        return 0
    whole_minutes, _, _seconds = minutes.partition(":")
    return int(whole_minutes)


def upsert_game(
    cursor, nba_game_id: str, game_date, season: str, home_team_id: str, away_team_id: str, home_score: int, away_score: int
) -> str:
    """Upserts one Game row by its unique nbaGameId, returns its internal id."""
    cursor.execute(
        """
        INSERT INTO "Game" ("id", "nbaGameId", "gameDate", "season", "homeTeamId", "awayTeamId", "homeScore", "awayScore")
        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT ("nbaGameId") DO UPDATE SET
            "gameDate" = EXCLUDED."gameDate",
            "homeScore" = EXCLUDED."homeScore",
            "awayScore" = EXCLUDED."awayScore"
        RETURNING "id"
        """,
        (nba_game_id, game_date, season, home_team_id, away_team_id, home_score, away_score),
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


def upsert_player_game_stat(cursor, player_internal_id: str, game_internal_id: str, stats: dict) -> None:
    """Upserts one PlayerGameStat row for (player, game)."""
    cursor.execute(
        """
        INSERT INTO "PlayerGameStat"
            ("id", "playerId", "gameId", "minutes", "points", "rebounds", "assists", "steals", "blocks",
             "turnovers", "fieldGoalsMade", "fieldGoalsAttempted", "threesMade", "threesAttempted",
             "freeThrowsMade", "freeThrowsAttempted")
        VALUES
            (gen_random_uuid(), %(player_id)s, %(game_id)s, %(minutes)s, %(points)s, %(rebounds)s, %(assists)s,
             %(steals)s, %(blocks)s, %(turnovers)s, %(field_goals_made)s, %(field_goals_attempted)s,
             %(threes_made)s, %(threes_attempted)s, %(free_throws_made)s, %(free_throws_attempted)s)
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
            "freeThrowsAttempted" = EXCLUDED."freeThrowsAttempted"
        """,
        {"player_id": player_internal_id, "game_id": game_internal_id, **stats},
    )
