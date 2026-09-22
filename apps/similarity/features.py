"""Turns a player's season of PlayerGameStat rows into the standardized
feature vector that clustering and nearest-neighbour search both run on.

Every feature here is a RATE, not a total. Two players with identical
styles but different minutes must land in the same place in this space, so
counting stats are normalised per 36 minutes and shooting stats are
expressed as shares of a player's own attempts. Totals would cluster
players by playing time, which measures role security, not playing style.

The features are then z-scored (standardize_feature_matrix) because the raw
columns are on wildly different scales — points/36 is around 20, three-point
attempt rate around 0.4, height around 78. Euclidean distance over
un-standardized columns is dominated by whichever column happens to carry
the largest units, which would make this an elaborate way to sort players
by height.

WHAT THIS MODULE DOES NOT HAVE, and the honest limits that follow, in the
spirit of apps/predictor/four_factors.py's own docstring:

  - Defence is two columns, steals/36 and blocks/36, and neither measures
    what good perimeter defence actually is. Point-of-attack defence
    produces no box-score event when it works: the shot simply never
    happens. A "3&D wing" is therefore NOT separable here from a low-usage
    off-ball shooter, and any label this service produces describes a
    player's OFFENSIVE role plus their rebounding and shot-blocking.
    Naming a cluster after a defensive archetype would claim a measurement
    this project does not have.
  - There is no shot-location data, so a midrange-heavy scorer and a
    rim-attacking scorer of equal efficiency are the same player to this
    model. Separating them needs each zone's share of points (nba_api's
    leaguedashplayerstats Scoring measure type), which is not ingested.
  - Usage rate IS real rather than approximated — PlayerGameStat stores
    NBA's own usagePercentage per game, see its schema comment — but assist
    percentage and rebound percentage are not available, so playmaking and
    rebounding are measured per 36 minutes rather than as a share of the
    team's opportunities while the player was on the floor.
"""

MINUTES_PER_RATE_WINDOW = 36

# Free throws do not each end a possession: the standard true-shooting
# denominator counts a trip to the line as 0.44 of a shooting possession.
# Same coefficient the API uses for its derived true shooting % (see
# docs/PROJECT_OVERVIEW.md, "Advanced stats"), so a player's archetype and
# their profile page cannot disagree about the same number.
FREE_THROW_POSSESSION_WEIGHT = 0.44

# Below these thresholds a player's rate stats are noise rather than style:
# a nine-minute cameo in which someone took two threes reads as a 100%
# three-point attempt rate. Players under the floor get no archetype at all
# rather than a confidently wrong one — the same "not enough data yet" call
# four_factors.py makes with MINIMUM_GAMES_FOR_REGRESSION.
#
# These two numbers are the single biggest lever on output quality and are
# meant to be TUNED against a fully ingested season, which is why they are
# named constants here rather than literals inside a query.
MINIMUM_GAMES_FOR_ARCHETYPE = 8
MINIMUM_MINUTES_PER_GAME_FOR_ARCHETYPE = 12

# The feature vector's column order. Fixed and explicit because the stored
# featureVector Json, and the centroid matching that carries archetype
# names across re-fits, both depend on a position meaning the same thing on
# every run.
FEATURE_NAMES = [
    "points_per_36",
    "offensive_rebounds_per_36",
    "defensive_rebounds_per_36",
    "assists_per_36",
    "steals_per_36",
    "blocks_per_36",
    "turnovers_per_36",
    "threes_attempted_per_36",
    "three_point_attempt_rate",
    "free_throw_rate",
    "true_shooting_pct",
    "assist_to_turnover_ratio",
    "usage_percentage",
    "height_inches",
    "weight_lbs",
]

# PlayerGameStat columns summed straight into season totals, keyed by the
# name this module uses for the total.
_COUNTING_STAT_COLUMNS = {
    "minutes": "minutes",
    "points": "points",
    "assists": "assists",
    "steals": "steals",
    "blocks": "blocks",
    "turnovers": "turnovers",
    "field_goals_attempted": "fieldGoalsAttempted",
    "threes_attempted": "threesAttempted",
    "free_throws_attempted": "freeThrowsAttempted",
}


def divide_or_none(numerator, denominator):
    """Divides two numbers, returning None when the denominator is zero or
    either side is missing.

    Every rate in this module routes through here so that "this cannot be
    computed" stays distinguishable from "this player's rate is 0.0". A
    player who attempted no field goals has an UNDEFINED three-point
    attempt rate, not a 0% one, and PlayerGameStat's schema comment makes
    the same distinction for its own nullable columns.

    Args:
        numerator: the dividend, or None if it was never recorded.
        denominator: the divisor, or None if it was never recorded.

    Returns:
        The quotient as a float, or None when it is undefined.
    """
    if numerator is None or denominator is None or denominator == 0:
        return None
    return numerator / denominator


def calculate_per_36(stat_total, minutes_total):
    """Scales a season counting-stat total to a per-36-minute rate.

    Args:
        stat_total: the player's season total for one counting stat.
        minutes_total: the player's season total minutes.

    Returns:
        The stat per 36 minutes, or None for a player with no recorded
        minutes, who has no rate at all.
    """
    per_minute = divide_or_none(stat_total, minutes_total)
    if per_minute is None:
        return None
    return per_minute * MINUTES_PER_RATE_WINDOW


def calculate_true_shooting_pct(points_total, field_goals_attempted, free_throws_attempted):
    """Points scored per shooting possession, counting each free-throw trip
    as FREE_THROW_POSSESSION_WEIGHT of a possession.

    Args:
        points_total: season points.
        field_goals_attempted: season field goal attempts.
        free_throws_attempted: season free throw attempts.

    Returns:
        True shooting percentage as a 0–1 float, or None when the player
        took no shots of either kind.
    """
    if field_goals_attempted is None or free_throws_attempted is None:
        return None
    shooting_possessions = (
        field_goals_attempted + FREE_THROW_POSSESSION_WEIGHT * free_throws_attempted
    )
    return divide_or_none(points_total, 2 * shooting_possessions)


def calculate_three_point_attempt_rate(threes_attempted, field_goals_attempted):
    """Share of a player's field goal attempts taken from three.

    This is the floor-spacing feature, and it separates a stretch big from
    a traditional big far more cleanly than three-point PERCENTAGE would:
    it measures what a player is willing to shoot, rather than how often it
    happened to go in over a small sample.

    Args:
        threes_attempted: season three-point attempts.
        field_goals_attempted: season field goal attempts.

    Returns:
        The rate as a 0–1 float, or None for a player who took no shots.
    """
    return divide_or_none(threes_attempted, field_goals_attempted)


def calculate_free_throw_rate(free_throws_attempted, field_goals_attempted):
    """Free-throw attempts per field-goal attempt, as a proxy for how much
    a player attacks the rim and draws contact.

    A proxy rather than a measurement: the shot-location data that would
    show rim pressure directly is not ingested by this project.

    Args:
        free_throws_attempted: season free throw attempts.
        field_goals_attempted: season field goal attempts.

    Returns:
        The rate as a float, or None for a player who took no field goals.
    """
    return divide_or_none(free_throws_attempted, field_goals_attempted)


def calculate_assist_to_turnover_ratio(assists_total, turnovers_total):
    """Assists per turnover, measuring how safely a player handles whatever
    creation volume they carry.

    Args:
        assists_total: season assists.
        turnovers_total: season turnovers.

    Returns:
        The ratio as a float, or None for a player with zero turnovers.
        None rather than treating them as infinitely careful: over a full
        season, zero turnovers describes a low-usage player who barely
        touched the ball, not an elite decision-maker, and either reading
        would be a guess this module has no business making.
    """
    return divide_or_none(assists_total, turnovers_total)


def aggregate_player_season_totals(game_stat_rows):
    """Collapses one player's PlayerGameStat rows into the season totals
    the rate features are derived from.

    Counting stats are summed. usagePercentage is MINUTES-WEIGHTED rather
    than simple-averaged, matching how the API aggregates it (see
    docs/PROJECT_OVERVIEW.md, "Advanced stats"): it is a rate over playing
    time, so a four-minute garbage-time cameo should not count as much as a
    thirty-eight-minute start. Rows carrying a null usagePercentage — those
    ingested before the column existed — are skipped for that weighting
    only, so they still contribute their counting stats instead of dropping
    the player altogether.

    Args:
        game_stat_rows: PlayerGameStat rows for ONE player, as dicts keyed
            by the Prisma column names.

    Returns:
        A dict of season totals, plus `games_played` and the minutes-weighted
        `usage_percentage`, which is None when no row recorded one.
    """
    totals = {
        "games_played": len(game_stat_rows),
        "minutes": 0,
        "points": 0,
        "offensive_rebounds": 0,
        "defensive_rebounds": 0,
        "assists": 0,
        "steals": 0,
        "blocks": 0,
        "turnovers": 0,
        "field_goals_attempted": 0,
        "threes_attempted": 0,
        "free_throws_attempted": 0,
    }

    usage_minutes_product = 0.0
    minutes_carrying_usage = 0

    for row in game_stat_rows:
        for total_name, column_name in _COUNTING_STAT_COLUMNS.items():
            totals[total_name] += row.get(column_name) or 0

        # Nullable, unlike the counting stats above: rows ingested before
        # the offensive/defensive rebound split existed carry a genuine
        # "never recorded" that must not be read as zero offensive rebounds.
        totals["offensive_rebounds"] += row.get("offensiveRebounds") or 0
        totals["defensive_rebounds"] += row.get("defensiveRebounds") or 0

        usage_percentage = row.get("usagePercentage")
        if usage_percentage is not None:
            minutes = row.get("minutes") or 0
            usage_minutes_product += usage_percentage * minutes
            minutes_carrying_usage += minutes

    totals["usage_percentage"] = divide_or_none(usage_minutes_product, minutes_carrying_usage)
    return totals


def is_eligible_for_archetype(season_totals):
    """Whether a player has played enough for their rate stats to describe
    a style rather than a small-sample accident.

    Both thresholds have to hold: the games floor guards against a player
    who had one huge night, the minutes-per-game floor against a deep-bench
    player who dressed all season without ever really playing.

    Args:
        season_totals: the output of aggregate_player_season_totals.

    Returns:
        True when the player clears both floors.
    """
    games_played = season_totals["games_played"]
    if games_played < MINIMUM_GAMES_FOR_ARCHETYPE:
        return False
    minutes_per_game = divide_or_none(season_totals["minutes"], games_played)
    if minutes_per_game is None:
        return False
    return minutes_per_game >= MINIMUM_MINUTES_PER_GAME_FOR_ARCHETYPE


def build_feature_row(season_totals, player):
    """Builds one player's raw, un-standardized feature vector.

    Args:
        season_totals: the output of aggregate_player_season_totals.
        player: a Player row, for the two physical features (heightInches,
            weightLbs) that no amount of box score reveals.

    Returns:
        A list of floats in FEATURE_NAMES order, or None if ANY feature
        could not be computed. None rather than an imputed value keeps this
        module from inventing a measurement: a player missing a height is a
        gap to be fixed in ingestion, not a player of average height.
        Callers drop these players with a stated reason, exactly as the
        minutes floor does.
    """
    minutes_total = season_totals["minutes"]
    field_goals_attempted = season_totals["field_goals_attempted"]
    free_throws_attempted = season_totals["free_throws_attempted"]

    feature_by_name = {
        "points_per_36": calculate_per_36(season_totals["points"], minutes_total),
        "offensive_rebounds_per_36": calculate_per_36(
            season_totals["offensive_rebounds"], minutes_total
        ),
        "defensive_rebounds_per_36": calculate_per_36(
            season_totals["defensive_rebounds"], minutes_total
        ),
        "assists_per_36": calculate_per_36(season_totals["assists"], minutes_total),
        "steals_per_36": calculate_per_36(season_totals["steals"], minutes_total),
        "blocks_per_36": calculate_per_36(season_totals["blocks"], minutes_total),
        "turnovers_per_36": calculate_per_36(season_totals["turnovers"], minutes_total),
        "threes_attempted_per_36": calculate_per_36(
            season_totals["threes_attempted"], minutes_total
        ),
        "three_point_attempt_rate": calculate_three_point_attempt_rate(
            season_totals["threes_attempted"], field_goals_attempted
        ),
        "free_throw_rate": calculate_free_throw_rate(
            free_throws_attempted, field_goals_attempted
        ),
        "true_shooting_pct": calculate_true_shooting_pct(
            season_totals["points"], field_goals_attempted, free_throws_attempted
        ),
        "assist_to_turnover_ratio": calculate_assist_to_turnover_ratio(
            season_totals["assists"], season_totals["turnovers"]
        ),
        "usage_percentage": season_totals["usage_percentage"],
        "height_inches": player.get("heightInches"),
        "weight_lbs": player.get("weightLbs"),
    }

    if any(feature_by_name[name] is None for name in FEATURE_NAMES):
        return None
    return [float(feature_by_name[name]) for name in FEATURE_NAMES]


def standardize_feature_matrix(feature_matrix):
    """Z-scores each column so that every feature contributes to distance
    on equal terms.

    A column with zero variance — every player identical, which happens on
    a near-empty development database — would divide by zero, so it is left
    centred at 0.0 instead. That is the truthful encoding rather than a
    convenience: a feature nobody differs on carries no information about
    who resembles whom, so contributing nothing to the distance is exactly
    right.

    Args:
        feature_matrix: a list of equal-length float lists, one per player.

    Returns:
        (standardized_matrix, column_means, column_standard_deviations).
        The means and deviations come back because scoring a new player
        against an existing fit, and un-standardizing a centroid to
        describe it in real units when naming archetypes, both need the
        same numbers.
    """
    if not feature_matrix:
        return [], [], []

    player_count = len(feature_matrix)
    column_count = len(feature_matrix[0])
    column_means = []
    column_standard_deviations = []

    for column_index in range(column_count):
        column = [row[column_index] for row in feature_matrix]
        mean = sum(column) / player_count
        variance = sum((value - mean) ** 2 for value in column) / player_count
        column_means.append(mean)
        column_standard_deviations.append(variance ** 0.5)

    standardized_matrix = []
    for row in feature_matrix:
        standardized_row = []
        for column_index, value in enumerate(row):
            standard_deviation = column_standard_deviations[column_index]
            if standard_deviation == 0:
                standardized_row.append(0.0)
            else:
                standardized_row.append(
                    (value - column_means[column_index]) / standard_deviation
                )
        standardized_matrix.append(standardized_row)

    return standardized_matrix, column_means, column_standard_deviations
