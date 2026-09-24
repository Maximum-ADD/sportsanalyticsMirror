import os
import uuid
from unittest.mock import ANY, MagicMock, patch

import pytest

from play_by_play import (
    SOURCE,
    build_game_event_row,
    order_actions_by_sequence,
    run_ingestion_batch,
    upsert_game_events,
)


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


def make_action(action_number, action_type="2pt", person_id=None):
    """One translated, valid action as run_ingestion_batch sees it."""
    return {
        "gameId": "0022500001",
        "actionNumber": action_number,
        "period": 1,
        "clock": "PT11M00.00S",
        "actionType": action_type,
        "subType": "jump shot",
        "description": f"play {action_number}",
        "personId": person_id,
        "teamId": 1610612747,
        "shotResult": "Made",
        "shotValue": 2,
    }


class TestRunIngestionBatchWrites:
    """A game's plays go to the database as one statement, not one per play."""

    def run_batch(self, actions, resume_after_sequence=None):
        cursor = FakeCursor()
        with (
            patch("play_by_play.fetch_game_actions", return_value=actions),
            patch("play_by_play.translate_game_actions", side_effect=lambda rows: rows),
            patch("play_by_play.upsert_ingestion_batch", return_value=("batch-1", resume_after_sequence)),
            patch("play_by_play.upsert_game_events") as upsert_game_events,
            patch("play_by_play.save_resume_checkpoint") as save_resume_checkpoint,
            patch("play_by_play.complete_ingestion_batch"),
        ):
            summary = run_ingestion_batch(cursor, "game-1", "0022500001", {1610612747: "lal"}, {})
        return summary, upsert_game_events, save_resume_checkpoint

    def test_writes_every_accepted_play_in_one_call(self):
        summary, upsert_game_events, _ = self.run_batch([make_action(1), make_action(2), make_action(3)])

        upsert_game_events.assert_called_once()
        rows = upsert_game_events.call_args.args[1]
        assert [row["sequence"] for row in rows] == [1, 2, 3]
        assert {row["team_id"] for row in rows} == {"lal"}
        assert summary["accepted"] == 3

    def test_leaves_rejected_plays_out_of_the_write(self):
        unknown_player_action = make_action(2, person_id=999)

        summary, upsert_game_events, _ = self.run_batch([make_action(1), unknown_player_action, make_action(3)])

        assert [row["sequence"] for row in upsert_game_events.call_args.args[1]] == [1, 3]
        assert summary["rejection_counts"] == {"UNKNOWN_PLAYER": 1}

    def test_saves_one_checkpoint_at_the_last_accepted_play(self):
        _, _, save_resume_checkpoint = self.run_batch([make_action(1), make_action(2), make_action(5)])

        save_resume_checkpoint.assert_called_once_with(ANY, "batch-1", 5)

    def test_saves_no_checkpoint_when_nothing_was_accepted(self):
        _, upsert_game_events, save_resume_checkpoint = self.run_batch([make_action(1)], resume_after_sequence=1)

        assert upsert_game_events.call_args.args[1] == []
        save_resume_checkpoint.assert_not_called()


class TestBuildGameEventRow:
    def test_marks_a_made_shot_as_a_success(self):
        row = build_game_event_row("game-1", "batch-1", make_action(7), "lal", "lebron")

        assert row == {
            "game_id": "game-1",
            "sequence": 7,
            "period": 1,
            "clock": "PT11M00.00S",
            "event_type": "2pt",
            "sub_type": "jump shot",
            "player_id": "lebron",
            "team_id": "lal",
            "success": True,
            "value": 2,
            "description": "play 7",
            "batch_id": "batch-1",
        }

    def test_leaves_success_empty_for_plays_that_are_not_shots(self):
        row = build_game_event_row("game-1", "batch-1", make_action(7, action_type="rebound"), None, None)

        assert row["success"] is None


TEST_DATABASE_URL = os.environ.get("INGESTION_TEST_DATABASE_URL")
requires_database = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="set INGESTION_TEST_DATABASE_URL to a disposable, migrated Postgres"
)


@pytest.fixture
def rolled_back_cursor():
    """A cursor on the test database inside a transaction that is always
    rolled back, holding one game and batch to attach events to.

    Connects straight to INGESTION_TEST_DATABASE_URL, never through
    db.get_connection, which reads .env and could point at production.
    """
    import psycopg2
    import psycopg2.extras

    connection = psycopg2.connect(TEST_DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        with connection.cursor() as cursor:
            team_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
            for offset, team_id in enumerate(team_ids):
                cursor.execute(
                    'INSERT INTO "Team" ("id", "nbaTeamId", "name", "abbreviation", "city", "conference", "division") '
                    "VALUES (%s, %s, 'Test', 'TST', 'Test', 'East', 'Atlantic')",
                    (team_id, -1000 - offset),
                )
            cursor.execute(
                'INSERT INTO "Game" ("id", "nbaGameId", "gameDate", "season", "homeTeamId", "awayTeamId") '
                "VALUES ('test-game', 'test-game', now(), '2025-26', %s, %s)",
                team_ids,
            )
            cursor.execute(
                'INSERT INTO "IngestionBatch" ("id", "gameId", "source") VALUES (\'test-batch\', \'test-game\', %s)',
                (SOURCE,),
            )
            yield cursor
    finally:
        connection.rollback()
        connection.close()


def read_events(cursor):
    cursor.execute('SELECT "sequence", "eventType", "description" FROM "GameEvent" WHERE "gameId" = \'test-game\' ORDER BY "sequence"')
    return [(row["sequence"], row["eventType"], row["description"]) for row in cursor.fetchall()]


@requires_database
class TestUpsertGameEventsAgainstPostgres:
    def test_writes_every_row(self, rolled_back_cursor):
        rows = [build_game_event_row("test-game", "test-batch", make_action(number), None, None) for number in (1, 2, 3)]

        upsert_game_events(rolled_back_cursor, rows)

        assert read_events(rolled_back_cursor) == [(1, "2pt", "play 1"), (2, "2pt", "play 2"), (3, "2pt", "play 3")]

    def test_rerunning_a_game_updates_its_rows_in_place(self, rolled_back_cursor):
        first_pass = [build_game_event_row("test-game", "test-batch", make_action(number, "period"), None, None) for number in (1, 2)]
        second_pass = [build_game_event_row("test-game", "test-batch", make_action(number), None, None) for number in (1, 2, 3)]

        upsert_game_events(rolled_back_cursor, first_pass)
        upsert_game_events(rolled_back_cursor, second_pass)

        assert read_events(rolled_back_cursor) == [(1, "2pt", "play 1"), (2, "2pt", "play 2"), (3, "2pt", "play 3")]
