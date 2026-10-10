"""Loads the NBA's all-time career leaders, with a bio for every player on
them, into AllTimeLeader and AllTimeLeaderPlayer.

The NBA keeps these totals itself (AllTimeLeadersGrids on stats.nba.com),
across its whole history, so nothing here depends on how many seasons this
app has ingested. One call returns the top TOP_COUNT in every category for
one season type, so the leaderboards cost two calls: regular season and
playoffs. The shooting percentages the endpoint also returns are skipped
(see AllTimeLeaderCategory in the Prisma schema for why).

Bios come from CommonPlayerInfo, one call per player — about 145 the first
time. After that only players without a bio, and active players (whose
seasons played still change), are fetched again, so a re-run is mostly the
two leaderboard calls plus ~35 bios.

Each run replaces every leaderboard row in one transaction, so the tables
always hold one consistent snapshot. Players who have dropped off every
leaderboard are deleted along with it.

stats.nba.com blocks cloud hosts, so run this from your own machine (see
README.md). Run from apps/ingestion:
    python all_time_leaders.py
"""

import uuid
from datetime import datetime, timezone

from nba_api.stats.endpoints import alltimeleadersgrids, commonplayerinfo

from db import get_connection
from player_bios import _parse_birthdate, _parse_draft_field
from throttle import call_with_rate_limit

TOP_COUNT = 20

# The endpoint's stat keys (each result set is named "<key>Leaders") mapped
# to the AllTimeLeaderCategory enum values they are stored as.
CATEGORY_BY_NBA_KEY = {
    "GP": "GAMES_PLAYED",
    "PTS": "POINTS",
    "AST": "ASSISTS",
    "STL": "STEALS",
    "OREB": "OFFENSIVE_REBOUNDS",
    "DREB": "DEFENSIVE_REBOUNDS",
    "REB": "REBOUNDS",
    "BLK": "BLOCKS",
    "FGM": "FIELD_GOALS_MADE",
    "FG3M": "THREES_MADE",
    "FTM": "FREE_THROWS_MADE",
}

# nba_api's season_type labels mapped to the SeasonType enum values stored.
SEASON_TYPE_BY_NBA_LABEL = {
    "Regular Season": "REGULAR",
    "Playoffs": "PLAYOFFS",
}

BIO_COMMIT_BATCH_SIZE = 25
INCHES_PER_FOOT = 12


def fetch_leaderboards(nba_season_type: str) -> dict:
    """Fetches every category's top TOP_COUNT career totals for one season type.

    nba_season_type is one of SEASON_TYPE_BY_NBA_LABEL's keys. Returns the
    endpoint's result sets as {result set name: list of row dicts}, e.g.
    {"PTSLeaders": [{"PLAYER_ID": 2544, "PTS": 43440, ...}, ...], ...}.
    """
    response = call_with_rate_limit(
        lambda: alltimeleadersgrids.AllTimeLeadersGrids(
            topx=TOP_COUNT, per_mode_simple="Totals", season_type=nba_season_type
        )
    )
    return response.get_normalized_dict()


def parse_leader_rows(result_sets: dict, season_type: str) -> list[dict]:
    """Flattens one season type's result sets into one row per leaderboard place.

    Only the categories in CATEGORY_BY_NBA_KEY are kept; any other result
    set (the percentages, attempts, turnovers, fouls) is ignored. A category
    missing from result_sets is skipped rather than raising, so one renamed
    result set costs that category, not the whole run.

    Returns dicts with category, season_type, rank, value, nba_player_id,
    player_name and is_active.
    """
    rows = []
    for nba_key, category in CATEGORY_BY_NBA_KEY.items():
        for entry in result_sets.get(f"{nba_key}Leaders", []):
            rows.append(
                {
                    "category": category,
                    "season_type": season_type,
                    "rank": entry[f"{nba_key}_RANK"],
                    "value": int(entry[nba_key]),
                    "nba_player_id": entry["PLAYER_ID"],
                    "player_name": entry["PLAYER_NAME"],
                    "is_active": entry["IS_ACTIVE_FLAG"] == "Y",
                }
            )
    return rows


def split_player_name(player_name: str) -> tuple[str, str]:
    """Splits a leaderboard PLAYER_NAME into (first name, last name).

    Only a stand-in until the player's bio is fetched, which carries the
    NBA's own split. Everything after the first word counts as the last
    name, so "Kareem Abdul-Jabbar" and "Jimmy Butler III" both come out
    right; a one-word name becomes the last name with an empty first name.
    """
    first_name, _, last_name = player_name.strip().partition(" ")
    if not last_name:
        return "", first_name
    return first_name, last_name


def parse_height_inches(raw_height: str | None) -> int | None:
    """Converts CommonPlayerInfo's "feet-inches" HEIGHT (e.g. "7-2") to inches (86).

    Returns None for a blank or malformed height, which the NBA has for
    some early-era players.
    """
    if not raw_height:
        return None
    feet, _, inches = raw_height.partition("-")
    try:
        return int(feet) * INCHES_PER_FOOT + int(inches or 0)
    except ValueError:
        return None


def parse_weight_lbs(raw_weight: str | None) -> int | None:
    """Converts CommonPlayerInfo's WEIGHT string (e.g. "225") to pounds, or None if blank."""
    if not raw_weight:
        return None
    try:
        return int(raw_weight)
    except ValueError:
        return None


def to_leader_bio(info_row: dict) -> dict:
    """Maps one CommonPlayerInfo row to the AllTimeLeaderPlayer bio columns.

    Returns a dict keyed for update_leader_bio, including nba_player_id.
    Blank strings become None so the page shows nothing rather than "".
    """
    return {
        "nba_player_id": info_row["PERSON_ID"],
        "first_name": info_row["FIRST_NAME"],
        "last_name": info_row["LAST_NAME"],
        "position": info_row["POSITION"] or None,
        "height_inches": parse_height_inches(info_row["HEIGHT"]),
        "weight_lbs": parse_weight_lbs(info_row["WEIGHT"]),
        "birth_date": _parse_birthdate(info_row["BIRTHDATE"]),
        "school": info_row["SCHOOL"] or None,
        "country": info_row["COUNTRY"] or None,
        "from_year": info_row["FROM_YEAR"],
        "to_year": info_row["TO_YEAR"],
        "season_exp": info_row["SEASON_EXP"],
        "draft_year": _parse_draft_field(info_row["DRAFT_YEAR"]),
        "draft_round": _parse_draft_field(info_row["DRAFT_ROUND"]),
        "draft_number": _parse_draft_field(info_row["DRAFT_NUMBER"]),
        "is_greatest_75": info_row.get("GREATEST_75_FLAG") == "Y",
    }


def fetch_leader_bio(nba_player_id: int) -> dict:
    """Fetches one player's bio from CommonPlayerInfo, mapped by to_leader_bio."""
    response = call_with_rate_limit(
        lambda: commonplayerinfo.CommonPlayerInfo(player_id=nba_player_id)
    )
    return to_leader_bio(response.get_normalized_dict()["CommonPlayerInfo"][0])


def upsert_leader_players(cursor, leader_rows: list[dict]) -> int:
    """Inserts every player on the leaderboards, or refreshes their active flag.

    A new player gets the stand-in name from split_player_name. An existing
    one keeps the name their bio gave them; only isActive is updated, since
    a player can retire between runs. Returns how many distinct players
    were written.
    """
    is_active_by_player_id = {}
    name_by_player_id = {}
    for row in leader_rows:
        is_active_by_player_id[row["nba_player_id"]] = row["is_active"]
        name_by_player_id[row["nba_player_id"]] = row["player_name"]

    for nba_player_id, is_active in is_active_by_player_id.items():
        first_name, last_name = split_player_name(name_by_player_id[nba_player_id])
        cursor.execute(
            """
            INSERT INTO "AllTimeLeaderPlayer" ("nbaPlayerId", "firstName", "lastName", "isActive")
            VALUES (%s, %s, %s, %s)
            ON CONFLICT ("nbaPlayerId") DO UPDATE SET "isActive" = EXCLUDED."isActive"
            """,
            (nba_player_id, first_name, last_name, is_active),
        )
    return len(is_active_by_player_id)


def replace_leader_rows(cursor, leader_rows: list[dict], fetched_at: datetime) -> None:
    """Deletes every AllTimeLeader row and inserts leader_rows in their place.

    Called inside the same transaction as upsert_leader_players, so a reader
    never sees a half-replaced snapshot. Ids are generated here because
    Prisma's @default(uuid()) is applied by the Prisma client, not the
    database.
    """
    cursor.execute('DELETE FROM "AllTimeLeader"')
    for row in leader_rows:
        cursor.execute(
            """
            INSERT INTO "AllTimeLeader"
                ("id", "category", "seasonType", "rank", "value", "nbaPlayerId", "fetchedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(uuid.uuid4()),
                row["category"],
                row["season_type"],
                row["rank"],
                row["value"],
                row["nba_player_id"],
                fetched_at,
            ),
        )


def delete_unlisted_players(cursor) -> int:
    """Deletes players who are no longer on any leaderboard. Returns how many were deleted."""
    cursor.execute(
        """
        DELETE FROM "AllTimeLeaderPlayer" AS player
        WHERE NOT EXISTS (
            SELECT 1 FROM "AllTimeLeader" AS leader WHERE leader."nbaPlayerId" = player."nbaPlayerId"
        )
        """
    )
    return cursor.rowcount


def select_player_ids_needing_bio(cursor) -> list[int]:
    """Lists the players whose bio should be fetched this run.

    That is every player without a bio yet, plus every active player, whose
    seasons played and last season still change while they play.
    """
    cursor.execute(
        """
        SELECT "nbaPlayerId" FROM "AllTimeLeaderPlayer"
        WHERE "bioFetchedAt" IS NULL OR "isActive"
        ORDER BY "nbaPlayerId"
        """
    )
    return [row["nbaPlayerId"] for row in cursor.fetchall()]


def update_leader_bio(cursor, bio: dict, fetched_at: datetime) -> None:
    """Writes one player's bio columns and stamps bioFetchedAt."""
    cursor.execute(
        """
        UPDATE "AllTimeLeaderPlayer" SET
            "firstName" = %(first_name)s,
            "lastName" = %(last_name)s,
            "position" = %(position)s,
            "heightInches" = %(height_inches)s,
            "weightLbs" = %(weight_lbs)s,
            "birthDate" = %(birth_date)s,
            "school" = %(school)s,
            "country" = %(country)s,
            "fromYear" = %(from_year)s,
            "toYear" = %(to_year)s,
            "seasonExp" = %(season_exp)s,
            "draftYear" = %(draft_year)s,
            "draftRound" = %(draft_round)s,
            "draftNumber" = %(draft_number)s,
            "isGreatest75" = %(is_greatest_75)s,
            "bioFetchedAt" = %(bio_fetched_at)s
        WHERE "nbaPlayerId" = %(nba_player_id)s
        """,
        {**bio, "bio_fetched_at": fetched_at},
    )


def describe_target_database(connection) -> str:
    """Names the database this run writes to, e.g. "archetype_fit_test on localhost".

    Printed before anything is written: apps/ingestion/.env switches between
    a local database and production, and this is the last chance to notice
    which one it currently names. Read from the connection's own settings,
    so it shows the host as .env spells it.
    """
    settings = connection.get_dsn_parameters()
    return f"{settings.get('dbname')} on {settings.get('host')}"


def load_leaderboards(connection) -> None:
    """Fetches both season types' leaderboards and replaces the stored snapshot."""
    leader_rows = []
    for nba_season_type, season_type in SEASON_TYPE_BY_NBA_LABEL.items():
        result_sets = fetch_leaderboards(nba_season_type)
        season_rows = parse_leader_rows(result_sets, season_type)
        print(f"  {nba_season_type}: {len(season_rows)} leaderboard places")
        leader_rows.extend(season_rows)

    fetched_at = datetime.now(timezone.utc)
    with connection.cursor() as cursor:
        player_count = upsert_leader_players(cursor, leader_rows)
        replace_leader_rows(cursor, leader_rows, fetched_at)
        deleted_count = delete_unlisted_players(cursor)
    connection.commit()
    print(f"Stored {len(leader_rows)} places across {player_count} players; removed {deleted_count} who dropped off.")


def load_bios(connection) -> None:
    """Fetches and stores a bio for every player select_player_ids_needing_bio names.

    A player whose bio call still fails after the throttle's retries is
    reported and skipped rather than ending the run; with no bioFetchedAt,
    the next run tries them again.
    """
    with connection.cursor() as cursor:
        nba_player_ids = select_player_ids_needing_bio(cursor)
    print(f"Fetching {len(nba_player_ids)} bios (about one a second)...")

    failed_ids = []
    with connection.cursor() as cursor:
        for index, nba_player_id in enumerate(nba_player_ids, start=1):
            try:
                bio = fetch_leader_bio(nba_player_id)
            except RuntimeError as error:
                print(f"  Skipped {nba_player_id}: {error}")
                failed_ids.append(nba_player_id)
                continue
            update_leader_bio(cursor, bio, datetime.now(timezone.utc))
            if index % BIO_COMMIT_BATCH_SIZE == 0:
                connection.commit()
                print(f"  {index}/{len(nba_player_ids)}")
    connection.commit()

    print(f"Done. {len(nba_player_ids) - len(failed_ids)} bios stored, {len(failed_ids)} skipped.")


def main() -> None:
    connection = get_connection()
    try:
        print(f"Writing to {describe_target_database(connection)}.")
        load_leaderboards(connection)
        load_bios(connection)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
