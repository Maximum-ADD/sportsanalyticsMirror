"""Ingests one FULLY COMPLETED prior season's games and boxscores — not
rosters, and not capped at GAMES_PER_TEAM the way ingest.py's current-
season pull is.

Why a separate script rather than a --season flag on ingest.py: this has
two real behavioral differences from ingest.py, not just a different
constant —
  1. Every game in the season, not the most-recent-15 cap that makes sense
     for "what's the current state of a season in progress." A completed
     season needs its full ~82 games/team to be useful training signal for
     elo.py's Elo model — see games.py's fetch_recent_games docstring for
     why `limit` now takes a much larger value here.
  2. Deliberately does NOT touch rosters/Player.teamId. Ingesting an old
     season's roster would overwrite Player.teamId with stale data for
     any player traded since — corrupting the CURRENT team shown on
     player profile/list pages, which real users depend on. Instead this
     resolves players against whatever's ALREADY in the Player table
     (populated by ingest.py's current-season roster pull) and skips any
     player not found there — same precedent ingest.py already uses for
     two-way/G-League call-ups not on a standard roster. This does mean a
     player who left the league entirely before the current season won't
     have their historical games ingested (they're in no current roster
     to resolve against) — an accepted, documented tradeoff, not a bug.

Each game's PlayerGameStat.teamId (the team a player suited up for IN THAT
GAME, from the boxscore itself) is written correctly regardless of
Player.teamId — that's the field elo.py/four_factors.py actually need for
historical accuracy, and it doesn't have the "which season's data wins"
problem Player.teamId does, since it's scoped per-game, not per-player.

Call budget for one season: 30 LeagueGameFinder calls (one per team) plus
up to ~1,230 boxscore calls (30 teams * ~82 games / 2, since each game is
shared by two teams and deduplicated by game id) — roughly 1,260 stats.nba.com
calls, ~20-25 minutes at RATE_LIMIT_DELAY_SECONDS. Same residential-network
requirement as ingest.py — see its module docstring / README.md.

Opens (and closes) a fresh DB connection for every single game, not one
connection for the whole run — see _write_one_game_with_fresh_connection's
docstring for why: this project's Supabase pooler was confirmed live to
kill a connection idle for as little as 5 seconds, well under the time a
single rate-limited stats.nba.com call plus its surrounding Python takes.
This adds one extra network round-trip per game (a new Postgres
connection) on top of the boxscore call, but each game is durably
committed the instant it's written, so a crash or interrupted run loses
at most one in-flight game rather than an unsaved batch — and simply
re-running the script picks up wherever it left off (every write here is
an idempotent upsert).

Usage: python ingest_historical_season.py 2024-25
"""

import sys

import psycopg2

from db import get_connection
from games import fetch_game_boxscore, fetch_recent_games, upsert_game, upsert_period_bookend_events, upsert_player_game_stat

# Comfortably above a real season's ~82 games/team (including a healthy
# margin for teams that played more due to play-in/playoff games counted
# by LeagueGameFinder under the same season code) — see games.py's
# fetch_recent_games docstring for why the current-season pull uses a much
# smaller cap instead.
GAMES_PER_TEAM_FULL_SEASON = 100


def team_id_by_nba_id_map(cursor) -> dict[int, str]:
    cursor.execute('SELECT "id", "nbaTeamId" FROM "Team"')
    return {row["nbaTeamId"]: row["id"] for row in cursor.fetchall()}


def player_id_by_nba_id_map(cursor) -> dict[int, str]:
    """Players already known from a CURRENT-season roster pull (ingest.py)
    — deliberately not re-fetched per historical season, see module
    docstring."""
    cursor.execute('SELECT "id", "nbaPlayerId" FROM "Player"')
    return {row["nbaPlayerId"]: row["id"] for row in cursor.fetchall()}


def collect_season_game_dates(season: str, team_id_by_nba_id: dict[int, str]) -> dict[str, str]:
    game_date_by_nba_game_id: dict[str, str] = {}
    for nba_team_id in team_id_by_nba_id:
        games = fetch_recent_games(nba_team_id, season, limit=GAMES_PER_TEAM_FULL_SEASON)
        for game in games:
            game_date_by_nba_game_id[game["nba_game_id"]] = game["game_date"]
        print(f"  Found {len(games)} games for team {nba_team_id} in {season}.")
    print(f"{len(game_date_by_nba_game_id)} unique games to fetch boxscores for.")
    return game_date_by_nba_game_id


def _write_one_game(cursor, season, nba_game_id, game_date, boxscore, home_team_id, away_team_id, team_id_by_nba_id, player_id_by_nba_id):
    """One game's worth of writes (Game + bookend events + every
    PlayerGameStat row) — split out so it can be retried as a unit against
    a fresh cursor/connection if the one it started on drops mid-write.
    Returns (skipped_unknown_players, skipped_unknown_teams) for this game.
    """
    game_internal_id = upsert_game(
        cursor, nba_game_id, game_date, season, home_team_id, away_team_id, boxscore["home_score"], boxscore["away_score"]
    )
    upsert_period_bookend_events(cursor, game_internal_id)

    skipped_unknown_players = 0
    skipped_unknown_teams = 0
    for player_stats in boxscore["players"]:
        player_internal_id = player_id_by_nba_id.get(player_stats["nba_player_id"])
        if player_internal_id is None:
            skipped_unknown_players += 1
            continue
        team_internal_id = team_id_by_nba_id.get(player_stats["nba_team_id"])
        if team_internal_id is None:
            skipped_unknown_teams += 1
            continue
        upsert_player_game_stat(
            cursor,
            player_internal_id,
            game_internal_id,
            team_internal_id,
            {key: value for key, value in player_stats.items() if key not in ("nba_player_id", "nba_team_id")},
        )
    return skipped_unknown_players, skipped_unknown_teams


def _write_one_game_with_fresh_connection(season, nba_game_id, game_date, boxscore, home_team_id, away_team_id, team_id_by_nba_id, player_id_by_nba_id):
    """Opens a connection, writes+commits this one game, closes it —
    called fresh for every game rather than reusing one connection across
    the whole loop. Confirmed live (not assumed): this project's Supabase
    pooler kills an idle connection after as little as 5 seconds — a
    single `SELECT 1` on a connection left idle for 5s already failed with
    "server closed the connection unexpectedly" in a one-off test. Each
    game here involves a ~1s+ rate-limited network call to stats.nba.com
    (fetch_game_boxscore) BEFORE the DB write, which alone can exceed that
    5s budget if a connection were held open across it — so no connection
    reuse across games survives this loop's actual timing. Retries once
    on a connection failure (a fresh connection can itself occasionally
    fail to establish, same as any network call) before giving up on this
    one game and letting the caller move on to the next.
    """
    for attempt in (1, 2):
        try:
            connection = get_connection()
            try:
                with connection.cursor() as cursor:
                    result = _write_one_game(
                        cursor, season, nba_game_id, game_date, boxscore, home_team_id, away_team_id, team_id_by_nba_id, player_id_by_nba_id
                    )
                connection.commit()
                return result
            finally:
                connection.close()
        except psycopg2.OperationalError as error:
            if attempt == 2:
                raise
            print(f"    Connection issue on game {nba_game_id} ({error}). Retrying once...")


def ingest_season_games_and_stats(
    season: str,
    game_date_by_nba_game_id: dict[str, str],
    team_id_by_nba_id: dict[int, str],
    player_id_by_nba_id: dict[int, str],
) -> None:
    """One fresh connection per game, committed immediately — see
    _write_one_game_with_fresh_connection's docstring for why a single
    long-lived connection doesn't survive this loop's actual timing
    against this project's Supabase pooler. This also means every game is
    already durably committed the moment it's written, so there's no
    separate "commit every N games" checkpoint needed the way an earlier
    version of this function had — a crash mid-run loses at most the one
    game in flight, not a whole batch.

    A game whose write fails outright (both connection attempts in
    _write_one_game_with_fresh_connection exhausted) is skipped with a
    logged warning rather than aborting the whole season — re-running this
    script is a safe, idempotent way to pick up anything a specific game
    failed on, without losing everything ingested around it.
    """
    skipped_unknown_players = 0
    skipped_unknown_teams = 0
    skipped_failed_games = 0
    for i, (nba_game_id, game_date) in enumerate(game_date_by_nba_game_id.items(), start=1):
        boxscore = fetch_game_boxscore(nba_game_id)

        home_team_id = team_id_by_nba_id.get(boxscore["home_team_nba_id"])
        away_team_id = team_id_by_nba_id.get(boxscore["away_team_nba_id"])
        if home_team_id is None or away_team_id is None:
            print(f"  Skipping game {nba_game_id}: a team in this game isn't one of the ingested 30.")
            continue

        try:
            game_skipped_players, game_skipped_teams = _write_one_game_with_fresh_connection(
                season, nba_game_id, game_date, boxscore, home_team_id, away_team_id, team_id_by_nba_id, player_id_by_nba_id
            )
            skipped_unknown_players += game_skipped_players
            skipped_unknown_teams += game_skipped_teams
        except psycopg2.OperationalError as error:
            print(f"  Giving up on game {nba_game_id} after repeated connection failures ({error}). Re-run this script later to pick it up.")
            skipped_failed_games += 1

        if i % 50 == 0 or i == len(game_date_by_nba_game_id):
            print(f"  {i}/{len(game_date_by_nba_game_id)} games processed.")

    print(f"Ingested {len(game_date_by_nba_game_id)} games for {season}.")
    if skipped_unknown_players:
        print(f"Skipped {skipped_unknown_players} stat rows for players not on any current roster (left the league since {season}).")
    if skipped_unknown_teams:
        print(f"Skipped {skipped_unknown_teams} stat rows for teams not in the ingested 30 (should not normally happen).")
    if skipped_failed_games:
        print(f"{skipped_failed_games} games failed outright after retries — re-run this script to retry just those (idempotent).")


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python ingest_historical_season.py <season, e.g. 2024-25>")
        sys.exit(1)
    season = sys.argv[1]

    # A fresh connection for this lookup, closed immediately rather than
    # held open through collect_season_game_dates below — that phase makes
    # 30 rate-limited network calls (LeagueGameFinder, one per team) with
    # no DB activity in between. This project's Supabase pooler kills an
    # idle connection fast — confirmed live via a one-off test, a single
    # `SELECT 1` on a connection left idle for just 5 seconds already
    # failed with "server closed the connection unexpectedly". A 30-call
    # phase is comfortably longer than that.
    lookup_connection = get_connection()
    try:
        with lookup_connection.cursor() as cursor:
            team_id_by_nba_id = team_id_by_nba_id_map(cursor)
            player_id_by_nba_id = player_id_by_nba_id_map(cursor)
    finally:
        lookup_connection.close()
    print(f"{len(team_id_by_nba_id)} teams, {len(player_id_by_nba_id)} known players.")

    game_date_by_nba_game_id = collect_season_game_dates(season, team_id_by_nba_id)

    # No connection opened here — ingest_season_games_and_stats opens (and
    # closes) a fresh one per game itself. See its docstring for why.
    ingest_season_games_and_stats(season, game_date_by_nba_game_id, team_id_by_nba_id, player_id_by_nba_id)
    print(f"Ingestion of {season} complete.")


if __name__ == "__main__":
    main()
