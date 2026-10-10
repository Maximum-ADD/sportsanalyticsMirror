"""Reports current backtested accuracy for elo.py and four_factors.py
against whatever games are in the database right now.

Not a one-off audit — meant to be re-run periodically (e.g. after a batch
of new games/results lands) to catch model drift, the way any deployed
model should be monitored. Read-only: computes predictions in memory the
same way predict_games.py does, but never writes to GamePrediction.

Both evaluations are walk-forward by construction: Elo's forward pass and
Four Factors' running averages only ever consume a team's strictly-earlier
games (see elo.py/four_factors.py's own module docstrings) — this script
adds no leakage of its own, it just scores what's already leak-free against
realized outcomes.

For the full backtest writeup this script's metrics are drawn from
(calibration analysis, permutation tests, naive-baseline comparisons,
player-point-predictor accuracy), see docs/reports/ in the repo root.
"""

import numpy as np
from db import get_connection
from elo import compute_elo_ratings, fetch_completed_games_chronological
from four_factors import (
    compute_running_season_averages,
    compute_team_game_four_factors,
    fetch_team_game_boxscores,
    fit_or_fallback_margin_model,
    predict_margin,
)

MIN_GAMES_FOR_A_MEANINGFUL_REPORT = 20


def brier_score(probabilities, outcomes):
    return float(np.mean([(p - o) ** 2 for p, o in zip(probabilities, outcomes)]))


def accuracy(probabilities, outcomes):
    correct = sum(1 for p, o in zip(probabilities, outcomes) if (p >= 0.5) == (o == 1.0))
    return correct / len(outcomes)


def mae(errors):
    return float(np.mean(np.abs(errors)))


def check_elo_accuracy(cursor):
    games = fetch_completed_games_chronological(cursor)
    if len(games) < MIN_GAMES_FOR_A_MEANINGFUL_REPORT:
        print(f"Elo: only {len(games)} completed games — too few for a meaningful accuracy check "
              f"(need >= {MIN_GAMES_FOR_A_MEANINGFUL_REPORT}). Skipping.")
        return

    _, pre_game_state, _ = compute_elo_ratings(games)
    probs = [pre_game_state[g["game_id"]]["home_win_probability"] for g in games]
    outcomes = [1.0 if g["home_score"] > g["away_score"] else 0.0 for g in games]
    home_win_rate = sum(outcomes) / len(outcomes)

    print(f"\n=== Elo win probability ({len(games)} games) ===")
    print(f"Brier score: {brier_score(probs, outcomes):.4f}  (0.25 = coin flip, lower is better)")
    print(f"Accuracy:    {accuracy(probs, outcomes):.4f}")
    print(f"Naive home-favorite baseline accuracy: {home_win_rate:.4f}")
    print(f"Edge over naive baseline: {accuracy(probs, outcomes) - home_win_rate:+.4f}")


def check_four_factors_accuracy(cursor):
    boxscores = fetch_team_game_boxscores(cursor)
    team_game_factors = [compute_team_game_four_factors(row) for row in boxscores]
    n_games = len(team_game_factors) // 2
    if n_games < MIN_GAMES_FOR_A_MEANINGFUL_REPORT:
        print(f"Four Factors: only {n_games} completed games — too few for a meaningful accuracy "
              f"check (need >= {MIN_GAMES_FOR_A_MEANINGFUL_REPORT}). Skipping.")
        return

    running_averages = compute_running_season_averages(team_game_factors)
    method, weights = fit_or_fallback_margin_model(team_game_factors, running_averages)

    games_by_id = {}
    for row in team_game_factors:
        games_by_id.setdefault(row["game_id"], []).append(row)

    errors = []
    naive_errors = []
    home_margins = []
    for rows in games_by_id.values():
        if len(rows) != 2:
            continue
        a, b = rows
        a_pre = running_averages.get(a["team_id"], {}).get(a["game_id"])
        b_pre = running_averages.get(b["team_id"], {}).get(b["game_id"])
        predicted = predict_margin(a_pre, b_pre, weights)
        if predicted is None:
            continue
        errors.append(predicted - a["margin"])
        home_margins.append(a["margin"])

    if not errors:
        print("Four Factors: no games with a qualifying pre-game snapshot yet. Skipping.")
        return

    league_avg_margin = float(np.mean(home_margins))
    naive_errors = [league_avg_margin - m for m in home_margins]

    print(f"\n=== Four Factors margin ({len(errors)} games, method={method}) ===")
    print(f"MAE:  {mae(errors):.2f} points")
    print(f"Naive baseline (leaguewide average margin) MAE: {mae(naive_errors):.2f} points")
    print(f"Edge over naive baseline: {mae(naive_errors) - mae(errors):+.2f} points")
    if mae(naive_errors) - mae(errors) < 1.0:
        print(
            "NOTE: margin prediction is only marginally better than the naive baseline — "
            "see docs/reports for why this should stay a secondary signal behind win probability."
        )


def main():
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            check_elo_accuracy(cursor)
            check_four_factors_accuracy(cursor)
    finally:
        connection.close()


if __name__ == "__main__":
    main()
