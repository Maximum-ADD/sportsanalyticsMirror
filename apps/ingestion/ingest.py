"""Populates Postgres with real NBA data via nba_api: all 30 teams, their
current rosters, each team's most recent games with real per-player
boxscores, and the season's full postseason (play-in, playoffs, finals).

Call budget (see README.md for the rate-limit/reliability background this
was designed around):
  - Teams: 0 calls (nba_api.stats.static.teams is bundled, no network).
  - Rosters: 30 calls (one CommonTeamRoster per team).
  - Player bios: one CommonPlayerInfo call per ingested player (~450-500
    for the full league) — see player_bios.py's module docstring.
  - Recent games: 30 calls (one LeagueGameFinder per team, kept to each
    team's newest GAMES_PER_TEAM games — see games.py's module docstring).
  - Boxscores: one BoxScoreTraditionalV3 call per unique game id, up to
    30 * GAMES_PER_TEAM, deduplicated by game id (two teams sharing a game
    only cost one call) — in practice well under that since most of a
    team's recent 15 games are against other teams whose own recent 15
    also include that game.
  - Play-by-play: one PlayByPlayV3 call per unique game id, alongside each
    boxscore call above (same dedup, same ~+8-9 min at RATE_LIMIT_DELAY_
    SECONDS) — see play_by_play.py. Its accepted GameEvent rows are what
    derive_player_game_stats.py actually aggregates into the counting
    stats below; minutes and plus/minus still come from the boxscore call.
  - Plus/minus and advanced figures: 2 calls for the entire regular season
    and 4 for the postseason (two measure types per segment), via
    leaguewide PlayerGameLogs — not one call per game. See
    player_game_logs.py for why that endpoint rather than
    BoxScoreAdvancedV3: 6 calls instead of ~900.
  - Postseason game ids: 2 calls (one leaguewide LeagueGameLog per
    segment — play-in and playoffs — instead of another 60 per-team calls;
    see games.py's fetch_season_segment_games).
  - Postseason boxscores: ~90 calls (verified live for 2025-26: 6 play-in
    games and 85 playoff games, Finals included). Deduplicated against
    nothing else — postseason ids don't overlap the regular-season ones.
  - Total: roughly 1400-1500 calls (900-1050 plus the new play-by-play
    line above, ~1 extra call per boxscore). At RATE_LIMIT_DELAY_SECONDS
    (1s/call) plus retries, expect this to take on the order of 35-45
    minutes — player bios remain the single largest phase by call count.

Must run from a real residential network, not a cloud host — see
README.md for why (stats.nba.com blocks cloud-provider IP ranges; this is
a documented, repeated community pain point, not a guess).
"""

import argparse

from db import get_connection
from derive_player_game_stats import aggregate_player_game_stats
from game_window import GameWindow, build_game_window, filter_games_by_window
from games import (
    NBA_SEASON_TYPE_PLAY_IN,
    NBA_SEASON_TYPE_PLAYOFFS,
    NBA_SEASON_TYPE_REGULAR,
    classify_game,
    fetch_game_boxscore,
    fetch_recent_games,
    fetch_season_segment_games,
    upsert_game,
    upsert_player_game_stat,
)
from play_by_play import run_ingestion_batch
from player_bios import fetch_player_bio, upsert_player_bio
from player_game_logs import fetch_season_player_game_logs
from rosters import fetch_team_roster, select_first_names_by_nba_id, upsert_players
from teams import fetch_all_teams, upsert_teams

# The season a pull covers unless --season overrides it. Kept as a module
# constant (rather than inlined) so the other ingestion scripts importing it
# keep working unchanged.
SEASON = "2025-26"


def ingest_teams(cursor) -> dict[int, str]:
    """Ingests all 30 teams, returns nbaTeamId -> internal id."""
    teams = fetch_all_teams()
    team_id_by_nba_id = upsert_teams(cursor, teams)
    print(f"Ingested {len(team_id_by_nba_id)} teams.")
    return team_id_by_nba_id


def ingest_rosters(cursor, team_id_by_nba_id: dict[int, str]) -> dict[int, str]:
    """Ingests every team's current roster, returns nbaPlayerId -> internal id."""
    player_id_by_nba_id: dict[int, str] = {}
    for nba_team_id, team_internal_id in team_id_by_nba_id.items():
        players = fetch_team_roster(nba_team_id, SEASON)
        player_id_by_nba_id.update(upsert_players(cursor, players, team_internal_id))
        print(f"  Ingested {len(players)} players for team {nba_team_id}.")
    print(f"Ingested {len(player_id_by_nba_id)} players total.")
    return player_id_by_nba_id


def ingest_player_bios(cursor, player_id_by_nba_id: dict[int, str]) -> None:
    """Enriches every already-ingested player with CommonPlayerInfo bio fields.

    One call per player - the most expensive phase by call count (~450-500
    calls vs. 30 for rosters), so this runs after rosters/teams, not before,
    in case an earlier phase fails first and this can be skipped on retry.
    """
    updated = 0
    for nba_player_id in player_id_by_nba_id:
        bio = fetch_player_bio(nba_player_id)
        upsert_player_bio(cursor, bio)
        updated += 1
        if updated % 50 == 0:
            print(f"  Enriched {updated}/{len(player_id_by_nba_id)} player bios so far.")
    print(f"Enriched {updated} player bios.")


def select_players_missing_bios(cursor, player_id_by_nba_id: dict[int, str]) -> dict[int, str]:
    """The subset of players whose bio has never been fetched.

    "Never fetched" means birthDate is null: upsert_player_bio always writes
    it, so a player with one has had a CommonPlayerInfo call before. A
    windowed pull uses this to fetch bios only for new arrivals (call-ups,
    signings) rather than every rostered player — bios are ~450-500 calls,
    the single biggest fixed cost of a pull, and almost never change.

    A player whose NBA bio genuinely has no birth date stays in this set and
    is re-fetched on each windowed pull; that is a handful of calls at most.
    Full refreshes remain the job of an unwindowed pull or
    backfill_player_bios.py.
    """
    if not player_id_by_nba_id:
        return {}
    cursor.execute(
        'SELECT "nbaPlayerId" FROM "Player" WHERE "birthDate" IS NULL AND "nbaPlayerId" = ANY(%s)',
        (list(player_id_by_nba_id),),
    )
    # get_connection uses RealDictCursor, so rows are keyed by column name.
    missing_nba_ids = {row["nbaPlayerId"] for row in cursor.fetchall()}
    return {nba_id: player_id for nba_id, player_id in player_id_by_nba_id.items() if nba_id in missing_nba_ids}


def collect_recent_game_dates(
    team_id_by_nba_id: dict[int, str],
    season: str = SEASON,
    window: GameWindow | None = None,
) -> dict[str, str]:
    """Returns the regular-season games a pull should cover, as a
    deduplicated nbaGameId -> ISO game_date map.

    With no window, each team's newest GAMES_PER_TEAM games — the previous
    behaviour, unchanged. With a window, every regular-season game in it,
    found with one leaguewide call; see collect_windowed_game_dates.
    """
    selection_window = window or GameWindow()
    if selection_window.is_open:
        return collect_recent_game_dates_per_team(team_id_by_nba_id, season)
    return collect_windowed_game_dates(season, selection_window)


def collect_recent_game_dates_per_team(team_id_by_nba_id: dict[int, str], season: str) -> dict[str, str]:
    """Each team's newest GAMES_PER_TEAM games, one LeagueGameFinder call per
    team (30 calls). A recency window per team is the right shape for
    "catch up on what just happened", which is what an unwindowed pull is."""
    game_date_by_nba_game_id: dict[str, str] = {}
    for nba_team_id in team_id_by_nba_id:
        games = fetch_recent_games(nba_team_id, season)
        for game in games:
            game_date_by_nba_game_id[game["nba_game_id"]] = game["game_date"]
        print(f"  Found {len(games)} recent games for team {nba_team_id}.")

    selected = filter_games_by_window(game_date_by_nba_game_id, GameWindow())
    print(f"{len(selected)} unique games to fetch boxscores for.")
    return selected


def collect_windowed_game_dates(season: str, window: GameWindow) -> dict[str, str]:
    """Every regular-season game inside the window, from ONE leaguewide
    LeagueGameLog call (the same call the postseason phase uses) instead of
    30 per-team calls.

    Per-team calls were only ever needed for the "newest N per team" shape;
    a date window wants every game in a range regardless of team, which the
    leaguewide log gives directly — and it can't miss games older than a
    team's newest N, which the per-team call would.
    """
    games = fetch_season_segment_games(season, NBA_SEASON_TYPE_REGULAR)
    game_date_by_nba_game_id = {game["nba_game_id"]: game["game_date"] for game in games}

    selected = filter_games_by_window(game_date_by_nba_game_id, window)
    print(f"  {len(selected)} of {len(game_date_by_nba_game_id)} regular-season games fall within {window.describe()}.")
    print(f"{len(selected)} unique games to fetch boxscores for.")
    return selected


def collect_postseason_game_dates(
    season: str = SEASON, window: GameWindow | None = None
) -> dict[str, str]:
    """Fetches every play-in and playoff game of the season in two API calls.

    Two leaguewide LeagueGameLog calls (one per segment) rather than the
    30-call per-team loop collect_recent_game_dates uses — the postseason
    is small and we want all of it, not a recency window. See
    fetch_season_segment_games.

    Returns the same deduplicated nbaGameId -> game_date map as
    collect_recent_game_dates, so both feed ingest_games_and_stats
    identically. The play-in and playoff id spaces don't overlap (different
    id prefixes), so merging the two segments into one map is safe.
    """
    selection_window = window or GameWindow()
    game_date_by_nba_game_id: dict[str, str] = {}
    for nba_season_type in (NBA_SEASON_TYPE_PLAY_IN, NBA_SEASON_TYPE_PLAYOFFS):
        games = fetch_season_segment_games(season, nba_season_type)
        for game in games:
            game_date_by_nba_game_id[game["nba_game_id"]] = game["game_date"]
        print(f"  Found {len(games)} {nba_season_type} games.")

    selected = filter_games_by_window(game_date_by_nba_game_id, selection_window)
    print(f"{len(selected)} unique postseason games to fetch boxscores for.")
    return selected


def collect_postseason_player_figures(season: str = SEASON) -> dict[tuple[str, int], dict]:
    """Fetches plus/minus and advanced figures for both postseason segments.

    Four calls total (two measure types per segment) covering every
    play-in and playoff player-game. The two segments' game ids don't
    overlap, so merging them into one lookup is safe — see
    collect_postseason_game_dates.
    """
    figures_by_player_game: dict[tuple[str, int], dict] = {}
    for nba_season_type in (NBA_SEASON_TYPE_PLAY_IN, NBA_SEASON_TYPE_PLAYOFFS):
        segment_figures = fetch_season_player_game_logs(season, nba_season_type)
        figures_by_player_game.update(segment_figures)
        print(f"  Fetched {len(segment_figures)} {nba_season_type} player-game figures.")
    return figures_by_player_game


def ingest_games_and_stats(
    cursor,
    game_date_by_nba_game_id: dict[str, str],
    team_id_by_nba_id: dict[int, str],
    player_id_by_nba_id: dict[int, str],
    extra_figures_by_player_game: dict[tuple[str, int], dict] | None = None,
    final_status: str = "COMPLETED",
) -> None:
    """Fetches and writes one Game + its PlayerGameStat rows per game id.

    Season-type agnostic: each game's segment (regular season, play-in,
    playoffs, finals) is derived from its own game id by classify_game(),
    so this runs unchanged over a regular-season or a postseason batch and
    a re-run always lands a game in the same segment. Everything below
    classification — boxscores, play-by-play, per-player stat rows — is
    already segment-independent.

    `extra_figures_by_player_game` supplies plus/minus, and the advanced
    figures, keyed by (nba_game_id, nba_player_id) — see
    player_game_logs.py. It is fetched once for the whole segment rather
    than per game, so it costs a couple of calls instead of one per game.
    A player-game missing from it is written with null figures rather than
    skipped: a missing usage rate is worth far less than a missing game,
    and a later run fills it in.

    The counting stats actually written (points, shooting splits, rebound
    split, assists, steals, blocks, turnovers) come from
    derive_player_game_stats.aggregate_player_game_stats over this game's
    real, just-ingested GameEvent rows (see play_by_play.run_ingestion_batch)
    — not from the boxscore response, which now only supplies minutes and
    plus/minus (see PlayerGameStat's schema doc comment for why those two
    stay boxscore-sourced). A player with no derivable event data for this
    game (the pipeline found nothing to aggregate for them — a batch that
    failed outright, or genuinely zero recorded actions) falls back to the
    boxscore's own counting stats rather than writing a gutted row.
    """
    extra_figures_by_player_game = extra_figures_by_player_game or {}
    skipped_unknown_players = 0
    player_games_missing_extra_figures = 0
    player_games_missing_derived_stats = 0
    for nba_game_id, game_date in game_date_by_nba_game_id.items():
        boxscore = fetch_game_boxscore(nba_game_id)

        home_team_id = team_id_by_nba_id.get(boxscore["home_team_nba_id"])
        away_team_id = team_id_by_nba_id.get(boxscore["away_team_nba_id"])
        if home_team_id is None or away_team_id is None:
            print(f"  Skipping game {nba_game_id}: a team in this game isn't one of the ingested 30.")
            continue

        season_type, playoff_round = classify_game(nba_game_id)
        game_internal_id = upsert_game(
            cursor,
            nba_game_id,
            game_date,
            SEASON,
            home_team_id,
            away_team_id,
            boxscore["home_score"],
            boxscore["away_score"],
            season_type,
            playoff_round,
        )

        batch_summary = run_ingestion_batch(cursor, game_internal_id, nba_game_id, team_id_by_nba_id, player_id_by_nba_id, final_status=final_status)
        if batch_summary["rejected"]:
            print(
                f"  {nba_game_id}: rejected {batch_summary['rejected']} play-by-play rows "
                f"({batch_summary['rejection_counts']}) — see IngestionBatch {batch_summary['batch_id']}."
            )
        accepted_events = batch_summary["accepted_events"]
        first_name_by_nba_id = select_first_names_by_nba_id(cursor, (event.get("personId") for event in accepted_events))
        derived_stats_by_nba_player_id = aggregate_player_game_stats(accepted_events, first_name_by_nba_id)

        for player_stats in boxscore["players"]:
            player_internal_id = player_id_by_nba_id.get(player_stats["nba_player_id"])
            if player_internal_id is None:
                # A player who appeared in this box score but isn't on any
                # ingested roster (two-way/G-League call-up, or traded
                # since the roster snapshot was fetched) — skip just this
                # stat row rather than failing the whole game.
                skipped_unknown_players += 1
                continue
            # The team this player suited up for IN THIS GAME (from the
            # boxscore itself, via games.py's nba_team_id), not their
            # current roster team — see PlayerGameStat.teamId's schema
            # doc comment. home_team_id/away_team_id above are already
            # known-non-None at this point (checked before the loop).
            team_internal_id = team_id_by_nba_id.get(player_stats["nba_team_id"])
            traditional_stats = {
                key: value for key, value in player_stats.items() if key not in ("nba_player_id", "nba_team_id")
            }
            extra_figures = extra_figures_by_player_game.get((nba_game_id, player_stats["nba_player_id"]))
            if extra_figures is None:
                # A player-game the leaguewide feed doesn't carry — most
                # often a DNP, which genuinely has no usage rate.
                extra_figures = {}
                player_games_missing_extra_figures += 1

            merged_stats = {**traditional_stats, **extra_figures}
            derived_stats = derived_stats_by_nba_player_id.get(player_stats["nba_player_id"])
            if derived_stats is not None:
                # Event-derived counting stats are authoritative when
                # present — they overwrite both the boxscore's own values
                # and (for offensive/defensive rebounds) the leaguewide
                # feed's, since real per-play derivation is more honest
                # than either "given" total. minutes/plus_minus are never
                # in derived_stats (see module docstring), so they're
                # untouched regardless.
                merged_stats.update(derived_stats)
            else:
                player_games_missing_derived_stats += 1

            upsert_player_game_stat(cursor, player_internal_id, game_internal_id, team_internal_id, merged_stats)

    print(f"Ingested {len(game_date_by_nba_game_id)} games.")
    if player_games_missing_extra_figures:
        print(f"{player_games_missing_extra_figures} player-games had no plus/minus or advanced figures (left null).")
    if player_games_missing_derived_stats:
        print(
            f"{player_games_missing_derived_stats} player-games had no derivable play-by-play "
            "(kept the boxscore's own counting stats instead)."
        )
    if skipped_unknown_players:
        print(f"Skipped {skipped_unknown_players} stat rows for players not on any ingested roster.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parses the pull's command line.

    Split out from main so the argument contract can be tested without
    running an ingestion. Date arguments are validated here (via
    build_game_window in main) rather than deep in the run, so a typo fails
    in the first second instead of after 40 minutes of API calls.
    """
    parser = argparse.ArgumentParser(
        description="Ingest NBA teams, rosters, games and play-by-play into Postgres."
    )
    parser.add_argument(
        "--review",
        action="store_true",
        help="Land batches as PENDING_REVIEW for admin approval instead of COMPLETED.",
    )
    parser.add_argument(
        "--season",
        default=SEASON,
        help=f"Season to ingest, e.g. 2025-26 (default: {SEASON}).",
    )
    parser.add_argument(
        "--from-date",
        dest="from_date",
        help="Only ingest games on or after this date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--to-date",
        dest="to_date",
        help="Only ingest games on or before this date (YYYY-MM-DD).",
    )
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()

    # --review: sets the ingestion batch status to PENDING_REVIEW instead
    # of COMPLETED, so the admin must approve the events in the review
    # workflow before they count as published.
    batch_status = "PENDING_REVIEW" if args.review else "COMPLETED"
    if args.review:
        print("Running with --review: batches will be set to PENDING_REVIEW for admin approval.")

    # Fails fast on a malformed or inverted window, before any API call.
    window = build_game_window(args.from_date, args.to_date)
    season = args.season
    print(f"Ingesting season {season}: {window.describe()}.")

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            team_id_by_nba_id = ingest_teams(cursor)
        connection.commit()

        with connection.cursor() as cursor:
            player_id_by_nba_id = ingest_rosters(cursor, team_id_by_nba_id)
        connection.commit()

        with connection.cursor() as cursor:
            # A windowed pull is "fetch these games", not "refresh the
            # league": only new players need a bio, and skipping the rest
            # removes ~8 minutes of fixed cost from every narrow pull.
            bio_targets = (
                player_id_by_nba_id
                if window.is_open
                else select_players_missing_bios(cursor, player_id_by_nba_id)
            )
            if not window.is_open:
                print(f"Fetching bios for {len(bio_targets)} new player(s); skipping {len(player_id_by_nba_id) - len(bio_targets)} with bios.")
            ingest_player_bios(cursor, bio_targets)
        connection.commit()

        game_date_by_nba_game_id = collect_recent_game_dates(team_id_by_nba_id, season, window)
        # Two calls for the whole regular season, rather than two per game.
        # Fetched leaguewide regardless of the window: it is 2 calls either
        # way, and the figures are looked up per player-game from the games
        # the window already selected.
        regular_season_figures = fetch_season_player_game_logs(season, NBA_SEASON_TYPE_REGULAR)
        print(f"Fetched plus/minus and advanced figures for {len(regular_season_figures)} regular-season player-games.")

        with connection.cursor() as cursor:
            ingest_games_and_stats(
                cursor, game_date_by_nba_game_id, team_id_by_nba_id, player_id_by_nba_id, regular_season_figures,
                final_status=batch_status,
            )
        connection.commit()

        # Postseason runs last and commits separately, so a failure here
        # leaves a complete regular season behind rather than rolling one
        # back — and, like every other phase, it's idempotent and can be
        # re-run on its own.
        postseason_game_dates = collect_postseason_game_dates(season, window)
        postseason_figures = collect_postseason_player_figures(season)

        with connection.cursor() as cursor:
            ingest_games_and_stats(
                cursor, postseason_game_dates, team_id_by_nba_id, player_id_by_nba_id, postseason_figures,
                final_status=batch_status,
            )
        connection.commit()

        print("Ingestion complete.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
