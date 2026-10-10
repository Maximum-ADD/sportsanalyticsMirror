"""Tests for how a pull decides which games and which player bios to fetch.

These are what make a windowed pull cheap: one leaguewide game-list call
instead of 30 per-team calls, and bios only for players who have never had
one. The NBA API functions are replaced with fakes that record their calls,
so the tests assert on call counts — the thing that actually costs time
against a rate-limited endpoint — without touching the network.
"""

import pytest

import ingest
from game_window import GameWindow
from games import NBA_SEASON_TYPE_REGULAR

TEAM_ID_BY_NBA_ID = {1610612747: "lal", 1610612738: "bos", 1610612744: "gsw"}


@pytest.fixture
def api_calls(monkeypatch):
    """Replaces both game-list fetchers with recording fakes."""
    calls = {"per_team": [], "leaguewide": []}

    def fake_fetch_recent_games(nba_team_id, season, limit=None):
        calls["per_team"].append(nba_team_id)
        return [{"nba_game_id": f"00225{nba_team_id % 1000:05d}", "game_date": "2026-04-10"}]

    def fake_fetch_season_segment_games(season, nba_season_type):
        calls["leaguewide"].append((season, nba_season_type))
        return [
            {"nba_game_id": "0022500001", "game_date": "2026-04-13"},
            {"nba_game_id": "0022500002", "game_date": "2026-04-14"},
            {"nba_game_id": "0022500003", "game_date": "APR 16, 2026"},
            {"nba_game_id": "0022500004", "game_date": "2026-04-19"},
        ]

    monkeypatch.setattr(ingest, "fetch_recent_games", fake_fetch_recent_games)
    monkeypatch.setattr(ingest, "fetch_season_segment_games", fake_fetch_season_segment_games)
    return calls


class TestCollectRecentGameDates:
    def test_an_unwindowed_pull_keeps_the_per_team_behaviour(self, api_calls):
        games = ingest.collect_recent_game_dates(TEAM_ID_BY_NBA_ID, "2025-26")

        assert sorted(api_calls["per_team"]) == sorted(TEAM_ID_BY_NBA_ID)
        assert api_calls["leaguewide"] == []
        assert len(games) == len(TEAM_ID_BY_NBA_ID)

    def test_a_windowed_pull_makes_one_leaguewide_call_instead_of_one_per_team(self, api_calls):
        window = GameWindow(from_date="2026-04-14", to_date="2026-04-18")

        ingest.collect_recent_game_dates(TEAM_ID_BY_NBA_ID, "2024-25", window)

        assert api_calls["leaguewide"] == [("2024-25", NBA_SEASON_TYPE_REGULAR)]
        assert api_calls["per_team"] == []

    def test_a_windowed_pull_keeps_only_games_inside_the_window_as_iso_dates(self, api_calls):
        window = GameWindow(from_date="2026-04-14", to_date="2026-04-18")

        games = ingest.collect_recent_game_dates(TEAM_ID_BY_NBA_ID, "2025-26", window)

        # 04-13 and 04-19 fall outside; the display-format date is normalised.
        assert games == {"0022500002": "2026-04-14", "0022500003": "2026-04-16"}


class FakeCursor:
    """Records the one query select_players_missing_bios runs and answers
    it with the nbaPlayerIds given as still missing a bio.

    Rows are dicts because db.get_connection uses RealDictCursor. An earlier
    version of this fake returned tuples, which let a row[0] lookup pass here
    and fail with KeyError against the real database.
    """

    def __init__(self, missing_nba_ids):
        self.missing_nba_ids = missing_nba_ids
        self.executed = []

    def execute(self, sql, params):
        self.executed.append((sql, params))

    def fetchall(self):
        requested = set(self.executed[-1][1][0])
        return [{"nbaPlayerId": nba_id} for nba_id in self.missing_nba_ids if nba_id in requested]


class TestSelectPlayersMissingBios:
    def test_returns_only_players_without_a_bio(self):
        cursor = FakeCursor(missing_nba_ids=[1610612738])

        selected = ingest.select_players_missing_bios(cursor, TEAM_ID_BY_NBA_ID)

        assert selected == {1610612738: "bos"}

    def test_asks_only_about_the_players_it_was_given(self):
        cursor = FakeCursor(missing_nba_ids=[])

        ingest.select_players_missing_bios(cursor, TEAM_ID_BY_NBA_ID)

        sql, params = cursor.executed[0]
        assert '"birthDate" IS NULL' in sql
        assert sorted(params[0]) == sorted(TEAM_ID_BY_NBA_ID)

    def test_skips_the_query_when_there_are_no_players(self):
        cursor = FakeCursor(missing_nba_ids=[])

        assert ingest.select_players_missing_bios(cursor, {}) == {}
        assert cursor.executed == []
