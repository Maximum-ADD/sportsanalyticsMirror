import { describe, expect, it } from "vitest";
import { findStatAnomalies, type CheckablePlayerGameStat } from "./stat-anomalies.js";

// A clean, internally-consistent line (Curry-esque: 8/14 shooting, 4/9 from
// three, 3/3 free throws -> (8-4)*2 + 4*3 + 3 = 8+12+3 = 23 points) that
// every test starts from and overrides just the field(s) it's checking, so
// each test isolates exactly one rule.
function validStat(overrides: Partial<CheckablePlayerGameStat> = {}): CheckablePlayerGameStat {
  return {
    points: 23,
    rebounds: 5,
    assists: 6,
    steals: 1,
    blocks: 0,
    turnovers: 2,
    fieldGoalsMade: 8,
    fieldGoalsAttempted: 14,
    threesMade: 4,
    threesAttempted: 9,
    freeThrowsMade: 3,
    freeThrowsAttempted: 3,
    offensiveRebounds: 1,
    defensiveRebounds: 4,
    minutes: 34,
    usagePercentage: 28.5,
    ...overrides,
  };
}

describe("findStatAnomalies", () => {
  it("finds nothing wrong with an internally-consistent line", () => {
    expect(findStatAnomalies(validStat())).toEqual([]);
  });

  it("flags a negative counting stat", () => {
    const findings = findStatAnomalies(validStat({ assists: -1 }));
    expect(findings).toContainEqual({ code: "NEGATIVE_STAT", message: "assists is negative (-1)" });
  });

  it("flags fieldGoalsMade exceeding fieldGoalsAttempted", () => {
    const findings = findStatAnomalies(validStat({ fieldGoalsMade: 15, fieldGoalsAttempted: 14 }));
    expect(findings.map((f) => f.code)).toContain("FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED");
  });

  it("flags threesMade exceeding threesAttempted", () => {
    const findings = findStatAnomalies(validStat({ threesMade: 10, threesAttempted: 9 }));
    expect(findings.map((f) => f.code)).toContain("THREES_MADE_EXCEEDS_ATTEMPTED");
  });

  it("flags freeThrowsMade exceeding freeThrowsAttempted", () => {
    const findings = findStatAnomalies(validStat({ freeThrowsMade: 4, freeThrowsAttempted: 3 }));
    expect(findings.map((f) => f.code)).toContain("FREE_THROWS_MADE_EXCEEDS_ATTEMPTED");
  });

  it("flags threesMade exceeding fieldGoalsMade", () => {
    const findings = findStatAnomalies(validStat({ fieldGoalsMade: 3, threesMade: 4, threesAttempted: 9, points: 15 }));
    expect(findings.map((f) => f.code)).toContain("THREES_MADE_EXCEEDS_FIELD_GOALS_MADE");
  });

  it("flags threesAttempted exceeding fieldGoalsAttempted", () => {
    const findings = findStatAnomalies(validStat({ fieldGoalsAttempted: 8, threesAttempted: 9 }));
    expect(findings.map((f) => f.code)).toContain("THREES_ATTEMPTED_EXCEEDS_FIELD_GOALS_ATTEMPTED");
  });

  it("flags a rebound split that doesn't add up to the total", () => {
    const findings = findStatAnomalies(validStat({ offensiveRebounds: 2, defensiveRebounds: 4, rebounds: 5 }));
    expect(findings.map((f) => f.code)).toContain("REBOUND_SPLIT_MISMATCH");
  });

  it("does not check the rebound split when either half is null", () => {
    const findings = findStatAnomalies(validStat({ offensiveRebounds: null, defensiveRebounds: null, rebounds: 999 }));
    expect(findings.map((f) => f.code)).not.toContain("REBOUND_SPLIT_MISMATCH");
  });

  it("flags points that don't match the shooting split", () => {
    const findings = findStatAnomalies(validStat({ points: 99 }));
    expect(findings.map((f) => f.code)).toContain("POINTS_MISMATCH");
  });

  it("flags negative minutes", () => {
    const findings = findStatAnomalies(validStat({ minutes: -5 }));
    expect(findings.map((f) => f.code)).toContain("INVALID_MINUTES");
  });

  it("flags a usagePercentage outside 0-100", () => {
    const findings = findStatAnomalies(validStat({ usagePercentage: 150 }));
    expect(findings.map((f) => f.code)).toContain("USAGE_PERCENTAGE_OUT_OF_RANGE");
  });

  it("does not check usagePercentage when it is null", () => {
    const findings = findStatAnomalies(validStat({ usagePercentage: null }));
    expect(findings.map((f) => f.code)).not.toContain("USAGE_PERCENTAGE_OUT_OF_RANGE");
  });

  it("reports every violated rule at once", () => {
    const findings = findStatAnomalies(validStat({ assists: -1, fieldGoalsMade: 20 }));
    expect(findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(["NEGATIVE_STAT", "FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED", "POINTS_MISMATCH"]),
    );
  });
});
