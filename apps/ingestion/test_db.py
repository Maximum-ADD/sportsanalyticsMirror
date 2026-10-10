"""get_connection must tolerate the pooled DATABASE_URL form.

The admin pull endpoint spawns these scripts from the NestJS API, whose
environment exports the Prisma pooler URL containing pgbouncer=true — an
option psycopg2/libpq reject with "invalid dsn". The flag is stripped
before connecting, and the scripts' own .env wins over any inherited env.
"""

from db import _strip_pgbouncer


def test_strip_pgbouncer_removes_the_flag_and_keeps_other_params():
    url = "postgresql://u:p@host:6543/postgres?pgbouncer=true&schema=public"
    assert _strip_pgbouncer(url) == "postgresql://u:p@host:6543/postgres?schema=public"


def test_strip_pgbouncer_handles_bare_flag():
    url = "postgresql://u:p@host:6543/postgres?pgbouncer=true"
    assert _strip_pgbouncer(url) == "postgresql://u:p@host:6543/postgres"


def test_strip_pgbouncer_leaves_plain_urls_untouched():
    url = "postgresql://u:p@host:5432/postgres"
    assert _strip_pgbouncer(url) == url
