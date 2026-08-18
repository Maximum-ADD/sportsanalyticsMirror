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

Chronology: every average used to predict a game (or to train a row of the
regression) is computed only from that team's games strictly before the
game being predicted — never from that game itself, and never from games
that happened afterwards. Mirrors elo.py's compute_elo_ratings, which
builds pre_game_state as a single forward pass so a team's rating going
into a game only ever reflects earlier results. A first version of this
module used a single average-over-everything computed once and reused for
every game regardless of date, which let a team's April form quietly
influence its predicted October margin — a real future-data leak, caught
in review, not a hypothetical one.
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
    matchup. Ordering by date is load-bearing here, not cosmetic — every
    chronological computation downstream (running averages, regression
    training rows) depends on processing games oldest-first.
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
        "game_date": boxscore_row["game_date"],
        "team_id": boxscore_row["team_id"],
        "effective_fg_pct": calculate_effective_field_goal_pct(
            boxscore_row["fgm"], boxscore_row["tpm"], boxscore_row["fga"]
        ),
        "turnover_rate": calculate_turnover_rate(boxscore_row["tov"], boxscore_row["fga"], boxscore_row["fta"]),
        "free_throw_rate": calculate_free_throw_rate(boxscore_row["ftm"], boxscore_row["fga"]),
        "margin": boxscore_row["team_score"] - boxscore_row["opponent_score"],
    }


def compute_running_season_averages(team_game_factors: list[dict]) -> dict[str, dict[str, dict]]:
    """Computes each team's Four Factors average as it stood before each of its games.

    team_game_factors must already be sorted oldest-first (see
    fetch_team_game_boxscores). Single forward pass per team, same shape as
    elo.py's compute_elo_ratings: a running per-team accumulator, snapshotted
    *before* folding in the current game, so a team's game-42 snapshot only
    ever reflects games 1-41 — never game 42 itself, and never game 43+.

    Returns teamId -> gameId -> {effective_fg_pct, turnover_rate,
    free_throw_rate} (the pre-game running average), plus a special
    "_final" gameId per team holding the average across all of that team's
    games, for predicting a team's next (not-yet-played) game.
    """
    running_by_team: dict[str, list[dict]] = {}
    snapshots: dict[str, dict[str, dict]] = {}

    for row in team_game_factors:
        team_id = row["team_id"]
        history = running_by_team.setdefault(team_id, [])
        team_snapshots = snapshots.setdefault(team_id, {})

        if history:
            game_count = len(history)
            team_snapshots[row["game_id"]] = {
                "effective_fg_pct": sum(r["effective_fg_pct"] for r in history) / game_count,
                "turnover_rate": sum(r["turnover_rate"] for r in history) / game_count,
                "free_throw_rate": sum(r["free_throw_rate"] for r in history) / game_count,
            }
        # else: this is the team's first game in the dataset — no prior
        # games to average, so it gets no pre-game snapshot at all (not a
        # zeroed/default one, which would be indistinguishable from a real
        # 0.0 factor value). predict_margin's None-propagation already
        # treats a missing snapshot as "not enough data" correctly.

        history.append(row)

    for team_id, history in running_by_team.items():
        game_count = len(history)
        snapshots[team_id]["_final"] = {
            "effective_fg_pct": sum(r["effective_fg_pct"] for r in history) / game_count,
            "turnover_rate": sum(r["turnover_rate"] for r in history) / game_count,
            "free_throw_rate": sum(r["free_throw_rate"] for r in history) / game_count,
        }

    return snapshots


def fit_regression_weights(team_game_factors: list[dict], running_averages: dict[str, dict[str, dict]]) -> np.ndarray:
    """Fits margin = w1*eFG_diff + w2*TOV_diff + w3*FTR_diff via ordinary least squares.

    Each team-game row's Four Factors are differenced against that same
    game's *opponent pre-game running average* (their form coming into
    this specific game, not a season-long average that would include
    games played after it) — see compute_running_season_averages. A team's
    own row already only exists once its own history has accumulated to
    that point; rows where the opponent has no pre-game snapshot yet
    (opponent's first game in the dataset) are skipped, same as
    predict_margin's None-handling.
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
        opponent_pre_game = running_averages.get(opponent_row["team_id"], {}).get(opponent_row["game_id"])
        if opponent_pre_game is None:
            continue
        feature_rows.append(
            [
                team_row["effective_fg_pct"] - opponent_pre_game["effective_fg_pct"],
                team_row["turnover_rate"] - opponent_pre_game["turnover_rate"],
                team_row["free_throw_rate"] - opponent_pre_game["free_throw_rate"],
            ]
        )
        margins.append(team_row["margin"])

    weights, _residuals, _rank, _singular_values = np.linalg.lstsq(
        np.array(feature_rows), np.array(margins), rcond=None
    )
    return weights


def fit_or_fallback_margin_model(
    team_game_factors: list[dict], running_averages: dict[str, dict[str, dict]]
) -> tuple[str, np.ndarray]:
    """Picks regression vs. heuristic based on MINIMUM_GAMES_FOR_REGRESSION.

    Returns (method_name, weights) where weights is a 3-element array in
    (effective_fg_pct, turnover_rate, free_throw_rate) order — either fitted
    via OLS or the fixed heuristic constants, so predict_margin can apply
    either the same way regardless of which path produced them.
    """
    if len(team_game_factors) >= MINIMUM_GAMES_FOR_REGRESSION:
        return "regression", fit_regression_weights(team_game_factors, running_averages)
    return "heuristic", np.array([EFG_WEIGHT, TURNOVER_WEIGHT, FREE_THROW_RATE_WEIGHT])


def predict_margin(home_factors: dict | None, away_factors: dict | None, weights: np.ndarray) -> float | None:
    """Predicts home-minus-away margin from each team's pre-game Four Factors snapshot.

    Returns None if either team has no qualifying history yet (their first
    game in the dataset has no prior games to average) — matches
    GamePrediction.predictedMarginHome's nullable field.
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
