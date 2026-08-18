"""Computes FiveThirtyEight-style Elo ratings and home win probability.

Deliberately the simplest model that's still principled: Elo only needs
Game.homeScore/awayScore/homeTeamId/awayTeamId history, no boxscore data,
which matters because it can produce a real (if weak) signal even with this
project's tiny seed dataset (6 games per team). Margin-of-victory K-scaling
(weighting blowouts more than close wins, as FiveThirtyEight's real NBA Elo
does) is a documented next step, not implemented here — with only 6 games
per team the extra parameter would add complexity without enough data to
tune or validate it against. Revisit once the real nba_api ingestion
pipeline (see root PROJECT_OVERVIEW.md's known gaps) provides enough games
per team for that to matter.

With this dataset's 6 games/team, ratings barely move from STARTING_ELO by
season end — that's an honest reflection of how little evidence 6 games is,
not a bug. Predictions will look close to 50/50 + home-court advantage for
almost every matchup until there's more real game history.
"""

STARTING_ELO = 1500.0

# FiveThirtyEight's NBA Elo model uses a K-factor around 20; higher K makes
# ratings react faster to recent results (useful for a short/noisy history)
# at the cost of more single-game noise. 20 is the standard starting point
# in the literature, not tuned against this project's data (there isn't
# enough of it to tune against).
K_FACTOR = 20.0

# Home-court advantage, expressed directly as Elo points added to the home
# team's rating before computing win probability. Roughly 70-100 is the
# commonly cited range in NBA Elo writeups (FiveThirtyEight's published NBA
# Elo used values toward the top of that range); 75 is a middle-of-range
# starting point.
HOME_COURT_ADVANTAGE_ELO = 75.0

# The divisor in the logistic win-probability formula. 400 is the standard
# Elo constant (chosen historically so a 400-point rating gap implies a
# 10:1 win probability) and not something this project has reason to retune.
ELO_DIVISOR = 400.0


def expected_win_probability(elo_home: float, elo_away: float) -> float:
    """FiveThirtyEight-style logistic win-probability formula, home team's perspective.

    P(home wins) = 1 / (1 + 10^(-((elo_home + HCA - elo_away)) / 400))
    """
    rating_diff = (elo_home + HOME_COURT_ADVANTAGE_ELO) - elo_away
    return 1.0 / (1.0 + 10 ** (-rating_diff / ELO_DIVISOR))


def update_elo(rating: float, actual_result: float, expected_result: float) -> float:
    """One Elo update: R' = R + K * (actual - expected).

    actual_result is 1.0 for a win, 0.0 for a loss (no draws in the NBA).
    """
    return rating + K_FACTOR * (actual_result - expected_result)


def fetch_completed_games_chronological(cursor) -> list[dict]:
    """Reads every played game (both scores present) oldest game first.

    Chronological order is required by compute_elo_ratings, which processes
    games as a single forward pass, updating a running rating dict — Elo is
    inherently sequential (each game's rating update depends on the state
    left by the previous one), unlike the per-player independence
    predict.py's recency-weighted average relies on.
    """
    cursor.execute(
        """
        SELECT g."id" AS game_id, g."homeTeamId" AS home_team_id,
               g."awayTeamId" AS away_team_id, g."homeScore" AS home_score,
               g."awayScore" AS away_score, g."gameDate" AS game_date
        FROM "Game" g
        WHERE g."homeScore" IS NOT NULL AND g."awayScore" IS NOT NULL
        ORDER BY g."gameDate" ASC
        """
    )
    return cursor.fetchall()


def fetch_upcoming_games(cursor) -> list[dict]:
    """Reads every scheduled-but-not-yet-played game (either score missing)."""
    cursor.execute(
        """
        SELECT g."id" AS game_id, g."homeTeamId" AS home_team_id,
               g."awayTeamId" AS away_team_id
        FROM "Game" g
        WHERE g."homeScore" IS NULL OR g."awayScore" IS NULL
        """
    )
    return cursor.fetchall()


def compute_elo_ratings(games_chronological: list[dict]) -> tuple[dict[str, float], dict[str, dict]]:
    """Single forward pass over every completed game, updating a running Elo dict.

    Returns (final_ratings, pre_game_state):
    - final_ratings: teamId -> its Elo rating after the last game in the input.
    - pre_game_state: gameId -> {home_elo_pre, away_elo_pre, home_win_probability},
      the rating/probability snapshot *before* that game was applied — the
      correct predictive quantity for a completed game, since using the
      post-game rating would leak the very outcome being predicted.
    """
    ratings: dict[str, float] = {}
    pre_game_state: dict[str, dict] = {}

    for game in games_chronological:
        home_id, away_id = game["home_team_id"], game["away_team_id"]
        elo_home = ratings.get(home_id, STARTING_ELO)
        elo_away = ratings.get(away_id, STARTING_ELO)

        home_win_probability = expected_win_probability(elo_home, elo_away)
        pre_game_state[game["game_id"]] = {
            "home_elo_pre": elo_home,
            "away_elo_pre": elo_away,
            "home_win_probability": home_win_probability,
        }

        home_won = 1.0 if game["home_score"] > game["away_score"] else 0.0
        ratings[home_id] = update_elo(elo_home, home_won, home_win_probability)
        ratings[away_id] = update_elo(elo_away, 1.0 - home_won, 1.0 - home_win_probability)

    return ratings, pre_game_state


def predict_upcoming_games(upcoming_games: list[dict], final_ratings: dict[str, float]) -> dict[str, dict]:
    """Predicts every not-yet-played game from each team's current Elo rating.

    Returns gameId -> {home_elo_pre, away_elo_pre, home_win_probability}, the
    same shape as compute_elo_ratings' pre_game_state, so both completed and
    upcoming games can be written through one save path. Teams with no
    completed games yet default to STARTING_ELO, same as mid-pass.
    """
    predictions: dict[str, dict] = {}
    for game in upcoming_games:
        elo_home = final_ratings.get(game["home_team_id"], STARTING_ELO)
        elo_away = final_ratings.get(game["away_team_id"], STARTING_ELO)
        predictions[game["game_id"]] = {
            "home_elo_pre": elo_home,
            "away_elo_pre": elo_away,
            "home_win_probability": expected_win_probability(elo_home, elo_away),
        }
    return predictions
