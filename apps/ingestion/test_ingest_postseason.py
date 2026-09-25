"""Tests for ingest_postseason.py's flags, end to end through ingest.py.

--season has to reach both the game-id lookup and every Game row written,
or an older postseason would be stored under this season's label.
--skip-play-storage has to reach run_ingestion_batch, or the plays are
saved anyway. The NBA API and database are replaced with recording fakes.
"""

from unittest.mock import MagicMock

import pytest

import ingest
import ingest_postseason

PAST_SEASON = "2023-24"
PLAYOFF_GAME_ID = "0042300101"
EMPTY_BATCH_SUMMARY = {"batch_id": "batch", "accepted": 0, "rejected": 0, "rejection_counts": {}, "accepted_events": []}


class TestParseArgs:
    def test_defaults_to_the_current_season_with_plays_saved(self):
        args = ingest_postseason.parse_args([])

        assert args.season == ingest.SEASON
        assert args.skip_play_storage is False

    def test_reads_both_flags(self):
        args = ingest_postseason.parse_args(["--season", PAST_SEASON, "--skip-play-storage"])

        assert args.season == PAST_SEASON
        assert args.skip_play_storage is True


@pytest.fixture
def recorded_pull(monkeypatch):
    """Runs main against one fake playoff game, recording what reached the writes."""
    recorded: dict = {}

    def fake_collect_postseason_game_dates(season):
        recorded["collected_season"] = season
        return {PLAYOFF_GAME_ID: "2024-04-20"}

    def fake_upsert_game(cursor, nba_game_id, game_date, season, *rest):
        recorded["game_season"] = season
        return "game"

    def fake_run_ingestion_batch(*args, **kwargs):
        recorded["store_events"] = kwargs["store_events"]
        return EMPTY_BATCH_SUMMARY

    boxscore = {"home_team_nba_id": 1610612738, "away_team_nba_id": 1610612748, "home_score": 114, "away_score": 94, "players": []}
    monkeypatch.setattr(ingest_postseason, "get_connection", MagicMock)
    monkeypatch.setattr(ingest_postseason, "read_team_ids", lambda cursor: {1610612738: "bos", 1610612748: "mia"})
    monkeypatch.setattr(ingest_postseason, "select_player_ids_by_nba_id", lambda cursor: {1628369: "tatum"})
    monkeypatch.setattr(ingest_postseason, "collect_postseason_game_dates", fake_collect_postseason_game_dates)
    monkeypatch.setattr(ingest_postseason, "collect_postseason_player_figures", lambda season: {})
    monkeypatch.setattr(ingest, "fetch_game_boxscore", lambda nba_game_id: boxscore)
    monkeypatch.setattr(ingest, "upsert_game", fake_upsert_game)
    monkeypatch.setattr(ingest, "run_ingestion_batch", fake_run_ingestion_batch)
    monkeypatch.setattr(ingest, "select_first_names_by_nba_id", lambda cursor, nba_ids: {})
    return recorded


class TestMain:
    def test_collects_and_labels_the_games_with_the_season_asked_for(self, recorded_pull):
        ingest_postseason.main(["--season", PAST_SEASON])

        assert recorded_pull["collected_season"] == PAST_SEASON
        assert recorded_pull["game_season"] == PAST_SEASON

    def test_saves_the_plays_by_default(self, recorded_pull):
        ingest_postseason.main([])

        assert recorded_pull["store_events"] is True

    def test_skip_play_storage_reaches_the_play_by_play_batch(self, recorded_pull):
        ingest_postseason.main(["--season", PAST_SEASON, "--skip-play-storage"])

        assert recorded_pull["store_events"] is False
