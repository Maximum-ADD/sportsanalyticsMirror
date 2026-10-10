import { describe, expect, it } from "vitest";
import {
  MINIMUM_CALLS_REQUIRED,
  calculateHitRate,
  qualifyCandidates,
  rankLeaderboard,
  type LeaderboardCandidate,
} from "./leaderboard-ranking.js";

function createUser(
  name: string,
  calls: number,
  correct: number
): LeaderboardCandidate {
  return { kind: "user", name, calls, correct };
}

function createModel(calls: number, correct: number): LeaderboardCandidate {
  return { kind: "model", name: "Elo model", calls, correct };
}

describe("calculateHitRate", () => {
  it("rounds to four places rather than leaking float noise", () => {
    // 3/7 is 0.42857142857142855 unrounded.
    expect(calculateHitRate(3, 7)).toBe(0.4286);
  });

  it("returns a clean 0 and 1 at the extremes", () => {
    expect(calculateHitRate(0, 10)).toBe(0);
    expect(calculateHitRate(10, 10)).toBe(1);
  });

  it("does not divide by zero when nobody has called anything", () => {
    expect(calculateHitRate(0, 0)).toBe(0);
  });
});

describe("qualifyCandidates", () => {
  it("drops a user below the minimum but keeps one exactly on it", () => {
    const qualified = qualifyCandidates([
      createUser("Under", MINIMUM_CALLS_REQUIRED - 1, MINIMUM_CALLS_REQUIRED - 1),
      createUser("Exactly", MINIMUM_CALLS_REQUIRED, 1),
    ]);

    expect(qualified.map((candidate) => candidate.name)).toEqual(["Exactly"]);
  });

  // The floor exists to stop a small sample topping the board; applying it to
  // the benchmark would sometimes remove the benchmark.
  it("never applies the minimum to the model", () => {
    const qualified = qualifyCandidates([createModel(1, 1)]);

    expect(qualified).toHaveLength(1);
    expect(qualified[0].kind).toBe("model");
  });
});

describe("rankLeaderboard", () => {
  it("orders by accuracy, best first", () => {
    const board = rankLeaderboard([
      createUser("Middle", 10, 6),
      createUser("Best", 10, 9),
      createUser("Worst", 10, 2),
    ]);

    expect(board.map((entry) => entry.name)).toEqual(["Best", "Middle", "Worst"]);
    expect(board.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  // A 70% over forty games is a stronger claim than a 70% over five, so the
  // bigger sample is placed higher.
  it("breaks an accuracy tie by who has called more games", () => {
    const board = rankLeaderboard([
      createUser("Small sample", 10, 7),
      createUser("Big sample", 40, 28),
    ]);

    expect(board.map((entry) => entry.name)).toEqual(["Big sample", "Small sample"]);
  });

  it("breaks a remaining tie by name so the order never flickers", () => {
    const board = rankLeaderboard([createUser("Zoe", 10, 7), createUser("Adam", 10, 7)]);

    expect(board.map((entry) => entry.name)).toEqual(["Adam", "Zoe"]);
  });

  // Dense: three tied at the top are all rank 1 and the next distinct
  // accuracy is rank 2, not rank 4.
  it("gives everyone level on accuracy the same rank", () => {
    const board = rankLeaderboard([
      createUser("A", 10, 8),
      createUser("B", 10, 8),
      createUser("C", 10, 8),
      createUser("D", 10, 5),
    ]);

    expect(board.map((entry) => entry.rank)).toEqual([1, 1, 1, 2]);
  });

  it("places the model among the users rather than pinning it to an end", () => {
    const board = rankLeaderboard([
      createUser("Sharp", 10, 9),
      createModel(200, 128),
      createUser("Cold", 10, 3),
    ]);

    expect(board.map((entry) => entry.name)).toEqual(["Sharp", "Elo model", "Cold"]);
    expect(board[1].hitRate).toBe(0.64);
  });

  // An empty board would look broken; a board with only the benchmark on it
  // still says something.
  it("still returns the model when no user qualifies", () => {
    const board = rankLeaderboard([
      createUser("Newcomer", 1, 1),
      createModel(200, 128),
    ]);

    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ kind: "model", rank: 1 });
  });

  it("returns an empty board when there is nothing at all to rank", () => {
    expect(rankLeaderboard([])).toEqual([]);
  });

  it("never exposes anything beyond name, counts, rate and rank", () => {
    const board = rankLeaderboard([createUser("Someone", 10, 7)]);

    expect(Object.keys(board[0]).sort()).toEqual(
      ["calls", "correct", "hitRate", "kind", "name", "rank"].sort()
    );
  });
});
