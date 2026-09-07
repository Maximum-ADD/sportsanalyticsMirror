"""Ingests only the season's postseason (play-in, playoffs, finals) into a
database that already has teams, rosters and regular-season games.

Use this when ingest.py has already been run and only the postseason phase
is needed - typically when adding the postseason to a database populated
before Game.seasonType existed. Running the full ingest.py instead would
re-fetch every player bio (~450-500 calls, the largest phase by far) to
end up in the same place, turning a ~5 minute job into a ~30 minute one.

Same standalone-phase pattern as backfill_player_bios.py: team and player
id maps are read straight out of the database rather than re-fetched from
nba_api, so this makes no calls beyond the postseason data itself.

Call budget: 2 leaguewide LeagueGameLog calls for the game ids, 4 more for
the leaguewide plus/minus and advanced figures (see player_game_logs.py),
then one BoxScoreTraditionalV3 call per game (~90 for a full postseason).
At RATE_LIMIT_DELAY_SECONDS plus retries, expect roughly 5 minutes.

Idempotent - every write is an upsert keyed on nbaGameId/(playerId,
gameId), so a failed or interrupted run can simply be run again.

Must run from a real residential network, not a cloud host - see
README.md for why (stats.nba.com blocks cloud-provider IP ranges).

Run from apps/ingestion:
    python ingest_postseason.py
"""

from db import get_connection
from ingest import collect_postseason_game_dates, collect_postseason_player_figures, ingest_games_and_stats


def read_team_ids(cursor) -> dict[int, str]:
    """Reads the already-ingested teams as nbaTeamId -> internal id."""
    cursor.execute('SELECT "nbaTeamId", "id" FROM "Team"')
    return {row["nbaTeamId"]: row["id"] for row in cursor.fetchall()}


def read_player_ids(cursor) -> dict[int, str]:
    """Reads the already-ingested players as nbaPlayerId -> internal id.

    A player appearing in a postseason boxscore who isn't in this map is
    skipped by ingest_games_and_stats, matching how the regular-season
    phase already treats call-ups and two-way players.
    """
    cursor.execute('SELECT "nbaPlayerId", "id" FROM "Player"')
    return {row["nbaPlayerId"]: row["id"] for row in cursor.fetchall()}


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            team_id_by_nba_id = read_team_ids(cursor)
            player_id_by_nba_id = read_player_ids(cursor)

        print(f"Found {len(team_id_by_nba_id)} teams and {len(player_id_by_nba_id)} players already in the database.")
        if not team_id_by_nba_id or not player_id_by_nba_id:
            # Bailing out beats writing games whose stat rows would all be
            # skipped for want of a roster to attach them to.
            print("Nothing to attach postseason games to - run ingest.py first.")
            return

        postseason_game_dates = collect_postseason_game_dates()
        postseason_figures = collect_postseason_player_figures()

        with connection.cursor() as cursor:
            ingest_games_and_stats(
                cursor, postseason_game_dates, team_id_by_nba_id, player_id_by_nba_id, postseason_figures
            )
        connection.commit()

        print("Postseason ingestion complete.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
