"""Enriches already-ingested players with bio fields from CommonPlayerInfo.

One CommonPlayerInfo call per player (~450-500 calls for the full league,
see ingest.py's module docstring for the overall call budget context) —
run after rosters.py has already created the Player rows this UPDATEs.

Deliberately does NOT use this endpoint's TEAM_ID/TEAM_NAME/TEAM_ABBREVIATION/
etc — those fields only ever reflect the player's *current* team at request
time, with no season parameter to pin them, so a player traded mid-season
would silently overwrite the correct season-scoped team CommonTeamRoster
already gave rosters.py. Team assignment stays sourced from the roster
ingestion only; this module only ever UPDATEs the bio columns.
"""

from datetime import datetime

from nba_api.stats.endpoints import commonplayerinfo

from throttle import call_with_rate_limit


def fetch_player_bio(nba_player_id: int) -> dict:
    """Fetches one player's bio fields from CommonPlayerInfo.

    Returns a dict with nba_player_id/first_name/last_name/birth_date/
    school/country/last_affiliation/season_exp/roster_status/draft_year/
    draft_round/draft_number — everything upsert_player_bio needs, plus
    first_name/last_name so callers can cross-check the returned player
    actually matches who they expected to fetch. This caught a real,
    pre-existing nbaPlayerId/name mismatch in seed.ts's MOCK_PLAYERS
    (two entries pointed at the wrong real player's id) during development
    of this feature — blindly trusting an id without checking the name it
    resolves to is what let that go unnoticed until now.
    """
    info = call_with_rate_limit(
        lambda: commonplayerinfo.CommonPlayerInfo(player_id=nba_player_id)
    )
    row = info.get_normalized_dict()["CommonPlayerInfo"][0]

    return {
        "nba_player_id": row["PERSON_ID"],
        "first_name": row["FIRST_NAME"],
        "last_name": row["LAST_NAME"],
        "birth_date": _parse_birthdate(row["BIRTHDATE"]),
        "school": row["SCHOOL"] or None,
        "country": row["COUNTRY"] or None,
        "last_affiliation": row["LAST_AFFILIATION"] or None,
        "season_exp": row["SEASON_EXP"] if row["SEASON_EXP"] is not None else None,
        "roster_status": row["ROSTERSTATUS"] or None,
        "draft_year": _parse_draft_field(row["DRAFT_YEAR"]),
        "draft_round": _parse_draft_field(row["DRAFT_ROUND"]),
        "draft_number": _parse_draft_field(row["DRAFT_NUMBER"]),
    }


def _parse_birthdate(raw: str | None) -> str | None:
    """Converts the API's full ISO timestamp string to a bare date.

    BIRTHDATE comes back as e.g. "1984-12-30T00:00:00", not a plain date -
    strip the time component psycopg2 doesn't need for a DATE-ish column.
    """
    if not raw:
        return None
    return datetime.fromisoformat(raw).date().isoformat()


def _parse_draft_field(raw) -> int | None:
    """Handles nba_api's "Undrafted" string in place of a real number.

    DRAFT_YEAR/DRAFT_ROUND/DRAFT_NUMBER return the literal string
    "Undrafted" (confirmed - not just a theoretical case) for players who
    went undrafted, rather than a null. Anything that isn't a clean integer
    string gets treated as "no draft info" instead of raising.
    """
    if raw is None or raw == "" or raw == "Undrafted":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def upsert_player_bio(cursor, bio: dict) -> None:
    """UPDATEs an existing Player row's bio columns by nbaPlayerId.

    Deliberately UPDATE, not the INSERT-ON-CONFLICT upsert pattern rosters.py
    uses - a player must already exist (created by roster ingestion) before
    its bio can be enriched. A player_id that matches no row is silently a
    no-op (rowcount 0), not an error - see ingest_player_bios in ingest.py
    for how that gets counted and reported.
    """
    cursor.execute(
        """
        UPDATE "Player" SET
            "birthDate" = %(birth_date)s,
            "school" = %(school)s,
            "country" = %(country)s,
            "lastAffiliation" = %(last_affiliation)s,
            "seasonExp" = %(season_exp)s,
            "rosterStatus" = %(roster_status)s,
            "draftYear" = %(draft_year)s,
            "draftRound" = %(draft_round)s,
            "draftNumber" = %(draft_number)s
        WHERE "nbaPlayerId" = %(nba_player_id)s
        """,
        bio,
    )