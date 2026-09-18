"""Aggregates one game's accepted GameEvent-shaped rows into per-player
PlayerGameStat counting stats — the actual "derived from a record of the
individual events... rather than stored as a total that somebody typed in"
the brief asks for.

Pure and DB/network-free, like event_validation.py and
apps/predictor/four_factors.py's compute_* functions: takes event dicts in,
returns a plain dict out, unit-testable with hand-built fixtures.

PlayByPlayV3 has no dedicated assistPersonId/stealPersonId/blockPersonId
fields (confirmed against the installed nba_api source — that richer shape
belongs to a different, real-time-only feed) — NBA embeds them as a
free-text suffix on the relevant row's description instead, e.g.:
  "Curry 26' 3PT Jump Shot (31 PTS) (Green 7 AST)"
  "MISS Doncic 15' Jump Shot (Gobert 2 BLK)"
  "Morant Bad Pass Turnover (P1.T3) (Holiday 3 STL)"
resolve_secondary_player below regexes these out and resolves the named
player against this game's own roster — never a database lookup, and never
a guess when the name doesn't resolve cleanly.

Deliberately excluded: minutes and plusMinus. See PlayerGameStat's schema
doc comment for why (on-court time needs a full substitution-event replay
to recover correctly; this project keeps sourcing both from the official
boxscore/PlayerGameLogs feeds instead of reinventing a number they already
provide).
"""

import re
from collections import defaultdict

# NBA's sentinel for a team-level action (a team rebound, a shot-clock
# turnover) — see event_validation.py's TEAM_ACTION_PERSON_ID. Repeated
# here rather than imported so this module has zero dependency on the
# validation module; they document the same fact independently.
TEAM_ACTION_PERSON_ID = 0

SECONDARY_PLAYER_PATTERNS = {
    "assists": re.compile(r"\(([A-Za-z.\-' ]+?) (\d+) AST\)"),
    "steals": re.compile(r"\(([A-Za-z.\-' ]+?) (\d+) STL\)"),
    "blocks": re.compile(r"\(([A-Za-z.\-' ]+?) (\d+) BLK\)"),
}

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


def build_roster_name_index(events: list[dict]) -> dict[str, list[int]]:
    """Surname -> every personId sharing it, from this game's own events.

    Every player who does anything in a game appears at least once with
    both personId and playerName, so this needs no external roster lookup.
    A list (not a single id) so an ambiguous surname is detectable rather
    than silently resolved to whichever player happened to be seen first.
    """
    index: dict[str, set[int]] = defaultdict(set)
    for event in events:
        person_id = event.get("personId")
        player_name = event.get("playerName")
        if person_id is None or person_id == TEAM_ACTION_PERSON_ID or not player_name:
            continue
        index[player_name.strip()].add(person_id)
    return {name: sorted(ids) for name, ids in index.items()}


def resolve_secondary_player(description: str, stat: str, roster_by_name: dict[str, list[int]]) -> int | None:
    """Extracts and resolves the "(Name N AST/STL/BLK)" suffix on one event's description.

    Returns None when there's no such suffix (a genuinely unassisted shot,
    an unblocked miss, an unstolen turnover — not missing data), or when
    the extracted name doesn't resolve to exactly one known player in this
    game (unresolved/ambiguous) — never a guess.
    """
    pattern = SECONDARY_PLAYER_PATTERNS[stat]
    match = pattern.search(description)
    if match is None:
        return None

    name = match.group(1).strip()
    candidates = roster_by_name.get(name)
    if candidates is None or len(candidates) != 1:
        return None
    return candidates[0]


def aggregate_player_game_stats(events: list[dict]) -> dict[int, dict]:
    """Aggregates one game's accepted events into nba_player_id -> counting stats.

    `events` must already be the ACCEPTED rows for a single game (see
    event_validation.validate_raw_event) — this function trusts actionType/
    subType/personId are well-formed and does no further validation of its
    own. Team-attributed actions (TEAM_ACTION_PERSON_ID) never contribute
    to any player's totals.
    """
    roster_by_name = build_roster_name_index(events)
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
                assist_id = resolve_secondary_player(event["description"], "assists", roster_by_name)
                if assist_id is not None:
                    stats_by_player[assist_id]["assists"] += 1
            else:
                block_id = resolve_secondary_player(event["description"], "blocks", roster_by_name)
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
                steal_id = resolve_secondary_player(event["description"], "steals", roster_by_name)
                if steal_id is not None:
                    stats_by_player[steal_id]["steals"] += 1

    return dict(stats_by_player)
