"""Tests for pull_worker.py, which runs pulls the deployed API queued.

Three layers:
  - pure helpers (command building, output summaries): always run
  - the subprocess runner, against a real child Python process: always run
  - the queue SQL, against a real Postgres: runs only when
    INGESTION_TEST_DATABASE_URL points at a disposable database with the API
    migrations applied (e.g. the API's test database on :55433). The claim
    query's no-double-claim guarantee comes from Postgres row locking, which
    no fake cursor can demonstrate.
"""

import os
import sys
import uuid

import pytest

import pull_worker


class TestBuildIngestCommand:
    def test_always_asks_for_review(self):
        command = pull_worker.build_ingest_command({}, python_executable="py")
        assert command == ["py", str(pull_worker.INGEST_SCRIPT), "--review"]

    def test_passes_only_the_options_the_request_set(self):
        request = {"season": "2024-25", "fromDate": "2026-04-14", "toDate": None}
        command = pull_worker.build_ingest_command(request, python_executable="py")
        assert command[2:] == ["--review", "--season", "2024-25", "--from-date", "2026-04-14"]

    def test_matches_ingest_py_flags(self):
        # The same flags ingest.parse_args accepts; see test_ingest_args.py.
        import ingest

        request = {"season": "2024-25", "fromDate": "2026-04-14", "toDate": "2026-04-18"}
        args = ingest.parse_args(pull_worker.build_ingest_command(request)[2:])
        assert (args.review, args.season, args.from_date, args.to_date) == (True, "2024-25", "2026-04-14", "2026-04-18")


class TestSummariseOutput:
    def test_reports_success_with_the_last_output(self):
        assert pull_worker.summarise_output(["Ingested 12 games.\n"], 0) == "Completed.\nIngested 12 games."

    def test_reports_the_exit_code_on_failure(self):
        assert pull_worker.summarise_output([], 2) == "ingest.py exited with code 2."

    def test_keeps_the_end_of_an_overlong_message(self):
        lines = [f"line {n}\n" for n in range(500)] + ["ValueError: the real error\n"]
        message = pull_worker.summarise_output(lines, 1)
        assert len(message) <= pull_worker.MESSAGE_MAX_CHARACTERS
        assert message.endswith("ValueError: the real error")


class TestRunIngest:
    def test_returns_the_exit_code_and_output_tail(self):
        command = [sys.executable, "-c", "print('first'); print('last'); raise SystemExit(3)"]
        exit_code, tail = pull_worker.run_ingest(command, on_heartbeat=lambda: None)
        assert exit_code == 3
        assert [line.strip() for line in tail] == ["first", "last"]

    def test_checks_in_while_a_long_pull_runs(self):
        heartbeats = []
        command = [sys.executable, "-c", "import time; time.sleep(0.6)"]
        exit_code, _ = pull_worker.run_ingest(command, on_heartbeat=lambda: heartbeats.append(1), heartbeat_interval_seconds=0.1)
        assert exit_code == 0
        assert len(heartbeats) >= 2


class TestDescribeDatabaseTarget:
    def test_shows_host_port_and_database_without_credentials(self):
        target = pull_worker.describe_database_target("postgresql://postgres:s3cret@localhost:55432/nba_analytics?schema=public")
        assert target == "localhost:55432/nba_analytics"
        assert "s3cret" not in target

    def test_defaults_the_port(self):
        assert pull_worker.describe_database_target("postgresql://u:p@db.example.com/prod") == "db.example.com:5432/prod"

    def test_says_when_nothing_is_configured(self):
        assert pull_worker.describe_database_target(None) == "no DATABASE_URL set"


class TestParseArgs:
    def test_defaults_to_polling_as_this_machine(self):
        args = pull_worker.parse_args([])
        assert args.once is False
        assert args.name
        assert args.interval == pull_worker.POLL_INTERVAL_SECONDS

    def test_once_and_name(self):
        args = pull_worker.parse_args(["--once", "--name", "home-pc"])
        assert (args.once, args.name) == (True, "home-pc")


TEST_DATABASE_URL = os.environ.get("INGESTION_TEST_DATABASE_URL")
requires_database = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="set INGESTION_TEST_DATABASE_URL to a disposable, migrated Postgres"
)


@pytest.fixture
def connect():
    """Opens autocommit connections straight to the test database and removes
    every request and worker row the test created.

    Deliberately never uses db.get_connection: that reads apps/ingestion/.env
    with override=True, so it would ignore INGESTION_TEST_DATABASE_URL and
    connect wherever .env points — possibly production.
    """
    import psycopg2
    import psycopg2.extras

    connections = []

    def open_connection(autocommit=True):
        connection = psycopg2.connect(TEST_DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        connection.autocommit = autocommit
        connections.append(connection)
        return connection

    marker = f"test-{uuid.uuid4().hex[:8]}"
    yield open_connection, marker

    cleanup = open_connection()
    with cleanup.cursor() as cursor:
        cursor.execute('DELETE FROM "IngestionRequest" WHERE "season" = %s OR "claimedBy" LIKE %s', (marker, f"{marker}%"))
        cursor.execute('DELETE FROM "IngestionWorker" WHERE "name" LIKE %s', (f"{marker}%",))
    for connection in connections:
        connection.close()


def queue_request(connection, marker, status="QUEUED", claimed_by=None):
    """Inserts a request the way the API does. The marker is stored in the
    season column so cleanup can find it."""
    request_id = str(uuid.uuid4())
    with connection.cursor() as cursor:
        cursor.execute(
            'INSERT INTO "IngestionRequest" ("id", "status", "season", "claimedBy", "requestedAt") VALUES (%s, %s, %s, %s, %s)',
            (request_id, status, marker, claimed_by, pull_worker.utc_now()),
        )
    return request_id


def status_of(connection, request_id):
    with connection.cursor() as cursor:
        cursor.execute('SELECT "status", "claimedBy", "message" FROM "IngestionRequest" WHERE "id" = %s', (request_id,))
        return cursor.fetchone()


@requires_database
class TestQueueAgainstPostgres:
    def test_claims_the_oldest_queued_request_once(self, connect):
        open_connection, marker = connect
        connection = open_connection()
        request_id = queue_request(connection, marker)

        with connection.cursor() as cursor:
            first = pull_worker.claim_next_request(cursor, f"{marker}-a")
            second = pull_worker.claim_next_request(cursor, f"{marker}-b")

        assert first["id"] == request_id
        assert second is None or second["id"] != request_id
        assert status_of(connection, request_id)["status"] == "RUNNING"
        assert status_of(connection, request_id)["claimedBy"] == f"{marker}-a"

    def test_a_second_worker_skips_a_row_the_first_has_locked(self, connect):
        open_connection, marker = connect
        setup = open_connection()
        request_id = queue_request(setup, marker)

        # Worker A claims inside a transaction it hasn't committed yet, so
        # the row stays locked; worker B must skip it rather than claim it.
        worker_a = open_connection(autocommit=False)
        worker_b = open_connection()
        with worker_a.cursor() as cursor:
            claimed_by_a = pull_worker.claim_next_request(cursor, f"{marker}-a")
        with worker_b.cursor() as cursor:
            claimed_by_b = pull_worker.claim_next_request(cursor, f"{marker}-b")
        worker_a.commit()

        assert claimed_by_a["id"] == request_id
        assert claimed_by_b is None or claimed_by_b["id"] != request_id

    def test_fails_requests_left_running_by_a_previous_run(self, connect):
        open_connection, marker = connect
        connection = open_connection()
        request_id = queue_request(connection, marker, status="RUNNING", claimed_by=f"{marker}-a")

        with connection.cursor() as cursor:
            failed = pull_worker.fail_orphaned_requests(cursor, f"{marker}-a")

        assert failed == 1
        assert status_of(connection, request_id)["status"] == "FAILED"

    def test_runs_a_queued_pull_end_to_end_and_records_the_outcome(self, connect, tmp_path, monkeypatch):
        open_connection, marker = connect
        connection = open_connection()
        request_id = queue_request(connection, marker)

        # Stand-in for ingest.py: prints the arguments it was given, so the
        # test sees exactly what the worker would pass the real script.
        fake_ingest = tmp_path / "ingest.py"
        fake_ingest.write_text("import sys\nprint('args:', ' '.join(sys.argv[1:]))\n")
        monkeypatch.setattr(pull_worker, "INGEST_SCRIPT", fake_ingest)

        ran = pull_worker.process_next_request(connection, f"{marker}-worker")

        assert ran is True
        outcome = status_of(connection, request_id)
        assert outcome["status"] == "SUCCEEDED"
        assert f"args: --review --season {marker}" in outcome["message"]
        with connection.cursor() as cursor:
            cursor.execute('SELECT "lastSeenAt" FROM "IngestionWorker" WHERE "name" = %s', (f"{marker}-worker",))
            assert cursor.fetchone() is not None

    def test_records_a_failed_pull(self, connect, tmp_path, monkeypatch):
        open_connection, marker = connect
        connection = open_connection()
        request_id = queue_request(connection, marker)
        fake_ingest = tmp_path / "ingest.py"
        fake_ingest.write_text("print('stats.nba.com timed out')\nraise SystemExit(1)\n")
        monkeypatch.setattr(pull_worker, "INGEST_SCRIPT", fake_ingest)

        pull_worker.process_next_request(connection, f"{marker}-worker")

        outcome = status_of(connection, request_id)
        assert outcome["status"] == "FAILED"
        assert "exited with code 1" in outcome["message"]
        assert "stats.nba.com timed out" in outcome["message"]
