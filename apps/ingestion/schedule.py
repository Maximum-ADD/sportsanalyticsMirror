"""Ingests a season's full game schedule, including games not yet played.

games.py's LeagueGameFinder only ever returns games that have already
happened — there's no way to reach a scheduled-but-unplayed game through it,
which is why this project's Game table had zero upcoming rows despite
predict_games.py already being built to handle them (see its own module
docstring). ScheduleLeagueV2 is the endpoint that actually carries the
league's full published schedule for a season, Final games and
not-yet-played games alike, confirmed live during development: requesting
season="2026-27" (the season after everything currently ingested, which
ends 2026-06-13) returns 174 game-dates starting 2026-10-03, every one at
gameStatus 1 ("scheduled", not yet 2 "live" or 3 "Final") — a real season
that hasn't tipped off yet, not a placeholder.

gameStatus values (observed live, not documented anywhere authoritative):
1 = scheduled/not yet started, 2 = live/in progress, 3 = Final.
"""

from nba_api.stats.endpoints import scheduleleaguev2

from throttle import call_with_rate_limit

# Preseason/All-Star/in-season-tournament exhibition games carry a
# non-empty gameLabel (e.g. "Preseason", "NBA Cup"); a regular real
# matchup's gameLabel is "". Restricting to that keeps this in line with
# games.py's own Regular-Season-only LeagueGameFinder filter, so a team's
# Elo/Four Factors state isn't fed an exhibition result later were this
# script ever extended to also ingest final scores.
REGULAR_SEASON_GAME_LABEL = ""

GAME_STATUS_FINAL = 3


def fetch_season_schedule(season: str) -> list[dict]:
    """Fetches every Regular Season game (played or not) for `season`.

    Returns {nba_game_id, game_date, home_team_nba_id, away_team_nba_id,
    is_final, home_score, away_score} per game, oldest first. A Final
    game's scores come straight from the schedule response's own
    homeTeam/awayTeam.score fields — good enough to upsert a completed
    game's final score without a separate boxscore call, but this project's
    real per-player stats still only ever come from games.py's
    BoxScoreTraditionalV3 path (this endpoint has no player-level data at
    all), so a Final game found here that isn't already in Postgres is
    still missing its PlayerGameStat rows and Elo/Four Factors won't be
    able to use it as training signal until games.py backfills it too.
    """
    response = call_with_rate_limit(lambda: scheduleleaguev2.ScheduleLeagueV2(season=season, timeout=30))
    data = response.get_dict()
    game_dates = data["leagueSchedule"]["gameDates"]

    games = []
    for game_date in game_dates:
        for game in game_date["games"]:
            if game.get("gameLabel", "") != REGULAR_SEASON_GAME_LABEL:
                continue
            is_final = game["gameStatus"] == GAME_STATUS_FINAL
            games.append(
                {
                    "nba_game_id": game["gameId"],
                    "game_date": game["gameDateUTC"],
                    "home_team_nba_id": game["homeTeam"]["teamId"],
                    "away_team_nba_id": game["awayTeam"]["teamId"],
                    "is_final": is_final,
                    "home_score": game["homeTeam"]["score"] if is_final else None,
                    "away_score": game["awayTeam"]["score"] if is_final else None,
                }
            )
    return games


def fetch_team_id_by_nba_id(cursor) -> dict[int, str]:
    """Reads the already-ingested Team table, returns nbaTeamId -> internal id.

    Every team this script needs is already in Postgres from ingest.py's
    own team phase — teams don't change season to season, so this re-reads
    rather than re-fetching/re-upserting from the API.
    """
    cursor.execute('SELECT "id", "nbaTeamId" FROM "Team"')
    return {row["nbaTeamId"]: row["id"] for row in cursor.fetchall()}


def upsert_scheduled_game(
    cursor,
    nba_game_id: str,
    game_date,
    season: str,
    home_team_id: str,
    away_team_id: str,
    home_score: int | None,
    away_score: int | None,
) -> str:
    """Upserts one Game row, home/away score included only if the game is Final.

    Deliberately distinct from games.py's upsert_game (which always writes
    real, non-null scores from a real boxscore) rather than widening that
    function's signature — this one exists specifically to carry a game
    that may not have been played yet, and ON CONFLICT here still only
    overwrites score columns with whatever this call was given, so a game
    already fully ingested with real boxscore-sourced scores via games.py
    is never regressed back to null by a later schedule refresh that
    happens to also see it (schedules do get amended, e.g. a rescheduled
    game keeps the same gameId with a new date).
    """
    cursor.execute(
        """
        INSERT INTO "Game" ("id", "nbaGameId", "gameDate", "season", "homeTeamId", "awayTeamId", "homeScore", "awayScore")
        VALUES (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT ("nbaGameId") DO UPDATE SET
            "gameDate" = EXCLUDED."gameDate"
        RETURNING "id"
        """,
        (nba_game_id, game_date, season, home_team_id, away_team_id, home_score, away_score),
    )
    return cursor.fetchone()["id"]
