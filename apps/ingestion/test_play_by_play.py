from unittest.mock import MagicMock, patch

import pytest

from play_by_play import order_actions_by_sequence, run_ingestion_batch


def test_order_actions_by_sequence_sorts_late_actions():
    actions = [{"actionNumber": 3}, {"actionNumber": 1}, {"actionNumber": 2}]

    assert [action["actionNumber"] for action in order_actions_by_sequence(actions)] == [1, 2, 3]


class FakeCursor:
    """A minimal stand-in for a psycopg2 RealDictCursor, just enough for
    upsert_ingestion_batch/complete_ingestion_batch's own execute/fetchone
    calls. `.connection` is a MagicMock so a test can assert commit() was
    called on it without a real database."""

    def __init__(self):
        self.connection = MagicMock()
        self._next_fetchone = None

    def execute(self, query, params=None):
        if "SELECT" in query and "FAILED" in query:
            self._next_fetchone = None  # no resumable batch
        elif "INSERT INTO" in query and "IngestionBatch" in query:
            self._next_fetchone = {"id": "batch-1"}

    def fetchone(self):
        return self._next_fetchone


def test_run_ingestion_batch_commits_the_failed_marker_before_reraising():
    """A crash right after this re-raise must not roll back the FAILED
    status/resume checkpoint along with it — see the matching comment in
    play_by_play.py. Regression test for the fix: previously nothing
    committed here, so a process crash on the raise below silently
    discarded the FAILED marker, and the next run found no batch to
    resume from."""
    cursor = FakeCursor()

    with patch("play_by_play.fetch_game_actions", side_effect=RuntimeError("network blew up")):
        with pytest.raises(RuntimeError):
            run_ingestion_batch(cursor, "game-internal-1", "0022500001", {}, {})

    cursor.connection.commit.assert_called_once()
