"""Fits a draft slot against NBA rookie production.

WHAT THIS MODEL ACTUALLY DOES, stated plainly because the feature's honesty
depends on it: it does NOT learn "amateur season -> draft slot". No such
dataset exists in this project. There is no table anywhere here pairing a
college or high-school season with what happened to that player in the draft.

What this project DOES have is recent draftees' rookie production
(PlayerGameStat) alongside the pick they were taken at (Player.draftNumber).
So the model is fitted the other way round: it learns the relationship between
ROOKIE-SEASON PRODUCTION and DRAFT POSITION among players who were actually
drafted, and the API then inverts it — a prospect's level-adjusted line is
scored on the same production index, and the slot whose typical rookie
production is closest is the slot they project to.

That inversion is a real assumption and a real limitation:

  - It answers "which pick's rookie year does this line most resemble", not
    "where would this player be drafted", which also depends on age, size,
    athleticism, position scarcity and scouting that this database has none of.
  - It is fitted on players who were drafted, so it says nothing reliable about
    lines far below the weakest rookie season in the data.
  - Rookie minutes are partly a consequence of draft position rather than only
    a cause of it: high picks play more because they were high picks.

TRAINING lives here and only here. APPLYING the fitted model — the slot
projection, the interval, the comparables, the explanation — lives in the API
(apps/api/src/become-pro/valuation-model.ts), because it has to run the moment
a prospect's season changes and only the always-on API can do that. The
parameters the API needs to apply it (slot bounds, interval widths) are
defined in this module and shipped to the API inside the model bundle, so
they are defined exactly once.

No language model is involved anywhere in this path. This is ordinary least
squares over four features, fitted with numpy, and every coefficient is
inspectable in the row it writes.
"""

import numpy as np

# The production index the fit runs over. Deliberately small and interpretable
# rather than every column available: with the number of recent draftees this
# database holds, four features is already close to as much as the data can
# support, and each of these is something a self-reported amateur box score
# can actually supply.
FEATURE_NAMES = ("points_per_game", "rebounds_per_game", "assists_per_game", "true_shooting")

# Minimum rookie games before a player is a usable training row. A five-game
# rookie year says more about injury than about draft position.
MINIMUM_ROOKIE_GAMES = 20

# The draft is 60 picks; anything the fit projects beyond it is reported as
# the undrafted range rather than extrapolated into a pick number nobody holds.
MAX_PROJECTED_SLOT = 75
MIN_PROJECTED_SLOT = 1

# How wide the reported interval is, as a fraction of the point estimate.
# Chosen to be visibly wide: the honest reading of this model is "somewhere in
# this neighbourhood", and a narrow band would overstate it.
BASE_INTERVAL_FRACTION = 0.28

# Extra width for a short game log, where the season line itself is still
# settling and so genuinely supports less.
SHORT_LOG_GAMES = 25
SHORT_LOG_EXTRA_FRACTION = 0.15


def build_feature_row(line: dict) -> list[float]:
    """The four model inputs, in FEATURE_NAMES order, from one season line."""
    return [float(line[name]) for name in FEATURE_NAMES]


def fit_slot_model(rows: list[dict]) -> dict:
    """Fits draft slot against rookie production by ordinary least squares.

    Args:
        rows: one dict per drafted player with the FEATURE_NAMES keys plus
              "draft_number".

    Returns:
        A dict with the fitted "coefficients" (intercept first), the training
        row count, and in-sample "mae" and Spearman "rank_correlation" — all
        stored with the model so a figure can always be traced back to how
        good the model behind it was.

    Raises:
        ValueError: when there are fewer training rows than features, where a
        least-squares fit would be meaningless rather than merely weak.
    """
    if len(rows) <= len(FEATURE_NAMES):
        raise ValueError(
            f"need more than {len(FEATURE_NAMES)} drafted players with rookie "
            f"production to fit a slot model, got {len(rows)}"
        )

    features = np.array([build_feature_row(row) for row in rows], dtype=float)
    targets = np.array([float(row["draft_number"]) for row in rows], dtype=float)

    # Intercept column: production of zero should not imply pick zero.
    design = np.hstack([np.ones((features.shape[0], 1)), features])
    coefficients, *_ = np.linalg.lstsq(design, targets, rcond=None)

    predictions = design @ coefficients
    mae = float(np.mean(np.abs(predictions - targets)))

    return {
        "coefficients": [float(value) for value in coefficients],
        "training_rows": len(rows),
        "mae": round(mae, 3),
        "rank_correlation": round(spearman(predictions, targets), 3),
    }


def spearman(predicted: np.ndarray, actual: np.ndarray) -> float:
    """Rank correlation between two series.

    Reported alongside MAE because ORDER is what this model is really being
    asked for: getting every slot within a few picks matters less than putting
    better production ahead of worse. Returns 0.0 when either series is
    constant, where the correlation is undefined rather than zero.
    """
    predicted_ranks = _rank(predicted)
    actual_ranks = _rank(actual)
    if np.std(predicted_ranks) == 0 or np.std(actual_ranks) == 0:
        return 0.0
    return float(np.corrcoef(predicted_ranks, actual_ranks)[0, 1])


def _rank(values: np.ndarray) -> np.ndarray:
    order = values.argsort()
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = np.arange(len(values), dtype=float)
    return ranks
