"""Writes one GamePrediction row per game, combining elo.py's win
probabilities with four_factors.py's predicted margins.

Both completed and upcoming games get a row: completed games use the Elo/
Four Factors state as it stood right before that game was played (no
outcome leakage — see elo.py's pre_game_state and four_factors.py's
compute_running_season_averages), so a prediction always reflects what was
knowable beforehand. This also means a freshly seeded database (which
currently has no unplayed games at all) still produces visible predictions
rather than an empty table.

One script, not a predict/optimize two-step like apps/optimizer: Elo and
Four Factors don't depend on each other's output the way optimize.py
depends on predict.py's written PlayerPrediction rows, they just both feed
the same GamePrediction row — splitting them would only add UPSERT-merge
complexity for no workflow benefit.
"""

import uuid

from db import get_connection
from elo import compute_elo_ratings, fetch_completed_games_chronological, fetch_upcoming_games, predict_upcoming_games
from four_factors import (
    compute_running_season_averages,
    compute_team_game_four_factors,
    fetch_team_game_boxscores,
    fit_or_fallback_margin_model,
    predict_margin,
)


def build_predictions(cursor) -> tuple[list[dict], str]:
    """Runs both models and returns (prediction rows, margin method used)."""
    completed_games = fetch_completed_games_chronological(cursor)
    upcoming_games = fetch_upcoming_games(cursor)
    final_ratings, pre_game_state = compute_elo_ratings(completed_games)
    upcoming_state = predict_upcoming_games(upcoming_games, final_ratings)

    boxscores = fetch_team_game_boxscores(cursor)
    team_game_factors = [compute_team_game_four_factors(row) for row in boxscores]
    running_averages = compute_running_season_averages(team_game_factors)
    margin_method, margin_weights = fit_or_fallback_margin_model(team_game_factors, running_averages)

    predictions = []
    for game in completed_games:
        # Each team's *pre-game* snapshot for this specific game — not a
        # single season-wide average reused everywhere, which is exactly
        # the future-data leak this function used to have (a team's later
        # games silently informing an earlier game's prediction).
        home_factors = running_averages.get(game["home_team_id"], {}).get(game["game_id"])
        away_factors = running_averages.get(game["away_team_id"], {}).get(game["game_id"])
        predictions.append(
            _build_prediction_row(
                game["game_id"],
                pre_game_state[game["game_id"]],
                home_factors,
                away_factors,
                margin_method,
                margin_weights,
            )
        )
    for game in upcoming_games:
        # An upcoming game has no row of its own in running_averages (it
        # was never in team_game_factors — there's no boxscore for a game
        # that hasn't been played), so it uses each team's "_final"
        # snapshot: the running average across all of that team's games
        # played so far, which is the correct (and only) pre-game state
        # for a game that hasn't happened yet.
        home_factors = running_averages.get(game["home_team_id"], {}).get("_final")
        away_factors = running_averages.get(game["away_team_id"], {}).get("_final")
        predictions.append(
            _build_prediction_row(
                game["game_id"],
                upcoming_state[game["game_id"]],
                home_factors,
                away_factors,
                margin_method,
                margin_weights,
            )
        )
    return predictions, margin_method


def _build_prediction_row(
    game_id: str,
    elo_state: dict,
    home_factors: dict | None,
    away_factors: dict | None,
    margin_method: str,
    margin_weights,
) -> dict:
    """Assembles one GamePrediction row from an Elo state dict and the margin model."""
    predicted_margin = predict_margin(home_factors, away_factors, margin_weights)
    return {
        "game_id": game_id,
        "home_win_probability": round(elo_state["home_win_probability"], 4),
        "home_elo_pre": round(elo_state["home_elo_pre"], 2),
        "away_elo_pre": round(elo_state["away_elo_pre"], 2),
        "predicted_margin_home": predicted_margin,
        "margin_method": margin_method if predicted_margin is not None else None,
    }


def save_predictions(cursor, predictions: list[dict]) -> None:
    """Upserts one GamePrediction row per game (ON CONFLICT ("gameId") DO UPDATE).

    Upsert, not append: see schema.prisma's GamePrediction docstring for why
    this table keeps only the latest prediction per game rather than a
    history of every run.
    """
    for prediction in predictions:
        cursor.execute(
            """
            INSERT INTO "GamePrediction"
                ("id", "gameId", "homeWinProbability", "homeTeamEloPre", "awayTeamEloPre",
                 "predictedMarginHome", "marginMethod")
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT ("gameId") DO UPDATE SET
                "homeWinProbability" = EXCLUDED."homeWinProbability",
                "homeTeamEloPre" = EXCLUDED."homeTeamEloPre",
                "awayTeamEloPre" = EXCLUDED."awayTeamEloPre",
                "predictedMarginHome" = EXCLUDED."predictedMarginHome",
                "marginMethod" = EXCLUDED."marginMethod",
                "createdAt" = now()
            """,
            (
                str(uuid.uuid4()),
                prediction["game_id"],
                prediction["home_win_probability"],
                prediction["home_elo_pre"],
                prediction["away_elo_pre"],
                prediction["predicted_margin_home"],
                prediction["margin_method"],
            ),
        )


def main() -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            predictions, margin_method = build_predictions(cursor)
            save_predictions(cursor, predictions)

        connection.commit()
        print(f"Wrote {len(predictions)} game predictions ({margin_method} margin model).")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
