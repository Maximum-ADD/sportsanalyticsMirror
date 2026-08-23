"""One-off backfill: enriches every Player already in the database with bio
fields from CommonPlayerInfo, without re-running teams/rosters/games/boxscores.

Use this when Player rows already exist (from an earlier rosters.py run)
and only the bio-enrichment step is needed. For a fresh database with no
players yet, use ingest.py instead - this script does nothing useful
against an empty Player table.

Run from apps/ingestion:
    python backfill_player_bios.py
"""

from db import get_connection
from player_bios import fetch_player_bio, upsert_player_bio


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT "nbaPlayerId" FROM "Player"')
            nba_player_ids = [row["nbaPlayerId"] for row in cursor.fetchall()]

        print(f"Found {len(nba_player_ids)} players already in the database.")

        with connection.cursor() as cursor:
            updated = 0
            for nba_player_id in nba_player_ids:
                bio = fetch_player_bio(nba_player_id)
                upsert_player_bio(cursor, bio)
                updated += 1
                if updated % 25 == 0:
                    print(f"  Enriched {updated}/{len(nba_player_ids)} so far...")
                    connection.commit()  # commit in batches, not just once at the very end

        connection.commit()
        print(f"Done. Enriched {updated} player bios.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
