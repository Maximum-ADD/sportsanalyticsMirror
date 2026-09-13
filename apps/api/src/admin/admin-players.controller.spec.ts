import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiException } from "../common/api-exception.js";
import { AdminPlayersController, parseUpdatePlayerBody } from "./admin-players.controller.js";
import type { AdminPlayersService } from "./admin-players.service.js";

const EXISTING_PLAYER = {
  id: "player-1",
  nbaPlayerId: 1,
  firstName: "LeBron",
  lastName: "James",
  position: "F",
  heightInches: 81,
  weightLbs: 250,
  jerseyNumber: "23",
  headshotUrl: null,
  teamId: "team-1",
  team: null,
  birthDate: null,
  school: null,
  country: null,
  lastAffiliation: null,
  seasonExp: null,
  rosterStatus: null,
  draftYear: null,
  draftRound: null,
  draftNumber: null,
};

describe("parseUpdatePlayerBody", () => {
  it("passes required string fields through, trimmed", () => {
    expect(parseUpdatePlayerBody({ firstName: " LeBron ", lastName: "James", position: "F" })).toEqual({
      firstName: "LeBron",
      lastName: "James",
      position: "F",
    });
  });

  it("accepts nullable string and int fields, including explicit null", () => {
    expect(parseUpdatePlayerBody({ jerseyNumber: null, heightInches: null })).toEqual({
      jerseyNumber: null,
      heightInches: null,
    });
    expect(parseUpdatePlayerBody({ jerseyNumber: "23", heightInches: 81 })).toEqual({
      jerseyNumber: "23",
      heightInches: 81,
    });
  });

  it("accepts a null or string teamId without validating it against a real team", () => {
    expect(parseUpdatePlayerBody({ teamId: null })).toEqual({ teamId: null });
    expect(parseUpdatePlayerBody({ teamId: "team-9" })).toEqual({ teamId: "team-9" });
  });

  it("parses a valid ISO birthDate into a Date, and passes null through", () => {
    const patch = parseUpdatePlayerBody({ birthDate: "1984-12-30" });
    expect(patch.birthDate).toBeInstanceOf(Date);
    expect(patch.birthDate?.toISOString().slice(0, 10)).toBe("1984-12-30");
    expect(parseUpdatePlayerBody({ birthDate: null })).toEqual({ birthDate: null });
  });

  it("leaves omitted fields untouched", () => {
    expect(parseUpdatePlayerBody({ firstName: "LeBron" })).toEqual({ firstName: "LeBron" });
  });

  it.each([
    ["a non-object body", "nope"],
    ["a null body", null],
    ["a blank firstName", { firstName: "  " }],
    ["a non-integer heightInches", { heightInches: 81.5 }],
    ["a non-string, non-null jerseyNumber", { jerseyNumber: 23 }],
    ["a non-string, non-null teamId", { teamId: 1 }],
    ["an unparseable birthDate", { birthDate: "not-a-date" }],
    ["a non-string birthDate", { birthDate: 123 }],
  ])("rejects %s with a 400", (_label, body) => {
    expect(() => parseUpdatePlayerBody(body)).toThrow(ApiException);
  });
});

describe("AdminPlayersController", () => {
  let adminPlayersService: {
    listPlayers: ReturnType<typeof vi.fn>;
    getPlayerById: ReturnType<typeof vi.fn>;
    updatePlayer: ReturnType<typeof vi.fn>;
  };
  let controller: AdminPlayersController;

  beforeEach(() => {
    adminPlayersService = { listPlayers: vi.fn(), getPlayerById: vi.fn(), updatePlayer: vi.fn() };
    controller = new AdminPlayersController(adminPlayersService as unknown as AdminPlayersService);
  });

  it("lists players, passing the raw query straight through", async () => {
    adminPlayersService.listPlayers.mockResolvedValue({ data: [], page: 1, pageSize: 25, total: 0 });

    await controller.listPlayers({ teamId: "team-1" });

    expect(adminPlayersService.listPlayers).toHaveBeenCalledWith({ teamId: "team-1" });
  });

  it("rejects a malformed body before the service ever sees it", async () => {
    await expect(controller.updatePlayer("player-1", { firstName: "" })).rejects.toThrow(ApiException);
    expect(adminPlayersService.updatePlayer).not.toHaveBeenCalled();
  });

  it("404s when the player doesn't exist", async () => {
    adminPlayersService.getPlayerById.mockResolvedValue(null);

    await expect(controller.updatePlayer("missing", { firstName: "LeBron" })).rejects.toThrow(ApiException);
    expect(adminPlayersService.updatePlayer).not.toHaveBeenCalled();
  });

  it("updates an existing player with the parsed patch", async () => {
    adminPlayersService.getPlayerById.mockResolvedValue(EXISTING_PLAYER);
    adminPlayersService.updatePlayer.mockResolvedValue({ ...EXISTING_PLAYER, jerseyNumber: "6" });

    const result = await controller.updatePlayer("player-1", { jerseyNumber: "6" });

    expect(adminPlayersService.updatePlayer).toHaveBeenCalledWith("player-1", { jerseyNumber: "6" });
    expect(result.jerseyNumber).toBe("6");
  });

  it("turns a foreign-key violation on teamId into a clean 400", async () => {
    adminPlayersService.getPlayerById.mockResolvedValue(EXISTING_PLAYER);
    adminPlayersService.updatePlayer.mockRejectedValue({ code: "P2003" });

    await expect(controller.updatePlayer("player-1", { teamId: "bogus" })).rejects.toThrow(ApiException);
  });

  it("re-throws an unrelated error from the update", async () => {
    adminPlayersService.getPlayerById.mockResolvedValue(EXISTING_PLAYER);
    const unrelated = new Error("boom");
    adminPlayersService.updatePlayer.mockRejectedValue(unrelated);

    await expect(controller.updatePlayer("player-1", { firstName: "LeBron" })).rejects.toThrow(unrelated);
  });
});
