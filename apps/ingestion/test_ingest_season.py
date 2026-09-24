"""Tests that --season reaches every phase of a pull, not just game selection.

A pull for a past season used to fetch this season's rosters and label its
games with this season, because ingest_rosters and ingest_games_and_stats
read the module's SEASON constant instead of the season asked for. The NBA
API and database writes are replaced with recording fakes.
"""

from types import SimpleNamespace

import pytest

import ingest

PAST_SEASON = "2023-24"
TEAM_ID_BY_NBA_ID = {1610612747: "lal", 1610612738: "bos"}
# ingest_games_and_stats commits after each game, so it needs a cursor with a connection.
STUB_CURSOR = SimpleNamespace(connection=SimpleNamespace(commit=lambda: None))
EMPTY_BATCH_SUMMARY = {"batch_id": "batch", "accepted": 0, "rejected": 0, "rejection_counts": {}, "accepted_events": []}


@pytest.fixture
def roster_seasons(monkeypatch):
    """Records the season each roster fetch asked for."""
    seasons: list[str] = []

    def fake_fetch_team_roster(nba_team_id, season):
        seasons.append(season)
        return []

    monkeypatch.setattr(ingest, "fetch_team_roster", fake_fetch_team_roster)
    monkeypatch.setattr(ingest, "upsert_players", lambda cursor, players, team_internal_id: {})
    return seasons


@pytest.fixture
def upserted_game_seasons(monkeypatch):
    """Records the season each game is written with; the game has no players."""
    seasons: list[str] = []

    def fake_upsert_game(cursor, nba_game_id, game_date, season, *rest):
        seasons.append(season)
        return "game"

    boxscore = {"home_team_nba_id": 1610612747, "away_team_nba_id": 1610612738, "home_score": 100, "away_score": 90, "players": []}
    monkeypatch.setattr(ingest, "fetch_game_boxscore", lambda nba_game_id: boxscore)
    monkeypatch.setattr(ingest, "upsert_game", fake_upsert_game)
    monkeypatch.setattr(ingest, "run_ingestion_batch", lambda *args, **kwargs: EMPTY_BATCH_SUMMARY)
    monkeypatch.setattr(ingest, "select_first_names_by_nba_id", lambda cursor, nba_ids: {})
    return seasons


class TestIngestRosters:
    def test_fetches_every_teams_roster_for_the_season_asked_for(self, roster_seasons):
        ingest.ingest_rosters(None, TEAM_ID_BY_NBA_ID, PAST_SEASON)

        assert roster_seasons == [PAST_SEASON] * len(TEAM_ID_BY_NBA_ID)

    def test_defaults_to_the_current_season(self, roster_seasons):
        ingest.ingest_rosters(None, TEAM_ID_BY_NBA_ID)

        assert roster_seasons == [ingest.SEASON] * len(TEAM_ID_BY_NBA_ID)


class TestIngestGamesAndStats:
    def test_labels_each_game_with_the_season_asked_for(self, upserted_game_seasons):
        ingest.ingest_games_and_stats(STUB_CURSOR, {"0022300001": "2024-01-10"}, TEAM_ID_BY_NBA_ID, {}, season=PAST_SEASON)

        assert upserted_game_seasons == [PAST_SEASON]

    def test_defaults_to_the_current_season(self, upserted_game_seasons):
        ingest.ingest_games_and_stats(STUB_CURSOR, {"0022500001": "2026-01-10"}, TEAM_ID_BY_NBA_ID, {})

        assert upserted_game_seasons == [ingest.SEASON]
