import { describe, expect, it } from "vitest";
import {
  MAX_PROSPECT_GAME_MINUTES,
  findBlockingProblems,
  type CheckableProspectGame,
} from "./prospect-box-score.js";

// A clean, internally consistent row: 9-for-17 with 3 threes and 3 free
// throws is (9-3)*2 + 3*3 + 3 = 24 points.
function makeGame(overrides: Partial<CheckableProspectGame> = {}): CheckableProspectGame {
  return {
    gameDate: new Date("2026-01-15T00:00:00.000Z"),
    minutes: 32,
    points: 24,
    rebounds: 7,
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
    ...overrides,
  };
}

const NOW = new Date("2026-02-01T12:00:00.000Z");

describe("findBlockingProblems", () => {
  it("accepts a clean row", () => {
    expect(findBlockingProblems(makeGame(), NOW)).toEqual([]);
  });

  it("blocks more makes than attempts", () => {
    const problems = findBlockingProblems(
      makeGame({ fieldGoalsMade: 6, fieldGoalsAttempted: 4, points: 15 }),
      NOW
    );

    expect(problems.join(" ")).toMatch(/fieldGoalsMade/i);
  });

  it("blocks more threes made than field goals made", () => {
    const problems = findBlockingProblems(
      makeGame({ fieldGoalsMade: 2, threesMade: 4, threesAttempted: 6, points: 12 }),
      NOW
    );

    expect(problems.length).toBeGreaterThan(0);
  });

  it("blocks a negative count", () => {
    expect(findBlockingProblems(makeGame({ rebounds: -2 }), NOW).join(" ")).toMatch(/negative/i);
  });

  it("blocks implausible minutes", () => {
    const problems = findBlockingProblems({ ...makeGame(), minutes: 320 }, NOW);

    expect(problems.join(" ")).toMatch(new RegExp(String(MAX_PROSPECT_GAME_MINUTES)));
  });

  it("allows an overtime minutes load", () => {
    expect(findBlockingProblems(makeGame({ minutes: 52 }), NOW)).toEqual([]);
  });

  it("blocks a game dated in the future", () => {
    const problems = findBlockingProblems(
      makeGame({ gameDate: new Date("2026-06-01T00:00:00.000Z") }),
      NOW
    );

    expect(problems.join(" ")).toMatch(/future/i);
  });

  // Midnight-UTC dates must not read as "tomorrow" just because now has a
  // clock time on it.
  it("accepts a game logged earlier the same day", () => {
    expect(
      findBlockingProblems(makeGame({ gameDate: new Date("2026-02-01T00:00:00.000Z") }), NOW)
    ).toEqual([]);
  });

  // The severity split. A real scoresheet sometimes disagrees with its own
  // splits, and refusing somebody's own sheet is worse than recording it.
  it("accepts a row whose points disagree with its shooting splits", () => {
    expect(findBlockingProblems(makeGame({ points: 22 }), NOW)).toEqual([]);
  });

  // The frontend mirrors this module; a row it lets you save must be a row
  // this accepts, and vice versa.
  it("still blocks an impossible row that also has a points mismatch", () => {
    const problems = findBlockingProblems(
      makeGame({ points: 99, fieldGoalsMade: 20, fieldGoalsAttempted: 3 }),
      NOW
    );

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).not.toMatch(/implied total/i);
  });
});
