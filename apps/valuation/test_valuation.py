"""Unit tests for the valuation model.

Every test here runs on literals — no database, no app boot — the same way
apps/optimizer/test_predict.py and apps/predictor's tests do.
"""

import pytest

from draft_slot_model import (
    MAX_PROJECTED_SLOT,
    MIN_PROJECTED_SLOT,
    describe_drivers,
    fit_slot_model,
    project_slot,
    value_interval,
)
from level_factors import LEVEL_FACTORS, factor_for
from rookie_scale import (
    DRAFT_PICKS,
    FIRST_ROUND_PICKS,
    FIRST_ROUND_SCALE,
    SECOND_ROUND_VALUE,
    UNDRAFTED_VALUE,
    value_for_slot,
)
from value_prospects import MINIMUM_GAMES_REQUIRED, adjust_for_level, true_shooting


def make_training_rows():
    """Drafted players whose production falls off as the pick number rises.

    Deliberately a clean signal: these tests check the model's MECHANICS
    (does it fit, does it invert, does it clamp), not how well it does on real
    NBA data, which is what the MAE it records at run time is for.
    """
    rows = []
    for pick in range(1, 31):
        strength = (31 - pick) / 30
        rows.append(
            {
                "player_id": f"player-{pick}",
                "draft_number": pick,
                "points_per_game": 6 + 18 * strength,
                "rebounds_per_game": 2 + 6 * strength,
                "assists_per_game": 1 + 5 * strength,
                "true_shooting": 48 + 12 * strength,
            }
        )
    return rows


class TestRookieScale:
    def test_every_first_round_pick_has_a_figure(self):
        for pick in range(1, FIRST_ROUND_PICKS + 1):
            assert FIRST_ROUND_SCALE[pick] > 0

    # The published scale never pays a later pick more than an earlier one.
    def test_the_scale_descends(self):
        values = [FIRST_ROUND_SCALE[pick] for pick in range(1, FIRST_ROUND_PICKS + 1)]
        assert values == sorted(values, reverse=True)

    def test_second_round_is_a_flat_two_way_figure(self):
        assert value_for_slot(FIRST_ROUND_PICKS + 1) == SECOND_ROUND_VALUE
        assert value_for_slot(DRAFT_PICKS) == SECOND_ROUND_VALUE

    # "Undrafted" is not "worthless" — it is a camp deal, which is a real
    # published figure.
    def test_undrafted_still_carries_a_real_figure(self):
        assert value_for_slot(DRAFT_PICKS + 1) == UNDRAFTED_VALUE
        assert UNDRAFTED_VALUE > 0

    def test_rejects_a_slot_that_is_not_a_pick(self):
        with pytest.raises(ValueError):
            value_for_slot(0)


class TestLevelFactors:
    # Division I is the reference level by construction: almost every drafted
    # player comes from it.
    def test_division_one_is_the_reference(self):
        factor, _ = factor_for("NCAA_D1")
        assert factor == 1.0

    def test_every_level_states_its_basis(self):
        for level in LEVEL_FACTORS:
            factor, basis = factor_for(level)
            assert 0 < factor <= 1.0
            assert len(basis) > 20

    def test_weaker_competition_is_discounted_further(self):
        assert factor_for("NCAA_D2")[0] > factor_for("NCAA_D3")[0]
        assert factor_for("NCAA_D3")[0] > factor_for("HIGH_SCHOOL")[0]
        assert factor_for("HIGH_SCHOOL")[0] > factor_for("REC")[0]

    # Under-claiming is the right failure direction for a figure presented as
    # somebody's professional value.
    def test_an_unknown_level_gets_the_most_conservative_factor(self):
        factor, basis = factor_for("SOMETHING_NEW")
        assert factor == min(value[0] for value in LEVEL_FACTORS.values())
        assert "not recognised" in basis


class TestTrueShooting:
    # Must match apps/api/src/players/season-averages.ts exactly, or a
    # prospect's efficiency is not comparable with an NBA player's.
    def test_matches_the_api_formula(self):
        # 24 points on 17 FGA and 4 FTA:
        #   24 / (2 * (17 + 0.44*4)) * 100 = 24 / 37.52 * 100 = 63.97 -> 64.0
        assert true_shooting(24, 17, 4) == 64.0

    def test_no_attempts_is_zero_not_a_crash(self):
        assert true_shooting(0, 0, 0) == 0.0


class TestLevelAdjustment:
    def test_volume_is_discounted(self):
        adjusted = adjust_for_level(
            {"points_per_game": 24.0, "rebounds_per_game": 8.0, "assists_per_game": 4.0, "true_shooting": 58.0},
            0.5,
        )
        assert adjusted["points_per_game"] == 12.0
        assert adjusted["rebounds_per_game"] == 4.0

    # A rate is not discounted: shooting 58% against weaker opposition still
    # means the shots went in.
    def test_efficiency_is_a_rate_and_is_not_discounted(self):
        adjusted = adjust_for_level(
            {"points_per_game": 24.0, "rebounds_per_game": 8.0, "assists_per_game": 4.0, "true_shooting": 58.0},
            0.5,
        )
        assert adjusted["true_shooting"] == 58.0


class TestSlotModel:
    def test_refuses_to_fit_on_too_little_data(self):
        with pytest.raises(ValueError):
            fit_slot_model(make_training_rows()[:3])

    def test_reports_its_own_accuracy(self):
        model = fit_slot_model(make_training_rows())
        assert model["training_rows"] == 30
        assert model["mae"] >= 0
        # A clean signal should rank almost perfectly.
        assert model["rank_correlation"] > 0.9

    def test_stronger_production_projects_to_an_earlier_pick(self):
        model = fit_slot_model(make_training_rows())
        strong = project_slot(
            model,
            {"points_per_game": 23.0, "rebounds_per_game": 7.5, "assists_per_game": 5.5, "true_shooting": 59.0},
        )
        weak = project_slot(
            model,
            {"points_per_game": 7.0, "rebounds_per_game": 2.2, "assists_per_game": 1.2, "true_shooting": 49.0},
        )
        assert strong < weak

    # A linear fit would otherwise extrapolate a spectacular line to pick zero
    # or a negative one, which is not a pick.
    def test_clamps_into_the_range_of_real_picks(self):
        model = fit_slot_model(make_training_rows())
        absurd = project_slot(
            model,
            {"points_per_game": 90.0, "rebounds_per_game": 40.0, "assists_per_game": 30.0, "true_shooting": 99.0},
        )
        nothing = project_slot(
            model,
            {"points_per_game": 0.0, "rebounds_per_game": 0.0, "assists_per_game": 0.0, "true_shooting": 0.0},
        )
        assert absurd >= MIN_PROJECTED_SLOT
        assert nothing <= MAX_PROJECTED_SLOT


class TestValueInterval:
    def test_brackets_the_point_estimate(self):
        low, high = value_interval(4_000_000, games_logged=40, has_verified_evidence=True)
        assert low < 4_000_000 < high

    # The frontend promotes the interval over the point estimate when nothing
    # is verified, so the interval has to actually widen or that promotion is
    # decoration.
    def test_widens_when_nothing_is_verified(self):
        verified = value_interval(4_000_000, games_logged=40, has_verified_evidence=True)
        unverified = value_interval(4_000_000, games_logged=40, has_verified_evidence=False)
        assert unverified[1] - unverified[0] > verified[1] - verified[0]

    def test_widens_for_a_short_game_log(self):
        long_log = value_interval(4_000_000, games_logged=40, has_verified_evidence=True)
        short_log = value_interval(4_000_000, games_logged=11, has_verified_evidence=True)
        assert short_log[1] - short_log[0] > long_log[1] - long_log[0]

    def test_never_goes_below_zero(self):
        low, _ = value_interval(85_000, games_logged=10, has_verified_evidence=False)
        assert low >= 0


class TestDrivers:
    def test_names_scoring_efficiency_and_level(self):
        drivers = describe_drivers(
            {"points_per_game": 24.0, "rebounds_per_game": 7.0, "assists_per_game": 2.0, "true_shooting": 58.0},
            0.62,
            "NCAA Division II production is translated against Division I output.",
        )
        labels = [driver["label"] for driver in drivers]
        assert labels == ["Scoring", "Efficiency", "Level"]

    def test_shows_the_level_adjusted_scoring_figure(self):
        drivers = describe_drivers(
            {"points_per_game": 24.0, "rebounds_per_game": 7.0, "assists_per_game": 2.0, "true_shooting": 58.0},
            0.5,
            "basis",
        )
        assert "12.0" in drivers[0]["detail"]

    # "1.1 assists per game" is noise, not a driver.
    def test_playmaking_only_appears_when_there_is_something_to_say(self):
        quiet = describe_drivers(
            {"points_per_game": 24.0, "rebounds_per_game": 7.0, "assists_per_game": 1.1, "true_shooting": 58.0},
            1.0,
            "basis",
        )
        loud = describe_drivers(
            {"points_per_game": 24.0, "rebounds_per_game": 7.0, "assists_per_game": 6.4, "true_shooting": 58.0},
            1.0,
            "basis",
        )
        assert "Playmaking" not in [driver["label"] for driver in quiet]
        assert "Playmaking" in [driver["label"] for driver in loud]


class TestFloorAgreement:
    # This constant must match MINIMUM_GAMES_REQUIRED in
    # apps/api/src/become-pro/prospect-ranking.ts. If they drift, a prospect
    # can be ranked by the API without this service ever giving them a figure.
    def test_games_floor_matches_the_api(self):
        assert MINIMUM_GAMES_REQUIRED == 10
