import { describe, expect, it, vi } from "vitest";
import { ExportRequestsController } from "./export-requests.controller.js";

// Same reason admin-batches.controller.spec.ts mocks this: the session
// guard imports auth.config, which builds a real PrismaClient at import
// time, and nothing here needs real auth.
vi.mock("../auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

function createMockService() {
  return {
    getExportById: vi.fn(),
    getExportCsv: vi.fn(),
  };
}

function createMockResponse() {
  const response = {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
  return response;
}

describe("ExportRequestsController", () => {
  describe("getExport", () => {
    it("returns the export summary", async () => {
      const service = createMockService();
      service.getExportById.mockResolvedValue({ id: "export-1", status: "SUCCEEDED" });
      const controller = new ExportRequestsController(service);

      await expect(controller.getExport("export-1")).resolves.toEqual({ id: "export-1", status: "SUCCEEDED" });
    });

    it("throws 404 when the export does not exist", async () => {
      const service = createMockService();
      service.getExportById.mockResolvedValue(null);
      const controller = new ExportRequestsController(service);

      await expect(controller.getExport("missing")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("downloadExport", () => {
    it("sends the csv with the resource's filename", async () => {
      const service = createMockService();
      service.getExportCsv.mockResolvedValue({ csv: "id,name\r\n1,Curry\r\n", resource: "PLAYERS" });
      const controller = new ExportRequestsController(service);
      const response = createMockResponse();

      await controller.downloadExport("export-1", response);

      expect(response.set).toHaveBeenCalledWith(
        expect.objectContaining({ "Content-Disposition": 'attachment; filename="players.csv"' }),
      );
      expect(response.send).toHaveBeenCalledWith("id,name\r\n1,Curry\r\n");
    });

    it("names a games export's file games.csv", async () => {
      const service = createMockService();
      service.getExportCsv.mockResolvedValue({ csv: "id\r\n1\r\n", resource: "GAMES" });
      const controller = new ExportRequestsController(service);
      const response = createMockResponse();

      await controller.downloadExport("export-1", response);

      expect(response.set).toHaveBeenCalledWith(
        expect.objectContaining({ "Content-Disposition": 'attachment; filename="games.csv"' }),
      );
    });

    it("throws 404 when the export isn't downloadable", async () => {
      const service = createMockService();
      service.getExportCsv.mockResolvedValue(null);
      const controller = new ExportRequestsController(service);
      const response = createMockResponse();

      await expect(controller.downloadExport("export-1", response)).rejects.toMatchObject({ status: 404 });
      expect(response.send).not.toHaveBeenCalled();
    });
  });
});
