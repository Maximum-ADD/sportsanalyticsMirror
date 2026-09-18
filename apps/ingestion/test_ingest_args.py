"""Tests for ingest.py's command line.

The API's admin "Pull Data" button shells out to this script, so the flags
below are a contract between the two — a rename here silently breaks the
button rather than failing a build. --review in particular decides whether
a pull lands as PENDING_REVIEW for approval or straight into COMPLETED.
"""

import pytest

from ingest import SEASON, parse_args


class TestParseArgs:
    def test_defaults_to_a_completed_full_pull_of_the_current_season(self):
        args = parse_args([])

        assert args.review is False
        assert args.season == SEASON
        assert args.from_date is None
        assert args.to_date is None

    def test_review_flag_is_recognised(self):
        # The API passes exactly this flag; see AdminIngestionService.
        assert parse_args(["--review"]).review is True

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
