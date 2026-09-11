"""Tests for check_accuracy.py's pure scoring functions. The DB-querying
functions (check_elo_accuracy, check_four_factors_accuracy) aren't unit
tested here for the same reason predict_games.py isn't: they're thin
orchestration over elo.py/four_factors.py, which already have their own
leakage-focused tests, and are exercised in practice by running the script
against a real database.
"""

from check_accuracy import accuracy, brier_score, mae


def test_brier_score_is_zero_for_perfect_predictions():
    assert brier_score([1.0, 0.0, 1.0], [1.0, 0.0, 1.0]) == 0.0


def test_brier_score_is_quarter_for_uninformative_coin_flip():
    assert brier_score([0.5, 0.5, 0.5, 0.5], [1.0, 0.0, 1.0, 0.0]) == 0.25


def test_brier_score_is_one_for_confidently_wrong_predictions():
    assert brier_score([1.0, 0.0], [0.0, 1.0]) == 1.0


def test_accuracy_counts_predictions_on_the_correct_side_of_the_threshold():
    # 0.6 and 0.9 correctly favor the actual winner; 0.4 incorrectly favors
    # the loser (predicted probability below 0.5 but home team still won).
    assert accuracy([0.6, 0.9, 0.4], [1.0, 1.0, 1.0]) == 2 / 3


def test_mae_averages_absolute_errors_not_signed_errors():
    # +3 and -3 should not cancel out to 0, unlike a naive mean of errors.
    assert mae([3.0, -3.0]) == 3.0
