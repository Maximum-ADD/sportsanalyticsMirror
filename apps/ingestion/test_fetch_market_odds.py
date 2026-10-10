"""Tests for fetch_market_odds.py's pure logic: the American-odds/de-vig
math, and the team/game matching that stands between an odds-API event and
one of our own Game rows. fetch_nba_moneyline_odds/upsert_market_odds
aren't unit tested here for the same reason games.py's live NBA calls and
db-writing functions aren't (see test_games.py's module docstring) — they're
thin I/O, exercised in practice by running the script for real.
"""

from datetime import datetime, timezone

from fetch_market_odds import (
    american_odds_to_implied_probability,
    average_home_win_probability,
    match_event_to_game,
    remove_vig,
    team_name_matches,
)


def test_negative_price_is_a_favorite_implying_over_half():
    # -110 is the standard "pick 'em minus the vig" price on each side of an
    # even matchup.
    assert round(american_odds_to_implied_probability(-110), 4) == 0.5238


def test_positive_price_is_an_underdog_implying_under_half():
    assert round(american_odds_to_implied_probability(150), 4) == 0.4


def test_remove_vig_on_a_pick_em_line_recovers_exactly_half():
    home_implied = american_odds_to_implied_probability(-110)
    away_implied = american_odds_to_implied_probability(-110)

    assert round(remove_vig(home_implied, away_implied), 10) == 0.5


def test_remove_vig_on_a_lopsided_line_keeps_the_favorite_favored():
    # -300 / +250: a real, clearly asymmetric moneyline. De-vigging must
    # narrow the gap toward the two prices' relative strength, not flip it
    # or collapse it to 50/50.
    home_implied = american_odds_to_implied_probability(-300)
    away_implied = american_odds_to_implied_probability(250)

    fair_home_probability = remove_vig(home_implied, away_implied)

    assert 0.5 < fair_home_probability < home_implied


def make_event(home_team: str, away_team: str, bookmaker_prices: list[tuple[float, float]]) -> dict:
    """One odds-API event with one h2h market per bookmaker (home_price, away_price)."""
    return {
        "home_team": home_team,
        "away_team": away_team,
        "bookmakers": [
            {
                "key": f"book-{index}",
                "markets": [
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": home_team, "price": home_price},
                            {"name": away_team, "price": away_price},
                        ],
                    }
                ],
            }
            for index, (home_price, away_price) in enumerate(bookmaker_prices)
        ],
    }


def test_average_home_win_probability_averages_across_every_book():
    # Two books quoting the exact same pick-'em line — the average must
    # still land on 0.5, not be skewed by naively summing without dividing.
    event = make_event("Boston Celtics", "Miami Heat", [(-110, -110), (-105, -115)])

    probability, bookmaker_count = average_home_win_probability(event)

    assert bookmaker_count == 2
    assert 0.49 < probability < 0.51


def test_average_home_win_probability_skips_books_with_no_two_sided_market():
    # One book has no h2h market at all (e.g. spreads-only); it must be
    # excluded from both the average and the reported bookmaker_count, not
    # counted as a missing/zero data point.
    event = make_event("Boston Celtics", "Miami Heat", [(-110, -110)])
    event["bookmakers"].append({"key": "spreads-only-book", "markets": [{"key": "spreads", "outcomes": []}]})

    probability, bookmaker_count = average_home_win_probability(event)

    assert bookmaker_count == 1
    assert round(probability, 10) == 0.5


def test_average_home_win_probability_is_none_when_no_book_has_a_usable_market():
    event = make_event("Boston Celtics", "Miami Heat", [])

    assert average_home_win_probability(event) is None


def test_team_name_matches_the_common_city_plus_nickname_form():
    assert team_name_matches("Boston Celtics", "Celtics")
    assert not team_name_matches("Boston Celtics", "Warriors")


def test_team_name_matches_the_la_clippers_city_form_mismatch():
    # The Odds API renders this team as "LA Clippers", not this schema's
    # own Team.city ("Los Angeles") + nickname combination — exactly the
    # mismatch nickname-suffix matching exists to sidestep. See module
    # docstring.
    assert team_name_matches("LA Clippers", "Clippers")


def test_team_name_matches_a_two_word_nickname():
    assert team_name_matches("Portland Trail Blazers", "Trail Blazers")


def make_upcoming_game(game_id: str, game_date: datetime, home_nickname: str, away_nickname: str) -> dict:
    return {"game_id": game_id, "game_date": game_date, "home_nickname": home_nickname, "away_nickname": away_nickname}


def test_match_event_to_game_requires_both_teams_and_a_close_commence_time():
    event = {
        "home_team": "Boston Celtics",
        "away_team": "Miami Heat",
        "commence_time": "2026-01-15T00:00:00Z",
    }
    upcoming_games = [
        make_upcoming_game("wrong-teams", datetime(2026, 1, 15, tzinfo=timezone.utc), "Lakers", "Warriors"),
        make_upcoming_game("right-game", datetime(2026, 1, 15, 1, 0, tzinfo=timezone.utc), "Celtics", "Heat"),
    ]

    matched = match_event_to_game(event, upcoming_games)

    assert matched["game_id"] == "right-game"


def test_match_event_to_game_rejects_a_same_matchup_far_enough_away_in_time():
    # The same two teams play twice in a season — the second meeting, weeks
    # later, must not be matched to odds for the first.
    event = {
        "home_team": "Boston Celtics",
        "away_team": "Miami Heat",
        "commence_time": "2026-01-15T00:00:00Z",
    }
    upcoming_games = [
        make_upcoming_game("later-rematch", datetime(2026, 3, 1, tzinfo=timezone.utc), "Celtics", "Heat"),
    ]

    assert match_event_to_game(event, upcoming_games) is None


def test_match_event_to_game_handles_naive_utc_game_dates_from_the_database():
    # psycopg2 returns naive datetimes for this schema's timezone-less
    # TIMESTAMP(3) columns; match_event_to_game must treat them as UTC
    # rather than raising on a naive/aware comparison.
    event = {
        "home_team": "Boston Celtics",
        "away_team": "Miami Heat",
        "commence_time": "2026-01-15T00:00:00Z",
    }
    upcoming_games = [make_upcoming_game("naive-date-game", datetime(2026, 1, 15), "Celtics", "Heat")]

    matched = match_event_to_game(event, upcoming_games)

    assert matched["game_id"] == "naive-date-game"


def test_match_event_to_game_returns_none_with_no_candidates():
    event = {"home_team": "Boston Celtics", "away_team": "Miami Heat", "commence_time": "2026-01-15T00:00:00Z"}

    assert match_event_to_game(event, []) is None
