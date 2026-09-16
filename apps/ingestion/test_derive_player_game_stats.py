"""Tests for derive_player_game_stats.py — the event-to-boxscore aggregation
that makes PlayerGameStat genuinely derived rather than typed in. Each test
targets one aggregation rule with a small, explicit, hand-built event list;
values are checked exactly, not just "greater than zero", so a wrong
attribution (e.g. crediting the wrong player) can't slip past a loose
assertion.
"""

from derive_player_game_stats import (
    TEAM_ACTION_PERSON_ID,
    aggregate_player_game_stats,
    build_roster_name_index,
    resolve_secondary_player,
)

CURRY = 201939
GREEN = 201142
WEMBANYAMA = 1641705
GOBERT = 203497
MORANT = 1629630
HOLIDAY = 201950


def made_shot(action_type: str, person_id: int, player_name: str, description: str, shot_value: int) -> dict:
    return {
        "actionType": action_type,
        "personId": person_id,
        "playerName": player_name,
        "shotResult": "Made",
        "shotValue": shot_value,
        "description": description,
    }


def missed_shot(action_type: str, person_id: int, player_name: str, description: str) -> dict:
    return {
        "actionType": action_type,
        "personId": person_id,
        "playerName": player_name,
        "shotResult": "Missed",
        "shotValue": 3 if action_type == "3pt" else 2,
        "description": description,
    }


def appears_in_game(person_id: int, player_name: str) -> dict:
    """A neutral event (an unhandled actionType, contributing nothing to
    any counted stat) whose only job is to put this player into the
    game's own roster-name index — see build_roster_name_index's
    docstring: a player must appear as an actor somewhere in the game's
    events to be resolvable as a secondary player at all, matching how a
    real player credited with an assist/steal/block always has actions
    of their own elsewhere in the same game."""
    return {"actionType": "foul", "personId": person_id, "playerName": player_name, "description": f"{player_name} Personal Foul"}


def test_made_two_pointer_with_assist_credits_both_players():
    events = [
        made_shot("2pt", CURRY, "Curry", "Curry 12' Jump Shot (2 PTS) (Green 5 AST)", 2),
        appears_in_game(GREEN, "Green"),
    ]

    result = aggregate_player_game_stats(events)

    assert result[CURRY]["points"] == 2
    assert result[CURRY]["field_goals_made"] == 1
    assert result[CURRY]["field_goals_attempted"] == 1
    assert result[CURRY]["threes_made"] == 0
    assert result[GREEN]["assists"] == 1


def test_made_three_pointer_with_assist_credits_points_and_three_point_splits():
    events = [
        made_shot("3pt", CURRY, "Curry", "Curry 26' 3PT Jump Shot (31 PTS) (Green 7 AST)", 3),
        appears_in_game(GREEN, "Green"),
    ]

    result = aggregate_player_game_stats(events)

    assert result[CURRY]["points"] == 3
    assert result[CURRY]["field_goals_made"] == 1
    assert result[CURRY]["field_goals_attempted"] == 1
    assert result[CURRY]["threes_made"] == 1
    assert result[CURRY]["threes_attempted"] == 1
    assert result[GREEN]["assists"] == 1


def test_unassisted_made_shot_credits_no_one_an_assist():
    events = [made_shot("2pt", CURRY, "Curry", "Curry 12' Jump Shot (2 PTS)", 2)]

    result = aggregate_player_game_stats(events)

    assert result[CURRY]["points"] == 2
    assert all(player_id != CURRY or line["assists"] == 0 for player_id, line in result.items())
    assert GREEN not in result


def test_missed_shot_with_block_credits_the_blocker_not_the_shooter():
    events = [
        missed_shot("2pt", CURRY, "Curry", "MISS Curry 15' Jump Shot (Wembanyama 3 BLK)"),
        appears_in_game(WEMBANYAMA, "Wembanyama"),
    ]

    result = aggregate_player_game_stats(events)

    assert result[CURRY]["field_goals_made"] == 0
    assert result[CURRY]["field_goals_attempted"] == 1
    assert result[CURRY]["points"] == 0
    assert result[WEMBANYAMA]["blocks"] == 1


def test_missed_shot_with_no_block_credits_no_one_a_block():
    events = [missed_shot("3pt", CURRY, "Curry", "MISS Curry 26' 3PT Jump Shot")]

    result = aggregate_player_game_stats(events)

    assert result[CURRY]["field_goals_attempted"] == 1
    assert result[CURRY]["threes_attempted"] == 1
    assert WEMBANYAMA not in result


def test_made_and_missed_free_throws():
    events = [
        {"actionType": "freethrow", "personId": CURRY, "playerName": "Curry", "shotResult": "Made", "description": "Curry Free Throw 1 of 2 (10 PTS)"},
        {"actionType": "freethrow", "personId": CURRY, "playerName": "Curry", "shotResult": "Missed", "description": "MISS Curry Free Throw 2 of 2"},
    ]

    result = aggregate_player_game_stats(events)

    assert result[CURRY]["free_throws_made"] == 1
    assert result[CURRY]["free_throws_attempted"] == 2
    assert result[CURRY]["points"] == 1


def test_offensive_and_defensive_rebounds_are_split_and_totalled():
    events = [
        {"actionType": "rebound", "subType": "offensive", "personId": CURRY, "playerName": "Curry", "description": "Curry REBOUND (Off:1 Def:0)"},
        {"actionType": "rebound", "subType": "defensive", "personId": GOBERT, "playerName": "Gobert", "description": "Gobert REBOUND (Off:0 Def:5)"},
    ]

    result = aggregate_player_game_stats(events)

    assert result[CURRY]["offensive_rebounds"] == 1
    assert result[CURRY]["defensive_rebounds"] == 0
    assert result[CURRY]["rebounds"] == 1
    assert result[GOBERT]["defensive_rebounds"] == 1
    assert result[GOBERT]["rebounds"] == 1


def test_team_rebound_is_excluded_from_every_players_totals():
    events = [{"actionType": "rebound", "subType": "defensive", "personId": TEAM_ACTION_PERSON_ID, "playerName": "", "description": "Warriors Rebound"}]

    result = aggregate_player_game_stats(events)

    assert result == {}


def test_turnover_with_steal_credits_both_players():
    events = [
        {
            "actionType": "turnover",
            "personId": MORANT,
            "playerName": "Morant",
            "description": "Morant Bad Pass Turnover (P1.T3) (Holiday 3 STL)",
        },
        appears_in_game(HOLIDAY, "Holiday"),
    ]

    result = aggregate_player_game_stats(events)

    assert result[MORANT]["turnovers"] == 1
    assert result[HOLIDAY]["steals"] == 1


def test_team_turnover_is_excluded_entirely():
    events = [{"actionType": "turnover", "personId": TEAM_ACTION_PERSON_ID, "playerName": "", "description": "Grizzlies Turnover: Shot Clock"}]

    result = aggregate_player_game_stats(events)

    assert result == {}


def test_ambiguous_surname_resolves_to_none_rather_than_guessing():
    # Two different players sharing the same playerName in this game's own
    # event list — a made shot "assisted by Williams" must not be
    # attributed to either one.
    events = [
        {"actionType": "2pt", "personId": 111, "playerName": "Williams", "shotResult": "Missed", "shotValue": 2, "description": "MISS Williams shot"},
        {"actionType": "2pt", "personId": 222, "playerName": "Williams", "shotResult": "Missed", "shotValue": 2, "description": "MISS Williams shot"},
        made_shot("2pt", CURRY, "Curry", "Curry 12' Jump Shot (2 PTS) (Williams 4 AST)", 2),
    ]

    result = aggregate_player_game_stats(events)

    assert result[111]["assists"] == 0
    assert result[222]["assists"] == 0
    assert result[CURRY]["points"] == 2


def test_build_roster_name_index_excludes_team_attributed_rows():
    events = [
        {"personId": CURRY, "playerName": "Curry"},
        {"personId": TEAM_ACTION_PERSON_ID, "playerName": ""},
    ]

    index = build_roster_name_index(events)

    assert index == {"Curry": [CURRY]}


def test_resolve_secondary_player_returns_none_when_the_suffix_is_absent():
    assert resolve_secondary_player("Curry 12' Jump Shot (2 PTS)", "assists", {"Curry": [CURRY]}) is None
