"""One-off backfill: fills plus/minus, the offensive/defensive rebound
split, and usage/offensive/defensive ratings on PlayerGameStat rows that
predate those columns, without re-fetching anything else.

Use this on a database populated before the advanced columns existed —
including production. It leaves every counting stat, roster, bio and game
row untouched and only writes the six columns added by the
add_advanced_player_game_stats migration.

Why not just re-run ingest.py: that phase is recency-windowed. It fetches
each team's GAMES_PER_TEAM (15) most recent games, roughly 400 unique
games, while a season's database holds ~1,240. Re-running it would leave
the older two thirds null forever. This script instead walks the games
*already in the database*, so coverage is whatever you have ingested.

Call budget: 2 calls per season segment (Base and Advanced measure types)
via leaguewide PlayerGameLogs, so 6 calls for a full season including the
postseason — a few seconds, not the ~2,600 calls a per-game endpoint would
need. See player_game_logs.py.

Safe to re-run: every write is an idempotent UPDATE keyed on
(playerId, gameId), and it never nulls out a figure it can't find.

Must run from a real residential network, not a cloud host - see
README.md for why (stats.nba.com blocks cloud-provider IP ranges).

Run from apps/ingestion:
    python backfill_advanced_stats.py
"""

from db import get_connection
from games import NBA_SEASON_TYPE_PLAY_IN, NBA_SEASON_TYPE_PLAYOFFS, NBA_SEASON_TYPE_REGULAR
from ingest import SEASON
from player_game_logs import fetch_season_player_game_logs

# Every segment a Game can belong to, as nba_api spells it. FINALS isn't
# listed because the NBA has no separate season type for it — Finals games
# come back under Playoffs (see games.py's classify_game).
NBA_SEASON_TYPES_TO_BACKFILL = (
    NBA_SEASON_TYPE_REGULAR,
    NBA_SEASON_TYPE_PLAY_IN,
    NBA_SEASON_TYPE_PLAYOFFS,
)

# Commit every this many updated rows rather than once at the very end, so
# an interrupted run keeps the work it already did — the same batching
# backfill_player_bios.py uses.
COMMIT_EVERY_ROWS = 500


def read_player_game_keys(cursor) -> list[dict]:
    """Reads every stored player-game as its real NBA ids plus internal ids.

    Returns rows of {nba_game_id, nba_player_id, player_id, game_id} — the
    NBA ids to look the figures up by, and the internal ids to write back
    against.
    """
    cursor.execute(
        """
        SELECT g."nbaGameId" AS nba_game_id, p."nbaPlayerId" AS nba_player_id,
               pgs."playerId" AS player_id, pgs."gameId" AS game_id
        FROM "PlayerGameStat" pgs
        JOIN "Game" g ON g."id" = pgs."gameId"
        JOIN "Player" p ON p."id" = pgs."playerId"
        """
    )
    return cursor.fetchall()


def update_player_game_figures(cursor, player_id: str, game_id: str, figures: dict) -> None:
    """Writes only the six backfilled columns for one (player, game).

    COALESCE on every column means a figure the feed didn't carry leaves
    whatever is already stored alone, rather than overwriting a real value
    with a null.
    """
    cursor.execute(
        """
        UPDATE "PlayerGameStat" SET
            "plusMinus" = COALESCE(%(plus_minus)s, "plusMinus"),
            "offensiveRebounds" = COALESCE(%(offensive_rebounds)s, "offensiveRebounds"),
            "defensiveRebounds" = COALESCE(%(defensive_rebounds)s, "defensiveRebounds"),
            "usagePercentage" = COALESCE(%(usage_percentage)s, "usagePercentage"),
            "offensiveRating" = COALESCE(%(offensive_rating)s, "offensiveRating"),
            "defensiveRating" = COALESCE(%(defensive_rating)s, "defensiveRating")
        WHERE "playerId" = %(player_id)s AND "gameId" = %(game_id)s
        """,
        {"player_id": player_id, "game_id": game_id, **figures},
    )


def fetch_all_segment_figures() -> dict[tuple[str, int], dict]:
    """Fetches every segment's per-player figures into one lookup.

    Segments' game ids don't overlap (different id prefixes), so merging
    them into a single (nba_game_id, nba_player_id) map is safe.
    """
    figures_by_player_game: dict[tuple[str, int], dict] = {}
    for nba_season_type in NBA_SEASON_TYPES_TO_BACKFILL:
        segment_figures = fetch_season_player_game_logs(SEASON, nba_season_type)
        figures_by_player_game.update(segment_figures)
        print(f"  Fetched {len(segment_figures)} {nba_season_type} player-game rows.")
    return figures_by_player_game


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            player_games = read_player_game_keys(cursor)
        print(f"Found {len(player_games)} stored player-games to backfill.")

        figures_by_player_game = fetch_all_segment_figures()
        print(f"{len(figures_by_player_game)} player-game rows available from the API.")

        updated = 0
        not_in_feed = 0
        with connection.cursor() as cursor:
            for row in player_games:
                figures = figures_by_player_game.get((row["nba_game_id"], row["nba_player_id"]))
                if figures is None:
                    # Most often a DNP, which genuinely has no usage rate,
                    # or a game not in this season's feed (e.g. seed
                    # fixtures). Left null rather than zeroed.
                    not_in_feed += 1
                    continue
                update_player_game_figures(cursor, row["player_id"], row["game_id"], figures)
                updated += 1
                if updated % COMMIT_EVERY_ROWS == 0:
                    connection.commit()
                    print(f"  Backfilled {updated} player-games so far...")

        connection.commit()
        print(f"Done. Backfilled {updated} player-games.")
        if not_in_feed:
            print(f"{not_in_feed} player-games had no row in the feed (DNPs or non-season games); left as they were.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
