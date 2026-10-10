"""Backfill IngestionBatch rows for games ingested before batch tracking.

The original ingestion pipeline wrote GameEvent rows directly without
creating IngestionBatch records. This script creates one COMPLETED batch
per game, counting existing GameEvent rows so the admin Batches tab has
a historical record to display.

Usage:
    cd apps/ingestion
    python backfill_batches.py
"""

import uuid
from datetime import datetime, timezone

import psycopg2.extras
from db import get_connection


def main():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # Find games that have player stats but no batch record —
            # the historical pipeline wrote PlayerGameStat rows directly
            # without GameEvent/IngestionBatch tracking.
            cur.execute("""
                SELECT g.id AS game_id,
                       COUNT(pgs.id) AS stat_count
                  FROM "Game" g
                  JOIN "PlayerGameStat" pgs ON pgs."gameId" = g.id
             LEFT JOIN "IngestionBatch" ib ON ib."gameId" = g.id
                 WHERE ib.id IS NULL
              GROUP BY g.id
            """)
            rows = cur.fetchall()

            if not rows:
                print("All games already have batch records. Nothing to do.")
                return

            now = datetime.now(timezone.utc)
            values = [
                (
                    str(uuid.uuid4()),
                    row["game_id"],
                    "backfill:pre-batch-tracking",
                    "COMPLETED",
                    now,
                    now,
                    row["stat_count"],
                    0,
                )
                for row in rows
            ]
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO "IngestionBatch"
                    (id, "gameId", source, status, "startedAt", "completedAt",
                     "eventsAccepted", "eventsRejected")
                VALUES %s
                """,
                values,
                page_size=500,
            )

            conn.commit()
            print(f"Created {len(values)} batch records for {len(values)} games.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
