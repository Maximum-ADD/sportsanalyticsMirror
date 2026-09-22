"""Tests for features.py.

Two properties are worth more than the arithmetic here and most of this
file exists to protect them:

  1. "Cannot be computed" never silently becomes 0.0. A player who took no
     shots has no three-point attempt rate; a player with no turnovers has
     no assist-to-turnover ratio. Feeding a 0.0 into either would place
     them somewhere specific and wrong in the feature space, and they would
     then be returned as somebody's "most similar player".
  2. Usage rate is minutes-weighted, not simple-averaged. A four-minute
     garbage-time cameo at a huge usage rate must not drag a starter's
     season figure upward — the same aggregation rule the API already
     follows for this column.
"""

import pytest

from features import (
    FEATURE_NAMES,
    MINIMUM_GAMES_FOR_ARCHETYPE,
    aggregate_player_season_totals,
    build_feature_row,
    calculate_assist_to_turnover_ratio,
    calculate_free_throw_rate,
    calculate_per_36,
    calculate_three_point_attempt_rate,
    calculate_true_shooting_pct,
    is_eligible_for_archetype,
    standardize_feature_matrix,
)


def make_game_stat_row(**overrides) -> dict:
    """A minimal PlayerGameStat row, keyed by the Prisma column names the
    aggregator reads.

    Defaults are a plausible ordinary game so that each test can override
    only the column it is actually about.
    """
    row = {
        "minutes": 30,
        "points": 20,
        "assists": 4,
        "steals": 1,
        "blocks": 1,
        "turnovers": 2,
        "fieldGoalsAttempted": 15,
        "threesAttempted": 5,
        "freeThrowsAttempted": 4,
        "offensiveRebounds": 2,
        "defensiveRebounds": 5,
        "usagePercentage": 25.0,
    }
    row.update(overrides)
    return row


def make_player(**overrides) -> dict:
    """A minimal Player row — only the two physical columns build_feature_row reads."""
    player = {"heightInches": 78, "weightLbs": 215}
    player.update(overrides)
    return player


class TestPer36:
    def test_scales_a_total_to_thirty_six_minutes(self):
        # 20 points in 30 minutes is 24 points per 36.
        assert calculate_per_36(20, 30) == pytest.approx(24.0)

    def test_returns_none_for_a_player_who_never_played(self):
        assert calculate_per_36(0, 0) is None

    def test_a_real_zero_stays_zero(self):
        # Distinct from the case above: this player played, and scored none.
        assert calculate_per_36(0, 30) == 0.0


class TestShootingRates:
    def test_true_shooting_matches_the_standard_formula(self):
        # 25 / (2 * (20 + 0.44 * 5)) = 25 / 44.4
        assert calculate_true_shooting_pct(25, 20, 5) == pytest.approx(25 / 44.4)

    def test_true_shooting_is_none_when_no_shot_was_taken(self):
        assert calculate_true_shooting_pct(0, 0, 0) is None

    def test_three_point_attempt_rate_is_a_share_of_attempts(self):
        assert calculate_three_point_attempt_rate(5, 20) == pytest.approx(0.25)

    def test_three_point_attempt_rate_is_none_without_attempts(self):
        # Not 0.0: this player has no shot profile at all, rather than a
        # profile containing no threes.
        assert calculate_three_point_attempt_rate(0, 0) is None

    def test_free_throw_rate_is_none_without_field_goal_attempts(self):
        assert calculate_free_throw_rate(4, 0) is None


class TestAssistToTurnover:
    def test_divides_assists_by_turnovers(self):
        assert calculate_assist_to_turnover_ratio(8, 4) == pytest.approx(2.0)

    def test_zero_turnovers_is_none_not_infinity(self):
        assert calculate_assist_to_turnover_ratio(8, 0) is None


class TestSeasonAggregation:
    def test_sums_the_counting_stats(self):
        totals = aggregate_player_season_totals(
            [make_game_stat_row(points=20), make_game_stat_row(points=30)]
        )
        assert totals["games_played"] == 2
        assert totals["points"] == 50
        assert totals["minutes"] == 60

    def test_usage_is_minutes_weighted_not_simple_averaged(self):
        # A 4-minute cameo at 40% usage and a 38-minute start at 20%.
        # Simple mean would say 30%; the true minutes-weighted figure is
        # (40*4 + 20*38) / 42 = 21.90, barely above the starter's own rate.
        rows = [
            make_game_stat_row(minutes=4, usagePercentage=40.0),
            make_game_stat_row(minutes=38, usagePercentage=20.0),
        ]
        totals = aggregate_player_season_totals(rows)
        assert totals["usage_percentage"] == pytest.approx(920 / 42)

    def test_rows_missing_usage_still_contribute_their_counting_stats(self):
        # Rows ingested before usagePercentage existed carry a genuine null.
        # They are skipped for the weighting only — dropping their points
        # would understate the player's whole season.
        rows = [
            make_game_stat_row(minutes=30, points=20, usagePercentage=None),
            make_game_stat_row(minutes=30, points=10, usagePercentage=25.0),
        ]
        totals = aggregate_player_season_totals(rows)
        assert totals["points"] == 30
        assert totals["usage_percentage"] == pytest.approx(25.0)

    def test_usage_is_none_when_no_row_recorded_one(self):
        rows = [make_game_stat_row(usagePercentage=None)]
        assert aggregate_player_season_totals(rows)["usage_percentage"] is None

    def test_null_rebound_split_contributes_nothing_rather_than_breaking(self):
        rows = [
            make_game_stat_row(offensiveRebounds=None, defensiveRebounds=None),
            make_game_stat_row(offensiveRebounds=3, defensiveRebounds=6),
        ]
        totals = aggregate_player_season_totals(rows)
        assert totals["offensive_rebounds"] == 3
        assert totals["defensive_rebounds"] == 6


class TestEligibility:
    def test_a_rotation_player_is_eligible(self):
        rows = [make_game_stat_row(minutes=30) for _ in range(MINIMUM_GAMES_FOR_ARCHETYPE)]
        assert is_eligible_for_archetype(aggregate_player_season_totals(rows)) is True

    def test_too_few_games_is_not_eligible(self):
        rows = [make_game_stat_row(minutes=36) for _ in range(MINIMUM_GAMES_FOR_ARCHETYPE - 1)]
        assert is_eligible_for_archetype(aggregate_player_season_totals(rows)) is False

    def test_enough_games_but_too_few_minutes_is_not_eligible(self):
        # The deep-bench case: dressed all season, never really played.
        rows = [make_game_stat_row(minutes=5) for _ in range(20)]
        assert is_eligible_for_archetype(aggregate_player_season_totals(rows)) is False

    def test_a_player_with_no_rows_is_not_eligible(self):
        assert is_eligible_for_archetype(aggregate_player_season_totals([])) is False


class TestFeatureRow:
    def test_returns_every_feature_in_the_declared_order(self):
        totals = aggregate_player_season_totals([make_game_stat_row() for _ in range(10)])
        row = build_feature_row(totals, make_player())
        assert row is not None
        assert len(row) == len(FEATURE_NAMES)
        # Position must mean the same thing on every run: the stored
        # featureVector and centroid matching both depend on it.
        assert row[FEATURE_NAMES.index("points_per_36")] == pytest.approx(24.0)
        assert row[FEATURE_NAMES.index("height_inches")] == pytest.approx(78.0)

    def test_a_missing_height_drops_the_player_rather_than_imputing_one(self):
        totals = aggregate_player_season_totals([make_game_stat_row() for _ in range(10)])
        assert build_feature_row(totals, make_player(heightInches=None)) is None

    def test_an_uncomputable_rate_drops_the_player(self):
        # No turnovers all season, so no assist-to-turnover ratio. Better
        # to have no archetype than to be placed at a made-up coordinate.
        totals = aggregate_player_season_totals(
            [make_game_stat_row(turnovers=0) for _ in range(10)]
        )
        assert build_feature_row(totals, make_player()) is None


class TestStandardization:
    def test_centres_each_column_on_zero(self):
        matrix = [[10.0, 100.0], [20.0, 200.0], [30.0, 300.0]]
        standardized, means, deviations = standardize_feature_matrix(matrix)
        assert means == pytest.approx([20.0, 200.0])
        for column_index in range(2):
            column = [row[column_index] for row in standardized]
            assert sum(column) == pytest.approx(0.0)
            assert deviations[column_index] > 0

    def test_columns_on_different_scales_end_up_comparable(self):
        # The whole point: height in inches and a 0–1 rate must contribute
        # to distance on equal terms once standardized.
        matrix = [[78.0, 0.20], [80.0, 0.40], [82.0, 0.60]]
        standardized, _, _ = standardize_feature_matrix(matrix)
        assert standardized[0][0] == pytest.approx(standardized[0][1])
        assert standardized[2][0] == pytest.approx(standardized[2][1])

    def test_a_column_nobody_differs_on_contributes_nothing(self):
        # Zero variance would divide by zero. Centred at 0.0 instead, which
        # is also the honest answer: it says nothing about who resembles whom.
        matrix = [[5.0, 1.0], [5.0, 2.0], [5.0, 3.0]]
        standardized, _, deviations = standardize_feature_matrix(matrix)
        assert deviations[0] == 0
        assert [row[0] for row in standardized] == [0.0, 0.0, 0.0]

    def test_an_empty_matrix_is_handled(self):
        assert standardize_feature_matrix([]) == ([], [], [])
