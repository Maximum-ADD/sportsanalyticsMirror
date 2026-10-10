import { describe, expect, it, vi } from "vitest";
import { PUBLISHED_GAME_FILTER } from "../common/game-visibility.js";
import { compareDatasetReleases, DatasetReleasesService, escapeCsvField, hashCsv, parseReleaseSort } from "./datasets.service.js";

describe("escapeCsvField", () => {
  it("returns empty string for null", () => {
    expect(escapeCsvField(null)).toBe("");
  });

  it("returns plain text as-is when no special characters", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(3.14)).toBe("3.14");
  });

  it("wraps in double quotes when text contains a comma", () => {
    expect(escapeCsvField("hello, world")).toBe('"hello, world"');
  });

  it("wraps in double quotes when text contains a double quote (and escapes it)", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in double quotes when text contains a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps in double quotes when text contains a carriage return", () => {
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });
});

describe("compareDatasetReleases", () => {
  it("reports only changed release metadata", () => {
    const from = { checksum: "old", season: "2025-26", gamesCount: 10, playersCount: 5, eventsCount: 50, fieldSchema: { columns: ["id"] } } as never;
    const to = { ...from, checksum: "new", gamesCount: 11 } as never;

    expect(compareDatasetReleases(from, to).changedFields).toEqual(["checksum", "gamesCount"]);
  });
});

describe("DatasetReleasesService.downloadRelease", () => {
  const STORED_CSV = "playerId,points\r\np1,20\r\n";

  function makePrisma(release: Record<string, unknown> | null) {
    return {
      datasetRelease: { findUnique: vi.fn().mockResolvedValue(release) },
      // Only reached when a release has to be rebuilt from live data.
      player: { findMany: vi.fn().mockResolvedValue([]) },
    };
  }

  it("serves the stored snapshot without reading live data", async () => {
    const prisma = makePrisma({ csv: STORED_CSV, isStale: false, checksum: hashCsv(STORED_CSV), season: "2025-26" });

    const result = await new DatasetReleasesService(prisma as never).downloadRelease("2025-26.1");

    expect(result).toEqual({ kind: "ready", csv: STORED_CSV, checksum: hashCsv(STORED_CSV), source: "stored" });
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });

  it("still serves a stored snapshot after it goes stale — that is what reproducing old analysis needs", async () => {
    const prisma = makePrisma({ csv: STORED_CSV, isStale: true, checksum: hashCsv(STORED_CSV), season: "2025-26" });

    const result = await new DatasetReleasesService(prisma as never).downloadRelease("2025-26.1");

    expect(result).toMatchObject({ kind: "ready", csv: STORED_CSV, source: "stored" });
  });

  const PUBLISHED_AT = new Date("2026-01-15T12:00:00.000Z");

  it("rebuilds a release published before files were stored", async () => {
    const prisma = makePrisma({ csv: null, isStale: false, checksum: "old-checksum", season: "2025-26", publishedAt: PUBLISHED_AT });

    const result = await new DatasetReleasesService(prisma as never).downloadRelease("2025-26.1");

    expect(result).toMatchObject({ kind: "ready", source: "rebuilt" });
    expect(prisma.player.findMany).toHaveBeenCalled();
  });

  // F26: refusing left the user with no file at all once any stat in the
  // season had been edited. The checksum, not the stale flag, says whether
  // the rebuild is the file that was published.
  it("still rebuilds a stale release that has no stored file, labelled as a rebuild", async () => {
    const prisma = makePrisma({ csv: null, isStale: true, checksum: "old-checksum", season: "2025-26", publishedAt: PUBLISHED_AT });
    const service = new DatasetReleasesService(prisma as never);

    const result = await service.downloadRelease("2025-26.1");

    expect(result).toMatchObject({ kind: "ready", source: "rebuilt" });
    expect(prisma.datasetRelease.findUnique).toHaveBeenCalledWith({ where: { version: "2025-26.1" } });
  });

  it("leaves games played after the release was published out of its rebuild", async () => {
    const prisma = makePrisma({ csv: null, isStale: true, checksum: "old-checksum", season: "2025-26", publishedAt: PUBLISHED_AT });

    await new DatasetReleasesService(prisma as never).downloadRelease("2025-26.1");

    const query = prisma.player.findMany.mock.calls[0][0];
    expect(query.include.gameStats.where.game).toEqual({
      season: "2025-26",
      ...PUBLISHED_GAME_FILTER,
      gameDate: { lte: PUBLISHED_AT },
    });
  });

  it("reports a missing release", async () => {
    await expect(new DatasetReleasesService(makePrisma(null) as never).downloadRelease("nope")).resolves.toEqual({
      kind: "missing",
    });
  });
});

describe("DatasetReleasesService.publishRelease", () => {
  function makePrisma(loadedGames: number) {
    return {
      game: { count: vi.fn().mockResolvedValue(loadedGames) },
      datasetRelease: { create: vi.fn().mockResolvedValue({ version: "2025-26.2" }) },
    };
  }

  it("stores the generated CSV with the release but returns only metadata", async () => {
    const prisma = makePrisma(1230);
    const service = new DatasetReleasesService(prisma as never);
    vi.spyOn(service, "generateSeasonCsv").mockResolvedValue({ csv: "h\r\np\r\n", rowCount: 1, gamesCount: 3, checksum: "sum" });

    await service.publishRelease({ version: "2025-26.2", description: "d", season: "2025-26" });

    const createArgs = prisma.datasetRelease.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({ csv: "h\r\np\r\n", checksum: "sum", playersCount: 1 });
    // The ~90 KB file must not be echoed back in the publish response.
    expect(createArgs.select).toBeDefined();
    expect(createArgs.select.csv).toBeUndefined();
  });

  // The season's Game rows include its whole loaded schedule: counting them
  // gave a release of a barely started season hundreds of games it doesn't
  // hold, so it read on the Datasets page as a season that's fully loaded.
  it("counts only the games the file's rows come from, not the season's schedule", async () => {
    const prisma = makePrisma(1230);
    const service = new DatasetReleasesService(prisma as never);
    vi.spyOn(service, "generateSeasonCsv").mockResolvedValue({ csv: "h\r\np\r\n", rowCount: 1, gamesCount: 3, checksum: "sum" });

    await service.publishRelease({ version: "2025-26.2", description: "d", season: "2025-26" });

    expect(prisma.datasetRelease.create.mock.calls[0][0].data.gamesCount).toBe(3);
    expect(prisma.game.count).not.toHaveBeenCalled();
  });

  it("refuses a season whose schedule is loaded but has no played games, and says so", async () => {
    const prisma = makePrisma(1230);
    const service = new DatasetReleasesService(prisma as never);
    vi.spyOn(service, "generateSeasonCsv").mockResolvedValue({ csv: "h\r\n", rowCount: 0, gamesCount: 0, checksum: "sum" });

    const publishing = service.publishRelease({ version: "2026-27.1", description: "d", season: "2026-27" });

    await expect(publishing).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "NO_PLAYED_GAMES", message: expect.stringContaining("2026-27 has 1230 games loaded, but none has been played") } },
    });
    expect(prisma.game.count).toHaveBeenCalledWith({ where: { season: "2026-27" } });
    expect(prisma.datasetRelease.create).not.toHaveBeenCalled();
  });

  it("refuses a season name that matches no games, pointing at the name", async () => {
    const prisma = makePrisma(0);
    const service = new DatasetReleasesService(prisma as never);
    vi.spyOn(service, "generateSeasonCsv").mockResolvedValue({ csv: "h\r\n", rowCount: 0, gamesCount: 0, checksum: "sum" });

    await expect(service.publishRelease({ version: "x", description: "d", season: "2025-2026" })).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "NO_PLAYED_GAMES", message: expect.stringContaining("Check the season name") } },
    });
    expect(prisma.datasetRelease.create).not.toHaveBeenCalled();
  });
});

describe("release reads never load the stored file", () => {
  function makeReadPrisma() {
    return {
      datasetRelease: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValue(0),
      },
    };
  }

  it("leaves csv out of the list, single-release, changes and diff queries", async () => {
    const prisma = makeReadPrisma();
    const service = new DatasetReleasesService(prisma as never);

    await service.listReleases({});
    await service.getReleaseByVersion("2025-26.1");
    await service.getChangesSince(new Date("2026-01-01"));
    await service.diffReleases("2025-26.1", "2025-26.2");

    const selects = [
      ...prisma.datasetRelease.findMany.mock.calls,
      ...prisma.datasetRelease.findUnique.mock.calls,
    ].map(([args]) => args.select);
    expect(selects).toHaveLength(5);
    for (const select of selects) {
      expect(select).toBeDefined();
      expect(select.csv).toBeUndefined();
      expect(select.checksum).toBe(true);
    }
  });
});

describe("parseReleaseSort", () => {
  it("defaults to newest published first", () => {
    expect(parseReleaseSort({})).toEqual({ field: "date", direction: "desc" });
  });

  it("reads season and ascending order off the query", () => {
    expect(parseReleaseSort({ sort: "season", order: "asc" })).toEqual({ field: "season", direction: "asc" });
  });

  it("falls back to the default for unrecognised values rather than erroring", () => {
    expect(parseReleaseSort({ sort: "checksum", order: "sideways" })).toEqual({ field: "date", direction: "desc" });
  });
});

describe("DatasetReleasesService.listReleases", () => {
  function makePrisma() {
    return {
      datasetRelease: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
  }

  it("orders by publish date with season as the tiebreaker by default", async () => {
    const prisma = makePrisma();
    await new DatasetReleasesService(prisma as never).listReleases({});

    expect(prisma.datasetRelease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ publishedAt: "desc" }, { season: "desc" }] }),
    );
  });

  it("orders by season with publish date as the tiebreaker when asked", async () => {
    const prisma = makePrisma();
    await new DatasetReleasesService(prisma as never).listReleases({ sort: "season", order: "asc" });

    expect(prisma.datasetRelease.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ season: "asc" }, { publishedAt: "desc" }] }),
    );
  });
});

describe("DatasetReleasesService.generateSeasonCsv", () => {
  it("orders players by nbaPlayerId so the same data always hashes the same", async () => {
    // Without an explicit order, Postgres may return rows in a different
    // physical order after an upsert, changing the bytes and the checksum
    // while no stat has changed.
    const prisma = { player: { findMany: vi.fn().mockResolvedValue([]) } };
    await new DatasetReleasesService(prisma as never).generateSeasonCsv("2025-26");

    expect(prisma.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { nbaPlayerId: "asc" } }),
    );
  });

  it("counts each distinct game behind the rows once, and no game a row doesn't come from", async () => {
    function statIn(gameId: string) {
      return {
        gameId, points: 10, rebounds: 5, assists: 5, steals: 1, blocks: 1, fieldGoalsMade: 4, fieldGoalsAttempted: 9,
        threesMade: 1, threesAttempted: 3, freeThrowsMade: 1, freeThrowsAttempted: 2,
      };
    }
    function player(nbaPlayerId: number, gameIds: string[]) {
      return {
        id: `p${nbaPlayerId}`, nbaPlayerId, firstName: "P", lastName: `${nbaPlayerId}`, position: "G",
        team: { abbreviation: "ORD" }, gameStats: gameIds.map(statIn),
      };
    }
    // Two teammates in g1, one of them in g2 too; the third player has no
    // played game this season, so he's no row and no game.
    const prisma = {
      player: { findMany: vi.fn().mockResolvedValue([player(1, ["g1", "g2"]), player(2, ["g1"]), player(3, [])]) },
    };

    const result = await new DatasetReleasesService(prisma as never).generateSeasonCsv("2025-26");

    expect(result.rowCount).toBe(2);
    expect(result.gamesCount).toBe(2);
  });

  // Only played, reviewed games have stat rows to read; a season's
  // scheduled games have none, so a season that hasn't started has nothing.
  it("reads only the season's reviewed games' stat rows", async () => {
    const prisma = { player: { findMany: vi.fn().mockResolvedValue([]) } };

    const result = await new DatasetReleasesService(prisma as never).generateSeasonCsv("2026-27");

    expect(result).toMatchObject({ rowCount: 0, gamesCount: 0 });
    const statFilter = prisma.player.findMany.mock.calls[0][0].include.gameStats.where;
    // No date cutoff when publishing: everything played so far goes in.
    expect(statFilter.game).toEqual({ season: "2026-27", ...PUBLISHED_GAME_FILTER });
  });
});
