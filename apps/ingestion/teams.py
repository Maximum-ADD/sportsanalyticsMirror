"""Ingests all 30 current NBA teams.

nba_api.stats.static.teams is bundled static data — no network call, so
this is the cheapest, safest part of ingestion (see module docstring in
ingest.py for the overall rate-limit strategy). It doesn't include
conference/division (verified against the package's own docs), which this
schema requires as non-nullable fields, so CONFERENCE_BY_ABBREVIATION and
DIVISION_BY_ABBREVIATION below fill that in from the NBA's own published
conference/division alignment — a fixed structural fact of the league, not
something that needs an API call to look up, and stable enough (division
realignments are rare, roughly once a decade) not to need to be kept in
sync with a live source.
"""

from nba_api.stats.static import teams as static_teams

CONFERENCE_BY_ABBREVIATION = {
    # East
    "ATL": "East", "BOS": "East", "BKN": "East", "CHA": "East", "CHI": "East",
    "CLE": "East", "DET": "East", "IND": "East", "MIA": "East", "MIL": "East",
    "NYK": "East", "ORL": "East", "PHI": "East", "TOR": "East", "WAS": "East",
    # West
    "DAL": "West", "DEN": "West", "GSW": "West", "HOU": "West", "LAC": "West",
    "LAL": "West", "MEM": "West", "MIN": "West", "NOP": "West", "OKC": "West",
    "PHX": "West", "POR": "West", "SAC": "West", "SAS": "West", "UTA": "West",
}

DIVISION_BY_ABBREVIATION = {
    "BOS": "Atlantic", "BKN": "Atlantic", "NYK": "Atlantic", "PHI": "Atlantic", "TOR": "Atlantic",
    "CHI": "Central", "CLE": "Central", "DET": "Central", "IND": "Central", "MIL": "Central",
    "ATL": "Southeast", "CHA": "Southeast", "MIA": "Southeast", "ORL": "Southeast", "WAS": "Southeast",
    "DEN": "Northwest", "MIN": "Northwest", "OKC": "Northwest", "POR": "Northwest", "UTA": "Northwest",
    "GSW": "Pacific", "LAC": "Pacific", "LAL": "Pacific", "PHX": "Pacific", "SAC": "Pacific",
    "DAL": "Southwest", "HOU": "Southwest", "MEM": "Southwest", "NOP": "Southwest", "SAS": "Southwest",
}


def fetch_all_teams() -> list[dict]:
    """Returns every current NBA team, enriched with conference/division.

    Each dict has nba_team_id/name/abbreviation/city/conference/division —
    everything Team.upsert_teams needs. Raises KeyError (deliberately, not
    caught) if the static list ever includes an abbreviation missing from
    the lookup tables above — that means the NBA added/renamed a team and
    the tables need a manual update, which should fail loudly rather than
    silently writing a team with a blank conference/division.
    """
    teams = []
    for team in static_teams.get_teams():
        abbreviation = team["abbreviation"]
        teams.append(
            {
                "nba_team_id": team["id"],
                "name": team["nickname"],
                "abbreviation": abbreviation,
                "city": team["city"],
                "conference": CONFERENCE_BY_ABBREVIATION[abbreviation],
                "division": DIVISION_BY_ABBREVIATION[abbreviation],
            }
        )
    return teams


def upsert_teams(cursor, teams: list[dict]) -> dict[int, str]:
    """Upserts each team by its unique nbaTeamId, returns nbaTeamId -> internal id.

    Upsert (not insert), matching Player/Team's existing seed.ts precedent
    of upserting on the external nba*Id fields — re-running ingestion
    should update a team's details if the league changed them, not fail on
    a duplicate-key conflict or create a second row.
    """
    team_id_by_nba_id: dict[int, str] = {}
    for team in teams:
        cursor.execute(
            """
            INSERT INTO "Team" ("id", "nbaTeamId", "name", "abbreviation", "city", "conference", "division")
            VALUES (gen_random_uuid(), %(nba_team_id)s, %(name)s, %(abbreviation)s, %(city)s, %(conference)s, %(division)s)
            ON CONFLICT ("nbaTeamId") DO UPDATE SET
                "name" = EXCLUDED."name",
                "abbreviation" = EXCLUDED."abbreviation",
                "city" = EXCLUDED."city",
                "conference" = EXCLUDED."conference",
                "division" = EXCLUDED."division"
            RETURNING "id", "nbaTeamId"
            """,
            team,
        )
        row = cursor.fetchone()
        team_id_by_nba_id[row["nbaTeamId"]] = row["id"]
    return team_id_by_nba_id
