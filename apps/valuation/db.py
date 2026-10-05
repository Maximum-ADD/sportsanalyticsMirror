"""Shared Postgres connection for the valuation scripts.

Talks to the same database Prisma/NestJS manages, exactly like apps/predictor
and apps/optimizer do. This service is a writer into one valuation-specific
table (ProspectValuation) and a reader of everything else — it never writes to
anything NestJS itself writes to.
"""

import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# An EXPLICIT path, never a bare load_dotenv(). With no argument python-dotenv
# walks UP the directory tree until it finds any .env — and the repository's
# root .env points DATABASE_URL at the production database. A developer who
# ran this script before creating apps/valuation/.env would silently write
# valuations into production. Reading only this directory's own .env means a
# missing file fails loudly (see get_connection) instead.
#
# Not override=True either: a DATABASE_URL already set in the environment —
# how CI and a deliberate one-off run point this at a specific database —
# wins over the file.
load_dotenv(Path(__file__).with_name(".env"))


def get_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy apps/valuation/.env.example to "
            "apps/valuation/.env and point it at your Postgres instance."
        )
    return psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
