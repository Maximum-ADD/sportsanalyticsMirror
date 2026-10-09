import type { Player, Team } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service.js";
import { AdminPlayersService } from "./admin-players.service.js";

const LAKERS: Team = {
  id: "team-1",
  nbaTeamId: 1,
  name: "Lakers",
  abbreviation: "LAL",
  city: "Los Angeles",
  conference: "West",
  division: "Pacific",
  logoUrl: null,
};

const LEBRON: Player = {
  id: "player-1",
  nbaPlayerId: 1,
  firstName: "LeBron",
  lastName: "James",
  position: "F",
  heightInches: 81,
  weightLbs: 250,
  jerseyNumber: "23",
  headshotUrl: null,
  teamId: LAKERS.id,
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

describe("AdminPlayersService", () => {
  let prisma: {
    player: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: AdminPlayersService;

  beforeEach(() => {
    prisma = {
      player: {
        findMany: vi.fn().mockResolvedValue([{ ...LEBRON, team: LAKERS }]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue({ ...LEBRON, team: LAKERS }),
        update: vi.fn().mockResolvedValue({ ...LEBRON, team: LAKERS }),
      },
    };
    service = new AdminPlayersService(prisma as unknown as PrismaService);
  });

  it("lists players with default pagination and no filters", async () => {
    const result = await service.listPlayers({});

    expect(result).toEqual({ data: [{ ...LEBRON, team: LAKERS }], page: 1, pageSize: 25, total: 1 });
    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, include: { team: true }, skip: 0, take: 25 })
    );
    // No search, so no extra read of everyone's names.
    expect(prisma.player.findMany).toHaveBeenCalledTimes(1);
  });

  it("narrows by teamId when given", async () => {
    await service.listPlayers({ teamId: "team-1" });

    expect(prisma.player.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { teamId: "team-1" } }));
  });

  // The admin search matches names the same accent-blind way the public
  // list does (see player-name-search.spec.ts for the folding itself): the
  // first read fetches the candidates' names, the page read gets their ids.
  it("finds a player whose name carries accents when the search has none", async () => {
    prisma.player.findMany.mockResolvedValueOnce([
      { id: "player-manon", firstName: "Juan", lastName: "Mañón" },
      { id: "player-james", firstName: "LeBron", lastName: "James" },
    ]);

    await service.listPlayers({ search: "manon", teamId: "team-1" });

    expect(prisma.player.findMany).toHaveBeenNthCalledWith(1, {
      where: { teamId: "team-1" },
      select: { id: true, firstName: true, lastName: true },
    });
    expect(prisma.player.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { teamId: "team-1", id: { in: ["player-manon"] } } })
    );
    expect(prisma.player.count).toHaveBeenCalledWith({ where: { teamId: "team-1", id: { in: ["player-manon"] } } });
  });

  it("getPlayerById reads a single player with its team", async () => {
    const result = await service.getPlayerById("player-1");

    expect(prisma.player.findUnique).toHaveBeenCalledWith({ where: { id: "player-1" }, include: { team: true } });
    expect(result).toEqual({ ...LEBRON, team: LAKERS });
  });

  it("updatePlayer passes the patch straight through to Prisma", async () => {
    await service.updatePlayer("player-1", { jerseyNumber: "6" });

    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: "player-1" },
      data: { jerseyNumber: "6" },
      include: { team: true },
    });
  });
});
