"""Tests for predict_games.py's pure row-assembly logic (_build_prediction_row).

build_predictions/save_predictions themselves aren't unit tested here for
the same reason check_accuracy.py's DB-querying functions aren't (see
test_check_accuracy.py's module docstring): they're thin orchestration over
elo.py/four_factors.py/the database, exercised in practice by running the
script against a real one. _build_prediction_row is the one piece of pure,
easily-isolated logic in this file, and the one this project's model
versioning depends on getting right — every row it returns has to carry
MODEL_VERSION, or GamePredictionRun silently stops being reproducible.
"""

import numpy as np

from predict_games import MODEL_VERSION, _build_prediction_row


def make_elo_state(home_win_probability: float, home_elo_pre: float, away_elo_pre: float) -> dict:
    return {
        "home_win_probability": home_win_probability,
        "home_elo_pre": home_elo_pre,
        "away_elo_pre": away_elo_pre,
    }


def test_row_carries_the_current_model_version():
    row = _build_prediction_row(
        "game-1",
        make_elo_state(0.6, 1520.0, 1480.0),
        home_factors={"effective_fg_pct": 0.55, "turnover_rate": 0.12, "free_throw_rate": 0.2, "offensive_rebound_pct": 0.25},
        away_factors={"effective_fg_pct": 0.50, "turnover_rate": 0.14, "free_throw_rate": 0.18, "offensive_rebound_pct": 0.30},
        margin_method="heuristic",
        margin_weights=np.array([1.0, 1.0, 1.0, 1.0]),
    )

    assert row["model_version"] == MODEL_VERSION
    assert row["game_id"] == "game-1"
    assert row["home_win_probability"] == 0.6


def test_margin_method_is_null_alongside_a_null_predicted_margin():
    # Neither team has a Four Factors snapshot yet (e.g. each team's first
    # game in the dataset) — predicted_margin_home comes back None, and
    # margin_method must follow it to None rather than reporting a method
    # that produced no number.
    row = _build_prediction_row(
        "game-2",
        make_elo_state(0.5, 1500.0, 1500.0),
        home_factors=None,
        away_factors=None,
        margin_method="regression",
        margin_weights=np.array([1.0, 1.0, 1.0]),
    )

    assert row["predicted_margin_home"] is None
    assert row["margin_method"] is None
    # Model versioning applies regardless of whether a margin was produced —
    # it identifies the model definition, not just the margin figure.
    assert row["model_version"] == MODEL_VERSION
