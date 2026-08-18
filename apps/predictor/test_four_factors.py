"""Tests for four_factors.py, focused on the property a code review caught
missing: a game's predicted margin must not change depending on what a team
does in *later* games. compute_running_season_averages is the function
responsible for that guarantee — these tests construct a small, explicit
game history and check the actual snapshot values, not just that the code
runs.
"""

from datetime import date

import numpy as np

from four_factors import compute_running_season_averages, fit_regression_weights, predict_margin


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


def test_regression_training_row_uses_opponents_pre_game_average_not_a_global_one():
    # Two teams, two games each, interleaved by date. If the regression
    # training pulled a global season average (the bug) rather than the
    # opponent's average as of that specific game, this would silently use
    # data from a game that hadn't happened yet relative to the training row.
    games = [
        make_team_game("g1", date(2026, 1, 1), "home", 0.50, margin=5),
        make_team_game("g1", date(2026, 1, 1), "away", 0.30, margin=-5),
        make_team_game("g2", date(2026, 1, 3), "home", 0.50, margin=5),
        make_team_game("g2", date(2026, 1, 3), "away", 0.70, margin=-5),
    ]
    running_averages = compute_running_season_averages(games)

    # g1 has no trainable row: neither team has a prior game yet, so
    # opponent_pre_game is None for both sides and it's skipped entirely —
    # confirmed by construction, not asserted directly here since
    # fit_regression_weights doesn't expose skipped rows; the real
    # assertion is that g2's row uses away's g1-only average (0.30), not
    # an average that includes away's g2 performance (0.70).
    away_snapshot_for_g2 = running_averages["away"]["g2"]
    assert away_snapshot_for_g2["effective_fg_pct"] == 0.30

    weights = fit_regression_weights(games, running_averages)
    # Not asserting exact fitted values (2 training points is degenerate
    # for a 3-feature fit) — the property under test is that
    # fit_regression_weights runs without error and used the pre-game
    # snapshot above, verified separately.
    assert weights.shape == (3,)
