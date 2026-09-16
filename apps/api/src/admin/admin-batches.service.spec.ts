import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminBatchesService } from "./admin-batches.service.js";

// Minimal mock that lets us configure return values per-call.
function createMockPrisma() {
  return {
    ingestionBatch: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({}),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
}

function createMockCache() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  return { invalidate: vi.fn() } as any;
}

describe("AdminBatchesService", () => {
  let service: AdminBatchesService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: ReturnType<typeof createMockCache>;

  beforeEach(() => {
    prisma = createMockPrisma();
    cache = createMockCache();
    service = new AdminBatchesService(prisma, cache);
  });

  describe("listBatches", () => {
    it("passes no filters when query is empty", async () => {
      await service.listBatches({});
      const where = prisma.ingestionBatch.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ deletedAt: null });
    });

    it("applies a valid status filter", async () => {
      await service.listBatches({ status: "COMPLETED" });
      const where = prisma.ingestionBatch.findMany.mock.calls[0][0].where;
      expect(where.status).toBe("COMPLETED");
    });

    it("ignores an invalid status filter", async () => {
      await service.listBatches({ status: "BOGUS" });
      const where = prisma.ingestionBatch.findMany.mock.calls[0][0].where;
      expect(where.status).toBeUndefined();
    });

    it("applies search terms against game id and team names", async () => {
      await service.listBatches({ search: "Lakers" });
      const where = prisma.ingestionBatch.findMany.mock.calls[0][0].where;
      expect(where.game).toBeDefined();
      expect(where.game.OR).toBeDefined();
      expect(where.game.OR.length).toBeGreaterThan(0);
    });

    it("ignores whitespace-only search", async () => {
      await service.listBatches({ search: "   " });
      const where = prisma.ingestionBatch.findMany.mock.calls[0][0].where;
      expect(where.game).toBeUndefined();
    });

    it("applies both status and search together", async () => {
      await service.listBatches({ status: "PENDING_REVIEW", search: "Celtics" });
      const where = prisma.ingestionBatch.findMany.mock.calls[0][0].where;
      expect(where.status).toBe("PENDING_REVIEW");
      expect(where.game).toBeDefined();
    });
  });

  describe("getBatchById", () => {
    it("returns null when batch does not exist", async () => {
      prisma.ingestionBatch.findUnique.mockResolvedValue(null);
      const result = await service.getBatchById("nonexistent");
      expect(result).toBeNull();
    });

    it("returns the batch when it exists", async () => {
      const batch = { id: "b1", gameId: "g1", deletedAt: null };
      prisma.ingestionBatch.findUnique.mockResolvedValue(batch);
      const result = await service.getBatchById("b1");
      expect(result).toEqual(batch);
    });

    it("returns null when batch is soft-deleted", async () => {
      const batch = { id: "b1", gameId: "g1", deletedAt: new Date() };
      prisma.ingestionBatch.findUnique.mockResolvedValue(batch);
      const result = await service.getBatchById("b1");
      expect(result).toBeNull();
    });
  });

  describe("approveBatch", () => {
    it("sets COMPLETED status and invalidates game + player caches", async () => {
      const userId = "u1";
      await service.approveBatch("b1", userId, "looks good");

      expect(prisma.ingestionBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "b1", deletedAt: null },
          data: expect.objectContaining({
            status: "COMPLETED",
            reviewedById: userId,
            reviewNotes: "looks good",
          }),
        })
      );
      expect(cache.invalidate).toHaveBeenCalledWith("games");
      expect(cache.invalidate).toHaveBeenCalledWith("players");
    });

    it("sets reviewNotes to null when not provided", async () => {
      await service.approveBatch("b1", "u1");
      const data = prisma.ingestionBatch.update.mock.calls[0][0].data;
      expect(data.reviewNotes).toBeNull();
    });
  });

  describe("rejectBatch", () => {
    it("sets REJECTED status and stores review notes", async () => {
      await service.rejectBatch("b1", "u1", "bad data");
      expect(prisma.ingestionBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "b1", deletedAt: null },
          data: expect.objectContaining({
            status: "REJECTED",
            reviewedById: "u1",
            reviewNotes: "bad data",
          }),
        })
      );
    });

    it("sets reviewNotes to null when not provided", async () => {
      await service.rejectBatch("b1", "u1");
      const data = prisma.ingestionBatch.update.mock.calls[0][0].data;
      expect(data.reviewNotes).toBeNull();
    });
  });
});
