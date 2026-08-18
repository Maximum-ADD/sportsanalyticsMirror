"""Shared Postgres connection for the optimizer scripts.

Talks to the same database Prisma/NestJS manages, exactly like the planned
nba_api ingestion service will — this is a second writer into a few
optimizer-specific tables (PlayerPrediction, Lineup, LineupSlot), never
touching anything NestJS itself writes to.
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
            "DATABASE_URL is not set. Copy apps/optimizer/.env.example to "
            "apps/optimizer/.env and point it at your Postgres instance."
        )
    return psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
