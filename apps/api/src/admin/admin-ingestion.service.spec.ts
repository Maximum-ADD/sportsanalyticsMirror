import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { AdminIngestionService, buildIngestionArgs } from "./admin-ingestion.service.js";

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
    ingestionRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "request-1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ingestionWorker: {
      findFirst: vi.fn().mockResolvedValue(null),
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

    it("passes the season and date window through to the script", async () => {
      vi.mocked(spawn).mockReturnValue(fakeRunningChild() as unknown as ChildProcess);

      const result = await service.triggerPull("user-1", {
        season: "2024-25",
        fromDate: "2026-04-14",
        toDate: "2026-04-18",
      });

      expect(result.started).toBe(true);
      const spawnArgs = vi.mocked(spawn).mock.calls[0][1] as string[];
      expect(spawnArgs.slice(1)).toEqual([
        "--review", "--season", "2024-25", "--from-date", "2026-04-14", "--to-date", "2026-04-18",
      ]);
    });

    it("refuses a malformed window without spawning anything", async () => {
      const result = await service.triggerPull("user-1", { fromDate: "14/04/2026" });

      expect(result.started).toBe(false);
      expect(result.message).toMatch(/YYYY-MM-DD/);
      expect(spawn).not.toHaveBeenCalled();
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

    // Before the queue existed, a server without the ingestion environment
    // could only refuse. Now it hands the pull to a pull worker instead.
    it("queues the pull when the ingestion scripts are missing", async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => !String(path).endsWith("ingest.py"));

      const result = await service.triggerPull("user-1");

      expect(result).toMatchObject({ started: true, queued: true });
      expect(mockPrisma.ingestionRequest.create).toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    });

    it("queues the pull when the Python virtual environment is missing", async () => {
      vi.mocked(existsSync).mockImplementation((path: unknown) => !String(path).includes(".venv"));

      const result = await service.triggerPull("user-1");

      expect(result).toMatchObject({ started: true, queued: true });
      expect(spawn).not.toHaveBeenCalled();
    });
  });

  describe("queue mode", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false);
    });

    afterEach(() => {
      delete process.env.INGESTION_MODE;
    });

    it("records the requester and the window for the worker to run", async () => {
      await service.triggerPull("user-1", { season: "2024-25", fromDate: "2026-04-14", toDate: "2026-04-18" });

      expect(mockPrisma.ingestionRequest.create).toHaveBeenCalledWith({
        data: {
          season: "2024-25",
          fromDate: "2026-04-14",
          toDate: "2026-04-18",
          scheduled: false,
          requestedById: "user-1",
        },
      });
    });

    it("queues even where it could run the pull itself when INGESTION_MODE=queue", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      process.env.INGESTION_MODE = "queue";

      const result = await service.triggerPull("user-1");

      expect(result.queued).toBe(true);
      expect(spawn).not.toHaveBeenCalled();
    });

    it("rejects a malformed window without queuing anything", async () => {
      const result = await service.triggerPull("user-1", { toDate: "18/04/2026" });

      expect(result.started).toBe(false);
      expect(mockPrisma.ingestionRequest.create).not.toHaveBeenCalled();
    });

    it("refuses a second request while one is still queued", async () => {
      mockPrisma.ingestionRequest.findFirst.mockResolvedValue({ status: "QUEUED", claimedBy: null });

      const result = await service.triggerPull("user-1");

      expect(result.started).toBe(false);
      expect(result.message).toMatch(/already queued/i);
      expect(mockPrisma.ingestionRequest.create).not.toHaveBeenCalled();
    });

    it("names the worker when a request is already running", async () => {
      mockPrisma.ingestionRequest.findFirst.mockResolvedValue({ status: "RUNNING", claimedBy: "home-pc" });

      const result = await service.triggerPull("user-1");

      expect(result.message).toMatch(/already running on home-pc/);
    });

    it("does not let a long-dead RUNNING request block new ones forever", async () => {
      await service.triggerPull("user-1");

      const { where } = mockPrisma.ingestionRequest.findFirst.mock.calls[0][0];
      const runningClause = where.OR.find((clause: { status: string }) => clause.status === "RUNNING");
      const cutoffInHours = (Date.now() - runningClause.claimedAt.gte.getTime()) / (60 * 60 * 1000);
      expect(cutoffInHours).toBeCloseTo(3, 1);
    });

    it("reports queue mode and when a worker last checked in", async () => {
      const lastSeenAt = new Date("2026-09-18T14:02:00Z");
      mockPrisma.ingestionWorker.findFirst.mockResolvedValue({ lastSeenAt });
      mockPrisma.ingestionSchedule.findUnique.mockResolvedValue(null);

      const schedule = await service.getSchedule();

      expect(schedule).toMatchObject({ pullMode: "queue", ingestionAvailable: false, workerLastSeenAt: lastSeenAt });
    });

    it("cancels only a request no worker has claimed", async () => {
      await expect(service.cancelPullRequest("request-1")).resolves.toBe(true);
      expect(mockPrisma.ingestionRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "request-1", status: "QUEUED" } }),
      );

      mockPrisma.ingestionRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.cancelPullRequest("request-2")).resolves.toBe(false);
    });

    it("lists the most recent requests first", async () => {
      await service.listPullRequests();

      expect(mockPrisma.ingestionRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { requestedAt: "desc" }, take: 10 }),
      );
    });
  });

  describe("ingestion availability", () => {
    it("reports ingestionAvailable on the default schedule config", async () => {
      mockPrisma.ingestionSchedule.findUnique.mockResolvedValue(null);

      const result = await service.getSchedule();

      expect(result.frequency).toBe("NEVER");
      expect(result.ingestionAvailable).toBe(true);
    });

    it("reports unavailable when the ingestion environment is missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      mockPrisma.ingestionSchedule.findUnique.mockResolvedValue(null);

      const result = await service.getSchedule();

      expect(result.ingestionAvailable).toBe(false);
    });

    it("queues a due scheduled pull where this server can't run it", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      mockPrisma.ingestionSchedule.findUnique.mockResolvedValue({
        frequency: "DAILY",
        lastRunAt: null,
        updatedAt: new Date(),
      });

      await service.checkSchedule();

      expect(mockPrisma.ingestionRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ scheduled: true, requestedById: null }),
      });
      expect(spawn).not.toHaveBeenCalled();
    });

    it("queues nothing when the schedule is off", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      mockPrisma.ingestionSchedule.findUnique.mockResolvedValue(null);

      await service.checkSchedule();

      expect(mockPrisma.ingestionRequest.create).not.toHaveBeenCalled();
    });

    it("runs the scheduled pull when it is due and ingestion is available", async () => {
      mockPrisma.ingestionSchedule.findUnique.mockResolvedValue({
        frequency: "HOURLY",
        lastRunAt: null,
        updatedAt: new Date(),
      });
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = vi.fn();
      vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcess);

      await service.checkSchedule();

      expect(spawn).toHaveBeenCalledTimes(1);
    });
  });
});

describe("buildIngestionArgs", () => {
  it("always asks for review, so pulls land as PENDING_REVIEW", () => {
    expect(buildIngestionArgs({})).toEqual(["--review"]);
  });

  it("adds only the options that were given", () => {
    expect(buildIngestionArgs({ season: "2024-25" })).toEqual([
      "--review", "--season", "2024-25",
    ]);
    expect(buildIngestionArgs({ fromDate: "2026-04-14" })).toEqual([
      "--review", "--from-date", "2026-04-14",
    ]);
  });

  it("builds a full window", () => {
    expect(
      buildIngestionArgs({ season: "2025-26", fromDate: "2026-04-14", toDate: "2026-04-18" }),
    ).toEqual([
      "--review", "--season", "2025-26", "--from-date", "2026-04-14", "--to-date", "2026-04-18",
    ]);
  });

  it("rejects a malformed season", () => {
    expect(() => buildIngestionArgs({ season: "2025" })).toThrow(/2025-26/);
  });

  it("rejects a malformed date", () => {
    expect(() => buildIngestionArgs({ toDate: "April 18" })).toThrow(/YYYY-MM-DD/);
  });

  it("rejects an inverted window, which would silently select no games", () => {
    expect(() =>
      buildIngestionArgs({ fromDate: "2026-04-18", toDate: "2026-04-14" }),
    ).toThrow(/must not be after/);
  });
});
