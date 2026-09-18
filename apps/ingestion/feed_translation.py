"""Translates raw PlayByPlayV3 actions into this platform's event vocabulary.

The platform's event schema (event_validation.py) and both stat derivers
(derive_player_game_stats.py here, derive-player-game-stats.ts in the API)
speak one vocabulary: "2pt"/"3pt" shots with a Made/Missed shotResult,
"freethrow", "rebound" with an "offensive"/"defensive" subType, and block,
steal and assist credits as "(Name N BLK|STL|AST)" description suffixes.
PlayByPlayV3 speaks another. Checked against live 2025-26 games on
2026-09-18, it sends:

  - "Made Shot" / "Missed Shot", with shotValue 2 or 3
  - "Free Throw" with an EMPTY shotResult; a miss is marked only by a
    "MISS " prefix on the description
  - "Rebound" with subType "Unknown"; offensive vs defensive is only in the
    description's running tally, e.g. "Braun REBOUND (Off:0 Def:1)"
  - blocks and steals as separate rows with an EMPTY actionType, sharing
    the actionNumber of the missed shot / turnover they belong to:
      #9  "MISS Gordon 6' Driving Layup"    + #9  "Edwards BLOCK (1 BLK)"
      #77 "Jokic Bad Pass Turnover (P2.T2)" + #77 "Reid STEAL (1 STL)"
    GameEvent is keyed on (game, actionNumber), so a pair can't be stored as
    two events. The credit is folded into its partner row as the
    "(Edwards 1 BLK)" suffix the derivers read, and the standalone row is
    dropped. (Assists already arrive as a suffix on the made shot.)
  - team actions (team rebounds, timeouts) with the TEAM's id as personId
    and teamId 0, not personId 0
  - instant-replay rows with a referee's id as personId, and a coach's
    technical ("David Adelman Foul:T.FOUL") with the coach's id — no team,
    no playerName. Neither is a player, so neither is checked as one.
  - the occasional rebound logged late, with a tally lower than the row
    before it — see _classify_rebounds

Before this module existed, every one of those was rejected, so a game kept
only its ~8 "period" markers and every stat fell back to the boxscore.

Translating once, here, keeps the stored GameEvent rows in the platform's
own vocabulary — what the API's re-derivation (corrections, replay) and an
admin editing an event both see. A feed name missing from
FEED_ACTION_TYPES passes through unchanged, so event_validation rejects it
as UNKNOWN_ACTION_TYPE with the real name in the message: a new NBA
vocabulary shows up in IngestionBatch.rejectionSummary instead of being
silently guessed at.

Pure and DB/network-free, like the modules it feeds.
"""

import re

# Same sentinel as event_validation.TEAM_ACTION_PERSON_ID and
# derive_player_game_stats.TEAM_ACTION_PERSON_ID.
TEAM_ACTION_PERSON_ID = 0

SHOT_FEED_TYPES = ("Made Shot", "Missed Shot")
THREE_POINT_SHOT_VALUE = 3

# PlayByPlayV3 name -> platform name, for every type that maps one-to-one.
# Shots need their value to pick 2pt/3pt and are handled separately.
FEED_ACTION_TYPES = {
    "Free Throw": "freethrow",
    "Rebound": "rebound",
    "Turnover": "turnover",
    "Foul": "foul",
    "Violation": "violation",
    "Timeout": "timeout",
    "Substitution": "substitution",
    "Jump Ball": "jumpball",
    "Ejection": "ejection",
    "Instant Replay": "instant replay",
    "Heave": "heave",
    "period": "period",
    "game": "game",
}

# Row types that carry an official's id in personId, not a player's.
OFFICIAL_ACTION_TYPES = {"instant replay"}

MISSED_FREE_THROW_PREFIX = "MISS "
REBOUND_TALLY = re.compile(r"\(Off:(\d+) Def:(\d+)\)")

# A standalone credit row's pattern -> the feed type of the row it belongs
# to, and the suffix code the derivers read. The name is taken as NBA wrote
# it on the credit row ("St. Curry STEAL", "L. James BLOCK", "Green BLOCK"),
# so a folded credit reads exactly like an assist credit NBA wrote itself.
CREDIT_ROWS = (
    (re.compile(r"^(.+?) BLOCK \((\d+) BLK\)"), "Missed Shot", "BLK"),
    (re.compile(r"^(.+?) STEAL \((\d+) STL\)"), "Turnover", "STL"),
)


def translate_game_actions(actions: list[dict]) -> list[dict]:
    """Translates one game's actions, in order. Returns new dicts; the
    input rows are never modified.

    Whole-game rather than row-by-row because three things need context: a
    block/steal row's partner (the row sharing its actionNumber), the game's
    team ids (to recognise team-level rows), and each player's previous
    rebound tally (to tell offensive from defensive). `actions` must be in
    actionNumber order.
    """
    team_ids = {action["teamId"] for action in actions if action.get("teamId")}
    rebound_kinds = _classify_rebounds(actions)
    return [
        _translate_action(action, team_ids, rebound_kinds)
        for action in _fold_credit_rows(actions)
    ]


def _rebound_tally(action: dict) -> tuple[int, int] | None:
    """The (offensive, defensive) running tally on a player rebound row."""
    if (action.get("actionType") or "") != "Rebound":
        return None
    match = REBOUND_TALLY.search(action.get("description") or "")
    return (int(match.group(1)), int(match.group(2))) if match else None


def _classify_rebounds(actions: list[dict]) -> dict[tuple[int, int, int], str]:
    """(personId, off, def) -> "offensive"/"defensive" for every player
    rebound in the game.

    Each rebound raises a player's running tally by exactly one, so ordering
    a player's rebounds by tally total gives their true order even when NBA
    logs one late. (A real game had "(Off:0 Def:4)" at actionNumber 277,
    after "(Off:1 Def:5)" at 264: comparing with the previous row by
    actionNumber, neither count went up and the rebound went uncounted.)
    Whichever count rose from the previous tally names the kind.
    """
    tallies_by_person: dict[int, set[tuple[int, int]]] = {}
    for action in actions:
        tally = _rebound_tally(action)
        if tally is not None and action.get("personId"):
            tallies_by_person.setdefault(action["personId"], set()).add(tally)

    kinds: dict[tuple[int, int, int], str] = {}
    for person_id, tallies in tallies_by_person.items():
        previous_offensive, previous_defensive = 0, 0
        for offensive, defensive in sorted(tallies, key=lambda tally: (tally[0] + tally[1], tally)):
            if offensive > previous_offensive:
                kinds[(person_id, offensive, defensive)] = "offensive"
            elif defensive > previous_defensive:
                kinds[(person_id, offensive, defensive)] = "defensive"
            previous_offensive, previous_defensive = offensive, defensive
    return kinds


def _credit_suffix(action: dict) -> tuple[str, str] | None:
    """(partner feed type, "(Name N BLK)") for a standalone block or steal
    row; None for every other row."""
    if action.get("actionType"):
        return None
    description = (action.get("description") or "").strip()
    for pattern, partner_type, code in CREDIT_ROWS:
        match = pattern.search(description)
        if match:
            return partner_type, f"({match.group(1)} {match.group(2)} {code})"
    return None


def _fold_credit_rows(actions: list[dict]) -> list[dict]:
    """Copies the actions, moving each block/steal credit onto the missed
    shot / turnover that shares its actionNumber and dropping the standalone
    row. A credit row with no such partner is kept as-is, so validation
    rejects it visibly (its actionType is empty) instead of it vanishing."""
    partner_index_by_key: dict[tuple[object, str], int] = {}
    copies: list[dict] = []
    for action in actions:
        credit = _credit_suffix(action)
        if credit is not None:
            partner_type, suffix = credit
            partner_index = partner_index_by_key.get((action.get("actionNumber"), partner_type))
            if partner_index is not None:
                partner = copies[partner_index]
                partner["description"] = f"{partner.get('description') or ''} {suffix}".strip()
                continue
        copies.append(dict(action))
        partner_index_by_key[(action.get("actionNumber"), action.get("actionType") or "")] = len(copies) - 1
    return copies


def _translate_action(action: dict, team_ids: set[int], rebound_kinds: dict[tuple[int, int, int], str]) -> dict:
    """Rewrites one (already copied) action into the platform's vocabulary."""
    feed_type = action.get("actionType") or ""
    tally = _rebound_tally(action)
    action["actionType"] = _platform_action_type(feed_type, action)

    _attribute_team_actions(action, team_ids)
    if _is_non_player_participant(action):
        action["personId"] = None

    if action["actionType"] == "freethrow":
        description = action.get("description") or ""
        action["shotResult"] = "Missed" if description.startswith(MISSED_FREE_THROW_PREFIX) else "Made"
    elif action["actionType"] == "rebound":
        # None for a team rebound, or a tally the classification couldn't
        # place — left for the deriver to skip rather than guessed.
        action["subType"] = rebound_kinds.get((action.get("personId"), *tally)) if tally else None
    return action


def _is_non_player_participant(action: dict) -> bool:
    """Whether the row's personId is someone other than a player: a referee
    on an instant replay, or a coach given a technical. Every player row
    carries the player's teamId; these carry teamId 0 — sometimes with a
    playerName ("Douglas Christie Foul:T.FOUL" names the coach), so the
    missing team is the reliable signal. Team-level rows are already
    rewritten to TEAM_ACTION_PERSON_ID with their team before this runs."""
    if action["actionType"] in OFFICIAL_ACTION_TYPES:
        return True
    return bool(action.get("personId")) and not action.get("teamId")


def _platform_action_type(feed_type: str, action: dict) -> str:
    """The platform's name for a feed action type. Unknown names (including
    an empty one) are returned unchanged so validation reports them."""
    if feed_type in SHOT_FEED_TYPES:
        return "3pt" if action.get("shotValue") == THREE_POINT_SHOT_VALUE else "2pt"
    return FEED_ACTION_TYPES.get(feed_type, feed_type)


def _attribute_team_actions(action: dict, team_ids: set[int]) -> None:
    """Rewrites a team-level row (personId is a team id) to the platform's
    shape: personId = TEAM_ACTION_PERSON_ID, teamId = that team."""
    person_id = action.get("personId")
    if person_id in team_ids:
        action["teamId"] = person_id
        action["personId"] = TEAM_ACTION_PERSON_ID
