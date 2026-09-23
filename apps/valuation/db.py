"""Shared Postgres connection for the valuation scripts.

Talks to the same database Prisma/NestJS manages, exactly like apps/predictor
and apps/optimizer do. This service is a writer into one valuation-specific
table (ProspectValuation) and a reader of everything else — it never writes to
anything NestJS itself writes to.
"""

import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy apps/valuation/.env.example to "
            "apps/valuation/.env and point it at your Postgres instance."
        )
    return psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
