import { describe, expect, it } from "vitest";
import { deriveLineupDrift, deriveSlotDrift, type SavedSlotValuation } from "./lineup-drift.js";

function makeValuation(overrides: Partial<SavedSlotValuation> = {}): SavedSlotValuation {
  return {
    playerId: "player-1",
    predictedPointsAtSave: 40,
    salaryAtSave: 9000,
    latestPredictedFantasyPoints: 40,
    latestSalary: 9000,
    ...overrides,
  };
}

describe("deriveSlotDrift", () => {
  it("reports zero movement when the current prediction matches the saved snapshot", () => {
    expect(deriveSlotDrift(makeValuation())).toEqual({ playerId: "player-1", pointsDelta: 0, salaryDelta: 0 });
  });

  it("reports a rise as a positive delta (latest minus saved)", () => {
    const drift = deriveSlotDrift(
      makeValuation({ latestPredictedFantasyPoints: 47.5, latestSalary: 9800 })
    );

    expect(drift.pointsDelta).toBe(7.5);
    expect(drift.salaryDelta).toBe(800);
  });

  it("reports a fall as a negative delta", () => {
    const drift = deriveSlotDrift(
      makeValuation({ latestPredictedFantasyPoints: 31.25, latestSalary: 8200 })
    );

    expect(drift.pointsDelta).toBe(-8.75);
    expect(drift.salaryDelta).toBe(-800);
  });

  it("treats a player with no current prediction as unchanged rather than as zero points", () => {
    const drift = deriveSlotDrift(
      makeValuation({ latestPredictedFantasyPoints: null, latestSalary: null })
    );

    expect(drift).toEqual({ playerId: "player-1", pointsDelta: 0, salaryDelta: 0 });
  });

  it("rounds float subtraction noise out of the points delta", () => {
    const drift = deriveSlotDrift(
      makeValuation({ predictedPointsAtSave: 40.1, latestPredictedFantasyPoints: 40.4 })
    );

    expect(drift.pointsDelta).toBe(0.3);
  });
});

describe("deriveLineupDrift", () => {
  const budgetAtSave = 50_000;

  it("returns zero drift for a lineup whose players have not been re-predicted", () => {
    const valuations = [
      makeValuation({ playerId: "player-1" }),
      makeValuation({ playerId: "player-2", predictedPointsAtSave: 22.4, latestPredictedFantasyPoints: 22.4 }),
    ];

    expect(deriveLineupDrift(valuations, budgetAtSave)).toEqual({
      pointsDelta: 0,
      salaryDelta: 0,
      isOverBudget: false,
    });
  });

  it("sums movement across slots, netting rises against falls", () => {
    const valuations = [
      makeValuation({ playerId: "player-1", latestPredictedFantasyPoints: 45, latestSalary: 9600 }),
      makeValuation({ playerId: "player-2", latestPredictedFantasyPoints: 38.5, latestSalary: 8700 }),
    ];

    const drift = deriveLineupDrift(valuations, budgetAtSave);

    expect(drift.pointsDelta).toBe(3.5);
    expect(drift.salaryDelta).toBe(300);
  });

  it("flags a lineup whose players now cost more than the budget it was saved under", () => {
    const valuations = [
      makeValuation({ playerId: "player-1", salaryAtSave: 25_000, latestSalary: 26_000 }),
      makeValuation({ playerId: "player-2", salaryAtSave: 24_000, latestSalary: 25_000 }),
    ];

    const drift = deriveLineupDrift(valuations, budgetAtSave);

    expect(drift.salaryDelta).toBe(2000);
    expect(drift.isOverBudget).toBe(true);
  });

  it("does not flag a lineup that sits exactly on the budget", () => {
    const valuations = [makeValuation({ salaryAtSave: 50_000, latestSalary: 50_000 })];

    expect(deriveLineupDrift(valuations, budgetAtSave).isOverBudget).toBe(false);
  });

  it("prices unpredicted players at their frozen salary when checking the budget", () => {
    const valuations = [makeValuation({ salaryAtSave: 51_000, latestSalary: null })];

    const drift = deriveLineupDrift(valuations, budgetAtSave);

    expect(drift.salaryDelta).toBe(0);
    expect(drift.isOverBudget).toBe(true);
  });

  it("returns zero drift for a lineup with no slots", () => {
    expect(deriveLineupDrift([], budgetAtSave)).toEqual({
      pointsDelta: 0,
      salaryDelta: 0,
      isOverBudget: false,
    });
  });
});
