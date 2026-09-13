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
      expect.objectContaining({ where: { AND: [] }, include: { team: true }, skip: 0, take: 25 })
    );
  });

  it("narrows by teamId when given", async () => {
    await service.listPlayers({ teamId: "team-1" });

    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: "team-1", AND: [] } })
    );
  });

  it("builds an insensitive OR filter over first/last name per search term", async () => {
    await service.listPlayers({ search: "leb" });

    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { firstName: { contains: "leb", mode: "insensitive" } },
                { lastName: { contains: "leb", mode: "insensitive" } },
              ],
            },
          ],
        },
      })
    );
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
