"""Aggregates one game's accepted GameEvent-shaped rows into per-player
PlayerGameStat counting stats — the actual "derived from a record of the
individual events... rather than stored as a total that somebody typed in"
the brief asks for.

Pure and DB/network-free, like event_validation.py and
apps/predictor/four_factors.py's compute_* functions: takes event dicts in,
returns a plain dict out, unit-testable with hand-built fixtures.

Events arrive already translated into the platform's vocabulary by
feed_translation.py ("2pt"/"3pt", "freethrow", "rebound" with an
offensive/defensive subType). Assist, block and steal credits are a
"(Name N AST|BLK|STL)" suffix on the made shot, missed shot or turnover:
  "DiVincenzo 26' 3PT Pullup Jump Shot (3 PTS) (Gobert 1 AST)"
  "MISS Gordon 6' Driving Layup (Edwards 1 BLK)"
  "Jokic Bad Pass Turnover (P2.T2) (Reid 1 STL)"
Assists arrive that way from PlayByPlayV3; blocks and steals arrive as
separate rows and feed_translation folds them into this form.
resolve_secondary_player regexes the suffix out and resolves the name
against this game's own roster, ignoring accents — never a database lookup,
and never a guess when the name doesn't resolve to exactly one player.

Deliberately excluded: minutes and plusMinus. See PlayerGameStat's schema
doc comment for why (on-court time needs a full substitution-event replay
to recover correctly; this project keeps sourcing both from the official
boxscore/PlayerGameLogs feeds instead of reinventing a number they already
provide).
"""

import re
import unicodedata
from collections import defaultdict
from typing import NamedTuple

# NBA's sentinel for a team-level action (a team rebound, a shot-clock
# turnover) — see event_validation.py's TEAM_ACTION_PERSON_ID. Repeated
# here rather than imported so this module has zero dependency on the
# validation module; they document the same fact independently.
TEAM_ACTION_PERSON_ID = 0

# Any characters but parentheses for the name: an ASCII-only class never
# matched a name like "Jokić" when it did appear accented.
SECONDARY_PLAYER_PATTERNS = {
    "assists": re.compile(r"\(([^()]+?) (\d+) AST\)"),
    "steals": re.compile(r"\(([^()]+?) (\d+) STL\)"),
    "blocks": re.compile(r"\(([^()]+?) (\d+) BLK\)"),
}


def fold_name(name: str) -> str:
    """A name with its accents removed and case folded, for matching.

    PlayByPlayV3 is inconsistent about accents: playerName is "Jokić" but
    the credit suffix on another row reads "(Jokic 11 AST)". Comparing
    folded forms matches the two; comparing raw strings dropped every
    assist, block and steal by a player with an accented surname.
    """
    decomposed = unicodedata.normalize("NFKD", name)
    return "".join(char for char in decomposed if not unicodedata.combining(char)).casefold().strip()

# snake_case, matching fetch_game_boxscore's dict shape (games.py) and
# upsert_player_game_stat's expected input — not the Prisma column names —
# so this plugs directly into the existing ingest.py merge/write path with
# no translation layer.
STAT_FIELDS = (
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


def _empty_stat_line() -> dict:
    return {field: 0 for field in STAT_FIELDS}


class RosterEntry(NamedTuple):
    """What a credit suffix can be matched against, for one player."""

    surname: str  # folded, e.g. "jokic", "james"
    first_initial: str  # folded, e.g. "l" for "L. James"; "" if unknown
    team_id: int | None  # the team they played for in this game


# The team a credit comes from, relative to the team of the row it's on:
# an assist is a teammate of the shooter; a block or steal comes from the
# other side.
CREDIT_FROM_SAME_TEAM = {"assists": True, "blocks": False, "steals": False}


def build_game_roster(events: list[dict]) -> dict[int, RosterEntry]:
    """personId -> surname, first initial and team, from this game's own
    events.

    Every player who does anything in a game appears at least once with
    their personId, playerName (surname), playerNameI ("L. James") and
    teamId, so this needs no external roster lookup.
    """
    roster: dict[int, RosterEntry] = {}
    for event in events:
        person_id = event.get("personId")
        player_name = event.get("playerName")
        if person_id in (None, TEAM_ACTION_PERSON_ID) or not player_name or person_id in roster:
            continue
        initial_name = fold_name(event.get("playerNameI") or "")
        first_initial = initial_name.split(".", 1)[0] if "." in initial_name else ""
        roster[person_id] = RosterEntry(fold_name(player_name), first_initial[:1], event.get("teamId") or None)
    return roster


def credit_name_matches(credit_name: str, player: RosterEntry) -> bool:
    """Whether a folded credit name ("jokic", "l. james", "st. curry")
    refers to this player.

    NBA writes a bare surname unless two players on a roster share it, and
    then prefixes it with enough of the first name to tell them apart — one
    letter ("L. James") or more ("St. Curry"). The prefix must begin with
    the player's first initial.
    """
    if credit_name == player.surname:
        return True
    if not credit_name.endswith(" " + player.surname) or not player.first_initial:
        return False
    prefix = credit_name[: -len(player.surname)].strip().rstrip(".")
    return prefix.startswith(player.first_initial)


def resolve_secondary_player(
    description: str,
    stat: str,
    roster: dict[int, RosterEntry],
    event_team_id: int | None = None,
) -> int | None:
    """Extracts and resolves the "(Name N AST/STL/BLK)" suffix on one event's
    description to a personId.

    Candidates are the game's players whose name matches. If more than one
    does — two players share a surname, and NBA only disambiguates within a
    roster, so "(Green 1 AST)" can mean Draymond or Jalen when they're on
    opposite sides — the one on the expected side of the event's team
    (see CREDIT_FROM_SAME_TEAM) is kept.

    Returns None when there's no suffix (an unassisted shot, an unblocked
    miss — not missing data) or the name still doesn't narrow to exactly one
    player — never a guess.
    """
    match = SECONDARY_PLAYER_PATTERNS[stat].search(description)
    if match is None:
        return None

    credit_name = fold_name(match.group(1))
    candidates = [person_id for person_id, player in roster.items() if credit_name_matches(credit_name, player)]
    if len(candidates) > 1 and event_team_id:
        from_same_team = CREDIT_FROM_SAME_TEAM[stat]
        candidates = [
            person_id for person_id in candidates if (roster[person_id].team_id == event_team_id) == from_same_team
        ]
    return candidates[0] if len(candidates) == 1 else None


def aggregate_player_game_stats(events: list[dict]) -> dict[int, dict]:
    """Aggregates one game's accepted events into nba_player_id -> counting stats.

    `events` must already be the ACCEPTED rows for a single game (see
    event_validation.validate_raw_event) — this function trusts actionType/
    subType/personId are well-formed and does no further validation of its
    own. Team-attributed actions (TEAM_ACTION_PERSON_ID) never contribute
    to any player's totals.
    """
    roster = build_game_roster(events)
    stats_by_player: dict[int, dict] = defaultdict(_empty_stat_line)

    for event in events:
        action_type = event["actionType"]
        person_id = event.get("personId")
        made = event.get("shotResult") == "Made"

        if action_type in ("2pt", "3pt"):
            if person_id is None or person_id == TEAM_ACTION_PERSON_ID:
                continue
            line = stats_by_player[person_id]
            line["field_goals_attempted"] += 1
            if action_type == "3pt":
                line["threes_attempted"] += 1
            if made:
                line["field_goals_made"] += 1
                shot_value = event.get("shotValue") or (3 if action_type == "3pt" else 2)
                line["points"] += shot_value
                if action_type == "3pt":
                    line["threes_made"] += 1
                # Both 2pt and 3pt makes carry the same optional
                # "(Name N AST)" description suffix — resolved once here
                # regardless of shot value, rather than duplicated per branch.
                assist_id = resolve_secondary_player(event["description"], "assists", roster, event.get("teamId"))
                if assist_id is not None:
                    stats_by_player[assist_id]["assists"] += 1
            else:
                block_id = resolve_secondary_player(event["description"], "blocks", roster, event.get("teamId"))
                if block_id is not None:
                    stats_by_player[block_id]["blocks"] += 1

        elif action_type == "freethrow":
            if person_id is not None and person_id != TEAM_ACTION_PERSON_ID:
                line = stats_by_player[person_id]
                line["free_throws_attempted"] += 1
                if made:
                    line["free_throws_made"] += 1
                    line["points"] += 1

        elif action_type == "rebound":
            if person_id is not None and person_id != TEAM_ACTION_PERSON_ID:
                line = stats_by_player[person_id]
                sub_type = event.get("subType")
                if sub_type == "offensive":
                    line["offensive_rebounds"] += 1
                    line["rebounds"] += 1
                elif sub_type == "defensive":
                    line["defensive_rebounds"] += 1
                    line["rebounds"] += 1
                # An unrecognised subType on an otherwise-valid rebound
                # event is left uncounted rather than guessed into either
                # bucket — event_validation doesn't constrain subType, so
                # this is the one place that silent gap could show up.

        elif action_type == "turnover":
            if person_id is not None and person_id != TEAM_ACTION_PERSON_ID:
                stats_by_player[person_id]["turnovers"] += 1
                steal_id = resolve_secondary_player(event["description"], "steals", roster, event.get("teamId"))
                if steal_id is not None:
                    stats_by_player[steal_id]["steals"] += 1

    return dict(stats_by_player)
