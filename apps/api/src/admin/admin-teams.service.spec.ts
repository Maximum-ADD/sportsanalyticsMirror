import type { Team } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service.js";
import { AdminTeamsService } from "./admin-teams.service.js";

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

describe("AdminTeamsService", () => {
  let prisma: {
    team: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let service: AdminTeamsService;

  beforeEach(() => {
    prisma = {
      team: {
        findMany: vi.fn().mockResolvedValue([LAKERS]),
        count: vi.fn().mockResolvedValue(1),
        findUnique: vi.fn().mockResolvedValue(LAKERS),
        update: vi.fn().mockResolvedValue(LAKERS),
      },
    };
    service = new AdminTeamsService(prisma as unknown as PrismaService);
  });

  it("lists teams with default pagination and no search filter", async () => {
    const result = await service.listTeams({});

    expect(result).toEqual({ data: [LAKERS], page: 1, pageSize: 25, total: 1 });
    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [] }, skip: 0, take: 25 })
    );
  });

  it("builds an insensitive OR filter per search term", async () => {
    await service.listTeams({ search: "lake", page: 2, pageSize: 5 });

    expect(prisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { city: { contains: "lake", mode: "insensitive" } },
                { name: { contains: "lake", mode: "insensitive" } },
                { abbreviation: { contains: "lake", mode: "insensitive" } },
              ],
            },
          ],
        },
        skip: 5,
        take: 5,
      })
    );
  });

  it("getTeamById reads a single team by id", async () => {
    const result = await service.getTeamById("team-1");

    expect(prisma.team.findUnique).toHaveBeenCalledWith({ where: { id: "team-1" } });
    expect(result).toBe(LAKERS);
  });

  it("getTeamById returns null when Prisma finds nothing", async () => {
    prisma.team.findUnique.mockResolvedValue(null);

    expect(await service.getTeamById("missing")).toBeNull();
  });

  it("updateTeam passes the patch straight through to Prisma", async () => {
    await service.updateTeam("team-1", { city: "LA" });

    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: "team-1" }, data: { city: "LA" } });
  });
});
