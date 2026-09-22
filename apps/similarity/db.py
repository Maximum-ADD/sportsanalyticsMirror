"""Shared Postgres connection for the similarity scripts.

Same role as apps/predictor/db.py and apps/optimizer/db.py: this service
reads the tables NestJS owns (Player, PlayerGameStat, Game) and writes only
into its own tables (PlayerArchetype, PlayerSimilarity), which NestJS then
reads and never writes. It is not a second writer into anything the API or
the ingestion pipeline maintains.

This service keeps its OWN .env rather than sharing the API's or the
ingestion pipeline's. Fitting the model wants a fully ingested season,
which during development means pointing at production and reading from it,
while the ingestion pipeline stays pointed at a local database. One shared
.env cannot express that, and repointing a shared one to fit a model would
silently move where the ingestion pipeline WRITES — a much worse outcome
than a failed query.
"""

import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()


# Query parameters Prisma understands and libpq does not. psycopg2 hands
# the DSN straight to libpq, which rejects the WHOLE connection string on
# an unrecognised URI parameter — "invalid URI query parameter" — rather
# than ignoring it. Both of these appear in this project's own .env files:
# `schema` on the local Prisma URL, `pgbouncer` on a transaction-mode
# pooler URL. Stripping them means a URL can be copied from apps/api/.env
# verbatim and still work here.
PRISMA_ONLY_QUERY_PARAMS = frozenset({"pgbouncer", "schema"})


def _strip_prisma_only_params(url: str) -> str:
    """Drops the query parameters that belong to Prisma rather than libpq.

    apps/ingestion/db.py has the same helper for `pgbouncer` alone; this
    one also drops `schema`, because the local DATABASE_URL in
    apps/api/.env carries `?schema=public` and copying that line is the
    likeliest way to end up with a DSN psycopg2 refuses.

    Args:
        url: a Postgres connection URL, possibly carrying Prisma options.

    Returns:
        The same URL with any Prisma-only query parameters removed and all
        other parameters (sslmode and friends) left untouched.
    """
    parts = urlsplit(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query)
        if key not in PRISMA_ONLY_QUERY_PARAMS
    ]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def get_connection(read_only: bool = False):
    """Opens a connection to the database named by DATABASE_URL.

    Args:
        read_only: when True, the session is put into read-only mode so the
            server itself rejects any write. Scripts that only fit and
            inspect a model pass True, which makes pointing this service at
            the production database for a look at real data a safe thing to
            do rather than a thing to be careful about.

    Returns:
        A psycopg2 connection yielding dict-like rows.
    """
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy apps/similarity/.env.example to "
            "apps/similarity/.env and point it at your Postgres instance."
        )
    connection = psycopg2.connect(
        _strip_prisma_only_params(database_url), cursor_factory=psycopg2.extras.RealDictCursor
    )
    if read_only:
        connection.set_session(readonly=True)
    return connection


def describe_connection_target() -> str:
    """Returns the host and database name DATABASE_URL points at, with any
    credentials removed.

    Every script here prints this before doing anything. Knowing whether a
    run is about to read production or a near-empty local database is the
    difference between a meaningful fit and a confusing one, and the
    project has already been bitten by .env files that quietly changed
    which host a script talked to.
    """
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        return "(DATABASE_URL not set)"
    parts = urlsplit(database_url)
    database_name = parts.path.lstrip("/") or "(no database in URL)"
    return f"{parts.hostname}:{parts.port or 5432}/{database_name}"
