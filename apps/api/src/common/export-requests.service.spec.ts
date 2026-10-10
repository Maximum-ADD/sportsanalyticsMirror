import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportRequestsService } from "./export-requests.service.js";

function createMockPrisma() {
  return {
    exportRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
}

const QUEUED_REQUEST = {
  id: "export-1",
  status: "QUEUED",
  resource: "PLAYERS",
  requestedAt: new Date("2026-10-09T00:00:00.000Z"),
  startedAt: null,
  finishedAt: null,
  message: null,
  rowCount: null,
  query: { teamId: "team-1" },
};

describe("ExportRequestsService", () => {
  let service: ExportRequestsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ExportRequestsService(prisma);
  });

  describe("queueExport", () => {
    it("creates a QUEUED request carrying the resource and query", async () => {
      prisma.exportRequest.create.mockResolvedValue({ ...QUEUED_REQUEST });

      await service.queueExport("PLAYERS", { teamId: "team-1" });

      expect(prisma.exportRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { resource: "PLAYERS", query: { teamId: "team-1" } } }),
      );
    });
  });

  describe("getExportById", () => {
    it("returns null when the request does not exist", async () => {
      prisma.exportRequest.findUnique.mockResolvedValue(null);
      await expect(service.getExportById("missing")).resolves.toBeNull();
    });

    it("returns the request summary when it exists", async () => {
      prisma.exportRequest.findUnique.mockResolvedValue({ ...QUEUED_REQUEST });
      await expect(service.getExportById("export-1")).resolves.toMatchObject({ id: "export-1", status: "QUEUED" });
    });
  });

  describe("getExportCsv", () => {
    it("returns null when the request does not exist", async () => {
      prisma.exportRequest.findUnique.mockResolvedValue(null);
      await expect(service.getExportCsv("missing")).resolves.toBeNull();
    });

    it("returns null when the request has not succeeded yet", async () => {
      prisma.exportRequest.findUnique.mockResolvedValue({
        status: "RUNNING",
        csv: null,
        resource: "PLAYERS",
        expiresAt: null,
      });
      await expect(service.getExportCsv("export-1")).resolves.toBeNull();
    });

    it("returns null once the request has expired", async () => {
      prisma.exportRequest.findUnique.mockResolvedValue({
        status: "SUCCEEDED",
        csv: "id,name\r\n",
        resource: "PLAYERS",
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.getExportCsv("export-1")).resolves.toBeNull();
    });

    it("returns the csv for a succeeded, unexpired request", async () => {
      prisma.exportRequest.findUnique.mockResolvedValue({
        status: "SUCCEEDED",
        csv: "id,name\r\n1,Curry\r\n",
        resource: "PLAYERS",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      await expect(service.getExportCsv("export-1")).resolves.toEqual({
        csv: "id,name\r\n1,Curry\r\n",
        resource: "PLAYERS",
      });
    });
  });

  describe("processNextQueued", () => {
    it("does nothing when nothing is queued", async () => {
      prisma.exportRequest.findFirst.mockResolvedValue(null);

      await service.processNextQueued();

      expect(prisma.exportRequest.updateMany).not.toHaveBeenCalled();
    });

    it("fails the request when no builder is registered for its resource", async () => {
      prisma.exportRequest.findFirst.mockResolvedValue({ ...QUEUED_REQUEST });
      prisma.exportRequest.updateMany.mockResolvedValue({ count: 1 });

      await service.processNextQueued();

      expect(prisma.exportRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "export-1" },
          data: expect.objectContaining({ status: "FAILED" }),
        }),
      );
    });

    it("does nothing further when another process already claimed the request", async () => {
      prisma.exportRequest.findFirst.mockResolvedValue({ ...QUEUED_REQUEST });
      prisma.exportRequest.updateMany.mockResolvedValue({ count: 0 });

      await service.processNextQueued();

      expect(prisma.exportRequest.update).not.toHaveBeenCalled();
    });

    it("runs the registered builder and marks the request SUCCEEDED with the CSV", async () => {
      prisma.exportRequest.findFirst.mockResolvedValue({ ...QUEUED_REQUEST });
      prisma.exportRequest.updateMany.mockResolvedValue({ count: 1 });
      service.registerBuilder("PLAYERS", {
        fetchRows: vi.fn().mockResolvedValue([{ id: "p1", name: "Curry" }]),
        columns: [
          { header: "id", value: (row: { id: string }) => row.id },
          { header: "name", value: (row: { name: string }) => row.name },
        ],
      });

      await service.processNextQueued();

      expect(prisma.exportRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "export-1" },
          data: expect.objectContaining({
            status: "SUCCEEDED",
            csv: "id,name\r\np1,Curry\r\n",
            rowCount: 1,
          }),
        }),
      );
    });

    it("marks the request FAILED when the builder throws", async () => {
      prisma.exportRequest.findFirst.mockResolvedValue({ ...QUEUED_REQUEST });
      prisma.exportRequest.updateMany.mockResolvedValue({ count: 1 });
      service.registerBuilder("PLAYERS", {
        fetchRows: vi.fn().mockRejectedValue(new Error("db exploded")),
        columns: [],
      });

      await service.processNextQueued();

      expect(prisma.exportRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "export-1" },
          data: expect.objectContaining({ status: "FAILED", message: "db exploded" }),
        }),
      );
    });
  });

  describe("sweepExpired", () => {
    it("clears the csv for every expired request", async () => {
      await service.sweepExpired();

      expect(prisma.exportRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ csv: { not: null } }),
          data: { csv: null },
        }),
      );
    });
  });
});
