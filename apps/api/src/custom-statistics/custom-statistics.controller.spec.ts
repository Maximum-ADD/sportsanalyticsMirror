import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CustomStatisticsController } from "./custom-statistics.controller.js";

function createServiceMock() {
  return {
    calculateDefinition: vi.fn(),
    createDefinition: vi.fn(),
    listDefinitions: vi.fn().mockResolvedValue([]),
    updateDefinition: vi.fn(),
  };
}

describe("CustomStatisticsController", () => {
  const request = { user: { id: "author-1" } };

  it("lists a caller's definitions", async () => {
    const service = createServiceMock();
    const controller = new CustomStatisticsController(service as never);

    await expect(controller.listDefinitions(request)).resolves.toEqual([]);
    expect(service.listDefinitions).toHaveBeenCalledWith("author-1");
  });

  it("creates a trimmed, validated definition", async () => {
    const service = createServiceMock();
    service.createDefinition.mockResolvedValue({ id: "definition-1" });
    const controller = new CustomStatisticsController(service as never);

    await expect(controller.createDefinition(request, { name: " Impact ", expression: " points + assists " })).resolves.toEqual({ id: "definition-1" });
    expect(service.createDefinition).toHaveBeenCalledWith("author-1", "Impact", "points + assists");
  });

  it("returns a bad request when create input is incomplete or invalid", async () => {
    const service = createServiceMock();
    service.createDefinition.mockRejectedValue(new Error("unsupported statistic: salary"));
    const controller = new CustomStatisticsController(service as never);

    await expect(controller.createDefinition(request, { name: "", expression: "points" })).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(controller.createDefinition(request, { name: "Impact", expression: "salary" })).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it("updates a definition and reports invalid update input", async () => {
    const service = createServiceMock();
    service.updateDefinition.mockResolvedValue({ id: "definition-1", version: 2 });
    const controller = new CustomStatisticsController(service as never);

    await expect(controller.updateDefinition(request, "definition-1", { expression: " points - turnovers " })).resolves.toEqual({ id: "definition-1", version: 2 });
    expect(service.updateDefinition).toHaveBeenCalledWith("author-1", "definition-1", "points - turnovers");
    await expect(controller.updateDefinition(request, "definition-1", {})).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it("calculates a definition, and handles missing input or definitions", async () => {
    const service = createServiceMock();
    const controller = new CustomStatisticsController(service as never);

    await expect(controller.calculateDefinition(request, "definition-1", "", undefined)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    service.calculateDefinition.mockResolvedValue(null);
    await expect(controller.calculateDefinition(request, "definition-1", "player-1", undefined)).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    service.calculateDefinition.mockResolvedValue({ value: 18 });
    await expect(controller.calculateDefinition(request, "definition-1", "player-1", "PLAYOFFS")).resolves.toEqual({ value: 18 });
    expect(service.calculateDefinition).toHaveBeenLastCalledWith("author-1", "definition-1", "player-1", "PLAYOFFS");
  });
});
