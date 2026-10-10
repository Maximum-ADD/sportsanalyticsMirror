"""Tests for predict.py's minutes-trend adjustment (see module docstring
for the backtest behind MINUTES_TREND_ADJUSTMENT_STRENGTH=0.15) — a
player whose recent minutes have shifted away from their longer-run
baseline gets a small nudge on top of the existing recency-weighted
fantasy-point prediction.
"""

from predict import (
    MINUTES_TREND_ADJUSTMENT_STRENGTH,
    MINUTES_TREND_BASELINE_WINDOW,
    MINUTES_TREND_DEVIATION_CAP,
    apply_minutes_trend_adjustment,
    calculate_minutes_trend_ratio,
)


def test_trend_ratio_is_none_with_fewer_games_than_the_baseline_window():
    minutes = [30] * (MINUTES_TREND_BASELINE_WINDOW - 1)
    assert calculate_minutes_trend_ratio(minutes) is None


def test_trend_ratio_is_one_when_recent_minutes_match_the_baseline():
    minutes = [30] * MINUTES_TREND_BASELINE_WINDOW
    assert calculate_minutes_trend_ratio(minutes) == 1.0


def test_trend_ratio_above_one_when_recent_minutes_exceed_the_baseline():
    # 7 games at 20 minutes, then 3 recent games at 40 minutes.
    minutes = [20] * 7 + [40] * 3
    ratio = calculate_minutes_trend_ratio(minutes)
    assert ratio > 1.0


def test_trend_ratio_below_one_when_recent_minutes_are_lower_than_the_baseline():
    minutes = [30] * 7 + [10] * 3
    ratio = calculate_minutes_trend_ratio(minutes)
    assert ratio < 1.0


def test_trend_ratio_is_none_when_the_baseline_window_has_zero_minutes():
    minutes = [0] * MINUTES_TREND_BASELINE_WINDOW
    assert calculate_minutes_trend_ratio(minutes) is None


def test_adjustment_leaves_prediction_unchanged_when_trend_is_none():
    assert apply_minutes_trend_adjustment(20.0, None) == 20.0


def test_adjustment_leaves_prediction_unchanged_when_trend_ratio_is_exactly_one():
    assert apply_minutes_trend_adjustment(20.0, 1.0) == 20.0


def test_adjustment_increases_prediction_when_trend_ratio_is_above_one():
    baseline = 20.0
    adjusted = apply_minutes_trend_adjustment(baseline, 1.5)
    assert adjusted > baseline


def test_adjustment_decreases_prediction_when_trend_ratio_is_below_one():
    baseline = 20.0
    adjusted = apply_minutes_trend_adjustment(baseline, 0.5)
    assert adjusted < baseline


def test_adjustment_magnitude_matches_the_configured_strength():
    # trend_ratio=2.0 -> deviation=1.0 (clamped to MINUTES_TREND_DEVIATION_CAP,
    # which is exactly 1.0, so this also implicitly covers the cap boundary).
    baseline = 20.0
    adjusted = apply_minutes_trend_adjustment(baseline, 2.0)
    expected = baseline * (1.0 + MINUTES_TREND_ADJUSTMENT_STRENGTH * MINUTES_TREND_DEVIATION_CAP)
    assert abs(adjusted - expected) < 1e-9


def test_adjustment_clamps_extreme_deviations_at_the_cap():
    # An extreme trend_ratio (e.g. 10.0, a 10x minutes jump) must not blow
    # the adjustment past what MINUTES_TREND_DEVIATION_CAP allows.
    baseline = 20.0
    adjusted_at_extreme = apply_minutes_trend_adjustment(baseline, 10.0)
    adjusted_at_cap_boundary = apply_minutes_trend_adjustment(baseline, 1.0 + MINUTES_TREND_DEVIATION_CAP)
    assert abs(adjusted_at_extreme - adjusted_at_cap_boundary) < 1e-9
