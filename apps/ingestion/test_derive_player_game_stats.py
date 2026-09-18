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
    RosterEntry,
    build_game_roster,
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
    game's own roster — see build_game_roster's
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


def test_build_game_roster_keeps_folded_names_and_team_and_skips_team_rows():
    events = [
        {"personId": CURRY, "playerName": "Curry", "playerNameI": "S. Curry", "teamId": 1610612744},
        {"personId": TEAM_ACTION_PERSON_ID, "playerName": ""},
    ]

    roster = build_game_roster(events)

    assert roster == {CURRY: RosterEntry("curry", "s", 1610612744)}


def test_resolve_secondary_player_returns_none_when_the_suffix_is_absent():
    roster = {CURRY: RosterEntry("curry", "s", None)}
    assert resolve_secondary_player("Curry 12' Jump Shot (2 PTS)", "assists", roster) is None


# The cases real 2025-26 play-by-play surfaced (see feed_translation.py):
# before these, every credit for a player with an accented or shared
# surname was dropped. Each mirrors a test in the API's
# derive-player-game-stats.spec.ts, since both derivers must agree.
WARRIORS = 1610612744
SPURS = 1610612759


def player_row(person_id: int, surname: str, initial_name: str, team_id: int) -> dict:
    """A foul by this player — puts them on the game's roster with their
    playerNameI and team, and counts toward nothing."""
    return {"actionType": "foul", "personId": person_id, "playerName": surname, "playerNameI": initial_name, "teamId": team_id, "description": "Foul"}


def shot(action_type: str, made: bool, description: str, team_id: int = WARRIORS) -> dict:
    return {
        "actionType": action_type,
        "personId": CURRY,
        "playerName": "Curry",
        "playerNameI": "S. Curry",
        "teamId": team_id,
        "shotResult": "Made" if made else "Missed",
        "shotValue": 3 if action_type == "3pt" else 2,
        "description": description,
    }


def test_credits_an_accented_player_from_an_unaccented_suffix():
    jokic = 203999
    events = [shot("3pt", True, "Curry 26' 3PT Jump Shot (5 PTS) (Jokic 1 AST)"), player_row(jokic, "Jokić", "N. Jokić", WARRIORS)]

    assert aggregate_player_game_stats(events)[jokic]["assists"] == 1


def test_tells_teammates_apart_by_the_initial_nba_prefixes_to_a_shared_surname():
    lebron, bronny = 2544, 1642355
    events = [
        shot("2pt", True, "Curry 21' Jump Shot (2 PTS) (L. James 1 AST)"),
        player_row(lebron, "James", "L. James", WARRIORS),
        player_row(bronny, "James", "B. James", WARRIORS),
    ]

    result = aggregate_player_game_stats(events)

    assert result[lebron]["assists"] == 1
    assert bronny not in result


def test_accepts_a_longer_first_name_prefix():
    events = [
        {**shot("3pt", True, "Porzingis 26' 3PT Jump Shot (14 PTS) (St. Curry 1 AST)"), "personId": GREEN, "playerName": "Green", "playerNameI": "D. Green"},
        player_row(CURRY, "Curry", "S. Curry", WARRIORS),
    ]

    assert aggregate_player_game_stats(events)[CURRY]["assists"] == 1


def test_uses_team_context_when_opponents_share_an_unprefixed_surname():
    draymond, jalen = 203110, 1630224
    events = [
        player_row(draymond, "Green", "D. Green", WARRIORS),
        player_row(jalen, "Green", "J. Green", SPURS),
        shot("2pt", True, "Curry 3' Running Dunk (2 PTS) (Green 1 AST)"),  # a teammate assists
        shot("2pt", False, "MISS Curry 6' Layup (Green 1 BLK)"),  # an opponent blocks
    ]

    result = aggregate_player_game_stats(events)

    assert result[draymond]["assists"] == 1
    assert result[draymond]["blocks"] == 0
    assert result[jalen]["blocks"] == 1
    assert result[jalen]["assists"] == 0


def test_still_refuses_to_guess_between_same_team_players_with_the_same_initial():
    seth = 203552
    events = [
        {**shot("2pt", True, "Green 3' Layup (2 PTS) (S. Curry 1 AST)"), "personId": GREEN, "playerName": "Green", "playerNameI": "D. Green"},
        player_row(CURRY, "Curry", "S. Curry", WARRIORS),
        player_row(seth, "Curry", "S. Curry", WARRIORS),
    ]

    result = aggregate_player_game_stats(events)

    assert CURRY not in result
    assert seth not in result
