"""The published NBA rookie salary scale — the only real money in this feature.

This table is the whole reason the valuation is anchored where it is. There is
no salary, contract or market-value data anywhere in this project and nba_api
exposes none, so "what is this player worth" cannot be answered directly. What
CAN be answered is "what would this player sign for entering the league",
because the rookie scale is small, fixed and public: the league publishes one
first-year figure per first-round pick, and it does not move until the next
one is published.

So the model predicts a DRAFT SLOT, and the slot is looked up here. That split
matters for how the figure is presented: the slot is what was computed, the
dollars are its published consequence, and the UI leads with the slot for
exactly that reason.

MAINTENANCE: the NBA publishes a new scale each summer. When it does, add the
new year below and move ROOKIE_SCALE_YEAR to it. Nothing in the system will
warn you that it has gone stale — which is why every stored valuation records
the year it was priced against, and why the API prints that year next to every
figure it shows.

Figures are the first-year salary at 100% of the scale amount, rounded to the
nearest ten thousand dollars. They are approximations of the published table,
not a contract database: a real deal is signed at 80-120% of the scale amount,
and nothing here claims otherwise.
"""

ROOKIE_SCALE_YEAR = "2025-26"

# Pick number -> first-year scale salary in whole dollars.
FIRST_ROUND_SCALE = {
    1: 12_800_000,
    2: 11_450_000,
    3: 10_290_000,
    4: 9_280_000,
    5: 8_390_000,
    6: 7_600_000,
    7: 6_900_000,
    8: 6_280_000,
    9: 5_730_000,
    10: 5_240_000,
    11: 4_800_000,
    12: 4_600_000,
    13: 4_490_000,
    14: 4_400_000,
    15: 4_150_000,
    16: 3_920_000,
    17: 3_710_000,
    18: 3_520_000,
    19: 3_350_000,
    20: 3_190_000,
    21: 3_050_000,
    22: 2_920_000,
    23: 2_800_000,
    24: 2_700_000,
    25: 2_610_000,
    26: 2_530_000,
    27: 2_460_000,
    28: 2_400_000,
    29: 2_350_000,
    30: 2_300_000,
}

FIRST_ROUND_PICKS = 30
DRAFT_PICKS = 60

# Second-rounders sign a two-way or a minimum deal rather than a scale
# contract, so there is no published per-pick figure for them. One flat
# approximation of the two-way salary is more honest than inventing a
# descending curve the league does not publish.
SECOND_ROUND_VALUE = 600_000

# Outside the draft entirely: an Exhibit 10 / training-camp deal. Still a real
# published figure, and still the honest bottom of this scale rather than zero
# — "undrafted" is not "worthless".
UNDRAFTED_VALUE = 85_000


def value_for_slot(slot: int) -> int:
    """First-year dollars for a projected draft slot.

    Args:
        slot: the projected pick number, 1 upwards.

    Returns:
        The published scale salary for a first-round pick, a flat two-way
        approximation through the second round, and the camp-deal figure
        beyond the draft.
    """
    if slot < 1:
        raise ValueError(f"draft slot must be 1 or higher, got {slot}")
    if slot <= FIRST_ROUND_PICKS:
        return FIRST_ROUND_SCALE[slot]
    if slot <= DRAFT_PICKS:
        return SECOND_ROUND_VALUE
    return UNDRAFTED_VALUE
