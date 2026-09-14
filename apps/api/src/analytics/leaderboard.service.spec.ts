import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResponseCacheService } from "../cache/response-cache.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { LEADERBOARD_CACHE_NAMESPACE, LeaderboardService } from "./leaderboard.service.js";

// One groupBy row per (userId, outcome) pair, as Prisma returns them.
function makePickCountRow(userId: string, outcome: "CORRECT" | "MISSED", count: number) {
  return { userId, outcome, _count: { _all: count } };
}

describe("LeaderboardService", () => {
  let prisma: {
    gamePick: { groupBy: ReturnType<typeof vi.fn> };
    user: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prisma = {
      gamePick: { groupBy: vi.fn() },
      user: { findMany: vi.fn() },
    };
  });

  function createService(cache = new ResponseCacheService({ enabled: false })): LeaderboardService {
    return new LeaderboardService(prisma as unknown as PrismaService, cache);
  }

  it("folds (userId, outcome) counts into calls and correct calls with one groupBy", async () => {
    prisma.gamePick.groupBy.mockResolvedValue([
      makePickCountRow("sharp", "CORRECT", 9),
      makePickCountRow("sharp", "MISSED", 1),
      makePickCountRow("cold", "MISSED", 8),
      makePickCountRow("cold", "CORRECT", 2),
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: "sharp", name: "Sharp Caller" },
      { id: "cold", name: "Cold Caller" },
    ]);

    const leaderboard = await createService().getLeaderboard([]);

    expect(prisma.gamePick.groupBy).toHaveBeenCalledTimes(1);
    const userEntries = leaderboard.entries.filter((entry) => entry.kind === "user");
    expect(userEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Sharp Caller", calls: 10, correct: 9 }),
        expect.objectContaining({ name: "Cold Caller", calls: 10, correct: 2 }),
      ])
    );
  });

  it("gives a user with no correct calls a correct count of zero", async () => {
    prisma.gamePick.groupBy.mockResolvedValue([makePickCountRow("unlucky", "MISSED", 6)]);
    prisma.user.findMany.mockResolvedValue([{ id: "unlucky", name: "Unlucky" }]);

    const leaderboard = await createService().getLeaderboard([]);

    expect(leaderboard.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Unlucky", calls: 6, correct: 0 })])
    );
  });

  it("only looks up names for users who meet the minimum call count", async () => {
    prisma.gamePick.groupBy.mockResolvedValue([
      makePickCountRow("qualified", "CORRECT", 5),
      makePickCountRow("rookie", "CORRECT", 1),
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "qualified", name: "Qualified" }]);

    await createService().getLeaderboard([]);

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["qualified"] } });
  });

  it("serves user counts from the cache until a pick invalidates them", async () => {
    const cache = new ResponseCacheService({ enabled: true });
    const service = createService(cache);
    prisma.gamePick.groupBy.mockResolvedValue([]);

    await service.getLeaderboard([]);
    await service.getLeaderboard([]);
    expect(prisma.gamePick.groupBy).toHaveBeenCalledTimes(1);

    cache.invalidate(LEADERBOARD_CACHE_NAMESPACE);
    await service.getLeaderboard([]);
    expect(prisma.gamePick.groupBy).toHaveBeenCalledTimes(2);
  });
});
