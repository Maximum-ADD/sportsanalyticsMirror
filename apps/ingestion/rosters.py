"""Ingests each team's current roster.

One CommonTeamRoster call per team (30 calls total) — cheap compared to the
per-player game-log endpoints, see ingest.py's module docstring for the
overall call budget. Requires RATE_LIMIT_DELAY_SECONDS between calls (see
throttle.py) since, unlike the static team list, this hits the live API.
"""

from nba_api.stats.endpoints import commonteamroster

from throttle import call_with_rate_limit


def fetch_team_roster(nba_team_id: int, season: str) -> list[dict]:
    """Fetches one team's current roster from CommonTeamRoster.

    Returns a list of dicts with nba_player_id/first_name/last_name/
    position/height_inches/weight_lbs/jersey_number — everything Player
    needs. HEIGHT comes back from the API as a "F-I" string (e.g. "6-9"),
    converted here to total inches to match the schema's heightInches Int.
    """
    roster = call_with_rate_limit(
        lambda: commonteamroster.CommonTeamRoster(team_id=nba_team_id, season=season)
    )
    players = []
    for row in roster.get_normalized_dict()["CommonTeamRoster"]:
        first_name, _, last_name = row["PLAYER"].partition(" ")
        players.append(
            {
                "nba_player_id": row["PLAYER_ID"],
                "first_name": first_name,
                "last_name": last_name or row["PLAYER"],
                "position": row["POSITION"] or "N/A",
                "height_inches": _parse_height_to_inches(row["HEIGHT"]),
                "weight_lbs": int(row["WEIGHT"]) if row["WEIGHT"] else None,
                "jersey_number": row["NUM"] or None,
            }
        )
    return players


def _parse_height_to_inches(height: str | None) -> int | None:
    """Converts the API's "F-I" height string (e.g. "6-9") to total inches."""
    if not height or "-" not in height:
        return None
    feet, inches = height.split("-")
    return int(feet) * 12 + int(inches)


def upsert_players(cursor, players: list[dict], team_internal_id: str) -> dict[int, str]:
    """Upserts each player by nbaPlayerId, returns nbaPlayerId -> internal id.

    Upsert on the external id, same rationale as teams.upsert_teams: a
    re-run should refresh a player's team/position/jersey if it changed
    (trades, jersey swaps), not fail or duplicate.
    """
    player_id_by_nba_id: dict[int, str] = {}
    for player in players:
        cursor.execute(
            """
            INSERT INTO "Player"
                ("id", "nbaPlayerId", "firstName", "lastName", "position",
                 "heightInches", "weightLbs", "jerseyNumber", "teamId")
            VALUES
                (gen_random_uuid(), %(nba_player_id)s, %(first_name)s, %(last_name)s, %(position)s,
                 %(height_inches)s, %(weight_lbs)s, %(jersey_number)s, %(team_id)s)
            ON CONFLICT ("nbaPlayerId") DO UPDATE SET
                "firstName" = EXCLUDED."firstName",
                "lastName" = EXCLUDED."lastName",
                "position" = EXCLUDED."position",
                "heightInches" = EXCLUDED."heightInches",
                "weightLbs" = EXCLUDED."weightLbs",
                "jerseyNumber" = EXCLUDED."jerseyNumber",
                "teamId" = EXCLUDED."teamId"
            RETURNING "id", "nbaPlayerId"
            """,
            {**player, "team_id": team_internal_id},
        )
        row = cursor.fetchone()
        player_id_by_nba_id[row["nbaPlayerId"]] = row["id"]
    return player_id_by_nba_id
