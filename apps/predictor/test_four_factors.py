"""Tests for four_factors.py, focused on the property a code review caught
missing: a game's predicted margin must not change depending on what a team
does in *later* games. compute_running_season_averages is the function
responsible for that guarantee — these tests construct a small, explicit
game history and check the actual snapshot values, not just that the code
runs.
"""

from datetime import date

import numpy as np

from four_factors import (
    build_regression_training_data,
    compute_running_season_averages,
    predict_margin,
)


def make_team_game(game_id: str, game_date: date, team_id: str, effective_fg_pct: float, margin: float) -> dict:
    """A minimal team-game-factors row — only the fields compute_running_season_averages/fit_regression_weights read."""
    return {
        "game_id": game_id,
        "game_date": game_date,
        "team_id": team_id,
        "effective_fg_pct": effective_fg_pct,
        "turnover_rate": 0.0,
        "free_throw_rate": 0.0,
        "margin": margin,
    }


def test_a_teams_pre_game_snapshot_only_reflects_strictly_earlier_games():
    # Team A plays 3 games with eFG% 0.40, 0.50, 0.90 in that order. Game 3's
    # very high eFG% must not appear in game 2's (or game 1's) snapshot.
    team_a_games = [
        make_team_game("g1", date(2026, 1, 1), "team-a", 0.40, margin=1),
        make_team_game("g2", date(2026, 1, 3), "team-a", 0.50, margin=1),
        make_team_game("g3", date(2026, 1, 5), "team-a", 0.90, margin=1),
    ]

    snapshots = compute_running_season_averages(team_a_games)

    # Game 1 is team A's first game in the dataset — no prior games, so no
    # pre-game snapshot exists for it at all (not a zeroed default).
    assert "g1" not in snapshots["team-a"]

    # Game 2's snapshot is the average of game 1 only (0.40) — game 3
    # (0.90) hasn't happened yet from game 2's point of view.
    assert snapshots["team-a"]["g2"]["effective_fg_pct"] == 0.40

    # Game 3's snapshot averages games 1-2 only (0.40, 0.50) — still no
    # trace of game 3's own 0.90.
    assert snapshots["team-a"]["g3"]["effective_fg_pct"] == 0.45


def test_final_snapshot_is_the_only_one_that_includes_every_game():
    team_a_games = [
        make_team_game("g1", date(2026, 1, 1), "team-a", 0.40, margin=1),
        make_team_game("g2", date(2026, 1, 3), "team-a", 0.60, margin=1),
    ]

    snapshots = compute_running_season_averages(team_a_games)

    # "_final" is the explicit, separately-keyed exception — used only for
    # predicting a team's next (not-yet-played) game, never substituted in
    # for a specific past game's own pre-game snapshot.
    assert snapshots["team-a"]["_final"]["effective_fg_pct"] == 0.50
    assert snapshots["team-a"]["g2"]["effective_fg_pct"] == 0.40
    assert "_final" != "g1" and "_final" != "g2"


def test_appending_a_later_game_does_not_change_an_earlier_games_prediction():
    # The concrete regression-test version of the leak a reviewer caught:
    # build predictions with only games 1-2 present, then again with game 3
    # added, and assert game 2's predicted margin is bit-for-bit identical
    # both times.
    home_games_without_future = [
        make_team_game("g1", date(2026, 1, 1), "home", 0.40, margin=1),
        make_team_game("g2", date(2026, 1, 3), "home", 0.50, margin=1),
    ]
    away_games = [
        make_team_game("g1", date(2026, 1, 1), "away", 0.45, margin=-1),
        make_team_game("g2", date(2026, 1, 3), "away", 0.45, margin=1),
    ]
    weights_placeholder = np.array([100.0, -80.0, 20.0])

    snapshots_before = compute_running_season_averages(home_games_without_future + away_games)
    margin_before = predict_margin(
        snapshots_before["home"].get("g2"), snapshots_before["away"].get("g2"), weights_placeholder
    )

    home_games_with_future = home_games_without_future + [
        make_team_game("g3", date(2026, 1, 5), "home", 0.99, margin=1),
    ]
    snapshots_after = compute_running_season_averages(home_games_with_future + away_games)
    margin_after = predict_margin(
        snapshots_after["home"].get("g2"), snapshots_after["away"].get("g2"), weights_placeholder
    )

    assert margin_before == margin_after


def test_regression_inputs_ignore_both_teams_current_game_factors():
    # Two teams play twice. Game 2 is trainable because both teams have a
    # pre-game snapshot from game 1. Changing either team's realized game-2
    # factors must not change game 2's regression feature row.
    games = [
        make_team_game("g1", date(2026, 1, 1), "home", 0.50, margin=5),
        make_team_game("g1", date(2026, 1, 1), "away", 0.30, margin=-5),
        make_team_game("g2", date(2026, 1, 3), "home", 0.50, margin=5),
        make_team_game("g2", date(2026, 1, 3), "away", 0.70, margin=-5),
    ]
    running_averages = compute_running_season_averages(games)
    feature_rows_before, margins_before = build_regression_training_data(games, running_averages)

    np.testing.assert_array_equal(feature_rows_before, np.array([[0.20, 0.0, 0.0]]))

    changed_factors_by_row_index = {
        2: {"effective_fg_pct": 0.99, "turnover_rate": 0.45, "free_throw_rate": 0.60},
        3: {"effective_fg_pct": 0.05, "turnover_rate": 0.50, "free_throw_rate": 0.01},
    }
    for row_index, changed_factors in changed_factors_by_row_index.items():
        games_with_one_team_changed = [dict(game) for game in games]
        games_with_one_team_changed[row_index].update(changed_factors)
        changed_running_averages = compute_running_season_averages(games_with_one_team_changed)
        feature_rows_after, margins_after = build_regression_training_data(
            games_with_one_team_changed, changed_running_averages
        )

        np.testing.assert_array_equal(feature_rows_before, feature_rows_after)
        np.testing.assert_array_equal(margins_before, margins_after)
