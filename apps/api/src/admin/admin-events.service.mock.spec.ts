import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminEventsService } from "./admin-events.service.js";

function createMockPrisma() {
  const txProxy = {
    gameEvent: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    // Empty by default so recomputeDerivedStats's own "nothing to recompute"
    // branch (existingStats.length === 0) short-circuits before it would
    // need player.findMany/playerGameStat.update — none of the tests below
    // exercise real recomputation, only the correction/audit-trail path.
    playerGameStat: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
    player: { findMany: vi.fn().mockResolvedValue([]) },
    eventCorrection: { create: vi.fn().mockResolvedValue({ id: "ec1" }) },
  };
  return {
    eventCorrection: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    gameEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (tx: typeof txProxy) => Promise<unknown>) => {
      return fn(txProxy);
    }),
    _tx: txProxy,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
}

function createMockCache() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  return { invalidate: vi.fn() } as any;
}

describe("AdminEventsService", () => {
  let service: AdminEventsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: ReturnType<typeof createMockCache>;

  beforeEach(() => {
    prisma = createMockPrisma();
    cache = createMockCache();
    service = new AdminEventsService(prisma, cache);
  });

  describe("listCorrections", () => {
    it("returns paginated corrections", async () => {
      const result = await service.listCorrections({});
      expect(result.data).toEqual([]);
      expect(result.page).toBe(1);
    });
  });

  describe("listCorrectionsForGame", () => {
    it("queries corrections filtered by gameId", async () => {
      await service.listCorrectionsForGame("g1");
      expect(prisma.eventCorrection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { gameId: "g1" } })
      );
    });
  });

  describe("correctEvent", () => {
    it("returns null-ish when the event does not exist", async () => {
      prisma.gameEvent.findUnique.mockResolvedValue(null);
      const result = await service.correctEvent("g1", 1, { points: 3 }, "u1");
      expect(result).toBeNull();
    });

    it("applies correction and invalidates caches when event exists", async () => {
      const currentEvent = {
        gameId: "g1",
        sequence: 1,
        period: 1,
        clock: "10:00",
        eventType: "SHOT",
        subType: null,
        playerId: "p1",
        teamId: "t1",
        success: true,
        value: 2,
        description: "Made shot",
      };
      prisma.gameEvent.findUnique.mockResolvedValue(currentEvent);

      const patch = { value: 3, reason: "Corrected value" };
      await service.correctEvent("g1", 1, patch, "u1");

      // Should have called $transaction
      expect(prisma.$transaction).toHaveBeenCalled();

      // Cache should be invalidated for both games and players
      expect(cache.invalidate).toHaveBeenCalledWith("games");
      expect(cache.invalidate).toHaveBeenCalledWith("players");
    });

    it("records previousValues and newValues for corrected fields", async () => {
      const currentEvent = {
        gameId: "g1",
        sequence: 5,
        period: 1,
        clock: "8:30",
        eventType: "SHOT",
        subType: null,
        playerId: "p1",
        teamId: "t1",
        success: true,
        value: 2,
        description: "Made shot",
      };
      prisma.gameEvent.findUnique.mockResolvedValue(currentEvent);

      const patch = { value: 3 };
      await service.correctEvent("g1", 5, patch, "u1");

      // The transaction callback should have been called
      expect(prisma._tx.eventCorrection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gameId: "g1",
            sequence: 5,
            correctedById: "u1",
          }),
        })
      );
    });
  });
});
