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
// style suffix in ITS description — see apps/ingestion/feed_translation.py
// for how PlayByPlayV3's rows become that form. GameEvent doesn't persist the
// raw names NBA supplied at ingestion time, so the roster here is built from
// Player.lastName and Player.firstName instead.
import type { GameEvent } from "@prisma/client";

export type CreditStat = "assists" | "steals" | "blocks";

const TEAM_ACTION_SENTINEL = null;

// The code each credit stat is written with in a description suffix.
export const CREDIT_SUFFIX_CODES: Record<CreditStat, string> = { assists: "AST", steals: "STL", blocks: "BLK" };

// Any characters but parentheses for the name: an ASCII-only class could
// never match an accented name.
const SECONDARY_PLAYER_PATTERNS: Record<CreditStat, RegExp> = {
  assists: /\(([^()]+?) (\d+) AST\)/,
  steals: /\(([^()]+?) (\d+) STL\)/,
  blocks: /\(([^()]+?) (\d+) BLK\)/,
};

// The team a credit comes from, relative to the team of the event it's on:
// an assist is a teammate of the shooter; a block or steal is the other side.
export const CREDIT_FROM_SAME_TEAM: Record<CreditStat, boolean> = { assists: true, blocks: false, steals: false };

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * A name with accents removed and case folded, for matching. NBA writes
 * "Jokić" as a player's name but "(Jokic 11 AST)" in credits, so raw
 * comparison dropped every credit for a player with an accented surname.
 * Mirrors derive_player_game_stats.fold_name.
 */
export function foldName(name: string): string {
  return name.normalize("NFKD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

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
  "eventType" | "subType" | "playerId" | "teamId" | "success" | "value" | "description"
>;

export interface PlayerName {
  firstName: string;
  lastName: string;
}

// What a credit suffix can be matched against, for one player.
export interface RosterEntry {
  surname: string; // folded
  firstInitial: string; // folded, one letter; "" if unknown
  teamId: string | null; // the team they played for in this game
}

// playerId -> name and team, restricted to players who actually acted in
// this game (mirrors build_game_roster: a player must appear as an actor in
// the game's own events to be resolvable as a credited player at all).
//
// `retainedTeamByPlayerId` (playerId -> their team in this game) names
// players who stay resolvable even without an event of their own. It has no
// Python counterpart because only an admin correction needs it: moving a
// player's only play to someone else would otherwise also drop every
// assist, block or steal credited to them on OTHER plays, a side effect the
// admin never asked for. Empty by default, so ingestion-equivalent callers
// (replay) behave exactly like the Python original.
export function buildGameRoster(
  events: DerivableGameEvent[],
  namesByPlayerId: Map<string, PlayerName>,
  retainedTeamByPlayerId: Map<string, string | null> = new Map(),
): Map<string, RosterEntry> {
  const roster = new Map<string, RosterEntry>();
  const addPlayer = (playerId: string, teamId: string | null) => {
    const name = namesByPlayerId.get(playerId);
    if (roster.has(playerId) || !name?.lastName) return;
    roster.set(playerId, {
      surname: foldName(name.lastName),
      firstInitial: foldName(name.firstName ?? "").slice(0, 1),
      teamId,
    });
  };
  for (const event of events) {
    if (event.playerId !== TEAM_ACTION_SENTINEL) addPlayer(event.playerId, event.teamId);
  }
  for (const [playerId, teamId] of retainedTeamByPlayerId) addPlayer(playerId, teamId);
  return roster;
}

// Whether a folded credit name ("jokic", "l. james", "st. curry") refers to
// this player. NBA writes a bare surname unless two players on a roster
// share it, then prefixes enough of the first name to tell them apart; the
// prefix must begin with the player's first initial. Mirrors
// credit_name_matches.
export function creditNameMatches(creditName: string, player: RosterEntry): boolean {
  if (creditName === player.surname) return true;
  if (!creditName.endsWith(` ${player.surname}`) || !player.firstInitial) return false;
  const prefix = creditName.slice(0, -player.surname.length).trim().replace(/\.$/, "");
  return prefix.startsWith(player.firstInitial);
}

// Extracts and resolves the "(Name N AST/STL/BLK)" suffix on one event's
// description to a playerId. When the name fits more than one player — two
// players share a surname, and NBA only disambiguates within a roster — the
// one on the expected side of the event's team (CREDIT_FROM_SAME_TEAM) is
// kept. Returns null when there's no suffix, or the name still doesn't
// narrow to exactly one player — never a guess. Mirrors
// resolve_secondary_player.
export function resolveSecondaryPlayer(
  description: string,
  stat: CreditStat,
  roster: Map<string, RosterEntry>,
  eventTeamId: string | null = null,
): string | null {
  const match = SECONDARY_PLAYER_PATTERNS[stat].exec(description);
  if (match === null) return null;

  const creditName = foldName(match[1]);
  let candidates = [...roster].filter(([, player]) => creditNameMatches(creditName, player)).map(([playerId]) => playerId);
  if (candidates.length > 1 && eventTeamId) {
    const fromSameTeam = CREDIT_FROM_SAME_TEAM[stat];
    candidates = candidates.filter((playerId) => (roster.get(playerId)!.teamId === eventTeamId) === fromSameTeam);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

// Aggregates one game's current GameEvent rows into playerId -> counting
// stats, exactly reproducing derive_player_game_stats.aggregate_player_
// game_stats' rules. `events` should be every GameEvent row for the game,
// already reflecting any correction just applied — this function does no
// validation of its own and trusts eventType/subType/playerId are
// well-formed, same as the Python original trusts actionType/subType/
// personId. `retainedTeamByPlayerId` is passed straight to buildGameRoster.
export function deriveGameEventStats(
  events: DerivableGameEvent[],
  namesByPlayerId: Map<string, PlayerName>,
  retainedTeamByPlayerId: Map<string, string | null> = new Map(),
): Map<string, CountingStats> {
  const roster = buildGameRoster(events, namesByPlayerId, retainedTeamByPlayerId);
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
    const { eventType, playerId, teamId, description } = event;
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
        const assistId = resolveSecondaryPlayer(description, "assists", roster, teamId);
        if (assistId !== null) lineFor(assistId).assists += 1;
      } else {
        const blockId = resolveSecondaryPlayer(description, "blocks", roster, teamId);
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
      const stealId = resolveSecondaryPlayer(description, "steals", roster, teamId);
      if (stealId !== null) lineFor(stealId).steals += 1;
    }
  }

  return statsByPlayer;
}
