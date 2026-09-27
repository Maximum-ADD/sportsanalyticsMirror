// Client-side checking for a hand-entered box score.
//
// Mirrors apps/api/src/admin/stat-anomalies.ts — the same codes, the same
// arithmetic — so the message a user sees while typing and the message the API
// returns on save cannot describe the same row differently. Same arrangement
// lib/avatar.ts has with AvatarStorageService: the API re-validates
// independently regardless, so drift here would only ever cost a slightly-late
// error message, not a security gap.
//
// The one thing this module adds that the server-side checker does not is
// SEVERITY. stat-anomalies.ts reports findings on already-ingested NBA data,
// where everything is equally worth flagging to an admin. Here a person is
// typing their own scoresheet, and the two cases are genuinely different:
//
//   - "blocking" is arithmetic that cannot be true of any real game — six
//     makes on four attempts. Saving it would put a figure in the database
//     that no scoresheet could have produced.
//   - "warning" is a row that disagrees with itself but might still be what
//     the sheet says. Real scoresheets do carry a points total that doesn't
//     reconcile with their own shooting splits, and refusing to accept a
//     user's own sheet is worse than accepting it with a flag on it.

import type { ProspectGameInput } from "@/types/nba";

// Same union as the API's AnomalyCode, minus the codes that only apply to
// ingested NBA rows (rebound splits and usage percentage, neither of which a
// user ever enters), plus the one check that only makes sense for hand entry.
export type BoxScoreIssueCode =
  | "NEGATIVE_STAT"
  | "FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED"
  | "THREES_MADE_EXCEEDS_ATTEMPTED"
  | "FREE_THROWS_MADE_EXCEEDS_ATTEMPTED"
  | "THREES_MADE_EXCEEDS_FIELD_GOALS_MADE"
  | "THREES_ATTEMPTED_EXCEEDS_FIELD_GOALS_ATTEMPTED"
  | "INVALID_MINUTES"
  | "FUTURE_GAME_DATE"
  | "POINTS_MISMATCH";

export type BoxScoreIssueSeverity = "blocking" | "warning";

export interface BoxScoreIssue {
  code: BoxScoreIssueCode;
  severity: BoxScoreIssueSeverity;
  /** Which input to attach the message to, so the form can mark the field. */
  field: keyof ProspectGameInput;
  /** Written for the person who typed the row, not for a log. */
  message: string;
}

// A regulation game is 48 minutes; overtime can push a starter past that, and
// four overtimes would be 68. 65 is a deliberately loose ceiling — it exists
// to catch a typed "320" rather than to adjudicate a marathon.
const MAX_MINUTES = 65;

// Every field that is a plain count and can never sensibly be negative.
const COUNTING_FIELDS = [
  "minutes",
  "points",
  "rebounds",
  "assists",
  "steals",
  "blocks",
  "turnovers",
  "fieldGoalsMade",
  "fieldGoalsAttempted",
  "threesMade",
  "threesAttempted",
  "freeThrowsMade",
  "freeThrowsAttempted",
] as const satisfies readonly (keyof ProspectGameInput)[];

const FIELD_LABELS: Record<(typeof COUNTING_FIELDS)[number], string> = {
  minutes: "Minutes",
  points: "Points",
  rebounds: "Rebounds",
  assists: "Assists",
  steals: "Steals",
  blocks: "Blocks",
  turnovers: "Turnovers",
  fieldGoalsMade: "Field goals made",
  fieldGoalsAttempted: "Field goals attempted",
  threesMade: "Threes made",
  threesAttempted: "Threes attempted",
  freeThrowsMade: "Free throws made",
  freeThrowsAttempted: "Free throws attempted",
};

/**
 * The points total a row's own shooting split implies.
 *
 * Identical arithmetic to stat-anomalies.ts's expectedPoints: every made field
 * goal that wasn't a three is worth two, threes are worth three, free throws
 * one. Exported because the entry form shows it beside the typed total when
 * the two disagree — seeing "your splits add up to 22" is more useful than
 * being told the row is wrong.
 */
export function impliedPoints(game: Pick<ProspectGameInput, "fieldGoalsMade" | "threesMade" | "freeThrowsMade">): number {
  return (game.fieldGoalsMade - game.threesMade) * 2 + game.threesMade * 3 + game.freeThrowsMade;
}

/**
 * Every problem with one entered game, worst first.
 *
 * @param game - the row as currently typed.
 * @param today - "now", injected so the future-date check is testable without
 *                touching the clock. Defaults to the real current date.
 * @returns blocking issues first, then warnings; an empty array for a clean row.
 */
export function findBoxScoreIssues(game: ProspectGameInput, today: Date = new Date()): BoxScoreIssue[] {
  const issues: BoxScoreIssue[] = [];

  for (const field of COUNTING_FIELDS) {
    const value = game[field];
    if (Number.isFinite(value) && value < 0) {
      issues.push({
        code: "NEGATIVE_STAT",
        severity: "blocking",
        field,
        message: `${FIELD_LABELS[field]} cannot be negative.`,
      });
    }
  }

  if (game.fieldGoalsMade > game.fieldGoalsAttempted) {
    issues.push({
      code: "FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED",
      severity: "blocking",
      field: "fieldGoalsMade",
      message: `${game.fieldGoalsMade} field goals made from ${game.fieldGoalsAttempted} attempts.`,
    });
  }

  if (game.threesMade > game.threesAttempted) {
    issues.push({
      code: "THREES_MADE_EXCEEDS_ATTEMPTED",
      severity: "blocking",
      field: "threesMade",
      message: `${game.threesMade} threes made from ${game.threesAttempted} attempts.`,
    });
  }

  if (game.freeThrowsMade > game.freeThrowsAttempted) {
    issues.push({
      code: "FREE_THROWS_MADE_EXCEEDS_ATTEMPTED",
      severity: "blocking",
      field: "freeThrowsMade",
      message: `${game.freeThrowsMade} free throws made from ${game.freeThrowsAttempted} attempts.`,
    });
  }

  // A three IS a field goal, so neither made nor attempted threes can exceed
  // the field-goal figure that contains them.
  if (game.threesMade > game.fieldGoalsMade) {
    issues.push({
      code: "THREES_MADE_EXCEEDS_FIELD_GOALS_MADE",
      severity: "blocking",
      field: "threesMade",
      message: "Threes made cannot exceed field goals made — every three is a field goal.",
    });
  }

  if (game.threesAttempted > game.fieldGoalsAttempted) {
    issues.push({
      code: "THREES_ATTEMPTED_EXCEEDS_FIELD_GOALS_ATTEMPTED",
      severity: "blocking",
      field: "threesAttempted",
      message: "Threes attempted cannot exceed field goals attempted.",
    });
  }

  if (game.minutes > MAX_MINUTES) {
    issues.push({
      code: "INVALID_MINUTES",
      severity: "blocking",
      field: "minutes",
      message: `Minutes cannot be above ${MAX_MINUTES}.`,
    });
  }

  if (isFutureDate(game.gameDate, today)) {
    issues.push({
      code: "FUTURE_GAME_DATE",
      severity: "blocking",
      field: "gameDate",
      message: "That date is in the future.",
    });
  }

  // The only warning. See the module comment for why this one does not block:
  // a real sheet sometimes disagrees with itself, and the user's sheet is the
  // record we are here to capture.
  const expected = impliedPoints(game);
  if (game.points !== expected) {
    issues.push({
      code: "POINTS_MISMATCH",
      severity: "warning",
      field: "points",
      message: `Your shooting splits add up to ${expected} points, not ${game.points}. Worth a check — you can still save it.`,
    });
  }

  return issues;
}

/** Whether anything in the row would stop it being saved. */
export function hasBlockingIssue(issues: BoxScoreIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocking");
}

/** The first issue attached to one field, for rendering inline under it. */
export function issueForField(
  issues: BoxScoreIssue[],
  field: keyof ProspectGameInput
): BoxScoreIssue | undefined {
  return issues.find((issue) => issue.field === field);
}

// Compares calendar days rather than instants: a game logged earlier today is
// not "in the future" just because the entered date parses to midnight.
function isFutureDate(gameDate: string, today: Date): boolean {
  const parsed = new Date(gameDate);
  if (Number.isNaN(parsed.getTime())) return false;
  const entered = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return entered > now;
}
