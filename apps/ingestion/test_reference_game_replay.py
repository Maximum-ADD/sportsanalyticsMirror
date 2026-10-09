"""Replays one real, completed NBA game's play-by-play through the full
derivation path (fetch -> translate -> validate -> aggregate) and asserts
every player's resulting counting stats match that same game's official
BoxScoreTraditionalV3 line exactly.

test_derive_player_game_stats.py already covers each aggregation rule in
isolation against small hand-built fixtures — this test instead exercises
the whole pipeline against one real game end to end, the gap the Advanced
tier docs call out: "unit tests match the NBA's published advanced stats to
three decimal places; there is no automated test replaying a whole game
against its published box score." The README's "16,775 of 16,777 plays
accepted... every one of the 14 counting stats on all 736 player lines
derived from those plays matched NBA's official boxscore exactly" was a
manual, one-off check on 2026-09-18 over 35 games — this makes that claim a
standing, repeatable assertion for at least one of them.

REFERENCE_GAME_ID is the 2025-26 Finals opener (SAS at NYK, 3 June 2026,
per games.py's own id-layout comment) — a real, long-final game, chosen
for being named and verified elsewhere in this codebase already, so this
test's fixed point isn't a fresh, unverified claim.

Needs the real network (stats.nba.com) and is skipped by default, like
test_play_by_play.py/test_pull_worker.py's requires_database tests: set
RUN_REFERENCE_GAME_REPLAY=1 to opt in. Not run in CI by default for the
same reason the load test isn't — an unofficial, rate-limited (1s/call)
external endpoint that occasionally times out, not something every push
should depend on.
"""

import os

import pytest

from derive_player_game_stats import aggregate_player_game_stats
from event_validation import validate_raw_event
from feed_translation import translate_game_actions
from games import fetch_game_boxscore
from play_by_play import fetch_game_actions, order_actions_by_sequence

REFERENCE_GAME_ID = "0042500401"  # 2025-26 Finals Game 1, SAS @ NYK — see games.py's GAME_ID_* comment

RUN_REFERENCE_GAME_REPLAY = os.environ.get("RUN_REFERENCE_GAME_REPLAY") == "1"
requires_network = pytest.mark.skipif(
    not RUN_REFERENCE_GAME_REPLAY,
    reason="set RUN_REFERENCE_GAME_REPLAY=1 to replay a real game against stats.nba.com (slow, network-dependent)",
)

COUNTING_STAT_FIELDS = (
    "points",
    "field_goals_made",
    "field_goals_attempted",
    "threes_made",
    "threes_attempted",
    "free_throws_made",
    "free_throws_attempted",
    "offensive_rebounds",
    "defensive_rebounds",
    "rebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
)


def _derive_stats_for_game(nba_game_id: str) -> dict[int, dict]:
    actions = order_actions_by_sequence(fetch_game_actions(nba_game_id))
    known_player_ids = {action["personId"] for action in actions if action.get("personId")}

    accepted_events = []
    previous_sequence = None
    for action in translate_game_actions(actions):
        result = validate_raw_event(action, previous_sequence=previous_sequence, known_player_ids=known_player_ids)
        if not result.accepted:
            continue
        previous_sequence = action["actionNumber"]
        accepted_events.append(action)

    return aggregate_player_game_stats(accepted_events)


@requires_network
class TestReferenceGameReplay:
    def test_derived_stats_match_official_boxscore_for_every_player(self):
        official_players = fetch_game_boxscore(REFERENCE_GAME_ID)["players"]
        derived_by_player = _derive_stats_for_game(REFERENCE_GAME_ID)

        assert official_players, "fixture game returned no players — check REFERENCE_GAME_ID is still valid"

        mismatches = []
        for official in official_players:
            player_id = official["nba_player_id"]
            # A player who never checks in (0 minutes) has no actions of
            # their own to derive a line from at all; the official boxscore
            # still lists them, all-zero. Nothing to derive is the correct
            # outcome there, not a divergence — only compare when either
            # side has something non-zero to say.
            derived = derived_by_player.get(player_id) or {field: 0 for field in COUNTING_STAT_FIELDS}
            for field in COUNTING_STAT_FIELDS:
                if derived[field] != official[field]:
                    mismatches.append(f"player {player_id} {field}: derived={derived[field]} official={official[field]}")

        assert not mismatches, "derived stats diverged from the official boxscore:\n" + "\n".join(mismatches)
