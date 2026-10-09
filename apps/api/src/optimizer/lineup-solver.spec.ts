import { describe, expect, it } from "vitest";
import { LINEUP_SIZE } from "./lineup-rules.js";
import { solveLineups, type LineupRequest, type SolvedLineup, type SolverCandidate } from "./lineup-solver.js";

const BUDGET = 50_000;

function makeCandidate(id: string, position: string, predictedFantasyPoints: number, salary: number): SolverCandidate {
  return { id, name: `Player ${id.toUpperCase()}`, position, predictedFantasyPoints, salary };
}

function makeRequest(overrides: Partial<LineupRequest> = {}): LineupRequest {
  return { budget: BUDGET, lockedPlayerIds: [], excludedPlayerIds: [], lineupCount: 1, ...overrides };
}

function idsOf(lineup: SolvedLineup): string[] {
  return lineup.players.map((player) => player.id).sort();
}

function solvedLineups(pool: SolverCandidate[], request: LineupRequest): SolvedLineup[] {
  const result = solveLineups(pool, request);
  if (!result.feasible) throw new Error(`expected a lineup, got: ${result.reason}`);
  return result.lineups;
}

function infeasibleReason(pool: SolverCandidate[], request: LineupRequest): string {
  const result = solveLineups(pool, request);
  if (result.feasible) throw new Error("expected the rules to be infeasible");
  return result.reason;
}

// A small hand-built pool where the best lineup isn't just the five highest
// projections: those five (A-E) cost $52,000, over the cap.
const POOL = [
  makeCandidate("a", "G", 50, 11_000),
  makeCandidate("b", "F", 48, 11_000),
  makeCandidate("c", "C", 45, 10_000),
  makeCandidate("d", "G-F", 40, 10_000),
  makeCandidate("e", "F", 38, 10_000),
  makeCandidate("f", "G", 30, 7_000),
  makeCandidate("g", "C", 20, 5_000),
  makeCandidate("h", "F", 12, 3_000),
  makeCandidate("i", "G", 10, 3_000),
];

// Brute force over every 5-player subset: the oracle the solver is checked
// against. Only usable on small pools.
function bruteForce(pool: SolverCandidate[], request: LineupRequest): { points: number; salary: number }[] {
  const locked = new Set(request.lockedPlayerIds);
  const excluded = new Set(request.excludedPlayerIds);
  const lineups: { points: number; salary: number }[] = [];
  const chosen: SolverCandidate[] = [];
  function visit(start: number) {
    if (chosen.length === LINEUP_SIZE) {
      const ids = new Set(chosen.map((player) => player.id));
      if ([...locked].some((id) => !ids.has(id))) return;
      if (chosen.some((player) => excluded.has(player.id))) return;
      const salary = chosen.reduce((sum, player) => sum + player.salary, 0);
      if (salary > request.budget) return;
      if (!chosen.some((player) => player.position.includes("G"))) return;
      if (!chosen.some((player) => player.position.includes("F"))) return;
      const points = chosen.reduce((sum, player) => sum + Math.round(player.predictedFantasyPoints * 100), 0);
      lineups.push({ points, salary });
      return;
    }
    for (let index = start; index < pool.length; index++) {
      chosen.push(pool[index]);
      visit(index + 1);
      chosen.pop();
    }
  }
  visit(0);
  return lineups.sort((a, b) => b.points - a.points || a.salary - b.salary);
}

// A deterministic pseudo-random source, so a failing case reproduces.
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const POSITIONS = ["G", "G", "F", "F", "C", "G-F", "F-C"];

// Pools priced either the way predict.py prices players (salary follows
// points in $100 steps, clamped to $3,000-$11,000) or at random, so the
// solver is tested on both the real shape and an adversarial one.
function randomPool(random: () => number, size: number): SolverCandidate[] {
  const followsPredictPy = random() < 0.5;
  return Array.from({ length: size }, (_, index) => {
    const points = Math.round(random() * 6_000) / 100;
    const salary = followsPredictPy
      ? Math.max(3_000, Math.min(11_000, Math.round((3_000 + points * 160) / 100) * 100))
      : 3_000 + Math.floor(random() * 80) * 100 + (random() < 0.3 ? 50 : 0);
    return makeCandidate(`p${index}`, POSITIONS[Math.floor(random() * POSITIONS.length)], points, salary);
  });
}

describe("solveLineups", () => {
  it("picks the highest-projected lineup that fits the cap, not the five highest projections", () => {
    const [best] = solvedLineups(POOL, makeRequest());
    // A+B+C+D+E would be 221 points but costs $52,000. Swapping E ($10,000)
    // for F ($7,000) costs 8 points and is the cheapest way under the cap.
    expect(idsOf(best)).toEqual(["a", "b", "c", "d", "f"]);
    expect(best.totalPredictedPoints).toBe(213);
    expect(best.totalSalary).toBe(49_000);
  });

  it("orders a lineup's players by projection and sums totals exactly", () => {
    const pool = [
      makeCandidate("a", "G", 10.1, 3_000),
      makeCandidate("b", "F", 20.2, 3_000),
      makeCandidate("c", "C", 30.3, 3_000),
      makeCandidate("d", "G", 0.1, 3_000),
      makeCandidate("e", "F", 0.2, 3_000),
    ];
    const [best] = solvedLineups(pool, makeRequest());
    expect(best.players.map((player) => player.id)).toEqual(["c", "b", "a", "e", "d"]);
    // 60.9 exactly, not 60.900000000000006.
    expect(best.totalPredictedPoints).toBe(60.9);
  });

  it("counts a combo guard-forward toward both position minimums", () => {
    const pool = [
      makeCandidate("combo", "G-F", 30, 3_000),
      makeCandidate("c1", "C", 40, 3_000),
      makeCandidate("c2", "C", 40, 3_000),
      makeCandidate("c3", "C", 40, 3_000),
      makeCandidate("c4", "C", 40, 3_000),
      makeCandidate("g", "G", 1, 3_000),
      makeCandidate("f", "F", 1, 3_000),
    ];
    const [best] = solvedLineups(pool, makeRequest());
    expect(idsOf(best)).toEqual(["c1", "c2", "c3", "c4", "combo"]);
  });

  it("matches a brute-force search on random pools", () => {
    const random = seededRandom(7);
    for (let trial = 0; trial < 150; trial++) {
      const pool = randomPool(random, 8 + Math.floor(random() * 6));
      const request = makeRequest({ budget: 20_000 + Math.floor(random() * 30) * 1_000 });
      const expected = bruteForce(pool, request);
      const result = solveLineups(pool, request);
      if (expected.length === 0) {
        expect(result.feasible).toBe(false);
        continue;
      }
      expect(result.feasible).toBe(true);
      if (!result.feasible) continue;
      expect(Math.round(result.lineups[0].totalPredictedPoints * 100)).toBe(expected[0].points);
    }
  });

  describe("locks", () => {
    it("puts a locked player in the lineup even when they aren't part of the best one", () => {
      const [best] = solvedLineups(POOL, makeRequest({ lockedPlayerIds: ["g"] }));
      expect(idsOf(best)).toContain("g");
      expect(best.totalSalary).toBeLessThanOrEqual(BUDGET);
    });

    it("keeps the lineup legal around the locks", () => {
      // Locking three centers and a forward leaves one slot, which has to
      // go to a guard.
      const pool = [
        ...POOL,
        makeCandidate("c2", "C", 5, 3_000),
        makeCandidate("c3", "C", 5, 3_000),
      ];
      const [best] = solvedLineups(pool, makeRequest({ lockedPlayerIds: ["c", "c2", "c3", "b"] }));
      expect(idsOf(best)).toEqual(["a", "b", "c", "c2", "c3"]);
    });

    it("returns the locked players themselves when all five slots are locked", () => {
      const [best] = solvedLineups(POOL, makeRequest({ lockedPlayerIds: ["a", "b", "f", "g", "h"] }));
      expect(idsOf(best)).toEqual(["a", "b", "f", "g", "h"]);
    });

    it("ignores a player locked twice", () => {
      const [best] = solvedLineups(POOL, makeRequest({ lockedPlayerIds: ["g", "g"] }));
      expect(idsOf(best)).toContain("g");
    });

    it("matches a brute-force search when random players are locked", () => {
      const random = seededRandom(11);
      for (let trial = 0; trial < 150; trial++) {
        const pool = randomPool(random, 8 + Math.floor(random() * 6));
        const lockedPlayerIds = pool.filter(() => random() < 0.2).slice(0, 4).map((player) => player.id);
        const request = makeRequest({ budget: 25_000 + Math.floor(random() * 25) * 1_000, lockedPlayerIds });
        const expected = bruteForce(pool, request);
        const result = solveLineups(pool, request);
        expect(result.feasible).toBe(expected.length > 0);
        if (!result.feasible) continue;
        expect(Math.round(result.lineups[0].totalPredictedPoints * 100)).toBe(expected[0].points);
        expect(idsOf(result.lineups[0])).toEqual(expect.arrayContaining(lockedPlayerIds));
      }
    });
  });

  describe("excludes", () => {
    it("never picks an excluded player", () => {
      const [best] = solvedLineups(POOL, makeRequest({ excludedPlayerIds: ["a", "c"] }));
      expect(idsOf(best)).not.toContain("a");
      expect(idsOf(best)).not.toContain("c");
    });

    it("matches a brute-force search when random players are excluded", () => {
      const random = seededRandom(13);
      for (let trial = 0; trial < 150; trial++) {
        const pool = randomPool(random, 9 + Math.floor(random() * 5));
        const excludedPlayerIds = pool.filter(() => random() < 0.25).map((player) => player.id);
        const request = makeRequest({ excludedPlayerIds });
        const expected = bruteForce(pool, request);
        const result = solveLineups(pool, request);
        expect(result.feasible).toBe(expected.length > 0);
        if (!result.feasible) continue;
        expect(Math.round(result.lineups[0].totalPredictedPoints * 100)).toBe(expected[0].points);
        expect(idsOf(result.lineups[0]).some((id) => excludedPlayerIds.includes(id))).toBe(false);
      }
    });
  });

  describe("infeasible rules", () => {
    it("explains more locks than slots", () => {
      const reason = infeasibleReason(POOL, makeRequest({ lockedPlayerIds: ["a", "b", "c", "d", "e", "f"] }));
      expect(reason).toBe("You locked 6 players, but a lineup has only 5 slots. Unlock 1 of them.");
    });

    it("explains a player who is both locked and excluded", () => {
      const reason = infeasibleReason(POOL, makeRequest({ lockedPlayerIds: ["a"], excludedPlayerIds: ["a"] }));
      expect(reason).toMatch(/^Player A is both locked and excluded/);
    });

    it("explains a locked player with no projection", () => {
      const reason = infeasibleReason(POOL, makeRequest({ lockedPlayerIds: ["unknown-id"] }));
      expect(reason).toMatch(/No projection exists for locked player unknown-id/);
    });

    it("explains locks that cost more than the budget on their own", () => {
      const reason = infeasibleReason(POOL, makeRequest({ budget: 30_000, lockedPlayerIds: ["a", "b", "c"] }));
      expect(reason).toBe(
        "Your locked players cost $32,000 together, which is $2,000 over the $30,000 budget. Unlock one of them."
      );
    });

    it("explains locks that leave too little budget for the open slots", () => {
      // A-D cost $42,000 and already cover both positions, leaving $2,000
      // for one slot; nobody costs less than $3,000.
      const reason = infeasibleReason(POOL, makeRequest({ budget: 44_000, lockedPlayerIds: ["a", "b", "c", "d"] }));
      expect(reason).toBe(
        "Your locked players cost $42,000, leaving $2,000 of the $44,000 budget for 1 more player. " +
          "The cheapest player who keeps the lineup legal costs $3,000, $1,000 too much. Unlock a player or raise the budget."
      );
    });

    it("prices the cheapest legal fill for several open slots", () => {
      // A and B leave $8,000 for three players; the cheapest three are H, I
      // and G at $11,000.
      const reason = infeasibleReason(POOL, makeRequest({ budget: 30_000, lockedPlayerIds: ["a", "b"] }));
      expect(reason).toMatch(/The cheapest 3 players who keep the lineup legal cost \$11,000, \$3,000 too much\./);
    });

    it("explains a budget below the cheapest legal lineup", () => {
      // H, I, G, F and the cheapest $10,000 player.
      const reason = infeasibleReason(POOL, makeRequest({ budget: 20_000 }));
      expect(reason).toBe(
        "The cheapest lineup that meets the roster rules costs $28,000, $8,000 over the $20,000 budget."
      );
    });

    it("explains five locked players with no guard", () => {
      const reason = infeasibleReason(POOL, makeRequest({ lockedPlayerIds: ["b", "c", "e", "g", "h"] }));
      expect(reason).toMatch(/^All 5 slots are locked, but the locked players don't include a guard\./);
    });

    it("explains when every guard has been excluded", () => {
      const reason = infeasibleReason(POOL, makeRequest({ excludedPlayerIds: ["a", "d", "f", "i"] }));
      expect(reason).toBe(
        "No guard is left to pick from once excluded players are set aside. Remove an exclusion or lock a guard."
      );
    });

    it("explains one open slot that would have to be both a guard and a forward", () => {
      const pool = [
        ...POOL.filter((player) => player.position !== "G-F"),
        makeCandidate("c2", "C", 5, 3_000),
        makeCandidate("c3", "C", 5, 3_000),
        makeCandidate("c4", "C", 5, 3_000),
      ];
      const reason = infeasibleReason(pool, makeRequest({ lockedPlayerIds: ["c", "c2", "c3", "c4"] }));
      expect(reason).toMatch(/^Your locks leave 1 open slot, which isn't room for a guard and a forward/);
    });

    it("explains a pool too small to fill the lineup", () => {
      const reason = infeasibleReason(POOL.slice(0, 6), makeRequest({ excludedPlayerIds: ["c", "d"] }));
      expect(reason).toBe(
        "Only 4 players are left to pick from once locked and excluded players are set aside, but the lineup needs 5."
      );
    });
  });
});
