"""How much a season's production is discounted for where it was played.

This is the single most consequential assumption in the feature, and the least
empirically grounded, so it is stated as an assumption everywhere it is used:
every stored valuation carries both the factor applied and a one-sentence
basis string, and the UI prints both next to the figure rather than folding
them silently into the dollars.

Why it has to exist at all: without it the board ranks whoever plays the
weakest opposition. Thirty points a game in a recreational league and thirty
in Division I are not the same claim, and a leaderboard that treats them alike
is measuring the schedule rather than the player.

Why the numbers are what they are: they are a coarse ordering of competition
strength, anchored on NCAA Division I as the level from which NBA draftees
overwhelmingly come (so D1 is 1.0 by construction, not by measurement).
Everything below it is a judgement about the size of the step down, informed
by how rarely players at that level reach the NBA at all. They are NOT fitted
— there is no dataset in this project pairing amateur seasons with NBA
outcomes, and inventing a regression over data that does not exist would be
worse than an honest ordering.

If that dataset ever arrives, this module is the thing to replace, and the
basis strings below are what would have to stop saying "judgement" and start
citing a fit.
"""

# Level -> (multiplier applied to production, one sentence saying why).
#
# The multiplier scales the per-game production that feeds the draft-slot
# model, not the dollar figure directly: a D2 player's 24 points are treated
# as though they were roughly 15 against D1 opposition, and the model prices
# THAT line. Scaling the dollars instead would imply the player was drafted
# and then paid less, which is not what is being claimed.
LEVEL_FACTORS = {
    "NCAA_D1": (
        1.00,
        "NCAA Division I is the reference level: almost every drafted player comes "
        "from it, so its production is taken at face value.",
    ),
    "INTERNATIONAL_PRO": (
        0.95,
        "Top-flight international professional leagues are a comparable or harder "
        "standard than NCAA Division I, discounted only slightly because league "
        "strength varies far more than within the NCAA.",
    ),
    "NCAA_D2": (
        0.62,
        "NCAA Division II production is translated against Division I output; the "
        "step down in opposition is large and draftees from it are rare.",
    ),
    "NAIA": (
        0.55,
        "NAIA sits alongside NCAA Division II in standard, with fewer players "
        "reaching professional basketball at all.",
    ),
    "JUCO": (
        0.52,
        "Junior college is a transfer level: strong players typically move up to "
        "Division I before being drafted, so production here is discounted "
        "against what they would face there.",
    ),
    "NCAA_D3": (
        0.42,
        "NCAA Division III is non-scholarship and a substantial step below "
        "Division I opposition.",
    ),
    "SEMI_PRO": (
        0.40,
        "Semi-professional leagues vary enormously in standard, so production is "
        "discounted heavily rather than assumed to be near a professional level.",
    ),
    "HIGH_SCHOOL": (
        0.30,
        "High school opposition is far below professional standard and the range "
        "of competition is wide, so production is discounted steeply.",
    ),
    "REC": (
        0.15,
        "Recreational leagues have no consistent standard of opposition, so "
        "production here supports only the weakest inference about professional "
        "potential.",
    ),
}

# Used when a level somehow reaches this module without an entry — the most
# conservative factor in the table, because under-claiming is the right
# failure direction for a figure presented as somebody's professional value.
UNKNOWN_LEVEL_FACTOR = (
    0.15,
    "This competition level is not recognised, so the most conservative "
    "translation in the table is applied.",
)


def factor_for(competition_level: str) -> tuple[float, str]:
    """The multiplier and its stated basis for one competition level.

    Args:
        competition_level: a CompetitionLevel enum value as stored by Prisma.

    Returns:
        (multiplier, basis sentence). Never raises: an unrecognised level gets
        the most conservative factor rather than failing the whole run, and the
        basis string says so.
    """
    return LEVEL_FACTORS.get(competition_level, UNKNOWN_LEVEL_FACTOR)
