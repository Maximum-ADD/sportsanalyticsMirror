"""Tests for copy_season_to_scratch.py.

Only the safety guard is tested here, and deliberately so: the copying
itself is two SQL statements against two live databases, which a unit test
can only restate rather than verify. The guard is different — it is the one
thing standing between "test a real fit safely" and "write a test fit into
production", and it has to hold for a URL nobody inspected.
"""

import pytest

from copy_season_to_scratch import assert_target_is_local


class TestRefusingNonLocalTargets:
    @pytest.mark.parametrize(
        "target_url",
        [
            "postgresql://postgres:postgres@localhost:55432/archetype_fit_test",
            "postgresql://postgres:postgres@127.0.0.1:55432/archetype_fit_test",
        ],
    )
    def test_allows_a_local_scratch_database(self, target_url):
        assert_target_is_local(target_url)

    @pytest.mark.parametrize(
        "target_url",
        [
            # The production pooler this project actually uses.
            "postgresql://user:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
            "postgresql://user:pw@db.example.com:5432/nba",
            # A hostname that merely starts with the allowed one.
            "postgresql://user:pw@localhost.evil.example.com:5432/nba",
        ],
    )
    def test_refuses_anything_that_is_not_local(self, target_url):
        with pytest.raises(RuntimeError, match="only writes to a local"):
            assert_target_is_local(target_url)

    def test_refuses_a_url_with_no_host_at_all(self):
        # A malformed URL must not fall through to "allowed" — the default
        # on an unreadable target has to be refusal.
        with pytest.raises(RuntimeError):
            assert_target_is_local("not-a-url")
