import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { AdminIngestionService } from "./admin-ingestion.service.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

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
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AdminIngestionService(mockPrisma as any);
    vi.mocked(existsSync).mockReturnValue(true);
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

  describe("triggerPull", () => {
    function fakeRunningChild() {
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = vi.fn();
      return child;
    }

    it("queues a pull when scripts and venv are present", async () => {
      vi.mocked(spawn).mockReturnValue(fakeRunningChild() as unknown as ChildProcess);

      const result = await service.triggerPull();

      expect(result.started).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it("refuses a second pull while one is running", async () => {
      vi.mocked(spawn).mockReturnValue(fakeRunningChild() as unknown as ChildProcess);

      const first = await service.triggerPull();
      const second = await service.triggerPull();

      expect(first.started).toBe(true);
      expect(second.started).toBe(false);
      expect(second.message).toMatch(/already running/i);
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it("allows a new pull after the previous one exits", async () => {
      mockPrisma.ingestionSchedule.update.mockResolvedValue({});
      const firstChild = fakeRunningChild();
      vi.mocked(spawn)
        .mockReturnValueOnce(firstChild as unknown as ChildProcess)
        .mockReturnValueOnce(fakeRunningChild() as unknown as ChildProcess);

      await service.triggerPull();
      firstChild.emit("exit", 0);
      const second = await service.triggerPull();

      expect(second.started).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
    });

    it("clears the in-flight flag when the process fails to start", async () => {
      const child = fakeRunningChild();
      vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

      await service.triggerPull();
      child.emit("error", new Error("spawn failed"));
      const second = await service.triggerPull();

      expect(second.started).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
    });

    it("reports when the ingestion scripts are missing", async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => !String(path).endsWith("ingest.py"));

      const result = await service.triggerPull();

      expect(result.started).toBe(false);
      expect(result.message).toMatch(/scripts not found/i);
      expect(spawn).not.toHaveBeenCalled();
    });

    it("reports when the Python virtual environment is missing", async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => !String(path).includes(".venv"));

      const result = await service.triggerPull();

      expect(result.started).toBe(false);
      expect(result.message).toMatch(/virtual environment not found/i);
      expect(spawn).not.toHaveBeenCalled();
    });
  });
});
