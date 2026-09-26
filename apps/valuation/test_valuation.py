"""Unit tests for the valuation trainer.

Every test here runs on literals — no database, no app boot — the same way
apps/optimizer/test_predict.py and apps/predictor's tests do.

Applying the model (slot projection, interval, comparables, explanation) is
tested in the API, where it now runs: see
apps/api/src/become-pro/valuation-model.spec.ts.
"""

import json

import pytest

from draft_slot_model import FEATURE_NAMES, fit_slot_model
from level_factors import LEVEL_FACTORS, factor_for
from rookie_scale import (
    DRAFT_PICKS,
    FIRST_ROUND_PICKS,
    FIRST_ROUND_SCALE,
    SECOND_ROUND_VALUE,
    UNDRAFTED_VALUE,
    value_for_slot,
)
from train_valuation_model import (
    MINIMUM_GAMES_REQUIRED,
    MODEL_VERSION,
    build_bundle,
    rookie_season_label,
    true_shooting,
)


def make_training_rows():
    """Drafted players whose production falls off as the pick number rises.

    Deliberately a clean signal: these tests check the model's MECHANICS
    (does it fit, does it rank), not how well it does on real NBA data, which
    is what the MAE it records at training time is for.
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
    # Must match apps/api/src/players/season-averages.ts exactly: a rookie's
    # efficiency is measured here and a prospect's there.
    def test_matches_the_api_formula(self):
        # 24 points on 17 FGA and 4 FTA:
        #   24 / (2 * (17 + 0.44*4)) * 100 = 24 / 37.52 * 100 = 63.97 -> 64.0
        assert true_shooting(24, 17, 4) == 64.0

    def test_no_attempts_is_zero_not_a_crash(self):
        assert true_shooting(0, 0, 0) == 0.0


class TestRookieSeasonLabel:
    # Must match rookieSeasonLabel in apps/api/src/become-pro/rookie-season.ts:
    # the model trains on this season and the profile page labels it.
    def test_a_june_draftee_is_a_rookie_the_following_season(self):
        assert rookie_season_label(2023) == "2023-24"

    def test_zero_pads_the_second_year(self):
        assert rookie_season_label(2008) == "2008-09"

    def test_wraps_the_century(self):
        assert rookie_season_label(1999) == "1999-00"


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

    # Better production must mean an EARLIER pick. If this ever flipped, the
    # API would project the best prospects to the worst picks.
    def test_better_production_lowers_the_projected_pick(self):
        model = fit_slot_model(make_training_rows())
        intercept, *weights = model["coefficients"]
        strong = intercept + sum(w * f for w, f in zip(weights, [23.0, 7.5, 5.5, 59.0]))
        weak = intercept + sum(w * f for w, f in zip(weights, [7.0, 2.2, 1.2, 49.0]))
        assert strong < weak


class TestBundle:
    def setup_method(self):
        rows = make_training_rows()
        self.bundle = build_bundle(fit_slot_model(rows), rows)

    # The API reads this bundle as JSON; anything that does not survive a
    # round trip would silently arrive as something else.
    def test_survives_a_json_round_trip(self):
        assert json.loads(json.dumps(self.bundle)) == self.bundle

    def test_carries_one_coefficient_per_feature_plus_the_intercept(self):
        assert self.bundle["featureNames"] == list(FEATURE_NAMES)
        assert len(self.bundle["coefficients"]) == len(FEATURE_NAMES) + 1

    # The rookie scale is defined once, here, and shipped — the API must not
    # need its own copy.
    def test_ships_the_whole_first_round_scale(self):
        first_round = self.bundle["rookieScale"]["firstRound"]
        assert len(first_round) == FIRST_ROUND_PICKS
        assert first_round["1"] == FIRST_ROUND_SCALE[1]
        assert first_round[str(FIRST_ROUND_PICKS)] == FIRST_ROUND_SCALE[FIRST_ROUND_PICKS]

    def test_ships_every_level_factor_with_its_basis(self):
        assert set(self.bundle["levelFactors"]) == set(LEVEL_FACTORS)
        for entry in self.bundle["levelFactors"].values():
            assert 0 < entry["factor"] <= 1
            assert entry["basis"]

    def test_comparables_are_drawn_from_the_training_rookies(self):
        index = self.bundle["comparableIndex"]
        assert len(index) == 30
        assert index[0]["playerId"] == "player-1"
        assert len(index[0]["features"]) == len(FEATURE_NAMES)

    def test_records_the_model_version(self):
        assert self.bundle["modelVersion"] == MODEL_VERSION


class TestFloorAgreement:
    # Must equal MINIMUM_GAMES_REQUIRED in
    # apps/api/src/become-pro/valuation-state.ts, which the API enforces.
    def test_games_floor_matches_the_api(self):
        assert MINIMUM_GAMES_REQUIRED == 10
