"""Schema validation for one raw PlayByPlayV3 action row, before it's
accepted as a GameEvent.

This is the platform's own event schema check the brief asks for: a
submission (here, one ingestion run's play-by-play fetch) is checked
against it before acceptance, and a rejection says what was wrong rather
than failing quietly or writing garbage silently. See play_by_play.py for
where accepted/rejected counts and reasons get rolled up into an
IngestionBatch row.

Pure and DB/network-free by design, matching apps/predictor/four_factors.py's
fetch-vs-compute split: known-player membership is injected as a parameter
rather than queried here, so this is unit-testable with hand-built fixture
rows and nothing else.

KNOWN_ACTION_TYPES below is assembled from public documentation of NBA's
play-by-play feed, not a live-verified enumeration — no authoritative spec
exists (same situation games.py's classify_game() docstring describes for
game-id layout). It needs a one-off live PlayByPlayV3 fetch to confirm
before this is trusted in production, and should be extended (not
silently widened) if a real game surfaces a value not listed here.
"""

from typing import NamedTuple

KNOWN_ACTION_TYPES = {
    "2pt",
    "3pt",
    "freethrow",
    "rebound",
    "turnover",
    "foul",
    "violation",
    "timeout",
    "substitution",
    "jumpball",
    "ejection",
    "period",
    "game",
    "instant replay",
}

# NBA's sentinel for "this action belongs to a team, not an individual
# player" (a team rebound, a team turnover on a shot-clock violation) —
# confirmed via the installed nba_api source, not guessed. personId is
# either this or a real player id; never null-as-in-"unknown" on a row
# that otherwise validates.
TEAM_ACTION_PERSON_ID = 0

REQUIRED_FIELDS = ("gameId", "actionNumber", "period", "clock", "actionType", "description")

# Regulation is 4 periods; NBA games have gone to 6+ overtimes historically
# (the record is 6). 10 is a deliberately generous ceiling, not a precise
# rule — this validator's job is to catch garbage (period 0, period 47),
# not to be the source of truth for how many overtimes are possible.
MIN_PERIOD = 1
MAX_PERIOD = 10


class RejectionReason(NamedTuple):
    # Machine-stable, aggregable by IngestionBatch.rejectionSummary — never
    # embed a specific value in `code` itself (that belongs in `message`).
    code: str
    field: str
    message: str


class ValidationResult(NamedTuple):
    accepted: bool
    # Empty iff accepted. More than one reason is possible in principle
    # (this validator collects rather than short-circuits, except for
    # missing-required-field checks — see below), so a caller reporting
    # "what was wrong" can show everything at once rather than one problem
    # per rejection cycle.
    reasons: list[RejectionReason]


def _missing_or_blank(row: dict, field: str) -> bool:
    value = row.get(field)
    return value is None or (isinstance(value, str) and value.strip() == "")


def validate_raw_event(
    row: dict,
    *,
    previous_sequence: int | None,
    known_player_ids: set[int],
) -> ValidationResult:
    """Checks one raw PlayByPlayV3 action against the platform's event schema.

    `previous_sequence` is the highest ACCEPTED actionNumber seen so far
    for this game in this ingestion run (None for the first row) — the
    monotonicity check below rejects both out-of-order and exact-duplicate
    rows, since a duplicate's actionNumber fails the strict "greater than"
    test the same way an earlier one would.

    `known_player_ids` is the roster already loaded for this run (see
    play_by_play.py) — injected rather than queried, keeping this function
    pure. A team-level action's personId (see TEAM_ACTION_PERSON_ID) is
    exempt from this check, not treated as an unknown player.
    """
    missing = [field for field in REQUIRED_FIELDS if _missing_or_blank(row, field)]
    if missing:
        # Nothing else here is safely checkable without these fields (a
        # missing actionType makes the KNOWN_ACTION_TYPES check meaningless,
        # for instance), so this short-circuits rather than piling on
        # confusing secondary errors about fields that aren't really wrong.
        return ValidationResult(
            accepted=False,
            reasons=[
                RejectionReason(code="MISSING_FIELD", field=field, message=f"'{field}' is required but missing")
                for field in missing
            ],
        )

    reasons: list[RejectionReason] = []

    action_number = row["actionNumber"]
    if not isinstance(action_number, int) or isinstance(action_number, bool) or action_number <= 0:
        reasons.append(
            RejectionReason(
                code="INVALID_TYPE", field="actionNumber", message=f"actionNumber must be a positive integer, got {action_number!r}"
            )
        )
    elif previous_sequence is not None and action_number <= previous_sequence:
        reasons.append(
            RejectionReason(
                code="NON_MONOTONIC_SEQUENCE",
                field="actionNumber",
                message=f"actionNumber {action_number} is not greater than the previous accepted {previous_sequence}",
            )
        )

    period = row["period"]
    if not isinstance(period, int) or isinstance(period, bool) or not (MIN_PERIOD <= period <= MAX_PERIOD):
        reasons.append(
            RejectionReason(
                code="INVALID_PERIOD", field="period", message=f"period must be an integer in [{MIN_PERIOD}, {MAX_PERIOD}], got {period!r}"
            )
        )

    action_type = row["actionType"]
    if action_type not in KNOWN_ACTION_TYPES:
        reasons.append(
            RejectionReason(
                code="UNKNOWN_ACTION_TYPE",
                field="actionType",
                message=f"actionType {action_type!r} is not in this platform's known event schema",
            )
        )

    person_id = row.get("personId")
    if person_id is not None and person_id != TEAM_ACTION_PERSON_ID and person_id not in known_player_ids:
        reasons.append(
            RejectionReason(
                code="UNKNOWN_PLAYER", field="personId", message=f"personId {person_id} is not on either team's ingested roster"
            )
        )

    return ValidationResult(accepted=len(reasons) == 0, reasons=reasons)
