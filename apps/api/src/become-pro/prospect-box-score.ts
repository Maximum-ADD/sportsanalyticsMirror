import { findStatAnomalies, type AnomalyCode } from "../admin/stat-anomalies.js";

// Whether one self-reported box score is allowed into the database.
//
// The checking itself is NOT reimplemented here: it calls the same
// findStatAnomalies the admin correction tools run over ingested NBA rows, so
// "what counts as an impossible line" has one definition in this codebase
// rather than one for imported data and a second, drifting one for
// user-entered data.
//
// What this module adds is SEVERITY, which the shared checker has no opinion
// on. Reviewing already-ingested data, every finding is equally worth an
// admin's attention. Accepting a person's own scoresheet, two cases differ:
//
//   - Impossible arithmetic — six makes on four attempts — cannot be true of
//     any real game, so storing it would put a figure in the database that no
//     scoresheet could have produced.
//   - A points total that disagrees with its own shooting splits is a row
//     that disagrees with itself but might still be exactly what the sheet
//     says. Real scoresheets do carry totals that do not reconcile, and
//     rejecting somebody's own sheet is worse than accepting it with the
//     disagreement recorded.
//
// The frontend mirrors this split (apps/web/src/lib/boxScoreValidation.ts) so
// a row it lets you save is a row this accepts.

// The one finding that does not block a save. Everything else findStatAnomalies
// can return is arithmetic that cannot be true.
const ADVISORY_CODES: readonly AnomalyCode[] = ["POINTS_MISMATCH"];

// A regulation game is 48 minutes and four overtimes would be 68. This is a
// deliberately loose ceiling: it exists to catch a typed "320", not to
// adjudicate a marathon.
export const MAX_PROSPECT_GAME_MINUTES = 65;

/** The fields of one entered game that the checks above read. */
export interface CheckableProspectGame {
  gameDate: Date;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threesMade: number;
  threesAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
}

/**
 * Every reason one entered game cannot be stored.
 *
 * @param game - the row as submitted.
 * @param now - "today", injected so the future-date check is testable without
 *              touching the clock.
 * @returns human-readable reasons, empty when the row is acceptable. A row
 *          whose only problem is a points total that disagrees with its own
 *          splits returns empty: that is recorded, not refused.
 */
export function findBlockingProblems(game: CheckableProspectGame, now: Date = new Date()): string[] {
  // offensiveRebounds/defensiveRebounds/usagePercentage are null rather than
  // 0 because a prospect genuinely does not report them — and the shared
  // checker already treats null as "unknown, do not check" rather than zero.
  const anomalies = findStatAnomalies({
    ...game,
    offensiveRebounds: null,
    defensiveRebounds: null,
    usagePercentage: null,
  });

  const problems = anomalies
    .filter((finding) => !ADVISORY_CODES.includes(finding.code))
    .map((finding) => finding.message);

  // Two checks the shared module does not make, because neither can arise
  // from ingested data: it only ever sees minutes that a real game produced,
  // and it never sees a date somebody typed.
  if (game.minutes > MAX_PROSPECT_GAME_MINUTES) {
    problems.push(`minutes (${game.minutes}) is above ${MAX_PROSPECT_GAME_MINUTES}`);
  }
  if (isFutureDate(game.gameDate, now)) {
    problems.push("gameDate is in the future");
  }

  return problems;
}

// Compares calendar days rather than instants: a game logged earlier today is
// not "in the future" because its date parsed to midnight UTC.
function isFutureDate(gameDate: Date, now: Date): boolean {
  const entered = Date.UTC(gameDate.getUTCFullYear(), gameDate.getUTCMonth(), gameDate.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return entered > today;
}
