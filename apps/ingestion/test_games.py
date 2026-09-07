"""Tests for games.py's classify_game, the one piece of postseason ingestion
that infers something rather than reading it off an API response.

Every id below is a real 2025-26 game id pulled live from stats.nba.com
during development, not a hand-constructed example — the whole risk this
function carries is that the id layout is a convention rather than a
documented contract, so the tests are only worth anything if they pin real
ids. The Finals cases matter most: nba_api has no season_type that isolates
the Finals from earlier playoff rounds, so the round digit is the *only*
thing separating them.
"""

import pytest

from games import (
    SEASON_TYPE_FINALS,
    SEASON_TYPE_PLAY_IN,
    SEASON_TYPE_PLAYOFFS,
    SEASON_TYPE_REGULAR,
    classify_game,
)


@pytest.mark.parametrize(
    "nba_game_id,expected",
    [
        # The full 2025-26 Finals (SAS vs. NYK, 3-13 June 2026) — round
        # digit 4. These are the ids the FINALS view stands or falls on.
        ("0042500401", (SEASON_TYPE_FINALS, 4)),
        ("0042500402", (SEASON_TYPE_FINALS, 4)),
        ("0042500403", (SEASON_TYPE_FINALS, 4)),
        ("0042500404", (SEASON_TYPE_FINALS, 4)),
        ("0042500405", (SEASON_TYPE_FINALS, 4)),
        # Earlier playoff rounds share the 004 prefix and must NOT be
        # classified as Finals.
        ("0042500101", (SEASON_TYPE_PLAYOFFS, 1)),
        ("0042500106", (SEASON_TYPE_PLAYOFFS, 1)),
        ("0042500201", (SEASON_TYPE_PLAYOFFS, 2)),
        ("0042500301", (SEASON_TYPE_PLAYOFFS, 3)),
        # Play-in games carry their own 005 prefix, so they never reach the
        # round-digit branch at all.
        ("0052500101", (SEASON_TYPE_PLAY_IN, None)),
        ("0052500211", (SEASON_TYPE_PLAY_IN, None)),
        # Regular season: the 002 prefix every pre-postseason Game row has.
        ("0022500001", (SEASON_TYPE_REGULAR, None)),
        ("0022501230", (SEASON_TYPE_REGULAR, None)),
    ],
)
def test_classify_game_maps_real_ids_to_their_segment(nba_game_id: str, expected: tuple[str, int | None]):
    assert classify_game(nba_game_id) == expected


@pytest.mark.parametrize(
    "nba_game_id",
    [
        "MOCK-GAME-1",  # seed.ts's fixture ids
        "004250040",  # one character short
        "00425004011",  # one character long
        "0042500X01",  # non-numeric round digit (index 7)
        "",
    ],
)
def test_classify_game_falls_back_to_regular_for_unrecognised_ids(nba_game_id: str):
    """An id this function can't read is left in the regular season.

    Deliberately fails *out* of the postseason rather than into it: a
    misfiled regular-season game is a wrong row in a view users can sanity
    check, whereas guessing a postseason segment would quietly corrupt the
    isolation guarantee the whole feature rests on.
    """
    assert classify_game(nba_game_id) == (SEASON_TYPE_REGULAR, None)
