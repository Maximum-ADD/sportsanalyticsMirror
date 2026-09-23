// Parses the JSON body of a correction, preview or undo request into typed
// values. Only shape is checked here (types, required reason); whether the
// corrected play makes sense is event-correction-rules.ts's job, because
// that needs the stored row and the game.
import type { CorrectableEvent } from "./event-correction-rules.js";

// Fields on GameEvent that an admin is allowed to correct — the identity
// and relational fields (id, gameId, sequence, batchId) are locked because
// changing them would break the audit trail's traceability to the original
// event.
export const CORRECTABLE_FIELDS = [
  "period",
  "clock",
  "eventType",
  "subType",
  "playerId",
  "teamId",
  "success",
  "value",
  "description",
] as const satisfies readonly (keyof CorrectableEvent)[];

export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
export type EventPatch = Partial<CorrectableEvent>;

export const MAX_REASON_LENGTH = 500;

export interface CorrectionRequest {
  patch: EventPatch;
  // Who gets the play's assist/block/steal credit: a playerId, null for
  // nobody, or undefined to leave the description's credit as it is.
  creditPlayerId?: string | null;
  reason: string;
}

type FieldParser = (value: unknown) => unknown;

const isString = (value: unknown): value is string => typeof value === "string";

function expectInteger(field: string, nullable: boolean): FieldParser {
  return (value) => {
    if (value === null && nullable) return null;
    if (typeof value === "number" && Number.isInteger(value)) return value;
    throw new Error(`${field} must be an integer${nullable ? " or null" : ""}`);
  };
}

function expectString(field: string, nullable: boolean): FieldParser {
  return (value) => {
    if (value === null && nullable) return null;
    if (isString(value)) return value;
    throw new Error(`${field} must be a string${nullable ? " or null" : ""}`);
  };
}

function expectBooleanOrNull(field: string): FieldParser {
  return (value) => {
    if (value === null || typeof value === "boolean") return value;
    throw new Error(`${field} must be true, false or null`);
  };
}

const FIELD_PARSERS: Record<CorrectableField, FieldParser> = {
  period: expectInteger("period", false),
  clock: expectString("clock", false),
  eventType: expectString("eventType", false),
  subType: expectString("subType", true),
  playerId: expectString("playerId", true),
  teamId: expectString("teamId", true),
  success: expectBooleanOrNull("success"),
  value: expectInteger("value", true),
  description: expectString("description", false),
};

/**
 * The trimmed reason from a request body.
 * @throws Error when it's missing, blank, not a string or too long.
 */
export function parseReason(raw: Record<string, unknown>): string {
  if (!isString(raw.reason) || raw.reason.trim().length === 0) {
    throw new Error("reason is required: say why this play is being corrected");
  }
  const reason = raw.reason.trim();
  if (reason.length > MAX_REASON_LENGTH) {
    throw new Error(`reason must be at most ${MAX_REASON_LENGTH} characters`);
  }
  return reason;
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Request body must be an object");
  }
  return body as Record<string, unknown>;
}

/**
 * Parses a correction (or preview) body: any CORRECTABLE_FIELDS, an
 * optional creditPlayerId and a required reason. Unknown keys are ignored.
 * @throws Error naming the first malformed field.
 */
export function parseCorrectEventBody(body: unknown): CorrectionRequest {
  const raw = asObject(body);
  const patch: Record<string, unknown> = {};
  for (const field of CORRECTABLE_FIELDS) {
    if (raw[field] !== undefined) patch[field] = FIELD_PARSERS[field](raw[field]);
  }

  const request: CorrectionRequest = { patch: patch as EventPatch, reason: "" };
  if (raw.creditPlayerId !== undefined) {
    request.creditPlayerId = expectString("creditPlayerId", true)(raw.creditPlayerId) as string | null;
  }
  if (Object.keys(patch).length === 0 && request.creditPlayerId === undefined) {
    throw new Error("At least one correctable field (or creditPlayerId) must be provided");
  }
  request.reason = parseReason(raw);
  return request;
}

/**
 * Parses an undo body, which only carries the reason.
 * @throws Error when the reason is missing or malformed.
 */
export function parseRevertBody(body: unknown): { reason: string } {
  return { reason: parseReason(asObject(body ?? {})) };
}
