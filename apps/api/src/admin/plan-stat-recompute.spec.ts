import { describe, expect, it } from "vitest";
import { COUNTING_STAT_FIELDS, type DerivableGameEvent, type PlayerName } from "./derive-player-game-stats.js";
import { planStatRecompute, type StoredStatRow } from "./plan-stat-recompute.js";

const HOME = "home";

function makeStatRow(playerId: string, overrides: Partial<StoredStatRow> = {}): StoredStatRow {
  const row = { playerId } as StoredStatRow;
  for (const field of COUNTING_STAT_FIELDS) row[field] = 0;
  return { ...row, ...overrides };
}

function makeShot(playerId: string, description: string): DerivableGameEvent {
  return { eventType: "2pt", subType: null, playerId, teamId: HOME, success: true, value: 2, description };
}

const NAMES = new Map<string, PlayerName>([
  ["curry", { firstName: "Stephen", lastName: "Curry" }],
  ["green", { firstName: "Draymond", lastName: "Green" }],
  ["bench", { firstName: "Bench", lastName: "Warmer" }],
]);

describe("planStatRecompute", () => {
  it("recomputes players who act, with the fields that change", () => {
    const [plan] = planStatRecompute(
      [makeShot("curry", "Curry Layup (2 PTS)")],
      [makeStatRow("curry", { points: 2, fieldGoalsMade: 1 })],
      NAMES,
    );

    expect(plan.playerId).toBe("curry");
    expect(plan.after.points).toBe(2);
    expect(plan.changedFields).toEqual(["fieldGoalsAttempted"]);
  });

  it("leaves players who never act alone (games with only period markers)", () => {
    expect(planStatRecompute([], [makeStatRow("curry", { points: 31 })], NAMES)).toEqual([]);
  });

  it("recomputes a retained player who no longer acts, down to zero", () => {
    const plans = planStatRecompute(
      [makeShot("green", "Green Layup (2 PTS)")],
      [makeStatRow("curry", { points: 2 }), makeStatRow("green")],
      NAMES,
      new Map([["curry", HOME]]),
    );

    expect(plans.map((plan) => [plan.playerId, plan.after.points])).toEqual([
      ["curry", 0],
      ["green", 2],
    ]);
  });

  it("keeps a retained player resolvable for credits on other plays", () => {
    const plans = planStatRecompute(
      [makeShot("green", "Green Layup (2 PTS) (Curry 1 AST)")],
      [makeStatRow("curry"), makeStatRow("green")],
      NAMES,
      new Map([["curry", HOME]]),
    );

    expect(plans.find((plan) => plan.playerId === "curry")?.after.assists).toBe(1);
  });

  it("treats a stored null O/D rebound split as changed when the derivation fills it", () => {
    const [plan] = planStatRecompute(
      [makeShot("curry", "Curry Layup (2 PTS)")],
      [makeStatRow("curry", { points: 2, fieldGoalsMade: 1, fieldGoalsAttempted: 1, offensiveRebounds: null })],
      NAMES,
    );

    expect(plan.before.offensiveRebounds).toBeNull();
    expect(plan.changedFields).toEqual(["offensiveRebounds"]);
  });
});
