"""Shared Postgres connection for the ingestion scripts.

Talks to the same database Prisma/NestJS manages — a second writer into
Team/Player/Game/GameEvent/PlayerGameStat, exactly the role this project's
README always described for a real nba_api ingestion pipeline (as opposed
to apps/optimizer and apps/predictor, which write into their own
prediction-only tables and never touch these).
"""

import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# The scripts' own .env is the source of truth. Without override=True an
# embedding process that already exports DATABASE_URL would silently win —
# e.g. the NestJS API spawning an admin pull exports the Prisma pooler URL
# carrying pgbouncer=true, which psycopg2 rejects as an unknown option and
# the pull dies seconds after starting.
load_dotenv(override=True)


def _strip_pgbouncer(url: str) -> str:
    """Drop the pgbouncer query flag some poolers append: it is a Prisma
    client option, not a libpq one, so psycopg2 refuses the DSN otherwise."""
    parts = urlsplit(url)
    query = [(key, value) for key, value in parse_qsl(parts.query) if key != "pgbouncer"]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def get_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy apps/ingestion/.env.example to "
            "apps/ingestion/.env and point it at your Postgres instance."
        )
    return psycopg2.connect(_strip_pgbouncer(database_url), cursor_factory=psycopg2.extras.RealDictCursor)
