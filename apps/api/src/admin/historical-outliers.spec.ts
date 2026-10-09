import { describe, expect, it } from "vitest";
import { findHistoricalOutliers, type OutlierStatField } from "./historical-outliers.js";

function statLine(overrides: Partial<Record<OutlierStatField, number>> = {}): Record<OutlierStatField, number> {
  return { points: 20, rebounds: 5, assists: 5, steals: 1, blocks: 1, turnovers: 2, ...overrides };
}

// Five typical games (meets MINIMUM_PRIOR_GAMES), each identical except
// points, which varies narrowly around 20 — a consistent role player's
// realistic scoring log, not a contrived single-value history.
function typicalPriorGames(points: number[]): Record<OutlierStatField, number>[] {
  return points.map((value) => statLine({ points: value }));
}

describe("findHistoricalOutliers", () => {
  it("flags nothing with too little history to judge", () => {
    const findings = findHistoricalOutliers(statLine({ points: 60 }), typicalPriorGames([18, 19, 20, 21]));
    expect(findings).toEqual([]);
  });

  it("flags nothing for a value close to the player's own mean", () => {
    const findings = findHistoricalOutliers(statLine({ points: 21 }), typicalPriorGames([18, 19, 20, 21, 22]));
    expect(findings).toEqual([]);
  });

  it("flags a career night that sits far outside the player's own history", () => {
    const priorGames = typicalPriorGames([18, 19, 20, 21, 22, 19, 20]);
    const findings = findHistoricalOutliers(statLine({ points: 60 }), priorGames);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ field: "points", value: 60 });
    expect(findings[0].zScore).toBeGreaterThan(3);
  });

  it("flags an unusually quiet game the same way as an unusually big one", () => {
    const priorGames = typicalPriorGames([18, 19, 20, 21, 22, 19, 20]);
    const findings = findHistoricalOutliers(statLine({ points: 0 }), priorGames);

    expect(findings.map((f) => f.field)).toContain("points");
    expect(findings.find((f) => f.field === "points")?.zScore).toBeLessThan(-3);
  });

  it("checks every field independently, not just points", () => {
    const priorGames = typicalPriorGames([18, 19, 20, 21, 22, 19]).map((game, index) => ({
      ...game,
      assists: [4, 5, 6, 5, 4, 5][index],
    }));
    const findings = findHistoricalOutliers(statLine({ points: 20, assists: 20 }), priorGames);

    expect(findings.map((f) => f.field)).toEqual(["assists"]);
  });

  it("never divides by zero for a player whose history is perfectly consistent", () => {
    const priorGames = Array.from({ length: 6 }, () => statLine({ blocks: 0 }));
    const findings = findHistoricalOutliers(statLine({ blocks: 5 }), priorGames);

    // stddev of an all-zero history is 0 — treated as nothing to judge
    // against rather than as an outlier with a divide-by-zero Infinity
    // z-score.
    expect(findings.map((f) => f.field)).not.toContain("blocks");
  });
});
