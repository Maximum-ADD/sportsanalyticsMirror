"""Shared Postgres connection for the ingestion scripts.

Talks to the same database Prisma/NestJS manages — a second writer into
Team/Player/Game/GameEvent/PlayerGameStat, exactly the role this project's
README always described for a real nba_api ingestion pipeline (as opposed
to apps/optimizer and apps/predictor, which write into their own
prediction-only tables and never touch these).
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
            "DATABASE_URL is not set. Copy apps/ingestion/.env.example to "
            "apps/ingestion/.env and point it at your Postgres instance."
        )
    return psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)
