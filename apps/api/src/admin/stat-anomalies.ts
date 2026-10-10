// Simple, threshold-based sanity checks over one PlayerGameStat row —
// deliberately not statistical outlier detection (no historical baselines,
// no z-scores): every rule here is a basketball-arithmetic fact that must
// hold for ANY legitimate box score, game one or game one thousand, so a
// violation is evidence of a data bug (a bad correction, a boxscore/derivation
// mismatch) rather than just an unusual performance. Pure and DB-free, like
// derive-player-game-stats.ts, so each rule is unit-testable on its own.
import type { PlayerGameStat } from "@prisma/client";

export type AnomalyCode =
  | "NEGATIVE_STAT"
  | "FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED"
  | "THREES_MADE_EXCEEDS_ATTEMPTED"
  | "FREE_THROWS_MADE_EXCEEDS_ATTEMPTED"
  | "THREES_MADE_EXCEEDS_FIELD_GOALS_MADE"
  | "THREES_ATTEMPTED_EXCEEDS_FIELD_GOALS_ATTEMPTED"
  | "REBOUND_SPLIT_MISMATCH"
  | "POINTS_MISMATCH"
  | "INVALID_MINUTES"
  | "USAGE_PERCENTAGE_OUT_OF_RANGE";

export interface AnomalyFinding {
  code: AnomalyCode;
  message: string;
}

// The counting stats that can never legitimately go negative — a made shot,
// a rebound, a turnover, none of these are ever subtracted, so a negative
// value can only come from a bad correction or a derivation bug.
const NON_NEGATIVE_FIELDS = [
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
  "offensiveRebounds",
  "defensiveRebounds",
] as const satisfies readonly (keyof PlayerGameStat)[];

// The subset of PlayerGameStat this checks — callers pass a real row
// straight through.
export type CheckablePlayerGameStat = Pick<
  PlayerGameStat,
  (typeof NON_NEGATIVE_FIELDS)[number] | "minutes" | "usagePercentage"
>;

export function findStatAnomalies(stat: CheckablePlayerGameStat): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];

  for (const field of NON_NEGATIVE_FIELDS) {
    const value = stat[field];
    if (value !== null && value < 0) {
      findings.push({ code: "NEGATIVE_STAT", message: `${field} is negative (${value})` });
    }
  }

  if (stat.fieldGoalsMade > stat.fieldGoalsAttempted) {
    findings.push({
      code: "FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED",
      message: `fieldGoalsMade (${stat.fieldGoalsMade}) exceeds fieldGoalsAttempted (${stat.fieldGoalsAttempted})`,
    });
  }

  if (stat.threesMade > stat.threesAttempted) {
    findings.push({
      code: "THREES_MADE_EXCEEDS_ATTEMPTED",
      message: `threesMade (${stat.threesMade}) exceeds threesAttempted (${stat.threesAttempted})`,
    });
  }

  if (stat.freeThrowsMade > stat.freeThrowsAttempted) {
    findings.push({
      code: "FREE_THROWS_MADE_EXCEEDS_ATTEMPTED",
      message: `freeThrowsMade (${stat.freeThrowsMade}) exceeds freeThrowsAttempted (${stat.freeThrowsAttempted})`,
    });
  }

  // A made three is, by definition, also a made field goal — the two are
  // never independent totals.
  if (stat.threesMade > stat.fieldGoalsMade) {
    findings.push({
      code: "THREES_MADE_EXCEEDS_FIELD_GOALS_MADE",
      message: `threesMade (${stat.threesMade}) exceeds fieldGoalsMade (${stat.fieldGoalsMade})`,
    });
  }

  if (stat.threesAttempted > stat.fieldGoalsAttempted) {
    findings.push({
      code: "THREES_ATTEMPTED_EXCEEDS_FIELD_GOALS_ATTEMPTED",
      message: `threesAttempted (${stat.threesAttempted}) exceeds fieldGoalsAttempted (${stat.fieldGoalsAttempted})`,
    });
  }

  // Only checked when both halves of the split are known — older rows
  // ingested before the split existed carry null here rather than 0 (see
  // PlayerGameStat's own schema doc comment), and null is "unknown", not
  // "zero", so it's never treated as a mismatch.
  if (stat.offensiveRebounds !== null && stat.defensiveRebounds !== null) {
    if (stat.offensiveRebounds + stat.defensiveRebounds !== stat.rebounds) {
      findings.push({
        code: "REBOUND_SPLIT_MISMATCH",
        message: `offensiveRebounds + defensiveRebounds (${stat.offensiveRebounds + stat.defensiveRebounds}) does not equal rebounds (${stat.rebounds})`,
      });
    }
  }

  const expectedPoints = (stat.fieldGoalsMade - stat.threesMade) * 2 + stat.threesMade * 3 + stat.freeThrowsMade;
  if (stat.points !== expectedPoints) {
    findings.push({
      code: "POINTS_MISMATCH",
      message: `points (${stat.points}) does not equal the shooting split's implied total (${expectedPoints})`,
    });
  }

  if (stat.minutes < 0) {
    findings.push({ code: "INVALID_MINUTES", message: `minutes is negative (${stat.minutes})` });
  }

  if (stat.usagePercentage !== null && (stat.usagePercentage < 0 || stat.usagePercentage > 100)) {
    findings.push({
      code: "USAGE_PERCENTAGE_OUT_OF_RANGE",
      message: `usagePercentage (${stat.usagePercentage}) is outside 0-100`,
    });
  }

  return findings;
}
