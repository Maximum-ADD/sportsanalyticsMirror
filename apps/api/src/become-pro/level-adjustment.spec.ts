import { describe, expect, it } from "vitest";
import { deriveSeasonAverages } from "../players/season-averages.js";
import { adjustForLevel } from "./level-adjustment.js";

// 24 points on 9-for-17 with 3 threes and 3 free throws, over 32 minutes.
const LINE = deriveSeasonAverages([
  {
    minutes: 32,
    points: 24,
    rebounds: 8,
    assists: 5,
    steals: 2,
    blocks: 1,
    turnovers: 3,
    fieldGoalsMade: 9,
    fieldGoalsAttempted: 17,
    threesMade: 3,
    threesAttempted: 7,
    freeThrowsMade: 3,
    freeThrowsAttempted: 4,
    plusMinus: null,
    usagePercentage: null,
    offensiveRating: null,
    defensiveRating: null,
  },
]);

describe("adjustForLevel", () => {
  it("discounts production by the level factor", () => {
    const adjusted = adjustForLevel(LINE, 0.5);

    expect(adjusted.pointsPerGame).toBe(12);
    expect(adjusted.reboundsPerGame).toBe(4);
    expect(adjusted.assistsPerGame).toBe(2.5);
    expect(adjusted.stealsPerGame).toBe(1);
  });

  // The rule the valuation model itself follows: shooting 58% against weaker
  // opposition still means the shots went in.
  it("leaves every rate untouched", () => {
    const adjusted = adjustForLevel(LINE, 0.5);

    expect(adjusted.fieldGoalPercentage).toBe(LINE.fieldGoalPercentage);
    expect(adjusted.threePointPercentage).toBe(LINE.threePointPercentage);
    expect(adjusted.trueShootingPercentage).toBe(LINE.trueShootingPercentage);
    expect(adjusted.assistToTurnoverRatio).toBe(LINE.assistToTurnoverRatio);
  });

  // Playing time is not production; discounting it would claim a prospect
  // played less than they did.
  it("does not discount minutes", () => {
    expect(adjustForLevel(LINE, 0.5).minutesPerGame).toBe(LINE.minutesPerGame);
  });

  it("carries the figures an amateur sheet cannot supply through as null", () => {
    const adjusted = adjustForLevel(LINE, 0.62);

    expect(adjusted.plusMinusPerGame).toBeNull();
    expect(adjusted.usagePercentage).toBeNull();
    expect(adjusted.offensiveRating).toBeNull();
    expect(adjusted.defensiveRating).toBeNull();
  });

  it("is the identity at the reference level", () => {
    expect(adjustForLevel(LINE, 1)).toEqual(LINE);
  });

  it("does not modify the line it was given", () => {
    const before = { ...LINE };
    adjustForLevel(LINE, 0.3);

    expect(LINE).toEqual(before);
  });
});
