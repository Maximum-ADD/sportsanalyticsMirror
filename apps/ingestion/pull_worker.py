"""Runs the pulls the deployed API queued but cannot run itself.

stats.nba.com blocks cloud-provider IP ranges, so the deployed API never
runs ingest.py. Instead, the admin "Pull Data" button (and the admin pull
schedule) record an IngestionRequest row. This worker, left running on a
machine that CAN reach stats.nba.com — a home network, not a cloud host —
claims each request, runs ingest.py with its options, and records how it
went. The admin Batches tab shows the queue and when a worker last checked
in.

Setup: point this folder's .env DATABASE_URL at the SAME database the
deployed API uses, then either leave it running:

    python pull_worker.py

or run a single pass from a scheduler (Windows Task Scheduler, cron):

    python pull_worker.py --once

ingest.py runs as a separate process with the worker's own Python and
environment, so it uses exactly the command-line contract covered by
test_ingest_args.py, and a crash inside a pull can't take the worker down.
"""

import argparse
import os
import socket
import subprocess
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

# Importing db loads this folder's .env with override=True, so DATABASE_URL
# below is always the .env value — one exported in the shell is ignored.
from db import get_connection

INGEST_SCRIPT = Path(__file__).with_name("ingest.py")

# How long to wait between checks when the queue is empty.
POLL_INTERVAL_SECONDS = 60
# How often to check in while a pull runs. A pull takes 35-45 minutes;
# without this the admin page would report the worker offline mid-run.
HEARTBEAT_INTERVAL_SECONDS = 60
# How much of ingest.py's output to keep with the request. Its failures are
# at the end, so the tail is the useful part.
OUTPUT_TAIL_LINES = 15
MESSAGE_MAX_CHARACTERS = 2000

# Maps IngestionRequest columns to ingest.py flags.
OPTION_FLAGS = (("season", "--season"), ("fromDate", "--from-date"), ("toDate", "--to-date"))


def describe_database_target(database_url: str | None) -> str:
    """host:port/database of a connection URL, without its credentials.

    Printed when the worker starts. The target comes from this folder's
    .env (db.py loads it with override=True, deliberately — see its
    comment), so exporting DATABASE_URL in the shell does NOT redirect the
    worker. A worker pointed at the wrong database runs the wrong queue, so
    it says out loud which one it is using.
    """
    if not database_url:
        return "no DATABASE_URL set"
    parts = urlsplit(database_url)
    return f"{parts.hostname}:{parts.port or 5432}{parts.path}"


def utc_now() -> datetime:
    """Current time for Prisma's timezone-less TIMESTAMP(3) columns, which
    hold UTC — the same convention as play_by_play.py and backfill_batches.py."""
    return datetime.now(timezone.utc)


def build_ingest_command(request: dict, python_executable: str = sys.executable) -> list[str]:
    """ingest.py's command line for a request.

    Always --review, so the batches land as PENDING_REVIEW for an admin to
    approve — the same as a pull started from the admin page directly.
    Options left null on the request are omitted, so ingest.py applies its
    own defaults.
    """
    command = [python_executable, str(INGEST_SCRIPT), "--review"]
    for column, flag in OPTION_FLAGS:
        if request.get(column):
            command += [flag, request[column]]
    return command


def summarise_output(tail_lines: list[str], exit_code: int) -> str:
    """The message stored with a finished request: how it ended, then the
    last lines ingest.py printed. Trimmed from the front, so a long
    traceback keeps its final (most useful) lines."""
    outcome = "Completed." if exit_code == 0 else f"ingest.py exited with code {exit_code}."
    body = "\n".join(line.rstrip() for line in tail_lines).strip()
    message = f"{outcome}\n{body}" if body else outcome
    return message[-MESSAGE_MAX_CHARACTERS:]


def record_heartbeat(cursor, worker_name: str) -> None:
    """Marks this worker as seen now, creating its row on first check-in."""
    cursor.execute(
        'INSERT INTO "IngestionWorker" ("name", "lastSeenAt") VALUES (%s, %s) '
        'ON CONFLICT ("name") DO UPDATE SET "lastSeenAt" = EXCLUDED."lastSeenAt"',
        (worker_name, utc_now()),
    )


def fail_orphaned_requests(cursor, worker_name: str) -> int:
    """Fails any request this worker claimed but never finished — it was
    stopped or crashed mid-pull. Run on startup, so a dead run doesn't sit
    in RUNNING. Returns how many were failed."""
    cursor.execute(
        'UPDATE "IngestionRequest" SET "status" = %s, "finishedAt" = %s, "message" = %s '
        'WHERE "status" = %s AND "claimedBy" = %s',
        ("FAILED", utc_now(), "The pull worker stopped while running this pull, so it did not finish.", "RUNNING", worker_name),
    )
    return cursor.rowcount


def claim_next_request(cursor, worker_name: str) -> dict | None:
    """Claims the oldest queued request, or returns None if there is none.

    One statement: the inner SELECT locks the row it picks and SKIP LOCKED
    makes a second worker skip it rather than wait, so two workers can
    never claim the same request.
    """
    cursor.execute(
        'UPDATE "IngestionRequest" SET "status" = %s, "claimedBy" = %s, "claimedAt" = %s '
        'WHERE "id" = ('
        '  SELECT "id" FROM "IngestionRequest" WHERE "status" = %s '
        '  ORDER BY "requestedAt" LIMIT 1 FOR UPDATE SKIP LOCKED'
        ') RETURNING "id", "season", "fromDate", "toDate"',
        ("RUNNING", worker_name, utc_now(), "QUEUED"),
    )
    return cursor.fetchone()


def finish_request(cursor, request_id: str, succeeded: bool, message: str) -> None:
    """Records how a request ended. A success also counts as the schedule's
    last run, so a scheduled pull isn't re-queued until it's due again."""
    finished_at = utc_now()
    cursor.execute(
        'UPDATE "IngestionRequest" SET "status" = %s, "finishedAt" = %s, "message" = %s WHERE "id" = %s',
        ("SUCCEEDED" if succeeded else "FAILED", finished_at, message, request_id),
    )
    if succeeded:
        cursor.execute('UPDATE "IngestionSchedule" SET "lastRunAt" = %s WHERE "id" = %s', (finished_at, "singleton"))


def run_ingest(command: list[str], on_heartbeat, heartbeat_interval_seconds: float = HEARTBEAT_INTERVAL_SECONDS) -> tuple[int, list[str]]:
    """Runs ingest.py to completion, echoing its output live, and returns
    (exit code, last OUTPUT_TAIL_LINES lines).

    Output is read on a separate thread so the main thread is free to call
    on_heartbeat every heartbeat_interval_seconds while the pull runs.
    """
    process = subprocess.Popen(
        command,
        cwd=INGEST_SCRIPT.parent,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    tail = deque(maxlen=OUTPUT_TAIL_LINES)

    def relay_output() -> None:
        for line in process.stdout:
            print(line, end="", flush=True)
            tail.append(line)

    reader = threading.Thread(target=relay_output, daemon=True)
    reader.start()
    while True:
        try:
            exit_code = process.wait(timeout=heartbeat_interval_seconds)
            break
        except subprocess.TimeoutExpired:
            on_heartbeat()
    reader.join(timeout=5)
    return exit_code, list(tail)


def process_next_request(connection, worker_name: str, python_executable: str = sys.executable) -> bool:
    """Checks in, then claims and runs one queued request. Returns whether
    there was one to run."""
    with connection.cursor() as cursor:
        record_heartbeat(cursor, worker_name)
        request = claim_next_request(cursor, worker_name)
    if request is None:
        return False

    command = build_ingest_command(request, python_executable)
    print(f"Claimed pull {request['id']}: {' '.join(command[2:])}", flush=True)

    def heartbeat() -> None:
        with connection.cursor() as cursor:
            record_heartbeat(cursor, worker_name)

    try:
        exit_code, tail = run_ingest(command, heartbeat)
    except OSError as error:
        exit_code, tail = -1, [f"Could not start ingest.py: {error}"]

    with connection.cursor() as cursor:
        finish_request(cursor, request["id"], exit_code == 0, summarise_output(tail, exit_code))
    print(f"Pull {request['id']} {'succeeded' if exit_code == 0 else 'failed'}.", flush=True)
    return True


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run pulls queued by the deployed API.")
    parser.add_argument("--once", action="store_true", help="Run whatever is queued, then exit (for schedulers).")
    parser.add_argument("--name", default=socket.gethostname(), help="How this worker appears on the admin page (default: hostname).")
    parser.add_argument("--interval", type=float, default=POLL_INTERVAL_SECONDS, help="Seconds between checks when idle.")
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    print(f"Using database {describe_database_target(os.environ.get('DATABASE_URL'))} (from apps/ingestion/.env).", flush=True)
    connection = get_connection()
    # Every statement commits on its own: a claim must be visible to other
    # workers immediately, and a heartbeat must land while a pull runs.
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            orphaned = fail_orphaned_requests(cursor, args.name)
        if orphaned:
            print(f"Marked {orphaned} unfinished pull(s) from a previous run as failed.")

        print(f"Pull worker '{args.name}' checking for queued pulls{' once' if args.once else ''}.", flush=True)
        while True:
            ran = process_next_request(connection, args.name)
            if ran:
                continue
            if args.once:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("Stopping.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
