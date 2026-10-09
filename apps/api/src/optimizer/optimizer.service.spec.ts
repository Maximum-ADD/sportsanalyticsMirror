import { HttpStatus } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import { ApiException } from "../common/api-exception.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { LineupRequest } from "./lineup-solver.js";
import { OptimizerService } from "./optimizer.service.js";

// One row of playerPrediction.findMany as getLatestPlayerPredictions reads
// it: the latest projection, player (with team) embedded.
function makePrediction(id: string, firstName: string, lastName: string, position: string, points: number, salary: number, asOf = "2026-10-08T09:00:00.000Z") {
  return {
    playerId: id,
    predictedFantasyPoints: points,
    salary,
    asOf: new Date(asOf),
    player: { id, firstName, lastName, position, team: { id: "team-1", abbreviation: "LAL" } },
  };
}

// Seven players, so any lock or exclusion still leaves a legal lineup under
// the $50,000 cap. Sengun's projection is the newest, so it sets
// projectionsAsOf.
const POOL = [
  makePrediction("curry", "Stephen", "Curry", "G", 50, 10_000),
  makePrediction("james", "LeBron", "James", "F", 48, 10_000),
  makePrediction("embiid", "Joel", "Embiid", "C", 47, 10_000),
  makePrediction("davis", "Anthony", "Davis", "F-C", 45, 9_500),
  makePrediction("booker", "Devin", "Booker", "G-F", 40, 8_000),
  makePrediction("sengun", "Alperen", "Sengun", "C", 35, 7_000, "2026-10-08T11:30:00.000Z"),
  makePrediction("green", "Jalen", "Green", "G", 30, 6_000),
];

function makeRequest(overrides: Partial<LineupRequest> = {}): LineupRequest {
  return { budget: 50_000, lockedPlayerIds: [], excludedPlayerIds: [], lineupCount: 1, ...overrides };
}

async function rejectionOf(promise: Promise<unknown>): Promise<ApiException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiException) return error;
    throw error;
  }
  throw new Error("expected the call to reject");
}

describe("OptimizerService.solveLineups", () => {
  let prisma: {
    playerPrediction: { findMany: ReturnType<typeof vi.fn> };
    player: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      playerPrediction: { findMany: vi.fn().mockResolvedValue(POOL) },
      player: { findMany: vi.fn().mockResolvedValue([]) },
    };
  });

  function createService(cache = new ResponseCacheService({ enabled: false })): OptimizerService {
    return new OptimizerService(prisma as unknown as PrismaService, cache);
  }

  it("returns the best lineup with the rules echoed back and the locked player marked", async () => {
    const result = await createService().solveLineups(
      makeRequest({ lockedPlayerIds: ["green", "green"], excludedPlayerIds: ["curry"] })
    );

    expect(result.budget).toBe(50_000);
    expect(result.rules).toEqual({ lineupSize: 5, minimumGuards: 1, minimumForwards: 1 });
    // Deduplicated before solving, and echoed back that way.
    expect(result.lockedPlayerIds).toEqual(["green"]);
    expect(result.excludedPlayerIds).toEqual(["curry"]);
    expect(result.projectionsAsOf).toEqual(new Date("2026-10-08T11:30:00.000Z"));

    expect(result.lineups).toHaveLength(1);
    const [best] = result.lineups;
    expect(best.rank).toBe(1);
    const ids = best.slots.map((slot) => slot.playerId);
    expect(ids).toHaveLength(5);
    expect(ids).toContain("green");
    expect(ids).not.toContain("curry");
    expect(best.totalSalary).toBeLessThanOrEqual(50_000);
    expect(best.totalPredictedPoints).toBeCloseTo(
      best.slots.reduce((sum, slot) => sum + slot.predictedFantasyPoints, 0)
    );
    for (const slot of best.slots) {
      expect(slot.isLocked).toBe(slot.playerId === "green");
      // The player row comes from the prediction pool, team included.
      expect(slot.player).toMatchObject({ id: slot.playerId, team: { abbreviation: "LAL" } });
    }
  });

  it("answers 404 NOT_FOUND when no projections exist yet", async () => {
    prisma.playerPrediction.findMany.mockResolvedValue([]);

    const error = await rejectionOf(createService().solveLineups(makeRequest()));

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(error.getResponse()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("answers 400 INFEASIBLE_LINEUP with the solver's plain-English reason", async () => {
    const error = await rejectionOf(
      createService().solveLineups(
        makeRequest({ lockedPlayerIds: ["curry", "james", "embiid", "davis", "booker", "sengun"] })
      )
    );

    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toEqual({
      error: {
        code: "INFEASIBLE_LINEUP",
        message: "You locked 6 players, but a lineup has only 5 slots. Unlock 1 of them.",
      },
    });
  });

  it("explains a lock that runs over the budget", async () => {
    const error = await rejectionOf(
      createService().solveLineups(makeRequest({ budget: 25_000, lockedPlayerIds: ["curry", "james", "embiid"] }))
    );

    expect(error.getResponse()).toMatchObject({
      error: { code: "INFEASIBLE_LINEUP", message: expect.stringContaining("$5,000 over the $25,000 budget") },
    });
  });

  it("names a locked player who has no projection, looked up from the players table", async () => {
    prisma.player.findMany.mockResolvedValue([{ id: "wemby", firstName: "Victor", lastName: "Wembanyama" }]);

    const error = await rejectionOf(createService().solveLineups(makeRequest({ lockedPlayerIds: ["wemby"] })));

    expect(prisma.player.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["wemby"] } } }));
    expect(error.getResponse()).toMatchObject({
      error: { code: "INFEASIBLE_LINEUP", message: expect.stringMatching(/^Victor Wembanyama has no projection/) },
    });
  });

  it("says so when a locked id matches no player at all", async () => {
    const error = await rejectionOf(createService().solveLineups(makeRequest({ lockedPlayerIds: ["nope"] })));

    expect(error.getResponse()).toMatchObject({
      error: { message: expect.stringContaining("an unknown player (id nope) has no projection") },
    });
  });

  it("caches one answer per rule set, whatever order or repeats the ids came in", async () => {
    const service = createService(new ResponseCacheService({ enabled: true }));

    const first = await service.solveLineups(makeRequest({ lockedPlayerIds: ["green", "booker"] }));
    const second = await service.solveLineups(makeRequest({ lockedPlayerIds: ["booker", "green", "booker"] }));
    const different = await service.solveLineups(makeRequest({ lockedPlayerIds: ["green"] }));

    expect(second).toBe(first);
    expect(different).not.toBe(first);
  });
});
