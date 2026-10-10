// Parses and validates the body of a human-submitted game's play-by-play —
// the Basic tier's "only approved submitters" gap: until now the only way
// events reached GameEvent was apps/ingestion's automated pipeline. This is
// the human path, built to land in the exact same place: a PENDING_REVIEW
// IngestionBatch an admin approves or rejects through the existing Batches
// tab (see admin-batches.controller.ts), never a second, looser way in.
//
// Shape and per-event schema validation live here, reusing
// event-correction-rules.ts's KNOWN_EVENT_TYPES/period/clock/value rules —
// the same vocabulary a correction is held to. What that module doesn't
// check (sequence is strictly increasing, since a correction touches one
// already-sequenced row and never needs to) is checked here instead.
import {
  KNOWN_EVENT_TYPES,
  MAX_PERIOD,
  MIN_PERIOD,
  REBOUND_KINDS,
  parseClockInSeconds,
} from "./event-correction-rules.js";

export interface SubmittedEvent {
  sequence: number;
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

export interface ManualSubmissionRequest {
  events: SubmittedEvent[];
  // Minutes played, by this project's own Player.id — required per player
  // appearing in `events` because, unlike the automated pipeline, a human
  // submission has no BoxScoreTraditionalV3 call behind it to source
  // minutes from (see PlayerGameStat's schema doc comment: minutes is
  // deliberately not event-derived). A player who appears in events but is
  // missing here fails validation rather than silently getting 0 minutes.
  minutesByPlayerId: Record<string, number>;
}

const MADE_OR_MISSED_EVENT_TYPES = new Set(["2pt", "3pt", "freethrow"]);
const SHOT_POINT_VALUES: Record<string, number> = { "2pt": 2, "3pt": 3 };
const FREE_THROW_POINT_VALUE = 1;
const NON_SCORING_VALUE = 0;

export const MAX_EVENTS_PER_SUBMISSION = 1000;

/**
 * Parses a raw request body into typed events and minutes, checking shape
 * only (every field is the right type, `events` is non-empty and under the
 * size ceiling). Throws naming the first problem — mirrors
 * parseCorrectEventBody's "throw Error, the controller catches it" contract.
 */
export function parseManualSubmissionBody(body: unknown): ManualSubmissionRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body must be an object");
  }
  const raw = body as Record<string, unknown>;

  if (!Array.isArray(raw.events) || raw.events.length === 0) {
    throw new Error("events must be a non-empty array");
  }
  if (raw.events.length > MAX_EVENTS_PER_SUBMISSION) {
    throw new Error(`events must have at most ${MAX_EVENTS_PER_SUBMISSION} rows (got ${raw.events.length})`);
  }

  const events = raw.events.map((rawEvent, index) => parseSubmittedEvent(rawEvent, index));

  if (typeof raw.minutesByPlayerId !== "object" || raw.minutesByPlayerId === null || Array.isArray(raw.minutesByPlayerId)) {
    throw new Error("minutesByPlayerId must be an object mapping playerId to minutes");
  }
  const minutesByPlayerId: Record<string, number> = {};
  for (const [playerId, minutes] of Object.entries(raw.minutesByPlayerId as Record<string, unknown>)) {
    if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0) {
      throw new Error(`minutesByPlayerId.${playerId} must be a non-negative integer`);
    }
    minutesByPlayerId[playerId] = minutes;
  }

  return { events, minutesByPlayerId };
}

function parseSubmittedEvent(rawEvent: unknown, index: number): SubmittedEvent {
  if (typeof rawEvent !== "object" || rawEvent === null) {
    throw new Error(`events[${index}] must be an object`);
  }
  const event = rawEvent as Record<string, unknown>;
  const at = (field: string) => `events[${index}].${field}`;

  if (!Number.isInteger(event.sequence)) throw new Error(`${at("sequence")} must be an integer`);
  if (!Number.isInteger(event.period)) throw new Error(`${at("period")} must be an integer`);
  if (typeof event.clock !== "string") throw new Error(`${at("clock")} must be a string`);
  if (typeof event.eventType !== "string") throw new Error(`${at("eventType")} must be a string`);
  if (event.subType !== null && typeof event.subType !== "string") throw new Error(`${at("subType")} must be a string or null`);
  if (event.playerId !== null && typeof event.playerId !== "string") throw new Error(`${at("playerId")} must be a string or null`);
  if (event.teamId !== null && typeof event.teamId !== "string") throw new Error(`${at("teamId")} must be a string or null`);
  if (event.success !== null && typeof event.success !== "boolean") throw new Error(`${at("success")} must be true, false or null`);
  if (event.value !== null && !Number.isInteger(event.value)) throw new Error(`${at("value")} must be an integer or null`);
  if (typeof event.description !== "string") throw new Error(`${at("description")} must be a string`);

  return {
    sequence: event.sequence as number,
    period: event.period as number,
    clock: event.clock as string,
    eventType: event.eventType as string,
    subType: (event.subType as string | null) ?? null,
    playerId: (event.playerId as string | null) ?? null,
    teamId: (event.teamId as string | null) ?? null,
    success: (event.success as boolean | null) ?? null,
    value: (event.value as number | null) ?? null,
    description: event.description as string,
  };
}

/** What validateSubmittedEvents needs to know about the game and its two rosters. */
export interface SubmissionContext {
  homeTeamId: string;
  awayTeamId: string;
  // Every player on either team's CURRENT roster -> their team. A fresh
  // submission has no stat rows yet to build this from the way a
  // correction does (see game-snapshot.ts's resolveGameTeamByPlayerId) —
  // this reads straight off Player.teamId instead, which is the best
  // source available before any box score exists for the game.
  teamIdByPlayerId: Map<string, string>;
}

/**
 * Every problem with a submitted batch of events, as admin-readable
 * messages; empty when the whole batch is acceptable. Checks the batch as
 * a whole (sequence ordering, duplicates) in addition to each event's own
 * shape — the per-event checks mirror validateCorrectedEvent's rules
 * exactly, so a submitted play is held to the same bar as a corrected one.
 */
export function validateSubmittedEvents(events: SubmittedEvent[], context: SubmissionContext): string[] {
  const errors: string[] = [];
  const gameTeamIds = [context.homeTeamId, context.awayTeamId];

  let previousSequence: number | null = null;
  const seenSequences = new Set<number>();
  for (const event of events) {
    if (seenSequences.has(event.sequence)) {
      errors.push(`sequence ${event.sequence} appears more than once`);
    }
    seenSequences.add(event.sequence);
    if (previousSequence !== null && event.sequence <= previousSequence) {
      errors.push(`sequence ${event.sequence} is not strictly increasing after ${previousSequence} — events must be submitted in order`);
    }
    previousSequence = event.sequence;

    errors.push(...validateOneEvent(event, context, gameTeamIds));
  }

  return errors;
}

function validateOneEvent(event: SubmittedEvent, context: SubmissionContext, gameTeamIds: string[]): string[] {
  const errors: string[] = [];
  const prefix = `sequence ${event.sequence}`;

  if (!(KNOWN_EVENT_TYPES as readonly string[]).includes(event.eventType)) {
    errors.push(`${prefix}: eventType "${event.eventType}" is not in the platform vocabulary (${KNOWN_EVENT_TYPES.join(", ")})`);
  }
  if (event.period < MIN_PERIOD || event.period > MAX_PERIOD) {
    errors.push(`${prefix}: period must be from ${MIN_PERIOD} to ${MAX_PERIOD}, got ${event.period}`);
  }
  if (parseClockInSeconds(event.clock) === null) {
    errors.push(`${prefix}: clock "${event.clock}" is not a valid game clock (expected e.g. "PT11M30.00S", at most 12 minutes)`);
  }

  if (event.teamId !== null && !gameTeamIds.includes(event.teamId)) {
    errors.push(`${prefix}: teamId ${event.teamId} is neither team in this game`);
  }
  if (event.playerId !== null) {
    const rosterTeamId = context.teamIdByPlayerId.get(event.playerId);
    if (rosterTeamId === undefined) {
      errors.push(`${prefix}: playerId ${event.playerId} is not on either team's current roster`);
    } else if (event.teamId === null) {
      errors.push(`${prefix}: a play with a player must also have that player's team`);
    } else if (rosterTeamId !== event.teamId) {
      errors.push(`${prefix}: teamId does not match the team ${event.playerId} is rostered to`);
    }
  }

  const takesSuccess = MADE_OR_MISSED_EVENT_TYPES.has(event.eventType);
  if (takesSuccess && event.success === null) {
    errors.push(`${prefix}: a ${event.eventType} must be marked made or missed (success true or false)`);
  } else if (!takesSuccess && event.success !== null) {
    errors.push(`${prefix}: success only applies to 2pt, 3pt and freethrow plays, not ${event.eventType}`);
  }

  if (event.value !== null) {
    const allowedValues = allowedValuesFor(event);
    if (!allowedValues.includes(event.value)) {
      errors.push(`${prefix}: value ${event.value} doesn't fit this play (allowed: ${allowedValues.join(" or ")}, or null)`);
    }
  }

  if (event.eventType === "rebound" && event.subType !== null && !(REBOUND_KINDS as readonly string[]).includes(event.subType)) {
    errors.push(`${prefix}: a rebound's subType must be "offensive", "defensive" or null, got "${event.subType}"`);
  }

  if (event.description.trim().length === 0) {
    errors.push(`${prefix}: description must not be empty`);
  }

  return errors;
}

function allowedValuesFor(event: SubmittedEvent): number[] {
  const shotPoints = SHOT_POINT_VALUES[event.eventType];
  if (shotPoints !== undefined) return [shotPoints];
  if (event.eventType === "freethrow") {
    return event.success === true ? [NON_SCORING_VALUE, FREE_THROW_POINT_VALUE] : [NON_SCORING_VALUE];
  }
  return [NON_SCORING_VALUE];
}
