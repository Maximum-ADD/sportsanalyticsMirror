"""Predicts score margin (home minus away, in points) from Dean Oliver's
Four Factors of basketball success (Basketball on Paper, 2004).

Uses 3 of Oliver's 4 factors, offense-only:
  - effective FG% ((FGM + 0.5*3PM) / FGA)
  - turnover rate (TOV / estimated possessions)
  - free throw rate (FTM / FGA)

Two factors from the original four are deliberately left out:
  - Offensive rebound rate needs the opposing team's defensive rebounds
    (ORB% = OREB / (OREB + opponent DREB)), and this schema's
    PlayerGameStat only tracks total rebounds, not an offensive/defensive
    split. Approximating a split with no real data behind it would be
    fabricating a statistic, not modeling one — left out rather than faked.
  - Defensive factors add no information beyond what's already in the
    model: in a two-team game, "team A's defensive eFG% allowed" is by
    definition the same number as "team B's offensive eFG%" — so once both
    teams' offensive factors are being differenced (home minus away), the
    defensive side is redundant, not a fourth independent signal.

Why a regression/heuristic split at all: with this project's seed data (12
games total, 4 teams, ~6 games/team), fitting a multi-feature OLS regression
against 12 point-margin observations is not honest statistics — every real
Four Factors study assumes a full season per team. Below
MINIMUM_GAMES_FOR_REGRESSION, this module falls back to fixed,
literature-informed weights instead of presenting an overfit regression as
if it were reliable. This is the same call predict.py makes for its own
reasons (see its module docstring) — honest "not enough data yet" over fake
sophistication. Revisit MINIMUM_GAMES_FOR_REGRESSION once the real nba_api
ingestion pipeline provides a full season per team.
"""

import numpy as np

# Below this many completed games leaguewide, a fitted regression is
# considered too unstable to trust — see module docstring. 30 is a loose
# rule of thumb (comfortably more observations than the 3 features being
# fit); this project's seed data (12 games) is always below it, so seed
# data always exercises the heuristic path, not the regression path.
MINIMUM_GAMES_FOR_REGRESSION = 30

# Points a 3-pointer counts as, above the 1.0 implicit weight of a
# 2-pointer, in effective FG% (Oliver's standard formula:
# eFG% = (FGM + 0.5*3PM) / FGA).
THREE_POINT_EFG_WEIGHT = 0.5

# Standard Dean Oliver coefficient converting free throw attempts into an
# equivalent number of "possessions," so TOV / (FGA + 0.44*FTA + TOV)
# approximates turnovers per possession rather than per shot attempt.
FREE_THROW_POSSESSION_WEIGHT = 0.44

# Fixed weights for the heuristic fallback (used below
# MINIMUM_GAMES_FOR_REGRESSION), applied to each team's offensive Four
# Factors difference (home minus away) to produce a predicted point margin.
# Follows Oliver's own published factor-importance ranking (shooting >
# turnovers > free throws, with turnovers working against the team that
# commits them) rather than a project-specific fit — with this little data,
# fitting these weights from scratch isn't possible, so borrowing the
# literature's relative ordering is the honest move. Not claimed to be
# precisely calibrated; see module docstring.
EFG_WEIGHT = 100.0
TURNOVER_WEIGHT = -80.0
FREE_THROW_RATE_WEIGHT = 20.0

MARGIN_DECIMAL_PLACES = 2


def calculate_effective_field_goal_pct(field_goals_made: int, threes_made: int, field_goals_attempted: int) -> float:
    """Oliver's eFG% — a 3-pointer counts as 1.5 field goals made. Returns 0.0 on 0 attempts."""
    if field_goals_attempted == 0:
        return 0.0
    return (field_goals_made + THREE_POINT_EFG_WEIGHT * threes_made) / field_goals_attempted


def calculate_turnover_rate(turnovers: int, field_goals_attempted: int, free_throws_attempted: int) -> float:
    """Turnovers per estimated possession. Returns 0.0 if the possession estimate is 0."""
    possessions_estimate = field_goals_attempted + FREE_THROW_POSSESSION_WEIGHT * free_throws_attempted + turnovers
    if possessions_estimate == 0:
        return 0.0
    return turnovers / possessions_estimate


def calculate_free_throw_rate(free_throws_made: int, field_goals_attempted: int) -> float:
    """Free throws made per field goal attempt — a proxy for how often a team gets to the line."""
    if field_goals_attempted == 0:
        return 0.0
    return free_throws_made / field_goals_attempted


def fetch_team_game_boxscores(cursor) -> list[dict]:
    """Aggregates PlayerGameStat rows to team-game level, oldest game first.

    One row per (team, game): summed FGM/FGA/3PM/FTM/FTA/TOV across every
    player on that team in that game, plus that team's score and its
    opponent's score in that game. Two rows come out of every completed
    game (one per team) since Four Factors are computed per team, not per
    matchup.
    """
    cursor.execute(
        """
        SELECT g."id" AS game_id, g."gameDate" AS game_date, t."id" AS team_id,
               SUM(pgs."fieldGoalsMade") AS fgm, SUM(pgs."fieldGoalsAttempted") AS fga,
               SUM(pgs."threesMade") AS tpm, SUM(pgs."freeThrowsMade") AS ftm,
               SUM(pgs."freeThrowsAttempted") AS fta, SUM(pgs."turnovers") AS tov,
               CASE WHEN g."homeTeamId" = t."id" THEN g."homeScore" ELSE g."awayScore" END AS team_score,
               CASE WHEN g."homeTeamId" = t."id" THEN g."awayScore" ELSE g."homeScore" END AS opponent_score
        FROM "Game" g
        JOIN "Team" t ON t."id" = g."homeTeamId" OR t."id" = g."awayTeamId"
        JOIN "PlayerGameStat" pgs ON pgs."gameId" = g."id"
          AND pgs."playerId" IN (SELECT "id" FROM "Player" WHERE "teamId" = t."id")
        WHERE g."homeScore" IS NOT NULL AND g."awayScore" IS NOT NULL
        GROUP BY g."id", g."gameDate", t."id", g."homeTeamId", g."awayTeamId", g."homeScore", g."awayScore"
        ORDER BY g."gameDate" ASC
        """
    )
    return cursor.fetchall()


def compute_team_game_four_factors(boxscore_row: dict) -> dict:
    """Computes the 3 offensive Four Factors (see module docstring) for one team-game row."""
    return {
        "game_id": boxscore_row["game_id"],
        "team_id": boxscore_row["team_id"],
        "effective_fg_pct": calculate_effective_field_goal_pct(
            boxscore_row["fgm"], boxscore_row["tpm"], boxscore_row["fga"]
        ),
        "turnover_rate": calculate_turnover_rate(boxscore_row["tov"], boxscore_row["fga"], boxscore_row["fta"]),
        "free_throw_rate": calculate_free_throw_rate(boxscore_row["ftm"], boxscore_row["fga"]),
        "margin": boxscore_row["team_score"] - boxscore_row["opponent_score"],
    }


def average_season_four_factors(team_game_factors: list[dict]) -> dict[str, dict]:
    """Averages each team's per-game Four Factors across all its completed games.

    Returns teamId -> {effective_fg_pct, turnover_rate, free_throw_rate}
    season averages. A team with zero completed games is simply absent from
    the result — predict_margin treats that absence as "not enough data,"
    returning None rather than guessing at a league-average default.
    """
    factors_by_team: dict[str, list[dict]] = {}
    for row in team_game_factors:
        factors_by_team.setdefault(row["team_id"], []).append(row)

    averages: dict[str, dict] = {}
    for team_id, rows in factors_by_team.items():
        game_count = len(rows)
        averages[team_id] = {
            "effective_fg_pct": sum(r["effective_fg_pct"] for r in rows) / game_count,
            "turnover_rate": sum(r["turnover_rate"] for r in rows) / game_count,
            "free_throw_rate": sum(r["free_throw_rate"] for r in rows) / game_count,
        }
    return averages


def fit_regression_weights(team_game_factors: list[dict], season_averages: dict[str, dict]) -> np.ndarray:
    """Fits margin = w1*eFG_diff + w2*TOV_diff + w3*FTR_diff via ordinary least squares.

    Each team-game row's Four Factors are differenced against that game's
    opponent's *season-average* factors (not the opponent's same-game
    factors, which would leak the very game being predicted into its own
    training row). Returns the 3 fitted weights, in
    (effective_fg_pct, turnover_rate, free_throw_rate) order.
    """
    games_by_id: dict[str, list[dict]] = {}
    for row in team_game_factors:
        games_by_id.setdefault(row["game_id"], []).append(row)

    feature_rows = []
    margins = []
    for rows in games_by_id.values():
        if len(rows) != 2:
            continue
        team_row, opponent_row = rows
        opponent_season = season_averages.get(opponent_row["team_id"])
        if opponent_season is None:
            continue
        feature_rows.append(
            [
                team_row["effective_fg_pct"] - opponent_season["effective_fg_pct"],
                team_row["turnover_rate"] - opponent_season["turnover_rate"],
                team_row["free_throw_rate"] - opponent_season["free_throw_rate"],
            ]
        )
        margins.append(team_row["margin"])

    weights, _residuals, _rank, _singular_values = np.linalg.lstsq(
        np.array(feature_rows), np.array(margins), rcond=None
    )
    return weights


def fit_or_fallback_margin_model(
    team_game_factors: list[dict], season_averages: dict[str, dict]
) -> tuple[str, np.ndarray]:
    """Picks regression vs. heuristic based on MINIMUM_GAMES_FOR_REGRESSION.

    Returns (method_name, weights) where weights is a 3-element array in
    (effective_fg_pct, turnover_rate, free_throw_rate) order — either fitted
    via OLS or the fixed heuristic constants, so predict_margin can apply
    either the same way regardless of which path produced them.
    """
    if len(team_game_factors) >= MINIMUM_GAMES_FOR_REGRESSION:
        return "regression", fit_regression_weights(team_game_factors, season_averages)
    return "heuristic", np.array([EFG_WEIGHT, TURNOVER_WEIGHT, FREE_THROW_RATE_WEIGHT])


def predict_margin(home_factors: dict | None, away_factors: dict | None, weights: np.ndarray) -> float | None:
    """Predicts home-minus-away margin from each team's season Four Factors averages.

    Returns None if either team has no completed games yet (nothing to
    average) — matches GamePrediction.predictedMarginHome's nullable field.
    """
    if home_factors is None or away_factors is None:
        return None

    feature_diff = np.array(
        [
            home_factors["effective_fg_pct"] - away_factors["effective_fg_pct"],
            home_factors["turnover_rate"] - away_factors["turnover_rate"],
            home_factors["free_throw_rate"] - away_factors["free_throw_rate"],
        ]
    )
    return round(float(np.dot(weights, feature_diff)), MARGIN_DECIMAL_PLACES)
