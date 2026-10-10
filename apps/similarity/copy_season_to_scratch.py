"""Copies one season from the database DATABASE_URL points at into a local
scratch database, so the archetype writer can be exercised at real scale.

WHY THIS EXISTS. build_archetypes.py needs a fully ingested season — it
refuses to fit nine archetypes from fewer than ninety eligible players, and
a development database seeded with a dozen mock players is nowhere near
that. So the only way to watch the writer actually write is against real
data, and the obvious shortcut is to point it at production and pass
--apply. Do not do that: production is where the live site reads from, the
archetype tables may not even exist there yet, and a model fit from an
unreviewed branch has no business being written to it.

This script gets the same answer safely. It reads production (read-only,
enforced by the server) and writes a copy into a scratch database on
localhost, where --apply can run freely and be re-run, inspected and thrown
away.

    # 1. create the scratch database and give it the schema
    docker exec nba-analytics-postgres psql -U postgres \\
        -c "CREATE DATABASE archetype_fit_test;"
    cd apps/api && DATABASE_URL="postgresql://postgres:postgres@localhost:55432/archetype_fit_test" \\
        npx prisma migrate deploy

    # 2. copy a season into it (DATABASE_URL here is the SOURCE, normally prod)
    cd apps/similarity && python copy_season_to_scratch.py --season 2025-26

    # 3. fit and write against the copy
    DATABASE_URL="postgresql://postgres:postgres@localhost:55432/archetype_fit_test" \\
        python build_archetypes.py --apply

    # 4. throw it away
    docker exec nba-analytics-postgres psql -U postgres \\
        -c "DROP DATABASE archetype_fit_test;"

A NOTE ON WHERE THE SCRATCH DATABASE LIVES. Use the development Postgres on
55432, not the test one on 55433: docker-compose.yml mounts the test
instance's data on tmpfs, which is RAM. A season is thirty-odd thousand box
score rows, and putting that in RAM on a modest machine is enough to make
the next `import scipy` fail with MemoryError.
"""

import argparse
import sys
from urllib.parse import urlsplit

import psycopg2
import psycopg2.extras

import db

# Copied in this order because each depends on the ones before it: a game
# references two teams, a box score references a game and a player.
COPIED_TABLES_IN_DEPENDENCY_ORDER = ["Team", "Player", "Game", "PlayerGameStat"]

# Hosts a scratch copy may be written to. This script is the one thing here
# that writes to a database it did not read from, so it refuses to target
# anything but a local one — the whole point is to keep a real fit away
# from production, and a mistyped URL would defeat it silently.
ALLOWED_TARGET_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

INSERT_BATCH_SIZE = 1000


def parse_arguments():
    """Reads the season to copy and where to put it."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--season", required=True, help="Season to copy, e.g. 2025-26."
    )
    parser.add_argument(
        "--target",
        default="postgresql://postgres:postgres@localhost:55432/archetype_fit_test",
        help="Scratch database to copy into. Must be on localhost.",
    )
    return parser.parse_args()


def assert_target_is_local(target_url: str) -> None:
    """Refuses to write anywhere but a local database.

    Raises:
        RuntimeError: when the target is not on a local host.
    """
    host = urlsplit(target_url).hostname
    if host not in ALLOWED_TARGET_HOSTS:
        raise RuntimeError(
            f"Refusing to copy into {host}: this script only writes to a local "
            "scratch database. Its entire purpose is to keep a test fit away "
            "from a real one."
        )


def read_column_names(connection, table_name: str) -> list[str]:
    """Reads a table's columns from the target, in declaration order.

    Introspected rather than listed in this file so that a column added to
    the Prisma schema is copied automatically. A hand-written list would go
    stale silently, and the failure — a feature quietly computed from a
    column that was never copied — would be hard to spot.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """,
            (table_name,),
        )
        return [row["column_name"] for row in cursor.fetchall()]


def copy_table(source, target, table_name: str, where_clause: str = "", parameters=()) -> int:
    """Copies one table's rows from source to target.

    Existing rows are left alone rather than overwritten, so the script can
    be re-run to top up a scratch database without first emptying it.

    Args:
        source: connection to read from.
        target: connection to write to.
        table_name: the table to copy.
        where_clause: optional SQL filter, e.g. 'WHERE season = %s'.
        parameters: parameters for the filter.

    Returns:
        How many rows were read.
    """
    column_names = read_column_names(target, table_name)
    quoted_columns = ", ".join(f'"{name}"' for name in column_names)

    with source.cursor() as reader:
        reader.execute(f'SELECT {quoted_columns} FROM "{table_name}" {where_clause}', parameters)
        rows = [tuple(row[name] for name in column_names) for row in reader.fetchall()]

    if rows:
        with target.cursor() as writer:
            psycopg2.extras.execute_values(
                writer,
                f'INSERT INTO "{table_name}" ({quoted_columns}) VALUES %s ON CONFLICT DO NOTHING',
                rows,
                page_size=INSERT_BATCH_SIZE,
            )
    target.commit()
    return len(rows)


def copy_season(source, target, season: str) -> None:
    """Copies everything the archetype model reads for one season.

    Teams and players are copied whole rather than filtered to the season:
    a box score references a player, and working out which players appeared
    is more work than simply copying all five hundred of them.
    """
    filters = {
        "Game": ("WHERE season = %s", (season,)),
        "PlayerGameStat": (
            'WHERE "gameId" IN (SELECT id FROM "Game" WHERE season = %s)',
            (season,),
        ),
    }
    for table_name in COPIED_TABLES_IN_DEPENDENCY_ORDER:
        where_clause, parameters = filters.get(table_name, ("", ()))
        copied = copy_table(source, target, table_name, where_clause, parameters)
        print(f"  {table_name}: {copied} rows")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    arguments = parse_arguments()
    assert_target_is_local(arguments.target)

    source = db.get_connection(read_only=True)
    target = psycopg2.connect(arguments.target, cursor_factory=psycopg2.extras.RealDictCursor)
    print(f"Copying {arguments.season}")
    print(f"  from {db.describe_connection_target()} (read-only)")
    print(f"  to   {urlsplit(arguments.target).hostname}:{urlsplit(arguments.target).port}"
          f"{urlsplit(arguments.target).path}")
    try:
        copy_season(source, target, arguments.season)
    finally:
        source.close()
        target.close()
    print("\n  Done. Now fit against the copy:")
    print(f'    DATABASE_URL="{arguments.target}" python build_archetypes.py --apply')


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as refusal:
        print(f"\n  {refusal}", file=sys.stderr)
        sys.exit(1)
