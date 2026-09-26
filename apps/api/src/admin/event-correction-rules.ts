// Pure rules for an admin correction to one GameEvent: what a corrected
// event must look like to be accepted, and how an assist/block/steal credit
// is written into its description. DB-free, so every rule is unit-testable;
// AdminEventsService loads the game context these functions take.
//
// Every rule below was checked against real ingested 2025-26 play-by-play
// (April 2026 games, via apps/ingestion/play_by_play.py), so a play that was
// ingested unchanged still passes when an admin edits some other field:
//   - 2pt/3pt rows carry value 2/3 whether made or missed (NBA's shotValue)
//   - free throws carry value 0 made or missed; points come from `success`
//   - every other row carries value 0, legacy bookend rows null
//   - success is true/false on 2pt/3pt/freethrow and null everywhere else
//   - clocks are "PT11M30.00S"; rows from before play-by-play was ingested
//     use "12:00" / "0:00"
//   - team rebounds, timeouts and team turnovers have a team but no player;
//     heaves, instant replays, period markers and coach technicals have
//     neither
//   - a player's technical foul can name a player with no box-score row
//     (they didn't play), which is why an UNCHANGED player is never
//     re-checked against the roster
import {
  CREDIT_FROM_SAME_TEAM,
  CREDIT_SUFFIX_CODES,
  resolveSecondaryPlayer,
  type CreditStat,
  type PlayerName,
  type RosterEntry,
} from "./derive-player-game-stats.js";

/**
 * The platform's event vocabulary. Mirrors KNOWN_ACTION_TYPES in
 * apps/ingestion/event_validation.py; extend both together.
 */
export const KNOWN_EVENT_TYPES = [
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
  "heave",
] as const;

// Same bounds as event_validation.MIN_PERIOD / MAX_PERIOD.
export const MIN_PERIOD = 1;
export const MAX_PERIOD = 10;

// The longest period is regulation's 12 minutes.
const MAX_PERIOD_LENGTH_IN_SECONDS = 12 * 60;
const SECONDS_PER_MINUTE = 60;

const ISO_CLOCK_PATTERN = /^PT(\d{1,2})M(\d{1,2}(?:\.\d{1,2})?)S$/;
const LEGACY_CLOCK_PATTERN = /^(\d{1,2}):(\d{2})$/;

const MADE_OR_MISSED_EVENT_TYPES = new Set(["2pt", "3pt", "freethrow"]);
const SHOT_POINT_VALUES: Record<string, number> = { "2pt": 2, "3pt": 3 };
const FREE_THROW_POINT_VALUE = 1;
const NON_SCORING_VALUE = 0;
export const REBOUND_KINDS = ["offensive", "defensive"] as const;

// Group 1 is the credit's code (AST/BLK/STL).
const CREDIT_SUFFIX_PATTERN = /\s*\([^()]+? \d+ (AST|BLK|STL)\)/g;

/** The GameEvent fields an admin may correct. */
export interface CorrectableEvent {
  period: number;
  clock: string;
  eventType: string;
  subType: string | null;
  playerId: string | null;
  teamId: string | null;
  success: boolean | null;
  value: number | null;
  description: string;
}

/** What validateCorrectedEvent needs to know about the game. */
export interface CorrectionContext {
  homeTeamId: string;
  awayTeamId: string;
  // Players with a PlayerGameStat row for this game -> the team they played
  // for in it (null when no source records it).
  teamIdByRosterPlayerId: Map<string, string | null>;
  // The event's player before this correction. It is exempt from the
  // roster check: it was accepted at ingestion, and an admin who didn't
  // change it shouldn't be blocked by it.
  originalPlayerId: string | null;
}

/**
 * Seconds remaining in the period for a stored clock, in either the ISO
 * form ("PT11M30.00S") or the legacy one ("11:30"). Returns null for
 * anything else, including a time longer than a regulation period.
 */
export function parseClockInSeconds(clock: string): number | null {
  const match = ISO_CLOCK_PATTERN.exec(clock) ?? LEGACY_CLOCK_PATTERN.exec(clock);
  if (match === null) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds >= SECONDS_PER_MINUTE) return null;
  const totalSeconds = minutes * SECONDS_PER_MINUTE + seconds;
  return totalSeconds <= MAX_PERIOD_LENGTH_IN_SECONDS ? totalSeconds : null;
}

/**
 * Every rule the corrected event breaks, as admin-readable messages; empty
 * when it's valid. `event` is the stored row with the patch already merged
 * in, so a rule is checked against the play as it will be saved rather
 * than against the patch alone (changing a made 2pt to a rebound, say,
 * must also clear `success`).
 */
export function validateCorrectedEvent(event: CorrectableEvent, context: CorrectionContext): string[] {
  return [
    ...validateEventType(event),
    ...validatePeriodAndClock(event),
    ...validatePlayerAndTeam(event, context),
    ...validateSuccess(event),
    ...validateValue(event),
    ...validateSubType(event),
    ...validateDescription(event),
  ];
}

function validateEventType(event: CorrectableEvent): string[] {
  if ((KNOWN_EVENT_TYPES as readonly string[]).includes(event.eventType)) return [];
  return [`eventType "${event.eventType}" is not in the platform vocabulary (${KNOWN_EVENT_TYPES.join(", ")})`];
}

function validatePeriodAndClock(event: CorrectableEvent): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(event.period) || event.period < MIN_PERIOD || event.period > MAX_PERIOD) {
    errors.push(`period must be an integer from ${MIN_PERIOD} to ${MAX_PERIOD}, got ${event.period}`);
  }
  if (parseClockInSeconds(event.clock) === null) {
    errors.push(`clock "${event.clock}" is not a valid game clock (expected e.g. "PT11M30.00S", at most 12 minutes)`);
  }
  return errors;
}

function validatePlayerAndTeam(event: CorrectableEvent, context: CorrectionContext): string[] {
  const errors: string[] = [];
  const gameTeamIds = [context.homeTeamId, context.awayTeamId];
  if (event.teamId !== null && !gameTeamIds.includes(event.teamId)) {
    errors.push(`teamId ${event.teamId} is neither team in this game`);
  }
  if (event.playerId === null) return errors;

  const isOnRoster = context.teamIdByRosterPlayerId.has(event.playerId);
  if (!isOnRoster && event.playerId !== context.originalPlayerId) {
    errors.push(`playerId ${event.playerId} did not play in this game (no box-score row for it)`);
    return errors;
  }
  if (event.teamId === null) {
    errors.push("a play with a player must also have that player's team");
    return errors;
  }
  const playerTeamId = context.teamIdByRosterPlayerId.get(event.playerId) ?? null;
  if (playerTeamId !== null && playerTeamId !== event.teamId) {
    errors.push("teamId does not match the team the player played for in this game");
  }
  return errors;
}

function validateSuccess(event: CorrectableEvent): string[] {
  const takesSuccess = MADE_OR_MISSED_EVENT_TYPES.has(event.eventType);
  if (takesSuccess && event.success === null) {
    return [`a ${event.eventType} must be marked made or missed (success true or false)`];
  }
  if (!takesSuccess && event.success !== null) {
    return [`success only applies to 2pt, 3pt and freethrow plays, not ${event.eventType}; set it to null`];
  }
  return [];
}

/** The values `value` may take for this type of play (null always allowed). */
function allowedValuesFor(event: CorrectableEvent): number[] {
  const shotPoints = SHOT_POINT_VALUES[event.eventType];
  if (shotPoints !== undefined) return [shotPoints];
  if (event.eventType === "freethrow") {
    return event.success === true ? [NON_SCORING_VALUE, FREE_THROW_POINT_VALUE] : [NON_SCORING_VALUE];
  }
  return [NON_SCORING_VALUE];
}

function validateValue(event: CorrectableEvent): string[] {
  if (event.value === null) return [];
  const allowedValues = allowedValuesFor(event);
  if (Number.isInteger(event.value) && allowedValues.includes(event.value)) return [];
  const madeOrMissed = event.success === null ? "" : event.success ? "made " : "missed ";
  return [`value ${event.value} doesn't fit a ${madeOrMissed}${event.eventType} (allowed: ${allowedValues.join(" or ")}, or null)`];
}

function validateSubType(event: CorrectableEvent): string[] {
  if (event.eventType !== "rebound" || event.subType === null) return [];
  if ((REBOUND_KINDS as readonly string[]).includes(event.subType)) return [];
  return [`a rebound's subType must be "offensive", "defensive" or null, got "${event.subType}"`];
}

function validateDescription(event: CorrectableEvent): string[] {
  return event.description.trim().length > 0 ? [] : ["description must not be empty"];
}

/**
 * Which credit a play can carry: an assist on a made shot, a block on a
 * missed shot, a steal on a turnover. Null for every other play.
 */
export function creditStatFor(event: Pick<CorrectableEvent, "eventType" | "success">): CreditStat | null {
  if (event.eventType === "2pt" || event.eventType === "3pt") {
    return event.success === true ? "assists" : event.success === false ? "blocks" : null;
  }
  return event.eventType === "turnover" ? "steals" : null;
}

/** A description with every "(Name N AST|BLK|STL)" credit suffix removed. */
export function stripCreditSuffixes(description: string): string {
  return description.replace(CREDIT_SUFFIX_PATTERN, "").trim();
}

/**
 * Whether the description carries a credit suffix this play can't take,
 * e.g. an assist left over on a shot corrected from made to missed. `stat`
 * is the credit the play can take, or null for none.
 */
export function hasInapplicableCreditSuffix(description: string, stat: CreditStat | null): boolean {
  const applicableCode = stat === null ? null : CREDIT_SUFFIX_CODES[stat];
  return [...description.matchAll(CREDIT_SUFFIX_PATTERN)].some((match) => match[1] !== applicableCode);
}

/** The credited player an admin picked, with what's needed to name them. */
export interface CreditedPlayer {
  playerId: string;
  name: PlayerName;
}

export interface CreditRewriteInput {
  event: CorrectableEvent;
  stat: CreditStat;
  creditedPlayer: CreditedPlayer;
  // This game's credit roster, exactly as the derivation will build it.
  roster: Map<string, RosterEntry>;
  // How many of this credit the player already has on earlier plays; the
  // suffix's count is this + 1. Cosmetic: the derivation ignores it.
  earlierCreditCount: number;
}

export type CreditRewriteResult = { description: string } | { error: string };

/**
 * Writes `creditedPlayer` into the event's description as the suffix the
 * derivation reads, replacing any credit suffix already there.
 *
 * The name is written the way NBA does: a bare surname, or the surname
 * after as much of the first name as it takes to be unambiguous in this
 * game ("L. James", "Jal. Williams"). Each form is checked by
 * running the real resolveSecondaryPlayer over the rewritten description,
 * and the first that resolves to exactly this player is used, so a saved
 * credit always counts for the player the admin picked. Returns an error
 * instead when the player is on the wrong side (an assist must come from
 * the shooter's team, a block or steal from the other team), is the play's
 * own player, or can't be named unambiguously.
 */
export function rewriteCreditSuffix(input: CreditRewriteInput): CreditRewriteResult {
  const { event, stat, creditedPlayer, roster } = input;
  const displayName = `${creditedPlayer.name.firstName} ${creditedPlayer.name.lastName}`.trim();
  const sideError = findCreditSideError(input, displayName);
  if (sideError !== null) return { error: sideError };

  const baseDescription = stripCreditSuffixes(event.description);
  const suffixCode = CREDIT_SUFFIX_CODES[stat];
  const creditCount = input.earlierCreditCount + 1;
  for (const creditName of creditNameCandidates(creditedPlayer.name)) {
    const description = `${baseDescription} (${creditName} ${creditCount} ${suffixCode})`;
    if (resolveSecondaryPlayer(description, stat, roster, event.teamId) === creditedPlayer.playerId) {
      return { description };
    }
  }
  return {
    error: `${displayName} can't be credited: their name matches another player in this game, so the stats derivation couldn't tell them apart`,
  };
}

/** A reason the credited player can't take this credit, or null. */
function findCreditSideError(input: CreditRewriteInput, displayName: string): string | null {
  const { event, stat, creditedPlayer, roster } = input;
  const rosterEntry = roster.get(creditedPlayer.playerId);
  if (rosterEntry === undefined) {
    return `${displayName} can't be credited: they have no play of their own in this game, so the stats derivation can't resolve a credit to them`;
  }
  if (creditedPlayer.playerId === event.playerId) {
    return `${displayName} can't be credited on their own play`;
  }
  const isSameTeam = rosterEntry.teamId === event.teamId;
  if (isSameTeam !== CREDIT_FROM_SAME_TEAM[stat]) {
    return stat === "assists"
      ? `${displayName} can't be credited with the assist: an assist must come from the shooter's team`
      : `${displayName} can't be credited with the ${stat === "blocks" ? "block" : "steal"}: it must come from the other team`;
  }
  return null;
}

/**
 * The ways NBA writes a credited name, shortest first: the bare surname,
 * then the surname after ever-longer starts of the first name
 * ("J. Williams", "Ja. Williams", "Jal. Williams", ...). NBA uses the
 * shortest one that tells two players apart, so trying them in this order
 * writes a credit the way NBA would have. A trailing dot in the first name
 * itself ("P.J.") is dropped, so no prefix ever ends in two dots.
 */
function creditNameCandidates(name: PlayerName): string[] {
  const firstName = name.firstName.trim();
  const prefixes = Array.from({ length: firstName.length }, (_, index) => firstName.slice(0, index + 1).replace(/\.+$/, ""));
  const distinctPrefixes = [...new Set(prefixes)].filter((prefix) => prefix !== "");
  return [name.lastName, ...distinctPrefixes.map((prefix) => `${prefix}. ${name.lastName}`)];
}
