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
  - Total: roughly 900-1050 calls. At RATE_LIMIT_DELAY_SECONDS (1s/call)
    plus retries, expect this to take on the order of 25-35 minutes —
    player bios remain the single largest phase by call count.

Must run from a real residential network, not a cloud host — see
README.md for why (stats.nba.com blocks cloud-provider IP ranges; this is
a documented, repeated community pain point, not a guess).
"""

from db import get_connection
from games import (
    NBA_SEASON_TYPE_PLAY_IN,
    NBA_SEASON_TYPE_PLAYOFFS,
    NBA_SEASON_TYPE_REGULAR,
    classify_game,
    fetch_game_boxscore,
    fetch_recent_games,
    fetch_season_segment_games,
    upsert_game,
    upsert_period_bookend_events,
    upsert_player_game_stat,
)
from player_bios import fetch_player_bio, upsert_player_bio
from player_game_logs import fetch_season_player_game_logs
from rosters import fetch_team_roster, upsert_players
from teams import fetch_all_teams, upsert_teams

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


def collect_recent_game_dates(team_id_by_nba_id: dict[int, str]) -> dict[str, str]:
    """Fetches every team's recent games, returns a deduplicated nbaGameId -> game_date map."""
    game_date_by_nba_game_id: dict[str, str] = {}
    for nba_team_id in team_id_by_nba_id:
        games = fetch_recent_games(nba_team_id, SEASON)
        for game in games:
            game_date_by_nba_game_id[game["nba_game_id"]] = game["game_date"]
        print(f"  Found {len(games)} recent games for team {nba_team_id}.")
    print(f"{len(game_date_by_nba_game_id)} unique games to fetch boxscores for.")
    return game_date_by_nba_game_id


def collect_postseason_game_dates() -> dict[str, str]:
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
    game_date_by_nba_game_id: dict[str, str] = {}
    for nba_season_type in (NBA_SEASON_TYPE_PLAY_IN, NBA_SEASON_TYPE_PLAYOFFS):
        games = fetch_season_segment_games(SEASON, nba_season_type)
        for game in games:
            game_date_by_nba_game_id[game["nba_game_id"]] = game["game_date"]
        print(f"  Found {len(games)} {nba_season_type} games.")
    print(f"{len(game_date_by_nba_game_id)} unique postseason games to fetch boxscores for.")
    return game_date_by_nba_game_id


def collect_postseason_player_figures() -> dict[tuple[str, int], dict]:
    """Fetches plus/minus and advanced figures for both postseason segments.

    Four calls total (two measure types per segment) covering every
    play-in and playoff player-game. The two segments' game ids don't
    overlap, so merging them into one lookup is safe — see
    collect_postseason_game_dates.
    """
    figures_by_player_game: dict[tuple[str, int], dict] = {}
    for nba_season_type in (NBA_SEASON_TYPE_PLAY_IN, NBA_SEASON_TYPE_PLAYOFFS):
        segment_figures = fetch_season_player_game_logs(SEASON, nba_season_type)
        figures_by_player_game.update(segment_figures)
        print(f"  Fetched {len(segment_figures)} {nba_season_type} player-game figures.")
    return figures_by_player_game


def ingest_games_and_stats(
    cursor,
    game_date_by_nba_game_id: dict[str, str],
    team_id_by_nba_id: dict[int, str],
    player_id_by_nba_id: dict[int, str],
    extra_figures_by_player_game: dict[tuple[str, int], dict] | None = None,
) -> None:
    """Fetches and writes one Game + its PlayerGameStat rows per game id.

    Season-type agnostic: each game's segment (regular season, play-in,
    playoffs, finals) is derived from its own game id by classify_game(),
    so this runs unchanged over a regular-season or a postseason batch and
    a re-run always lands a game in the same segment. Everything below
    classification — boxscores, period bookends, per-player stat rows — is
    already segment-independent.

    `extra_figures_by_player_game` supplies plus/minus, the rebound split
    and the advanced figures, keyed by (nba_game_id, nba_player_id) — see
    player_game_logs.py. It is fetched once for the whole segment rather
    than per game, so it costs a couple of calls instead of one per game.
    A player-game missing from it is written with null figures rather than
    skipped: a missing usage rate is worth far less than a missing game,
    and a later run fills it in.
    """
    extra_figures_by_player_game = extra_figures_by_player_game or {}
    skipped_unknown_players = 0
    player_games_missing_extra_figures = 0
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
        upsert_period_bookend_events(cursor, game_internal_id)

        for player_stats in boxscore["players"]:
            player_internal_id = player_id_by_nba_id.get(player_stats["nba_player_id"])
            if player_internal_id is None:
                # A player who appeared in this box score but isn't on any
                # ingested roster (two-way/G-League call-up, or traded
                # since the roster snapshot was fetched) — skip just this
                # stat row rather than failing the whole game.
                skipped_unknown_players += 1
                continue
            traditional_stats = {key: value for key, value in player_stats.items() if key != "nba_player_id"}
            extra_figures = extra_figures_by_player_game.get((nba_game_id, player_stats["nba_player_id"]))
            if extra_figures is None:
                # A player-game the leaguewide feed doesn't carry — most
                # often a DNP, which genuinely has no usage rate.
                extra_figures = {}
                player_games_missing_extra_figures += 1
            upsert_player_game_stat(cursor, player_internal_id, game_internal_id, {**traditional_stats, **extra_figures})

    print(f"Ingested {len(game_date_by_nba_game_id)} games.")
    if player_games_missing_extra_figures:
        print(f"{player_games_missing_extra_figures} player-games had no plus/minus or advanced figures (left null).")
    if skipped_unknown_players:
        print(f"Skipped {skipped_unknown_players} stat rows for players not on any ingested roster.")


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            team_id_by_nba_id = ingest_teams(cursor)
        connection.commit()

        with connection.cursor() as cursor:
            player_id_by_nba_id = ingest_rosters(cursor, team_id_by_nba_id)
        connection.commit()

        with connection.cursor() as cursor:
            ingest_player_bios(cursor, player_id_by_nba_id)
        connection.commit()

        game_date_by_nba_game_id = collect_recent_game_dates(team_id_by_nba_id)
        # Two calls for the whole regular season, rather than two per game.
        regular_season_figures = fetch_season_player_game_logs(SEASON, NBA_SEASON_TYPE_REGULAR)
        print(f"Fetched plus/minus and advanced figures for {len(regular_season_figures)} regular-season player-games.")

        with connection.cursor() as cursor:
            ingest_games_and_stats(
                cursor, game_date_by_nba_game_id, team_id_by_nba_id, player_id_by_nba_id, regular_season_figures
            )
        connection.commit()

        # Postseason runs last and commits separately, so a failure here
        # leaves a complete regular season behind rather than rolling one
        # back — and, like every other phase, it's idempotent and can be
        # re-run on its own.
        postseason_game_dates = collect_postseason_game_dates()
        postseason_figures = collect_postseason_player_figures()

        with connection.cursor() as cursor:
            ingest_games_and_stats(
                cursor, postseason_game_dates, team_id_by_nba_id, player_id_by_nba_id, postseason_figures
            )
        connection.commit()

        print("Ingestion complete.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
