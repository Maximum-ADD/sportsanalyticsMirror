import { HttpStatus } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-exception.js";
import { InjuryFeedUnavailableError } from "./injury-feed-unavailable.error.js";
import { InjuriesController } from "./injuries.controller.js";
import type { InjuriesService } from "./injuries.service.js";

// The controller's session guard imports auth.config, which builds a real
// PrismaClient at import time; see datasets.controller.spec.ts for why that
// has to be stubbed in a short spec like this one.
vi.mock("../auth/auth.config.js", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

describe("InjuriesController", () => {
  let injuriesService: {
    getLeagueReport: ReturnType<typeof vi.fn>;
    getTeamInjuries: ReturnType<typeof vi.fn>;
    getPlayerInjury: ReturnType<typeof vi.fn>;
  };
  let controller: InjuriesController;

  beforeEach(() => {
    injuriesService = { getLeagueReport: vi.fn(), getTeamInjuries: vi.fn(), getPlayerInjury: vi.fn() };
    controller = new InjuriesController(injuriesService as unknown as InjuriesService);
  });

  it("returns what the service reads", async () => {
    const report = { fetchedAt: "2026-10-09T18:00:00.000Z", injury: null };
    injuriesService.getPlayerInjury.mockResolvedValue(report);

    await expect(controller.getPlayerInjury("player-1")).resolves.toBe(report);
    expect(injuriesService.getPlayerInjury).toHaveBeenCalledWith("player-1");
  });

  it("answers 404 for a team that doesn't exist", async () => {
    injuriesService.getTeamInjuries.mockResolvedValue(null);

    const error = await controller.getTeamInjuries("no-such-team").catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it("answers 503 INJURY_DATA_UNAVAILABLE when ESPN can't be read", async () => {
    injuriesService.getLeagueReport.mockRejectedValue(new InjuryFeedUnavailableError("ESPN answered with status 500"));

    const error = await controller.getLeagueReport().catch((thrown: unknown) => thrown);

    expect((error as ApiException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((error as ApiException).getResponse()).toMatchObject({ error: { code: "INJURY_DATA_UNAVAILABLE" } });
  });

  it("lets any other error through unchanged", async () => {
    const databaseError = new Error("connection refused");
    injuriesService.getLeagueReport.mockRejectedValue(databaseError);

    await expect(controller.getLeagueReport()).rejects.toBe(databaseError);
  });
});
