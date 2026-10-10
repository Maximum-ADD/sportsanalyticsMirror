"""Tests for ingest.py's command line.

The API's admin "Pull Data" button shells out to this script, so the flags
below are a contract between the two — a rename here silently breaks the
button rather than failing a build. --review in particular decides whether
a pull lands as PENDING_REVIEW for approval or straight into COMPLETED.
--skip-play-storage, which pull_worker.py always passes, has to reach both
phases' ingest_games_and_stats, or one of them saves its plays anyway.
"""

from unittest.mock import MagicMock

import pytest

import ingest
from ingest import SEASON, parse_args


class TestParseArgs:
    def test_defaults_to_a_completed_full_pull_of_the_current_season(self):
        args = parse_args([])

        assert args.review is False
        assert args.skip_play_storage is False
        assert args.season == SEASON
        assert args.from_date is None
        assert args.to_date is None

    def test_review_flag_is_recognised(self):
        # The API passes exactly this flag; see AdminIngestionService.
        assert parse_args(["--review"]).review is True

    def test_skip_play_storage_flag_is_recognised(self):
        # pull_worker.py passes exactly this flag; see build_ingest_command.
        assert parse_args(["--skip-play-storage"]).skip_play_storage is True

    def test_season_can_be_overridden(self):
        assert parse_args(["--season", "2023-24"]).season == "2023-24"

    def test_reads_a_date_window(self):
        args = parse_args(["--from-date", "2026-04-14", "--to-date", "2026-04-18"])

        assert args.from_date == "2026-04-14"
        assert args.to_date == "2026-04-18"

    def test_accepts_every_option_together(self):
        args = parse_args(
            ["--review", "--season", "2024-25", "--from-date", "2025-01-01", "--to-date", "2025-01-31"]
        )

        assert args.review is True
        assert args.season == "2024-25"
        assert args.from_date == "2025-01-01"
        assert args.to_date == "2025-01-31"

    def test_rejects_an_unknown_flag(self):
        with pytest.raises(SystemExit):
            parse_args(["--not-a-flag"])


@pytest.fixture
def recorded_phases(monkeypatch):
    """Runs main with every NBA call and write faked, recording the
    store_events each ingest_games_and_stats phase received, in order."""
    store_events_by_phase: list[bool] = []

    def fake_ingest_games_and_stats(*args, **kwargs):
        store_events_by_phase.append(kwargs["store_events"])

    monkeypatch.setattr(ingest, "get_connection", MagicMock)
    monkeypatch.setattr(ingest, "ingest_teams", lambda cursor: {})
    monkeypatch.setattr(ingest, "resolve_player_ids", lambda *args: {})
    monkeypatch.setattr(ingest, "collect_recent_game_dates", lambda *args: {})
    monkeypatch.setattr(ingest, "fetch_season_player_game_logs", lambda *args: {})
    monkeypatch.setattr(ingest, "collect_postseason_game_dates", lambda *args: {})
    monkeypatch.setattr(ingest, "collect_postseason_player_figures", lambda *args: {})
    monkeypatch.setattr(ingest, "ingest_games_and_stats", fake_ingest_games_and_stats)
    return store_events_by_phase


class TestMain:
    def test_saves_the_plays_in_both_phases_by_default(self, recorded_phases):
        ingest.main([])

        assert recorded_phases == [True, True]

    def test_skip_play_storage_reaches_both_phases(self, recorded_phases):
        ingest.main(["--review", "--skip-play-storage"])

        assert recorded_phases == [False, False]
