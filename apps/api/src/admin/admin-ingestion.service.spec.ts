import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminIngestionService } from "./admin-ingestion.service.js";

function createMockPrisma() {
  return {
    ingestionSchedule: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    ingestionBatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe("AdminIngestionService", () => {
  let service: AdminIngestionService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminIngestionService(mockPrisma as any);
  });

  describe("getSchedule", () => {
    it("returns default config when no schedule exists", async () => {
      mockPrisma.ingestionSchedule.findUnique.mockResolvedValue(null);

      const result = await service.getSchedule();

      expect(result.frequency).toBe("NEVER");
      expect(result.lastRunAt).toBeNull();
    });

    it("returns existing schedule config", async () => {
      const schedule = {
        frequency: "DAILY",
        lastRunAt: new Date("2026-09-16T10:00:00Z"),
        updatedAt: new Date("2026-09-16T09:00:00Z"),
      };
      mockPrisma.ingestionSchedule.findUnique.mockResolvedValue(schedule);

      const result = await service.getSchedule();

      expect(result.frequency).toBe("DAILY");
      expect(result.lastRunAt).toEqual(schedule.lastRunAt);
    });
  });

  describe("updateSchedule", () => {
    it("upserts the schedule configuration", async () => {
      const updated = {
        frequency: "WEEKLY",
        lastRunAt: null,
        updatedAt: new Date(),
      };
      mockPrisma.ingestionSchedule.upsert.mockResolvedValue(updated);

      const result = await service.updateSchedule("WEEKLY", "user-1");

      expect(mockPrisma.ingestionSchedule.upsert).toHaveBeenCalledWith({
        where: { id: "singleton" },
        update: { frequency: "WEEKLY", updatedById: "user-1" },
        create: { id: "singleton", frequency: "WEEKLY", updatedById: "user-1" },
      });
      expect(result.frequency).toBe("WEEKLY");
    });
  });

  describe("deleteBatch", () => {
    it("returns false for non-existent batch", async () => {
      mockPrisma.ingestionBatch.findUnique.mockResolvedValue(null);

      const result = await service.deleteBatch("nonexistent", "user-1");

      expect(result).toBe(false);
    });

    it("returns false for already-deleted batch", async () => {
      mockPrisma.ingestionBatch.findUnique.mockResolvedValue({
        id: "batch-1",
        deletedAt: new Date(),
      });

      const result = await service.deleteBatch("batch-1", "user-1");

      expect(result).toBe(false);
    });

    it("soft-deletes the batch", async () => {
      mockPrisma.ingestionBatch.findUnique.mockResolvedValue({
        id: "batch-1",
        deletedAt: null,
      });
      mockPrisma.ingestionBatch.update.mockResolvedValue({
        id: "batch-1",
        deletedAt: new Date(),
        deletedById: "user-1",
      });

      const result = await service.deleteBatch("batch-1", "user-1");

      expect(result).toBe(true);
      expect(mockPrisma.ingestionBatch.update).toHaveBeenCalledWith({
        where: { id: "batch-1" },
        data: {
          deletedAt: expect.any(Date),
          deletedById: "user-1",
        },
      });
    });
  });
});
