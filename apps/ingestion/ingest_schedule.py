"""Ingests a season's full game schedule (played and not-yet-played games
alike) — the missing piece that gives Predictions' "Upcoming" filter, and
anything built on top of it, real games to show.

Why this is a separate script from ingest.py rather than folded in: ingest.py
(and games.py's LeagueGameFinder underneath it) can only ever see games that
have already been played — see schedule.py's module docstring for how that
was confirmed live. This script's ScheduleLeagueV2 call is the one that
actually carries not-yet-played games, and it is otherwise unrelated to
ingest.py's roster/player-bio/boxscore work, so it runs on its own.

Deliberately does NOT touch rosters, player bios, or PlayerGameStat rows —
scheduling a season and rostering it are different concerns, and
ScheduleLeagueV2 has no per-player data at all (see schedule.py). A Final
game this script finds that isn't already in Postgres still has no boxscore
until games.py/ingest_historical_season.py backfill it — this script alone
only ever writes the Game row's own scores (for a Final game, from the
schedule response) and nothing under PlayerGameStat.

One call to ScheduleLeagueV2 total, not one per game — this is a single
network request no matter how many games the season has, so there's no real
call-budget section the way ingest.py/ingest_historical_season.py need one.

Run from a real residential network — see ingest.py/README.md; this talks
to the same stats.nba.com the rest of the ingestion pipeline does.
"""

import sys

from db import get_connection
from schedule import fetch_season_schedule, fetch_team_id_by_nba_id, upsert_scheduled_game


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python ingest_schedule.py <season>  (e.g. 2026-27)")
        sys.exit(1)
    season = sys.argv[1]

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            team_id_by_nba_id = fetch_team_id_by_nba_id(cursor)
        print(f"{len(team_id_by_nba_id)} teams known.")

        games = fetch_season_schedule(season)
        print(f"{len(games)} Regular Season games found for {season}.")

        written = 0
        skipped_unknown_teams = 0
        final_count = 0
        with connection.cursor() as cursor:
            for game in games:
                home_team_id = team_id_by_nba_id.get(game["home_team_nba_id"])
                away_team_id = team_id_by_nba_id.get(game["away_team_nba_id"])
                if home_team_id is None or away_team_id is None:
                    skipped_unknown_teams += 1
                    continue

                upsert_scheduled_game(
                    cursor,
                    game["nba_game_id"],
                    game["game_date"],
                    season,
                    home_team_id,
                    away_team_id,
                    game["home_score"],
                    game["away_score"],
                )
                written += 1
                if game["is_final"]:
                    final_count += 1
        connection.commit()

        print(f"Wrote {written} games ({final_count} already Final, {written - final_count} not yet played).")
        if skipped_unknown_teams:
            print(f"Skipped {skipped_unknown_teams} games: a team wasn't one of the ingested 30 (unexpected).")
        print("Schedule ingestion complete. Run apps/predictor/predict_games.py next to predict the new games.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
