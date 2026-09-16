// TypeScript port of apps/ingestion/derive_player_game_stats.py's aggregation
// rules, run against this project's OWN stored GameEvent rows instead of a
// fresh nba_api response. The Python pipeline derives stats once, at
// ingestion time, from events it just fetched; this module re-derives them
// on demand, from whatever GameEvent rows are in the database right now —
// which is what lets AdminEventsService.correctEvent bring every derived
// stat for a game back in line immediately after a single correction,
// instead of requiring a full pipeline re-run over that game.
//
// Keyed by this project's own internal Player.id (uuid) throughout, not
// NBA's personId — GameEvent.playerId already resolves to the right player
// directly, so there's no need to round-trip through NBA's numeric id the
// way the Python module does. The one place name resolution is still
// needed is exactly where the Python module needs it: assist/steal/block
// credit is never a field on the event that earns it, only a "(Name N AST)"
// style suffix in ITS description — see event_validation.py and
// derive_player_game_stats.py's own module docstring for why. GameEvent
// doesn't persist the raw playerName NBA supplied at ingestion time, so the
// roster name index here is built from Player.lastName instead — the same
// surname NBA's own play-by-play feed uses in that suffix.
import type { GameEvent } from "@prisma/client";

const TEAM_ACTION_SENTINEL = null;

const SECONDARY_PLAYER_PATTERNS: Record<"assists" | "steals" | "blocks", RegExp> = {
  assists: /\(([A-Za-z.\-' ]+?) (\d+) AST\)/,
  steals: /\(([A-Za-z.\-' ]+?) (\d+) STL\)/,
  blocks: /\(([A-Za-z.\-' ]+?) (\d+) BLK\)/,
};

export const COUNTING_STAT_FIELDS = [
  "points",
  "fieldGoalsMade",
  "fieldGoalsAttempted",
  "threesMade",
  "threesAttempted",
  "freeThrowsMade",
  "freeThrowsAttempted",
  "offensiveRebounds",
  "defensiveRebounds",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
] as const;

export type CountingStatField = (typeof COUNTING_STAT_FIELDS)[number];
export type CountingStats = Record<CountingStatField, number>;

function emptyStatLine(): CountingStats {
  const line = {} as CountingStats;
  for (const field of COUNTING_STAT_FIELDS) line[field] = 0;
  return line;
}

// The subset of GameEvent fields the aggregation rules below actually read —
// callers pass real Prisma GameEvent rows straight through.
export type DerivableGameEvent = Pick<
  GameEvent,
  "eventType" | "subType" | "playerId" | "success" | "value" | "description"
>;

// Surname -> every playerId sharing it, restricted to players who actually
// acted in this game (mirrors build_roster_name_index: a player must
// appear as an actor somewhere in the game's own events to be resolvable as
// a secondary player at all).
export function buildRosterNameIndex(
  events: DerivableGameEvent[],
  lastNameByPlayerId: Map<string, string>,
): Map<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.playerId === TEAM_ACTION_SENTINEL) continue;
    const lastName = lastNameByPlayerId.get(event.playerId);
    if (!lastName) continue;
    const ids = index.get(lastName) ?? new Set<string>();
    ids.add(event.playerId);
    index.set(lastName, ids);
  }
  const result = new Map<string, string[]>();
  for (const [name, ids] of index) result.set(name, [...ids].sort());
  return result;
}

// Extracts and resolves the "(Name N AST/STL/BLK)" suffix on one event's
// description. Returns null when there's no such suffix (a genuinely
// unassisted shot, an unblocked miss, an unstolen turnover), or when the
// extracted name doesn't resolve to exactly one known player in this game
// (unresolved/ambiguous) — never a guess.
export function resolveSecondaryPlayer(
  description: string,
  stat: "assists" | "steals" | "blocks",
  rosterByName: Map<string, string[]>,
): string | null {
  const match = SECONDARY_PLAYER_PATTERNS[stat].exec(description);
  if (match === null) return null;

  const candidates = rosterByName.get(match[1].trim());
  if (candidates === undefined || candidates.length !== 1) return null;
  return candidates[0];
}

// Aggregates one game's current GameEvent rows into playerId -> counting
// stats, exactly reproducing derive_player_game_stats.aggregate_player_
// game_stats' rules. `events` should be every GameEvent row for the game,
// already reflecting any correction just applied — this function does no
// validation of its own and trusts eventType/subType/playerId are
// well-formed, same as the Python original trusts actionType/subType/
// personId.
export function deriveGameEventStats(
  events: DerivableGameEvent[],
  lastNameByPlayerId: Map<string, string>,
): Map<string, CountingStats> {
  const rosterByName = buildRosterNameIndex(events, lastNameByPlayerId);
  const statsByPlayer = new Map<string, CountingStats>();

  const lineFor = (playerId: string): CountingStats => {
    let line = statsByPlayer.get(playerId);
    if (line === undefined) {
      line = emptyStatLine();
      statsByPlayer.set(playerId, line);
    }
    return line;
  };

  for (const event of events) {
    const { eventType, playerId, description } = event;
    const made = event.success === true;

    if (eventType === "2pt" || eventType === "3pt") {
      if (playerId === TEAM_ACTION_SENTINEL) continue;
      const line = lineFor(playerId);
      line.fieldGoalsAttempted += 1;
      if (eventType === "3pt") line.threesAttempted += 1;
      if (made) {
        line.fieldGoalsMade += 1;
        const shotValue = event.value ?? (eventType === "3pt" ? 3 : 2);
        line.points += shotValue;
        if (eventType === "3pt") line.threesMade += 1;
        const assistId = resolveSecondaryPlayer(description, "assists", rosterByName);
        if (assistId !== null) lineFor(assistId).assists += 1;
      } else {
        const blockId = resolveSecondaryPlayer(description, "blocks", rosterByName);
        if (blockId !== null) lineFor(blockId).blocks += 1;
      }
    } else if (eventType === "freethrow") {
      if (playerId === TEAM_ACTION_SENTINEL) continue;
      const line = lineFor(playerId);
      line.freeThrowsAttempted += 1;
      if (made) {
        line.freeThrowsMade += 1;
        line.points += 1;
      }
    } else if (eventType === "rebound") {
      if (playerId === TEAM_ACTION_SENTINEL) continue;
      const line = lineFor(playerId);
      if (event.subType === "offensive") {
        line.offensiveRebounds += 1;
        line.rebounds += 1;
      } else if (event.subType === "defensive") {
        line.defensiveRebounds += 1;
        line.rebounds += 1;
      }
    } else if (eventType === "turnover") {
      if (playerId === TEAM_ACTION_SENTINEL) continue;
      lineFor(playerId).turnovers += 1;
      const stealId = resolveSecondaryPlayer(description, "steals", rosterByName);
      if (stealId !== null) lineFor(stealId).steals += 1;
    }
  }

  return statsByPlayer;
}
