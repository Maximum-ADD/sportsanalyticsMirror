import { HttpStatus } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminGamesService } from "./admin-games.service.js";

// AdminGamesService had no dedicated unit spec — every sibling admin
// service (admin-events, admin-ingestion, admin-batches, admin-consumers,
// admin-players/teams/users) has one alongside its e2e coverage. This
// covers listGames' date-window/filter logic, which admin-games.e2e-spec.ts
// only exercises through a couple of happy-path requests.
function createMockPrisma() {
  return {
    game: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock
  } as any;
}

describe("AdminGamesService.listGames", () => {
  let service: AdminGamesService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AdminGamesService(prisma);
  });

  it("applies no filter when the query is empty", async () => {
    await service.listGames({});
    expect(prisma.game.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("filters by an exact season match", async () => {
    await service.listGames({ season: "2025-26" });
    expect(prisma.game.findMany.mock.calls[0][0].where).toEqual({ season: "2025-26" });
  });

  it("filters by a team on either side of the matchup", async () => {
    await service.listGames({ teamId: "team-1" });
    expect(prisma.game.findMany.mock.calls[0][0].where).toEqual({
      OR: [{ homeTeamId: "team-1" }, { awayTeamId: "team-1" }],
    });
  });

  it("builds an inclusive date window, with toDate covering its whole day", async () => {
    await service.listGames({ fromDate: "2026-04-01", toDate: "2026-04-01" });
    expect(prisma.game.findMany.mock.calls[0][0].where).toEqual({
      gameDate: { gte: new Date("2026-04-01T00:00:00.000Z"), lt: new Date("2026-04-02T00:00:00.000Z") },
    });
  });

  it("accepts a fromDate with no toDate as an open-ended window", async () => {
    await service.listGames({ fromDate: "2026-04-01" });
    expect(prisma.game.findMany.mock.calls[0][0].where).toEqual({
      gameDate: { gte: new Date("2026-04-01T00:00:00.000Z") },
    });
  });

  it("rejects a date window where fromDate is after toDate", async () => {
    await expect(service.listGames({ fromDate: "2026-04-10", toDate: "2026-04-01" })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
    expect(prisma.game.findMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed date rather than silently ignoring it", async () => {
    await expect(service.listGames({ fromDate: "not-a-date" })).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(service.listGames({ fromDate: "2026-4-1" })).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it("treats an empty-string date param as absent rather than malformed", async () => {
    await service.listGames({ fromDate: "" });
    expect(prisma.game.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("maps event and correction counts onto each row", async () => {
    prisma.game.findMany.mockResolvedValueOnce([
      {
        id: "game-1",
        nbaGameId: "0022500001",
        gameDate: new Date("2026-04-01"),
        season: "2025-26",
        seasonType: "REGULAR",
        homeScore: 110,
        awayScore: 104,
        homeTeam: { id: "home", name: "Lakers", abbreviation: "LAL", city: "Los Angeles", logoUrl: null },
        awayTeam: { id: "away", name: "Celtics", abbreviation: "BOS", city: "Boston", logoUrl: null },
        _count: { events: 450, corrections: 2 },
      },
    ]);

    const result = await service.listGames({});

    expect(result.data[0]).toMatchObject({ id: "game-1", eventCount: 450, correctionCount: 2 });
    expect(result.data[0]).not.toHaveProperty("_count");
  });
});
