import { describe, expect, it, vi } from "vitest";
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

  it("rebuilds a release published before files were stored", async () => {
    const prisma = makePrisma({ csv: null, isStale: false, checksum: "old-checksum", season: "2025-26" });

    const result = await new DatasetReleasesService(prisma as never).downloadRelease("2025-26.1");

    expect(result).toMatchObject({ kind: "ready", source: "rebuilt" });
    expect(prisma.player.findMany).toHaveBeenCalled();
  });

  it("refuses to rebuild a stale release that has no stored file", async () => {
    // A rebuild would put corrected figures under the old version name.
    const prisma = makePrisma({ csv: null, isStale: true, checksum: "old-checksum", season: "2025-26" });
    const service = new DatasetReleasesService(prisma as never);

    await expect(service.downloadRelease("2025-26.1")).resolves.toEqual({ kind: "stale", checksum: "old-checksum" });
    expect(prisma.datasetRelease.findUnique).toHaveBeenCalledWith({ where: { version: "2025-26.1" } });
    expect(prisma.player.findMany).not.toHaveBeenCalled();
  });

  it("reports a missing release", async () => {
    await expect(new DatasetReleasesService(makePrisma(null) as never).downloadRelease("nope")).resolves.toEqual({
      kind: "missing",
    });
  });
});

describe("DatasetReleasesService.publishRelease", () => {
  it("stores the generated CSV with the release but returns only metadata", async () => {
    const prisma = {
      game: { count: vi.fn().mockResolvedValue(3) },
      datasetRelease: { create: vi.fn().mockResolvedValue({ version: "2025-26.2" }) },
    };
    const service = new DatasetReleasesService(prisma as never);
    vi.spyOn(service, "generateSeasonCsv").mockResolvedValue({ csv: "h\r\n", rowCount: 0, checksum: "sum" });

    await service.publishRelease({ version: "2025-26.2", description: "d", season: "2025-26" });

    const createArgs = prisma.datasetRelease.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({ csv: "h\r\n", checksum: "sum", gamesCount: 3 });
    // The ~90 KB file must not be echoed back in the publish response.
    expect(createArgs.select).toBeDefined();
    expect(createArgs.select.csv).toBeUndefined();
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
});
