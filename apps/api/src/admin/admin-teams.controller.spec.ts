import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-exception.js";
import { AdminTeamsController, parseUpdateTeamBody } from "./admin-teams.controller.js";
import type { AdminTeamsService } from "./admin-teams.service.js";

const EXISTING_TEAM = {
  id: "team-1",
  nbaTeamId: 1,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

describe("parseUpdateTeamBody", () => {
  it("passes every editable field through, trimmed", () => {
    expect(
      parseUpdateTeamBody({ name: " Lakers ", abbreviation: "LAL", city: "LA", conference: "West", division: "Pacific" })
    ).toEqual({ name: "Lakers", abbreviation: "LAL", city: "LA", conference: "West", division: "Pacific" });
  });

  it("leaves an omitted field untouched (undefined, not overwritten to empty)", () => {
    expect(parseUpdateTeamBody({ name: "Lakers" })).toEqual({ name: "Lakers" });
  });

  it("accepts a null logoUrl (clearing it) alongside a string one", () => {
    expect(parseUpdateTeamBody({ logoUrl: null })).toEqual({ logoUrl: null });
    expect(parseUpdateTeamBody({ logoUrl: "https://example.com/logo.png" })).toEqual({
      logoUrl: "https://example.com/logo.png",
    });
  });

  it.each([
    ["a non-object body", "nope"],
    ["a null body", null],
    ["a blank name", { name: "   " }],
    ["a non-string abbreviation", { abbreviation: 1 }],
    ["a non-string, non-null logoUrl", { logoUrl: 1 }],
  ])("rejects %s with a 400", (_label, body) => {
    expect(() => parseUpdateTeamBody(body)).toThrow(ApiException);
  });
});

describe("AdminTeamsController", () => {
  let adminTeamsService: {
    listTeams: ReturnType<typeof vi.fn>;
    getTeamById: ReturnType<typeof vi.fn>;
    updateTeam: ReturnType<typeof vi.fn>;
  };
  let controller: AdminTeamsController;

  beforeEach(() => {
    adminTeamsService = { listTeams: vi.fn(), getTeamById: vi.fn(), updateTeam: vi.fn() };
    controller = new AdminTeamsController(adminTeamsService as unknown as AdminTeamsService);
  });

  it("lists teams, passing the raw query straight through", async () => {
    adminTeamsService.listTeams.mockResolvedValue({ data: [], page: 1, pageSize: 25, total: 0 });

    await controller.listTeams({ search: "lak" });

    expect(adminTeamsService.listTeams).toHaveBeenCalledWith({ search: "lak" });
  });

  it("rejects a malformed body before the service ever sees it", async () => {
    await expect(controller.updateTeam("team-1", { name: "" })).rejects.toThrow(ApiException);
    expect(adminTeamsService.updateTeam).not.toHaveBeenCalled();
  });

  it("404s when the team doesn't exist", async () => {
    adminTeamsService.getTeamById.mockResolvedValue(null);

    await expect(controller.updateTeam("missing", { name: "Lakers" })).rejects.toThrow(ApiException);
    expect(adminTeamsService.updateTeam).not.toHaveBeenCalled();
  });

  it("updates an existing team with the parsed patch", async () => {
    adminTeamsService.getTeamById.mockResolvedValue(EXISTING_TEAM);
    adminTeamsService.updateTeam.mockResolvedValue({ ...EXISTING_TEAM, city: "LA" });

    const result = await controller.updateTeam("team-1", { city: "LA" });

    expect(adminTeamsService.updateTeam).toHaveBeenCalledWith("team-1", { city: "LA" });
    expect(result.city).toBe("LA");
  });
});
