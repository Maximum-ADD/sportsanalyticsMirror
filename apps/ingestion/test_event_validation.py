"""Tests for event_validation.py's schema checks. Each test targets exactly
one rejection rule with a hand-built fixture row, plus the ordering
guarantee (missing fields short-circuit; everything else can co-occur).
"""

from event_validation import TEAM_ACTION_PERSON_ID, validate_raw_event


def make_valid_row(**overrides) -> dict:
    row = {
        "gameId": "0022500001",
        "actionNumber": 5,
        "period": 1,
        "clock": "PT11M04.00S",
        "actionType": "2pt",
        "description": "Curry 12' Jump Shot (2 PTS)",
        "personId": 201939,
    }
    row.update(overrides)
    return row


KNOWN_PLAYERS = {201939, 1628369}


def test_a_well_formed_row_is_accepted():
    result = validate_raw_event(make_valid_row(), previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is True
    assert result.reasons == []


def test_first_row_of_a_game_has_no_previous_sequence_to_compare_against():
    result = validate_raw_event(make_valid_row(actionNumber=1), previous_sequence=None, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is True


def test_missing_required_field_is_rejected_and_short_circuits():
    row = make_valid_row()
    del row["clock"]

    result = validate_raw_event(row, previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is False
    assert [reason.code for reason in result.reasons] == ["MISSING_FIELD"]
    assert result.reasons[0].field == "clock"


def test_blank_string_field_counts_as_missing_not_present():
    result = validate_raw_event(make_valid_row(description="   "), previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is False
    assert result.reasons[0].code == "MISSING_FIELD"
    assert result.reasons[0].field == "description"


def test_non_monotonic_sequence_is_rejected():
    result = validate_raw_event(make_valid_row(actionNumber=4), previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is False
    assert result.reasons[0].code == "NON_MONOTONIC_SEQUENCE"


def test_exact_duplicate_sequence_is_rejected_by_the_same_monotonicity_check():
    # A re-delivered row for a sequence already accepted must not slip
    # through as if it were new — it fails the strict "greater than" test
    # exactly like an out-of-order one would.
    result = validate_raw_event(make_valid_row(actionNumber=5), previous_sequence=5, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is False
    assert result.reasons[0].code == "NON_MONOTONIC_SEQUENCE"


def test_non_integer_action_number_is_rejected():
    result = validate_raw_event(make_valid_row(actionNumber="5"), previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is False
    assert result.reasons[0].code == "INVALID_TYPE"


def test_period_outside_the_sane_range_is_rejected():
    result = validate_raw_event(make_valid_row(period=0), previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is False
    assert result.reasons[0].code == "INVALID_PERIOD"


def test_unknown_action_type_is_rejected_not_silently_accepted():
    result = validate_raw_event(make_valid_row(actionType="dunk_contest"), previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is False
    assert result.reasons[0].code == "UNKNOWN_ACTION_TYPE"


def test_person_id_not_on_either_roster_is_rejected():
    result = validate_raw_event(make_valid_row(personId=999999), previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is False
    assert result.reasons[0].code == "UNKNOWN_PLAYER"


def test_team_action_sentinel_is_exempt_from_the_known_player_check():
    # A team rebound/turnover's personId is 0, not a real player id — must
    # not be rejected as an "unknown player".
    result = validate_raw_event(
        make_valid_row(actionType="rebound", personId=TEAM_ACTION_PERSON_ID), previous_sequence=4, known_player_ids=KNOWN_PLAYERS
    )

    assert result.accepted is True


def test_row_with_no_person_id_at_all_is_still_checkable():
    # Some action types (e.g. a timeout) carry no personId at all — that's
    # not the same as an unknown player and must not be rejected for it.
    row = make_valid_row(actionType="timeout")
    del row["personId"]

    result = validate_raw_event(row, previous_sequence=4, known_player_ids=KNOWN_PLAYERS)

    assert result.accepted is True


def test_multiple_independent_problems_are_all_reported_together():
    # Unlike missing-field, non-missing-field checks don't short-circuit —
    # a caller reporting "what was wrong" should see every problem in one
    # pass, not just the first.
    result = validate_raw_event(
        make_valid_row(actionType="dunk_contest", personId=999999), previous_sequence=4, known_player_ids=KNOWN_PLAYERS
    )

    assert result.accepted is False
    codes = {reason.code for reason in result.reasons}
    assert codes == {"UNKNOWN_ACTION_TYPE", "UNKNOWN_PLAYER"}
