import { describe, expect, it } from "vitest";
import {
  findBoxScoreIssues,
  hasBlockingIssue,
  impliedPoints,
  issueForField,
} from "./boxScoreValidation";
import type { ProspectGameInput } from "@/types/nba";

// A clean, internally consistent row: 9-for-17 with 3 threes and 3 free
// throws is (9-3)*2 + 3*3 + 3 = 24 points.
function makeGame(overrides: Partial<ProspectGameInput> = {}): ProspectGameInput {
  return {
    gameDate: "2026-01-15",
    opponent: "Lincoln High",
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

// Fixed "today" so the future-date check never depends on the wall clock.
const TODAY = new Date("2026-02-01T12:00:00Z");

describe("impliedPoints", () => {
  it("scores twos, threes and free throws", () => {
    expect(impliedPoints({ fieldGoalsMade: 9, threesMade: 3, freeThrowsMade: 3 })).toBe(24);
  });

  it("treats every made field goal as a two when none were threes", () => {
    expect(impliedPoints({ fieldGoalsMade: 5, threesMade: 0, freeThrowsMade: 0 })).toBe(10);
  });
});

describe("findBoxScoreIssues", () => {
  it("passes a clean row", () => {
    expect(findBoxScoreIssues(makeGame(), TODAY)).toEqual([]);
  });

  it("blocks more makes than attempts", () => {
    const issues = findBoxScoreIssues(
      makeGame({ fieldGoalsMade: 6, fieldGoalsAttempted: 4, points: 15 }),
      TODAY
    );

    const issue = issues.find((candidate) => candidate.code === "FIELD_GOALS_MADE_EXCEEDS_ATTEMPTED");
    expect(issue?.severity).toBe("blocking");
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("blocks more threes made than field goals made, since every three is a field goal", () => {
    const issues = findBoxScoreIssues(
      makeGame({ fieldGoalsMade: 2, threesMade: 4, threesAttempted: 6, points: 12 }),
      TODAY
    );

    expect(issues.some((issue) => issue.code === "THREES_MADE_EXCEEDS_FIELD_GOALS_MADE")).toBe(true);
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it("blocks a negative count", () => {
    const issues = findBoxScoreIssues(makeGame({ rebounds: -2 }), TODAY);

    const issue = issues.find((candidate) => candidate.code === "NEGATIVE_STAT");
    expect(issue?.field).toBe("rebounds");
    expect(issue?.severity).toBe("blocking");
  });

  it("blocks implausible minutes", () => {
    const issues = findBoxScoreIssues(makeGame({ minutes: 320 }), TODAY);

    expect(issues.some((issue) => issue.code === "INVALID_MINUTES")).toBe(true);
  });

  it("allows an overtime minutes load", () => {
    expect(findBoxScoreIssues(makeGame({ minutes: 52 }), TODAY)).toEqual([]);
  });

  it("blocks a game dated in the future", () => {
    const issues = findBoxScoreIssues(makeGame({ gameDate: "2026-06-01" }), TODAY);

    expect(issues.some((issue) => issue.code === "FUTURE_GAME_DATE")).toBe(true);
  });

  it("accepts a game logged earlier the same day", () => {
    expect(findBoxScoreIssues(makeGame({ gameDate: "2026-02-01" }), TODAY)).toEqual([]);
  });

  // The whole point of the severity split: a real scoresheet sometimes
  // disagrees with its own shooting splits, and refusing the user's own sheet
  // is worse than accepting it with a flag on it.
  it("only WARNS when the points total disagrees with the shooting splits", () => {
    const issues = findBoxScoreIssues(makeGame({ points: 22 }), TODAY);

    const issue = issues.find((candidate) => candidate.code === "POINTS_MISMATCH");
    expect(issue?.severity).toBe("warning");
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it("names both totals in the mismatch message so the user can see the gap", () => {
    const issues = findBoxScoreIssues(makeGame({ points: 22 }), TODAY);

    const issue = issues.find((candidate) => candidate.code === "POINTS_MISMATCH");
    expect(issue?.message).toContain("24");
    expect(issue?.message).toContain("22");
  });
});

describe("issueForField", () => {
  it("finds the issue attached to one input", () => {
    const issues = findBoxScoreIssues(makeGame({ minutes: 320 }), TODAY);

    expect(issueForField(issues, "minutes")?.code).toBe("INVALID_MINUTES");
    expect(issueForField(issues, "assists")).toBeUndefined();
  });
});
