"""Writes one GamePrediction row per game, combining elo.py's win
probabilities with four_factors.py's predicted margins.

Both completed and upcoming games get a row: completed games use the Elo/
Four Factors state as it stood right before that game was played (no
outcome leakage — see elo.py's pre_game_state), so a prediction always
reflects what was knowable beforehand. This also means a freshly seeded
database (which currently has no unplayed games at all) still produces
visible predictions rather than an empty table.

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
    average_season_four_factors,
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
    season_averages = average_season_four_factors(team_game_factors)
    margin_method, margin_weights = fit_or_fallback_margin_model(team_game_factors, season_averages)

    predictions = []
    for game in completed_games:
        predictions.append(
            _build_prediction_row(
                game["game_id"],
                game["home_team_id"],
                game["away_team_id"],
                pre_game_state[game["game_id"]],
                season_averages,
                margin_method,
                margin_weights,
            )
        )
    for game in upcoming_games:
        predictions.append(
            _build_prediction_row(
                game["game_id"],
                game["home_team_id"],
                game["away_team_id"],
                upcoming_state[game["game_id"]],
                season_averages,
                margin_method,
                margin_weights,
            )
        )
    return predictions, margin_method


def _build_prediction_row(
    game_id: str,
    home_team_id: str,
    away_team_id: str,
    elo_state: dict,
    season_averages: dict[str, dict],
    margin_method: str,
    margin_weights,
) -> dict:
    """Assembles one GamePrediction row from an Elo state dict and the margin model."""
    predicted_margin = predict_margin(
        season_averages.get(home_team_id), season_averages.get(away_team_id), margin_weights
    )
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
