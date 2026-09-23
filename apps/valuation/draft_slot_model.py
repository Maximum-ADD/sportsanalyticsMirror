"""Maps a season line onto a projected NBA draft slot.

WHAT THIS MODEL ACTUALLY DOES, stated plainly because the feature's honesty
depends on it: it does NOT learn "amateur season -> draft slot". No such
dataset exists in this project. There is no table anywhere here pairing a
college or high-school season with what happened to that player in the draft.

What this project DOES have is every NBA player's rookie production
(PlayerGameStat) alongside the pick they were taken at (Player.draftNumber).
So the model is fitted the other way round: it learns the relationship between
ROOKIE-SEASON PRODUCTION and DRAFT POSITION among players who were actually
drafted, then inverts it — a prospect's level-adjusted line is scored on the
same production index, and the slot whose typical rookie production is closest
is the slot they project to.

That inversion is a real assumption and a real limitation:

  - It answers "which pick's rookie year does this line most resemble", not
    "where would this player be drafted", which also depends on age, size,
    athleticism, position scarcity and scouting that this database has none of.
  - It is fitted on players who were drafted, so it says nothing reliable about
    lines far below the weakest rookie season in the data.
  - Rookie minutes are partly a consequence of draft position rather than only
    a cause of it: high picks play more because they were high picks. The
    model uses per-minute-aware inputs to blunt that, but cannot remove it.

The API prints the level factor and its basis next to every figure, and the
frontend leads with the SLOT rather than the dollars, precisely because the
slot is what this computes and the money is the published scale's consequence
of it.

No language model is involved anywhere in this path. This is ordinary least
squares over four features, fitted with numpy, and every coefficient is
inspectable in the row it writes.
"""

import numpy as np

# The production index the fit runs over. Deliberately small and interpretable
# rather than every column available: with a few hundred drafted players, four
# features is already close to as much as the data can support, and each of
# these is something a self-reported amateur box score can actually supply.
FEATURE_NAMES = ("points_per_game", "rebounds_per_game", "assists_per_game", "true_shooting")

# Minimum rookie games before a player is a usable training row. A five-game
# rookie year says more about injury than about draft position.
MINIMUM_ROOKIE_GAMES = 20

# The draft is 60 picks; anything the fit projects beyond it is reported as
# the undrafted range rather than extrapolated into a pick number nobody holds.
MAX_PROJECTED_SLOT = 75
MIN_PROJECTED_SLOT = 1

# How wide the reported interval is, as a fraction of the point estimate,
# before the widening below. Chosen to be visibly wide: the honest reading of
# this model is "somewhere in this neighbourhood", and a narrow band would
# overstate it.
BASE_INTERVAL_FRACTION = 0.28

# Extra width for a short game log and for a season nobody has documented.
# Both are real reasons to trust the figure less, and the UI promotes the
# interval over the point estimate when evidence is absent — so the interval
# has to actually widen, or that promotion would be decoration.
SHORT_LOG_GAMES = 25
SHORT_LOG_EXTRA_FRACTION = 0.15
UNDOCUMENTED_EXTRA_FRACTION = 0.20


def build_feature_row(line: dict) -> list[float]:
    """The four model inputs, in FEATURE_NAMES order, from one season line."""
    return [
        float(line["points_per_game"]),
        float(line["rebounds_per_game"]),
        float(line["assists_per_game"]),
        float(line["true_shooting"]),
    ]


def fit_slot_model(rows: list[dict]) -> dict:
    """Fits draft slot against rookie production by ordinary least squares.

    Args:
        rows: one dict per drafted player with the FEATURE_NAMES keys plus
              "draft_number".

    Returns:
        A dict with the fitted "coefficients" (intercept first), the training
        row count, and in-sample "mae" and Spearman "rank_correlation" — all
        stored on the valuation row so a figure can always be traced back to
        how good the model behind it was.

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


def project_slot(model: dict, line: dict) -> int:
    """The draft slot one level-adjusted line projects to.

    Clamped into [MIN_PROJECTED_SLOT, MAX_PROJECTED_SLOT]: the fit is linear
    and a spectacular line would otherwise extrapolate to pick zero or a
    negative one, which is not a pick.
    """
    coefficients = np.array(model["coefficients"], dtype=float)
    design = np.array([1.0, *build_feature_row(line)], dtype=float)
    raw = float(design @ coefficients)
    return int(min(MAX_PROJECTED_SLOT, max(MIN_PROJECTED_SLOT, round(raw))))


def value_interval(value_usd: int, games_logged: int, has_verified_evidence: bool) -> tuple[int, int]:
    """A low/high band around a point estimate.

    Widened for a short game log and for a season with nothing verified behind
    it. Both are genuine reasons for less confidence, and the frontend promotes
    this interval over the point estimate when evidence is absent — so it has
    to be a real change in the model's claim, not a styling choice.
    """
    fraction = BASE_INTERVAL_FRACTION
    if games_logged < SHORT_LOG_GAMES:
        fraction += SHORT_LOG_EXTRA_FRACTION
    if not has_verified_evidence:
        fraction += UNDOCUMENTED_EXTRA_FRACTION

    low = int(round(value_usd * (1 - fraction)))
    high = int(round(value_usd * (1 + fraction)))
    return max(0, low), high


def describe_drivers(line: dict, level_factor: float, level_basis: str) -> list[dict]:
    """Two or three sentences naming what moved this figure most.

    Authored here rather than in the browser on purpose: a client-written
    explanation of a server-side model would be invention. The client renders
    these verbatim.
    """
    drivers = [
        {
            "label": "Scoring",
            "detail": (
                f"{line['points_per_game']:.1f} points per game, counted as "
                f"{line['points_per_game'] * level_factor:.1f} after the level adjustment."
            ),
        },
        {
            "label": "Efficiency",
            "detail": f"{line['true_shooting']:.1f}% true shooting on that scoring volume.",
        },
        {"label": "Level", "detail": level_basis},
    ]

    # Playmaking only earns a line when there is something to say about it —
    # "1.1 assists per game" is noise, not a driver.
    if line["assists_per_game"] >= 4:
        drivers.insert(
            2,
            {
                "label": "Playmaking",
                "detail": f"{line['assists_per_game']:.1f} assists per game is a real part of this profile.",
            },
        )
    return drivers
