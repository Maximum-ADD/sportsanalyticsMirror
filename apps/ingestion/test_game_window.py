"""Tests for game_window.py, which decides which games a pull covers.

The window is applied before any boxscore or play-by-play call, so a bug
here either silently skips games the operator asked for or quietly widens a
45-minute run. Both fail quietly in production, hence the coverage of the
boundary and malformed-input cases rather than just the happy path.
"""

import pytest

from game_window import (
    GameWindow,
    build_game_window,
    filter_games_by_window,
    normalise_game_date,
    parse_iso_date,
)


class TestNormaliseGameDate:
    def test_passes_an_iso_date_through(self):
        assert normalise_game_date("2025-10-15") == "2025-10-15"

    def test_converts_the_nba_display_format(self):
        assert normalise_game_date("OCT 15, 2025") == "2025-10-15"

    def test_tolerates_surrounding_whitespace(self):
        assert normalise_game_date("  2025-10-15  ") == "2025-10-15"

    def test_rejects_an_unrecognised_format(self):
        # Silently returning the input would compare wrongly against a
        # window bound rather than failing.
        with pytest.raises(ValueError):
            normalise_game_date("15/10/2025")


class TestParseIsoDate:
    def test_returns_a_valid_date(self):
        assert parse_iso_date("2026-04-18") == "2026-04-18"

    @pytest.mark.parametrize("bad_date", ["2026-13-01", "not-a-date", "2026-04-31", ""])
    def test_rejects_an_invalid_date(self, bad_date):
        with pytest.raises(ValueError):
            parse_iso_date(bad_date)


class TestBuildGameWindow:
    def test_no_dates_produces_an_open_window(self):
        window = build_game_window(None, None)
        assert window.is_open
        assert window.describe() == "all available games"

    def test_builds_a_bounded_window(self):
        window = build_game_window("2026-04-14", "2026-04-18")
        assert not window.is_open
        assert window.describe() == "games from 2026-04-14 to 2026-04-18"

    def test_allows_a_single_open_bound(self):
        assert build_game_window("2026-04-14", None).describe() == "games from 2026-04-14"
        assert build_game_window(None, "2026-04-18").describe() == "games up to 2026-04-18"

    def test_rejects_an_inverted_window(self):
        # An inverted window matches nothing, which would read as "the pull
        # found no games" rather than "the request was wrong".
        with pytest.raises(ValueError, match="after"):
            build_game_window("2026-04-18", "2026-04-14")

    def test_rejects_a_malformed_date(self):
        with pytest.raises(ValueError):
            build_game_window("18-04-2026", None)


class TestGameWindowContains:
    def test_an_open_window_contains_everything(self):
        assert GameWindow().contains("1999-01-01")

    @pytest.mark.parametrize(
        "game_date,expected",
        [
            ("2026-04-13", False),  # day before the window
            ("2026-04-14", True),   # lower bound is inclusive
            ("2026-04-16", True),
            ("2026-04-18", True),   # upper bound is inclusive
            ("2026-04-19", False),  # day after the window
        ],
    )
    def test_bounds_are_inclusive(self, game_date, expected):
        window = GameWindow(from_date="2026-04-14", to_date="2026-04-18")
        assert window.contains(game_date) is expected

    def test_honours_a_lower_bound_alone(self):
        window = GameWindow(from_date="2026-04-14")
        assert not window.contains("2026-04-13")
        assert window.contains("2030-01-01")

    def test_honours_an_upper_bound_alone(self):
        window = GameWindow(to_date="2026-04-18")
        assert window.contains("1999-01-01")
        assert not window.contains("2026-04-19")


class TestFilterGamesByWindow:
    GAMES = {
        "0022500100": "2026-04-13",
        "0022500101": "2026-04-14",
        "0022500102": "2026-04-18",
        "0022500103": "2026-04-19",
    }

    def test_keeps_only_games_inside_the_window(self):
        window = GameWindow(from_date="2026-04-14", to_date="2026-04-18")
        assert filter_games_by_window(self.GAMES, window) == {
            "0022500101": "2026-04-14",
            "0022500102": "2026-04-18",
        }

    def test_an_open_window_keeps_every_game(self):
        assert filter_games_by_window(self.GAMES, GameWindow()) == self.GAMES

    def test_normalises_dates_whichever_endpoint_produced_them(self):
        mixed_format_games = {"0022500101": "OCT 15, 2025", "0022500102": "2025-10-16"}
        window = GameWindow(from_date="2025-10-15", to_date="2025-10-16")

        assert filter_games_by_window(mixed_format_games, window) == {
            "0022500101": "2025-10-15",
            "0022500102": "2025-10-16",
        }

    def test_normalises_dates_even_when_the_window_is_open(self):
        # The returned map feeds upsert_game, so it has to be ISO whether or
        # not a window narrowed it.
        assert filter_games_by_window({"0022500101": "OCT 15, 2025"}, GameWindow()) == {
            "0022500101": "2025-10-15",
        }

    def test_returns_empty_when_nothing_matches(self):
        window = GameWindow(from_date="2030-01-01", to_date="2030-01-02")
        assert filter_games_by_window(self.GAMES, window) == {}
