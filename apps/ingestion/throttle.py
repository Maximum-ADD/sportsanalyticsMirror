"""Rate-limits and retries calls against stats.nba.com (via nba_api).

stats.nba.com has no official documented rate limit — the nba_api
maintainers explicitly decline to publish one (it's "the NBA's rate limit,
not the client's to set"). RATE_LIMIT_DELAY_SECONDS follows the most
concrete community-derived number available (a contributor reverse-
engineered ~600ms as workable; this project rounds up to 1s to stay
comfortably inside that with margin, since the project's own call volume
doesn't need to be fast — see ingest.py's module docstring for the full
call budget). Source: nba_api GitHub issues #69, #176, #650.
"""

import time
from typing import Callable, TypeVar

T = TypeVar("T")

RATE_LIMIT_DELAY_SECONDS = 1.0

# stats.nba.com occasionally times out or drops a connection even at a
# conservative call rate — not from being throttled, just an unreliable
# undocumented endpoint. A couple of retries with a short backoff handles
# that without masking a real, persistent failure (e.g. a genuinely wrong
# team/player id, or the well-documented cloud-IP block — see the
# ingestion README — which retries won't fix and will keep failing).
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 3.0


def call_with_rate_limit(api_call: Callable[[], T]) -> T:
    """Sleeps RATE_LIMIT_DELAY_SECONDS, then runs api_call with retries on failure."""
    time.sleep(RATE_LIMIT_DELAY_SECONDS)

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            return api_call()
        except Exception as error:  # noqa: BLE001 — nba_api raises plain requests exceptions, no specific type to narrow to
            last_error = error
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_BACKOFF_SECONDS)

    raise RuntimeError(
        f"stats.nba.com call failed after {MAX_RETRIES} attempts: {last_error}. "
        "If every call is failing immediately, see apps/ingestion/README.md — "
        "this most likely means you're running from a cloud host/CI environment "
        "that the NBA blocks; run this from your own machine's network instead."
    ) from last_error
