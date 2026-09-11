"""Populates Postgres with real NBA data via nba_api: all 30 teams, their
current rosters, and each team's most recent games with real per-player
boxscores.

Call budget (see README.md for the rate-limit/reliability background this
was designed around):
  - Teams: 0 calls (nba_api.stats.static.teams is bundled, no network).
  - Rosters: 30 calls (one CommonTeamRoster per team).
  - Player bios: one CommonPlayerInfo call per ingested player (~450-500
    for the full league) — see player_bios.py's module docstring.
  - Recent games: 30 calls (one LeagueGameFinder per team, kept to each
    team's newest GAMES_PER_TEAM games — see games.py's module docstring).
  - Boxscores: up to 30 * GAMES_PER_TEAM calls, deduplicated by game id
    (two teams sharing a game only cost one boxscore call) — in practice
    well under that since most of a team's recent 15 games are against
    other teams whose own recent 15 also include that game.
  - Total: roughly 800-950 calls. At RATE_LIMIT_DELAY_SECONDS (1s/call)
    plus retries, expect this to take on the order of 20-30 minutes —
    roughly double the pre-player-bios estimate, since bios are now the
    single largest phase by call count.

Must run from a real residential network, not a cloud host — see
README.md for why (stats.nba.com blocks cloud-provider IP ranges; this is
a documented, repeated community pain point, not a guess).
"""

from db import get_connection
from games import fetch_game_boxscore, fetch_recent_games, upsert_game, upsert_period_bookend_events, upsert_player_game_stat
from player_bios import fetch_player_bio, upsert_player_bio
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


def ingest_games_and_stats(
    cursor,
    game_date_by_nba_game_id: dict[str, str],
    team_id_by_nba_id: dict[int, str],
    player_id_by_nba_id: dict[int, str],
) -> None:
    """Fetches and writes one Game + its PlayerGameStat rows per game id."""
    skipped_unknown_players = 0
    for nba_game_id, game_date in game_date_by_nba_game_id.items():
        boxscore = fetch_game_boxscore(nba_game_id)

        home_team_id = team_id_by_nba_id.get(boxscore["home_team_nba_id"])
        away_team_id = team_id_by_nba_id.get(boxscore["away_team_nba_id"])
        if home_team_id is None or away_team_id is None:
            print(f"  Skipping game {nba_game_id}: a team in this game isn't one of the ingested 30.")
            continue

        game_internal_id = upsert_game(
            cursor,
            nba_game_id,
            game_date,
            SEASON,
            home_team_id,
            away_team_id,
            boxscore["home_score"],
            boxscore["away_score"],
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
            upsert_player_game_stat(
                cursor,
                player_internal_id,
                game_internal_id,
                {key: value for key, value in player_stats.items() if key != "nba_player_id"},
            )

    print(f"Ingested {len(game_date_by_nba_game_id)} games.")
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

        with connection.cursor() as cursor:
            ingest_games_and_stats(cursor, game_date_by_nba_game_id, team_id_by_nba_id, player_id_by_nba_id)
        connection.commit()

        print("Ingestion complete.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
