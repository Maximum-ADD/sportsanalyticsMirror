"""Ingests only one season's postseason (play-in, playoffs, finals) into a
database that already has teams, rosters and regular-season games.

Use this when ingest.py has already been run and only the postseason phase
is needed - typically when adding the postseason to a database populated
before Game.seasonType existed, or adding an older season's postseason
(--season). Running the full ingest.py instead would re-fetch every player
bio (~450-500 calls, the largest phase by far) to end up in the same place,
turning a ~5 minute job into a ~30 minute one.

Same standalone-phase pattern as backfill_player_bios.py: team and player
id maps are read straight out of the database rather than re-fetched from
nba_api, so this makes no calls beyond the postseason data itself, and it
never writes rosters. That makes it safe for a past season, where a roster
pull would overwrite every player's current team (see ingest.py's
resolve_player_ids). Players no longer in the league aren't in the
database, so their plays and stat rows are skipped.

--skip-play-storage derives each game's stats from its play-by-play without
saving the plays to GameEvent (see play_by_play.run_ingestion_batch). A
postseason's plays are ~22 MB of database space, and an older season's
regular-season games have none stored anyway; the cost is that the admin
corrections tools and GET /games/:id/events have nothing to show for these
games.

Call budget: 2 leaguewide LeagueGameLog calls for the game ids, 4 more for
the leaguewide plus/minus and advanced figures (see player_game_logs.py),
then one BoxScoreTraditionalV3 and one PlayByPlayV3 call per game (~180
for a full postseason — see ingest.py's ingest_games_and_stats, which this
reuses unchanged, and play_by_play.py). At RATE_LIMIT_DELAY_SECONDS plus
retries, expect roughly 8-10 minutes, plus the time to write the plays
unless --skip-play-storage is given.

Idempotent - every write is an upsert keyed on nbaGameId/(playerId,
gameId), so a failed or interrupted run can simply be run again.

Must run from a real residential network, not a cloud host - see
README.md for why (stats.nba.com blocks cloud-provider IP ranges).

Run from apps/ingestion:
    python ingest_postseason.py
    python ingest_postseason.py --season 2023-24 --skip-play-storage
"""

import argparse

from db import get_connection
from ingest import SEASON, collect_postseason_game_dates, collect_postseason_player_figures, ingest_games_and_stats
from rosters import select_player_ids_by_nba_id


def read_team_ids(cursor) -> dict[int, str]:
    """Reads the already-ingested teams as nbaTeamId -> internal id."""
    cursor.execute('SELECT "nbaTeamId", "id" FROM "Team"')
    return {row["nbaTeamId"]: row["id"] for row in cursor.fetchall()}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parses the command line; split out from main so it can be tested without a pull."""
    parser = argparse.ArgumentParser(
        description="Ingest one season's postseason into a database that already has teams and players."
    )
    parser.add_argument(
        "--season",
        default=SEASON,
        help=f"Season whose postseason to ingest, e.g. 2023-24 (default: {SEASON}).",
    )
    parser.add_argument(
        "--skip-play-storage",
        dest="skip_play_storage",
        action="store_true",
        help="Derive stats from the play-by-play without saving the plays to GameEvent.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    season = args.season
    store_events = not args.skip_play_storage
    plays_note = "" if store_events else " without saving its plays"
    print(f"Ingesting the {season} postseason{plays_note}.")

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            team_id_by_nba_id = read_team_ids(cursor)
            player_id_by_nba_id = select_player_ids_by_nba_id(cursor)

        print(f"Found {len(team_id_by_nba_id)} teams and {len(player_id_by_nba_id)} players already in the database.")
        if not team_id_by_nba_id or not player_id_by_nba_id:
            # Bailing out beats writing games whose stat rows would all be
            # skipped for want of a roster to attach them to.
            print("Nothing to attach postseason games to - run ingest.py first.")
            return

        postseason_game_dates = collect_postseason_game_dates(season)
        postseason_figures = collect_postseason_player_figures(season)

        with connection.cursor() as cursor:
            ingest_games_and_stats(
                cursor, postseason_game_dates, team_id_by_nba_id, player_id_by_nba_id, postseason_figures,
                season=season, store_events=store_events,
            )
        connection.commit()

        print("Postseason ingestion complete.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
