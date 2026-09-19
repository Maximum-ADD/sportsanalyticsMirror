// Pure helpers for the Corrections tab's edit form: labels for the
// platform's event vocabulary, which credit a play can take, and turning
// the form into a correction request that only carries what changed. The
// API validates everything again; these only keep the form honest.
import type { AdminGameEvent, AdminRosterPlayer, CorrectionRequestBody } from "@/lib/adminApi";
import { formatGameClock, parseTypedGameClock } from "@/lib/gameClock";

export type CreditStat = "assists" | "blocks" | "steals";

export const CREDIT_LABELS: Record<CreditStat, string> = {
  assists: "Assisted by",
  blocks: "Blocked by",
  steals: "Stolen by",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  "2pt": "2-pt shot",
  "3pt": "3-pt shot",
  freethrow: "Free throw",
  rebound: "Rebound",
  turnover: "Turnover",
  foul: "Foul",
  violation: "Violation",
  timeout: "Timeout",
  substitution: "Substitution",
  jumpball: "Jump ball",
  ejection: "Ejection",
  period: "Period",
  game: "Game",
  "instant replay": "Instant replay",
  heave: "Heave",
};

const MADE_OR_MISSED_EVENT_TYPES = new Set(["2pt", "3pt", "freethrow"]);
const SHOT_POINT_VALUES: Record<string, number> = { "2pt": 2, "3pt": 3 };
const FREE_THROW_POINT_VALUE = 1;
const NON_SCORING_VALUE = 0;
const REGULATION_PERIODS = 4;

// Group 1 is the credit's code (AST/BLK/STL).
const CREDIT_SUFFIX_PATTERN = /\s*\([^()]+? \d+ (AST|BLK|STL)\)/g;

/** A play type's display name ("3pt" -> "3-pt shot"); unknown types as-is. */
export function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

/** "Q1".."Q4", then "OT1", "OT2", ... */
export function formatPeriod(period: number): string {
  return period <= REGULATION_PERIODS ? `Q${period}` : `OT${period - REGULATION_PERIODS}`;
}

export function takesMadeOrMissed(eventType: string): boolean {
  return MADE_OR_MISSED_EVENT_TYPES.has(eventType);
}

/**
 * The credit a play can carry: an assist on a made shot, a block on a
 * missed shot, a steal on a turnover; null otherwise. Mirrors the API's
 * creditStatFor.
 */
export function creditStatFor(eventType: string, success: boolean | null): CreditStat | null {
  if (eventType === "2pt" || eventType === "3pt") {
    return success === true ? "assists" : success === false ? "blocks" : null;
  }
  return eventType === "turnover" ? "steals" : null;
}

/**
 * The description split into its narrative text and its trailing
 * "(Name N AST|BLK|STL)" credit suffix(es). The credit is edited through
 * the credit picker, so the form only lets an admin edit the text part.
 */
export function splitDescription(description: string): { text: string; creditSuffix: string } {
  const creditSuffix = [...description.matchAll(CREDIT_SUFFIX_PATTERN)].map((match) => match[0]).join("");
  return { text: description.replace(CREDIT_SUFFIX_PATTERN, "").trim(), creditSuffix };
}

/** The values a play's `value` may hold. Mirrors the API's rule. */
function allowedValuesFor(eventType: string, success: boolean | null): number[] {
  const shotPoints = SHOT_POINT_VALUES[eventType];
  if (shotPoints !== undefined) return [shotPoints];
  if (eventType === "freethrow") return success === true ? [NON_SCORING_VALUE, FREE_THROW_POINT_VALUE] : [NON_SCORING_VALUE];
  return [NON_SCORING_VALUE];
}

/**
 * The `value` a corrected play should carry: the current one while it
 * still fits the play type, otherwise the type's usual value as ingested
 * plays carry it (2 or 3 on shots, 0 on everything else, free throws
 * included).
 */
export function valueForPlay(eventType: string, success: boolean | null, currentValue: number | null): number | null {
  if (currentValue === null || allowedValuesFor(eventType, success).includes(currentValue)) return currentValue;
  return SHOT_POINT_VALUES[eventType] ?? NON_SCORING_VALUE;
}

export type MadeOrMissed = "made" | "missed" | "";
export type ReboundKind = "offensive" | "defensive" | "";

/** The edit form's state: everything as the inputs hold it. */
export interface PlayFormState {
  period: number;
  clock: string; // as typed, "m:ss"
  playerId: string; // "" = team play (no player)
  teamId: string; // "" = no team
  eventType: string;
  madeOrMissed: MadeOrMissed;
  reboundKind: ReboundKind; // "" = unclassified
  creditPlayerId: string; // "" = no credit
  descriptionText: string;
  reason: string;
}

function toMadeOrMissed(success: boolean | null): MadeOrMissed {
  return success === true ? "made" : success === false ? "missed" : "";
}

/** A fresh form for editing `event`, showing its current values. */
export function createPlayForm(event: AdminGameEvent): PlayFormState {
  return {
    period: event.period,
    clock: formatGameClock(event.clock),
    playerId: event.playerId ?? "",
    teamId: event.teamId ?? "",
    eventType: event.eventType,
    madeOrMissed: toMadeOrMissed(event.success),
    reboundKind: event.eventType === "rebound" && (event.subType === "offensive" || event.subType === "defensive") ? event.subType : "",
    creditPlayerId: event.creditPlayerId ?? "",
    descriptionText: splitDescription(event.description).text,
    reason: "",
  };
}

/** The success flag a made/missed choice stands for ("" = not chosen). */
export function madeOrMissedToSuccess(madeOrMissed: MadeOrMissed): boolean | null {
  return madeOrMissed === "made" ? true : madeOrMissed === "missed" ? false : null;
}

/** The success a corrected play should carry: null on plays that aren't shots. */
export function successFromForm(form: Pick<PlayFormState, "eventType" | "madeOrMissed">): boolean | null {
  return takesMadeOrMissed(form.eventType) ? madeOrMissedToSuccess(form.madeOrMissed) : null;
}

/** The subType a corrected play should carry. */
function subTypeFromForm(event: AdminGameEvent, form: PlayFormState): string | null {
  if (form.eventType === "rebound") return form.reboundKind || null;
  // A rebound's "offensive"/"defensive" means nothing on another play type.
  return event.eventType === "rebound" ? null : event.subType;
}

export type CorrectionBuildResult = { body: CorrectionRequestBody } | { error: string };

/**
 * The correction request for `form`: only the fields that differ from
 * `event`, plus the credit whenever the play's credit changes (including
 * when a new play type can't take the old credit, so its suffix goes too)
 * and the reason. Returns an error instead for anything the form can
 * already tell is wrong.
 */
export function buildCorrectionBody(event: AdminGameEvent, form: PlayFormState): CorrectionBuildResult {
  const reason = form.reason.trim();
  if (!reason) return { error: "Give a reason for this correction." };
  const clock = form.clock.trim() === formatGameClock(event.clock) ? event.clock : parseTypedGameClock(form.clock);
  if (clock === null) return { error: "Clock must be m:ss (at most 12:00), e.g. 7:45." };
  const success = successFromForm(form);
  if (takesMadeOrMissed(form.eventType) && success === null) return { error: "Choose made or missed." };
  const { text: currentText, creditSuffix } = splitDescription(event.description);
  const descriptionText = form.descriptionText.trim();
  if (!descriptionText) return { error: "The description can't be empty." };

  const corrected = {
    period: form.period,
    clock,
    eventType: form.eventType,
    subType: subTypeFromForm(event, form),
    playerId: form.playerId || null,
    teamId: form.teamId || null,
    success,
    value: valueForPlay(form.eventType, success, event.value),
    // Untouched text keeps the stored description exactly; edited text
    // keeps its credit suffix (the picker is what changes the credit).
    description: descriptionText === currentText ? event.description : `${descriptionText}${creditSuffix}`,
  };
  const body: CorrectionRequestBody = { reason };
  for (const [field, value] of Object.entries(corrected) as [keyof typeof corrected, unknown][]) {
    if (value !== event[field]) Object.assign(body, { [field]: value });
  }

  const stat = creditStatFor(form.eventType, success);
  const creditPlayerId = stat === null ? null : form.creditPlayerId || null;
  if (stat !== creditStatFor(event.eventType, event.success) || creditPlayerId !== event.creditPlayerId) {
    body.creditPlayerId = creditPlayerId;
  }
  if (Object.keys(body).length === 1) return { error: "Nothing has changed yet." };
  return { body };
}

/**
 * Whether `player` can take this play's credit: never the play's own
 * player; from the play's team for an assist, the other team for a block
 * or steal. A side nobody records (no team on the play or the player) is
 * left for the API to judge.
 */
export function canTakeCredit(stat: CreditStat, form: Pick<PlayFormState, "playerId" | "teamId">, player: AdminRosterPlayer): boolean {
  if (player.id === form.playerId) return false;
  if (!form.teamId || player.teamId === null) return true;
  return (player.teamId === form.teamId) === (stat === "assists");
}

/**
 * Players who can take this play's credit: roster players who act in the
 * game (the only players the stats derivation can resolve a credit to) and
 * pass canTakeCredit.
 */
export function creditCandidates(
  stat: CreditStat,
  form: Pick<PlayFormState, "playerId" | "teamId">,
  roster: AdminRosterPlayer[],
  actingPlayerIds: Set<string>,
): AdminRosterPlayer[] {
  return roster.filter((player) => actingPlayerIds.has(player.id) && canTakeCredit(stat, form, player));
}

/**
 * `next` with its credit cleared when an edit made it meaningless: the
 * play now takes a different credit (an assist became a block), or the
 * credited player can no longer take it (they became the shooter, or the
 * play moved to their team for a block). The request then removes the
 * credit rather than keeping one the API would reject.
 */
export function dropInvalidCredit(previous: PlayFormState, next: PlayFormState, roster: AdminRosterPlayer[]): PlayFormState {
  if (!next.creditPlayerId) return next;
  const nextStat = creditStatFor(next.eventType, successFromForm(next));
  const statChanged = creditStatFor(previous.eventType, successFromForm(previous)) !== nextStat;
  const creditedPlayer = roster.find((player) => player.id === next.creditPlayerId);
  const isStillValid = nextStat !== null && creditedPlayer !== undefined && canTakeCredit(nextStat, next, creditedPlayer);
  return statChanged || !isStillValid ? { ...next, creditPlayerId: "" } : next;
}
