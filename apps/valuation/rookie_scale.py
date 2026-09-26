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

Figures are the first-year salary at 100% of the scale amount, which is what
"the rookie scale" means. A real first-round deal may be signed at 80-120% of
that amount, and in practice almost every pick signs at 120%; the figure here
is the scale itself, not a claim about any one negotiation.

SOURCE: Hoops Rumors, "Rookie Scale Salaries For 2026 NBA First-Round Picks"
(July 2026), which prints each pick's 120% first-year salary for 2026-27; each
figure below is that amount divided by 1.2, which is exact for every pick.
Cross-checked against the same outlet's 2025-26 table: every pick rises by
6.67%, exactly the rise in the salary cap ($154,647,000 to $164,961,000), as
the scale is tied to the cap.
https://www.hoopsrumors.com/2026/07/rookie-scale-salaries-for-2026-nba-first-round-picks.html
"""

ROOKIE_SCALE_YEAR = "2026-27"

# Pick number -> first-year scale salary (100%) in whole dollars.
FIRST_ROUND_SCALE = {
    1: 12_290_000,
    2: 10_996_100,
    3: 9_874_800,
    4: 8_903_100,
    5: 8_062_300,
    6: 7_322_500,
    7: 6_684_700,
    8: 6_123_900,
    9: 5_629_000,
    10: 5_347_800,
    11: 5_080_200,
    12: 4_826_400,
    13: 4_585_000,
    14: 4_356_000,
    15: 4_137_900,
    16: 3_931_100,
    17: 3_734_400,
    18: 3_547_900,
    19: 3_388_100,
    20: 3_252_300,
    21: 3_122_300,
    22: 2_997_600,
    23: 2_877_800,
    24: 2_762_800,
    25: 2_651_900,
    26: 2_564_100,
    27: 2_490_100,
    28: 2_474_600,
    29: 2_456_900,
    30: 2_439_000,
}

FIRST_ROUND_PICKS = 30
DRAFT_PICKS = 60

# Second-rounders sign a two-way or a minimum deal rather than a scale
# contract, so there is no published per-pick figure for them. The two-way
# player salary is the lower of the two and the most common landing spot, and
# it is one published number rather than a descending curve the league does
# not publish. 2026-27: $678,882, half the rookie minimum (Hoops Rumors,
# "Salary Cap, Tax Line Set For 2026/27 NBA Season", June 2026).
SECOND_ROUND_VALUE = 678_882

# Outside the draft entirely: an Exhibit 10 / training-camp deal, priced at
# the maximum Exhibit 10 bonus — the guaranteed money such a deal can carry.
# Still a real published figure, and still the honest bottom of this scale
# rather than zero: "undrafted" is not "worthless". 2026-27: $91,000 (same
# source as above).
UNDRAFTED_VALUE = 91_000


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
