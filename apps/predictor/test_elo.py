"""Tests for elo.py, focused on the season-boundary reset (compute_elo_ratings
regressing every team's rating toward STARTING_ELO whenever a game's season
differs from the previous game's — see elo.py's module docstring for the
backtest behind SEASON_RESET_FRACTION=0.5) and the chronological/leak-free
properties the rest of the codebase's Elo usage depends on.
"""

from elo import (
    K_FACTOR,
    STARTING_ELO,
    compute_elo_ratings,
    expected_win_probability,
    predict_upcoming_games,
    update_elo,
)


def make_game(game_id: str, season: str, home_team_id: str, away_team_id: str, home_score: int, away_score: int) -> dict:
    return {
        "game_id": game_id,
        "season": season,
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "home_score": home_score,
        "away_score": away_score,
    }


def test_no_season_change_never_triggers_a_reset():
    """A team that only ever plays within one season should end up at
    exactly the same rating a season-reset-unaware forward pass would
    produce — the reset must be a no-op when there's no boundary to cross.
    """
    games = [
        make_game("g1", "2024-25", "home", "away", 110, 100),
        make_game("g2", "2024-25", "home", "away", 105, 108),
        make_game("g3", "2024-25", "home", "away", 120, 90),
    ]
    final_ratings, pre_game_state, final_season = compute_elo_ratings(games)

    # Hand-compute the same sequence with no reset logic at all.
    expected_ratings = {}
    for game in games:
        home_id, away_id = game["home_team_id"], game["away_team_id"]
        elo_home = expected_ratings.get(home_id, STARTING_ELO)
        elo_away = expected_ratings.get(away_id, STARTING_ELO)
        p_home = expected_win_probability(elo_home, elo_away)
        home_won = 1.0 if game["home_score"] > game["away_score"] else 0.0
        expected_ratings[home_id] = update_elo(elo_home, home_won, p_home)
        expected_ratings[away_id] = update_elo(elo_away, 1.0 - home_won, 1.0 - p_home)

    assert final_ratings["home"] == expected_ratings["home"]
    assert final_ratings["away"] == expected_ratings["away"]
    assert final_season == "2024-25"


def test_season_boundary_regresses_rating_toward_starting_elo():
    """A team that's built up a rating far from STARTING_ELO within one
    season should have that rating pulled back toward STARTING_ELO the
    moment a new season's first game is processed — not gradually, not
    delayed, exactly at the boundary.
    """
    games = [
        # "home" wins big and often against a fixed opponent within season 1,
        # building a rating comfortably above STARTING_ELO.
        make_game("g1", "2023-24", "home", "opponent", 130, 90),
        make_game("g2", "2023-24", "home", "opponent", 125, 95),
        make_game("g3", "2023-24", "home", "opponent", 128, 88),
    ]
    final_ratings, _, _ = compute_elo_ratings(games)
    rating_at_season_end = final_ratings["home"]  # AFTER g3, not pre_game_state's before-g3 snapshot
    assert rating_at_season_end > STARTING_ELO  # sanity: the team did build up a rating

    # Now add one more game for "home" in a NEW season, immediately after.
    games_with_new_season = games + [make_game("g4", "2024-25", "home", "opponent", 100, 100)]
    _, pre_game_state_2, _ = compute_elo_ratings(games_with_new_season)
    rating_entering_new_season = pre_game_state_2["g4"]["home_elo_pre"]

    # After a season boundary, the rating should have moved BACK toward
    # STARTING_ELO relative to where it ended the prior season — and by
    # exactly SEASON_RESET_FRACTION of the distance (0.5 today).
    expected_after_reset = rating_at_season_end + 0.5 * (STARTING_ELO - rating_at_season_end)
    assert abs(rating_entering_new_season - expected_after_reset) < 1e-9


def test_a_teams_first_game_ever_is_unaffected_by_a_season_reset():
    """A team's first-ever game already starts at STARTING_ELO — a reset
    (regressing 1500 toward 1500) must be a true no-op for it, not
    accidentally perturb a team that has no history yet.
    """
    games = [
        make_game("g1", "2023-24", "veteran", "veteran_opponent", 110, 100),
        # "rookie" enters in a new season with no prior games at all.
        make_game("g2", "2024-25", "rookie", "veteran", 105, 100),
    ]
    _, pre_game_state, _ = compute_elo_ratings(games)
    assert pre_game_state["g2"]["home_elo_pre"] == STARTING_ELO


def test_reset_only_fires_once_per_boundary_not_once_per_game():
    """Multiple games within the SAME new season must only trigger the
    reset once, at the first game of that season — not re-apply on every
    subsequent game of the same season, which would over-regress ratings
    throughout the whole season instead of just at its start.
    """
    games = [
        make_game("g1", "2023-24", "home", "away", 130, 90),
        make_game("g2", "2023-24", "home", "away", 128, 92),
        make_game("g3", "2024-25", "home", "away", 100, 100),
        make_game("g4", "2024-25", "home", "away", 100, 100),
        make_game("g5", "2024-25", "home", "away", 100, 100),
    ]
    _, pre_game_state, _ = compute_elo_ratings(games)

    # Manually replay: reset fires once before g3, never again before g4/g5.
    rating_before_g3 = pre_game_state["g3"]["home_elo_pre"]
    rating_before_g4 = pre_game_state["g4"]["home_elo_pre"]
    # Between g3 and g4, only ONE real Elo update should have happened (from
    # g3's own result) — no additional regression pulling it further toward
    # STARTING_ELO purely because g4 is also in "2024-25".
    p_g3 = expected_win_probability(rating_before_g3, pre_game_state["g3"]["away_elo_pre"])
    home_won_g3 = 1.0  # 100-100 is a tie in this synthetic example; treat as not a home win for this check
    # Instead of asserting exact arithmetic (tie games aren't realistic NBA
    # data), assert the qualitative property: g4's pre-game rating differs
    # from g3's only by the single update_elo step g3's own result caused.
    expected_rating_before_g4 = update_elo(rating_before_g3, 0.0, p_g3)
    assert abs(rating_before_g4 - expected_rating_before_g4) < 1e-9


def test_predict_upcoming_games_applies_a_pending_season_reset():
    """If every completed game so far is from an earlier season than the
    upcoming games being predicted, predict_upcoming_games must apply the
    same reset compute_elo_ratings would have applied had the new season's
    first game already been played — otherwise the very first predictions
    of a new season would use stale, un-reset ratings.
    """
    completed_games = [
        make_game("g1", "2023-24", "home", "away", 130, 90),
        make_game("g2", "2023-24", "home", "away", 128, 92),
    ]
    final_ratings, _, final_season = compute_elo_ratings(completed_games)
    rating_at_season_end = final_ratings["home"]
    assert rating_at_season_end > STARTING_ELO

    upcoming_games = [{"game_id": "g3", "home_team_id": "home", "away_team_id": "away", "season": "2024-25"}]
    predictions = predict_upcoming_games(upcoming_games, final_ratings, final_season)

    expected_after_reset = rating_at_season_end + 0.5 * (STARTING_ELO - rating_at_season_end)
    assert abs(predictions["g3"]["home_elo_pre"] - expected_after_reset) < 1e-9


def test_predict_upcoming_games_does_not_reset_when_same_season_as_last_completed_game():
    """An upcoming game in the SAME season as the most recent completed
    game must NOT trigger a reset — only a genuine season boundary should.
    """
    completed_games = [make_game("g1", "2024-25", "home", "away", 130, 90)]
    final_ratings, _, final_season = compute_elo_ratings(completed_games)

    upcoming_games = [{"game_id": "g2", "home_team_id": "home", "away_team_id": "away", "season": "2024-25"}]
    predictions = predict_upcoming_games(upcoming_games, final_ratings, final_season)

    assert predictions["g2"]["home_elo_pre"] == final_ratings["home"]
