import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminEventsService } from "./admin-events.service.js";

const GAME = { id: "g1", season: "2024-25", homeTeamId: "t1", awayTeamId: "t2" };

function makeStoredEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    gameId: "g1",
    sequence: 5,
    period: 1,
    clock: "PT08M30.00S",
    eventType: "2pt",
    subType: "Jump Shot",
    playerId: "p1",
    teamId: "t1",
    success: true,
    value: 2,
    description: "Doe 12' Jump Shot (2 PTS)",
    batchId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockPrisma() {
  // The transaction and the plain client are the same mock: every read a
  // correction makes goes through the transaction it runs in.
  const client = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "g1" }]),
    game: { findUnique: vi.fn().mockResolvedValue(GAME) },
    gameEvent: { update: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([makeStoredEvent()]) },
    // No stat rows, so there's nothing to recompute: these tests cover the
    // correction/audit-trail path, and the e2e spec covers recomputation.
    playerGameStat: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
    player: { findMany: vi.fn().mockResolvedValue([]) },
    datasetRelease: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    eventCorrection: {
      create: vi.fn().mockResolvedValue({ id: "ec1" }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(),
  };
  client.$transaction.mockImplementation(async (fn: (tx: typeof client) => Promise<unknown>) => fn(client));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  return client as any;
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
    it("rejects with 404 when the game doesn't exist", async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.correctEvent("g1", 5, { patch: { value: null }, reason: "r" }, "u1")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("rejects with 404 when the event doesn't exist", async () => {
      await expect(service.correctEvent("g1", 99, { patch: { value: null }, reason: "r" }, "u1")).rejects.toMatchObject({
        status: 404,
      });
    });

    it("locks the game before reading the play it corrects", async () => {
      await service.correctEvent("g1", 5, { patch: { value: null }, reason: "r" }, "u1");
      const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(prisma.gameEvent.findMany.mock.invocationCallOrder[0]);
    });

    it("applies the correction, marks releases stale and invalidates caches", async () => {
      const saved = await service.correctEvent("g1", 5, { patch: { value: null }, reason: "Corrected value" }, "u1");

      expect(prisma.gameEvent.update).toHaveBeenCalledWith({
        where: { gameId_sequence: { gameId: "g1", sequence: 5 } },
        data: { value: null },
      });
      expect(prisma.datasetRelease.updateMany).toHaveBeenCalledWith({
        where: { season: "2024-25" },
        data: { isStale: true },
      });
      expect(saved.releasesMarkedStale).toBe(2);
      expect(cache.invalidate).toHaveBeenCalledWith("games");
      expect(cache.invalidate).toHaveBeenCalledWith("players");
    });

    it("records only the fields that actually change", async () => {
      await service.correctEvent("g1", 5, { patch: { value: null, period: 1 }, reason: "r" }, "u1");

      expect(prisma.eventCorrection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gameId: "g1",
          sequence: 5,
          previousValues: { value: 2 },
          newValues: { value: null },
          correctedById: "u1",
          reason: "r",
        }),
      });
    });

    it("rejects a correction that changes nothing, without writing", async () => {
      await expect(service.correctEvent("g1", 5, { patch: { value: 2 }, reason: "r" }, "u1")).rejects.toMatchObject({
        status: 400,
      });
      expect(prisma.gameEvent.update).not.toHaveBeenCalled();
    });
  });
});
